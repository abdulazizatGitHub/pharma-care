import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
  console.error('REFUSING: wrong project ref:', url);
  process.exit(1);
}

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';
const WALKIN_ID = '4ca6acf2-67a3-46c0-a4d3-d3b5d7659729';
const CUSTOMERS = {
  imran: '399a3630-4c2a-40b4-b724-3f05be82abce',
  hassan: '91f85b82-a588-4b9d-933a-a76f810411d2',
  malik: 'b2607065-bd14-4598-a411-bf606869484c',
};

const EXCLUDED = new Set(['Insulin Glargine 100IU/ml (Lantus)']);
const THIN_STOCK = new Set([
  'Levofloxacin 500mg Tablets (Levaquin)',
  'Alprazolam 0.5mg Tablets (Xanax)',
  'Ipratropium 20mcg Inhaler (Atrovent)',
  'Naproxen 500mg Tablets (Naprosyn)',
  'Ampicillin 250mg Capsules (Penbritin)',
]);
const THIN_STOCK_MAX_QTY = 2;
const THIN_STOCK_MAX_SALES = 5;
const thinStockUsedSales: Record<string, number> = {};

const NORMAL_POOL = [
  'Amoxicillin 500mg Capsules (Amoxil)', 'Cefixime 400mg Tablets (Cefix)', 'Cephalexin 500mg Capsules (Keflex)',
  'Ciprofloxacin 500mg Tablets (Cifran)', 'Ibuprofen 400mg Tablets (Brufen)', 'Diclofenac 50mg Tablets (Voltaren)',
  'Paracetamol 500mg Tablets (Panadol)', 'Paracetamol 250mg Syrup (Calpol)', 'Amlodipine 5mg Tablets (Norvasc)',
  'Losartan 50mg Tablets (Cozaar)', 'Atenolol 50mg Tablets (Tenormin)', 'Atorvastatin 20mg Tablets (Lipitor)',
  'Rosuvastatin 10mg Tablets (Crestor)', 'Metformin 500mg Tablets (Glucophage)', 'Glibenclamide 5mg Tablets (Daonil)',
  'Sitagliptin 100mg Tablets (Januvia)', 'Salbutamol 100mcg Inhaler (Ventolin)', 'Fluticasone 125mcg Inhaler (Flixotide)',
  'Budesonide 200mcg Inhaler (Pulmicort)', 'Omeprazole 20mg Capsules (Losec)', 'Pantoprazole 40mg Tablets (Protonix)',
  'Aluminium Hydroxide Suspension (Gaviscon)', 'Domperidone 10mg Tablets (Motilium)', 'Centrum Adults Tablets',
  'Neurobion Forte Tablets', 'Vitamin D3 1000IU Tablets (D-Sol)', 'Vitamin C 500mg Tablets (Redoxon)',
  'Ferrous Sulphate 200mg Tablets (Feospan)', 'Calcium Carbonate 500mg Tablets (Caltrate)',
  'Diazepam 5mg Tablets (Valium)', 'Codeine Phosphate 30mg Tablets', 'Fusidic Acid 2% Cream (Fucidin)',
  'Mupirocin 2% Ointment (Bactroban)', 'Clotrimazole 1% Cream (Canesten)', 'Terbinafine 1% Cream (Lamisil)',
  'Ciprofloxacin 0.3% Eye Drops (Ciloxan)', 'Sodium Chloride 0.9% Eye Drops', 'Latanoprost 0.005% Eye Drops (Xalatan)',
  'Tramadol 50mg Capsules (Tramal)',
];

function rand(min: number, max: number) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

function randomBusinessTime(): string {
  const startMin = 9 * 60 + 30, endMin = 19 * 60 + 30;
  const m = rand(startMin, endMin);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

type StockRow = { batch_id: string; medicine_id: string; name: string; mrp: number; quantity: number };

async function refreshStock(client: Client): Promise<Map<string, StockRow[]>> {
  const { rows } = await client.query(`
    SELECT sb.id as batch_id, sb.medicine_id, m.name, COALESCE(sb.mrp, m.mrp) as mrp, sb.quantity
    FROM stock_batches sb JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.quantity > 0 AND sb.expiry_date > '2026-09-01' AND sb.is_deleted = false
    ORDER BY m.name, sb.expiry_date ASC
  `);
  const map = new Map<string, StockRow[]>();
  for (const r of rows) {
    if (EXCLUDED.has(r.name)) continue;
    if (!map.has(r.name)) map.set(r.name, []);
    map.get(r.name)!.push({ batch_id: r.batch_id, medicine_id: r.medicine_id, name: r.name, mrp: Number(r.mrp), quantity: r.quantity });
  }
  return map;
}

function pickBatch(stock: Map<string, StockRow[]>, used: Map<string, number>, name: string, qty: number) {
  const batches = stock.get(name);
  if (!batches) return null;
  for (const b of batches) {
    const usedQty = used.get(b.batch_id) || 0;
    const avail = b.quantity - usedQty - 2; // safety buffer
    if (avail >= qty) {
      used.set(b.batch_id, usedQty + qty);
      return b;
    }
  }
  return null;
}

async function getShiftForDate(client: Client, date: string): Promise<string> {
  const { rows } = await client.query(`SELECT id FROM shifts WHERE opened_at::date = $1::date`, [date]);
  if (rows.length === 0) throw new Error(`No shift for date ${date}`);
  return rows[0].id;
}

async function makeSale(
  client: Client,
  used: Map<string, number>,
  date: string,
  customerId: string,
  paymentType: string,
  items: { batch_id: string; medicine_id: string; unit_price: number; quantity: number }[],
  discountAmt: number,
  notes: string | null
): Promise<{ saleId: string; total: number } | null> {
  const shiftId = await getShiftForDate(client, date);
  await client.query(`UPDATE shifts SET status = 'open' WHERE id = $1`, [shiftId]);

  try {
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const total = subtotal - discountAmt;
    const amountPaid = paymentType === 'credit' ? 0 : total;

    const itemsJson = JSON.stringify(items.map(i => ({
      medicine_id: i.medicine_id, batch_id: i.batch_id, quantity: i.quantity, unit_price: i.unit_price, discount_pct: 0,
    })));

    const res = await client.query(
      `SELECT complete_sale($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::numeric, $6::numeric, $7::numeric, $8::text) as result`,
      [PHARMACIST_ID, customerId, paymentType, itemsJson, discountAmt, 0, amountPaid, notes]
    );
    const saleId = res.rows[0].result.sale_id;

    const { rows: jeRows } = await client.query(
      `SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [saleId]
    );
    const timestamp = `${date}T${randomBusinessTime()}+05:00`;
    if (jeRows.length > 0) {
      await backdateJournalEntry(client, {
        entryId: jeRows[0].id,
        entryDate: date,
        sourceTable: 'sales',
        sourceId: saleId,
        sourceDateColumn: 'created_at',
        sourceTimestamp: timestamp,
      });
    }
    return { saleId, total };
  } finally {
    await client.query(`UPDATE shifts SET status = 'closed' WHERE id = $1`, [shiftId]);
  }
}

function canUseThinStock(name: string): boolean {
  if (!THIN_STOCK.has(name)) return true;
  return (thinStockUsedSales[name] || 0) < THIN_STOCK_MAX_SALES;
}
function markThinStockUsed(name: string) {
  if (THIN_STOCK.has(name)) thinStockUsedSales[name] = (thinStockUsedSales[name] || 0) + 1;
}

function buildBasket(stock: Map<string, StockRow[]>, used: Map<string, number>, itemCount: number, qtyScale: number) {
  const items: { batch_id: string; medicine_id: string; unit_price: number; quantity: number; name: string }[] = [];
  let attempts = 0;
  while (items.length < itemCount && attempts < 30) {
    attempts++;
    const name = pick(NORMAL_POOL);
    if (!canUseThinStock(name)) continue;
    if (items.some(i => i.name === name)) continue;
    let qty = Math.max(1, Math.round(rand(2, 8) * qtyScale));
    if (THIN_STOCK.has(name)) qty = Math.min(qty, THIN_STOCK_MAX_QTY);
    const batch = pickBatch(stock, used, name, qty);
    if (!batch) continue;
    markThinStockUsed(name);
    items.push({ batch_id: batch.batch_id, medicine_id: batch.medicine_id, unit_price: batch.mrp, quantity: qty, name });
  }
  return items;
}

// Exact-target credit sale item plans (name, qty), computed to hit target via order-level discount
const CREDIT_PLANS = [
  { key: 'imran', date: '2026-04-10', target: 12500, items: [
    ['Amoxicillin 500mg Capsules (Amoxil)', 20], ['Ciprofloxacin 500mg Tablets (Cifran)', 20], ['Cefixime 400mg Tablets (Cefix)', 16],
  ]},
  { key: 'hassan', date: '2026-04-14', target: 4200, items: [
    ['Amlodipine 5mg Tablets (Norvasc)', 6], ['Metformin 500mg Tablets (Glucophage)', 10], ['Atorvastatin 20mg Tablets (Lipitor)', 3],
  ]},
  { key: 'malik', date: '2026-04-20', target: 8900, items: [
    ['Centrum Adults Tablets', 2], ['Aluminium Hydroxide Suspension (Gaviscon)', 10], ['Ibuprofen 400mg Tablets (Brufen)', 20], ['Vitamin C 500mg Tablets (Redoxon)', 12],
  ]},
  { key: 'imran', date: '2026-04-25', target: 6750, items: [
    ['Cephalexin 500mg Capsules (Keflex)', 11], ['Levofloxacin 500mg Tablets (Levaquin)', 2], ['Salbutamol 100mcg Inhaler (Ventolin)', 10],
  ]},
];

function workingDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= endDate) {
    if (cur.getUTCDay() !== 0) {
      const y = cur.getUTCFullYear(), m = String(cur.getUTCMonth() + 1).padStart(2, '0'), d = String(cur.getUTCDate()).padStart(2, '0');
      days.push(`${y}-${m}-${d}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const week1 = workingDaysBetween('2026-04-06', '2026-04-11');
  const week2 = workingDaysBetween('2026-04-13', '2026-04-18');
  const week3 = workingDaysBetween('2026-04-20', '2026-04-25');
  const week4 = workingDaysBetween('2026-04-27', '2026-04-30');

  // 6 multi-item sales spread across weeks: 2,2,1,1
  const multiItemDays = [week1[1], week1[4], week2[1], week2[4], week3[2], week4[1]];
  // 55 simple sales spread: 11,14,18,12 across weeks
  const simplePlan: { week: string[]; count: number }[] = [
    { week: week1, count: 11 }, { week: week2, count: 14 }, { week: week3, count: 18 }, { week: week4, count: 12 },
  ];
  const simpleDays: string[] = [];
  for (const { week, count } of simplePlan) {
    for (let i = 0; i < count; i++) simpleDays.push(week[i % week.length]);
  }

  let stock = await refreshStock(client);
  const used = new Map<string, number>();

  let salesCount = 0;
  let revenueTotal = 0;
  let qtyScale = 1.0;

  async function checkpointReport(n: number) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int as cnt, COALESCE(SUM(total_amount),0) as rev FROM sales WHERE created_at >= '2026-04-01' AND created_at < '2026-05-01'`
    );
    const { rows: balRows } = await client.query(
      `SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits, SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')`
    );
    console.log(`\n=== CHECKPOINT ${n} ===`);
    console.log(`Sales so far (April): ${rows[0].cnt}, Revenue: PKR ${rows[0].rev}`);
    console.log(`Journal balance: debits=${balRows[0].debits} credits=${balRows[0].credits} diff=${(Number(balRows[0].debits) - Number(balRows[0].credits)).toFixed(4)}`);
    return { count: rows[0].cnt, revenue: Number(rows[0].rev) };
  }

  // --- 4 credit sales ---
  for (const plan of CREDIT_PLANS) {
    const customerId = (CUSTOMERS as any)[plan.key];
    const items = [];
    let subtotal = 0;
    for (const [name, qty] of plan.items as [string, number][]) {
      const batch = pickBatch(stock, used, name, qty);
      if (!batch) { console.error(`FAILED to find batch for credit sale item ${name} qty ${qty}`); process.exit(1); }
      markThinStockUsed(name);
      items.push({ batch_id: batch.batch_id, medicine_id: batch.medicine_id, unit_price: batch.mrp, quantity: qty });
      subtotal += batch.mrp * qty;
    }
    const discountAmt = Math.max(0, Math.round((subtotal - plan.target) * 100) / 100);
    const result = await makeSale(client, used, plan.date, customerId, 'credit', items, discountAmt, `Credit sale — ${plan.key}`);
    if (result) {
      salesCount++; revenueTotal += result.total;
      console.log(`Credit sale ${plan.key} (${plan.date}): subtotal=${subtotal.toFixed(2)} discount=${discountAmt.toFixed(2)} total=${result.total.toFixed(2)} sale_id=${result.saleId}`);
    }
  }

  // --- 6 multi-item cash sales ---
  for (const date of multiItemDays) {
    const items = buildBasket(stock, used, rand(2, 4), qtyScale);
    if (items.length < 2) { console.error(`Could not build multi-item basket for ${date}`); continue; }
    const result = await makeSale(client, used, date, WALKIN_ID, 'cash', items, 0, 'Multi-item sale');
    if (result) { salesCount++; revenueTotal += result.total; }
    if (salesCount % 10 === 0) { stock = await refreshStock(client); used.clear(); }
  }

  // --- 55 simple cash sales ---
  for (let i = 0; i < simpleDays.length; i++) {
    const date = simpleDays[i];
    const items = buildBasket(stock, used, rand(1, 2), qtyScale);
    if (items.length === 0) { console.error(`Could not build basket for ${date} (sale ${salesCount + 1})`); continue; }
    const result = await makeSale(client, used, date, WALKIN_ID, 'cash', items, 0, null);
    if (result) { salesCount++; revenueTotal += result.total; }

    if (salesCount % 10 === 0) { stock = await refreshStock(client); used.clear(); }

    if (salesCount === 20) {
      const cp = await checkpointReport(1);
    }
    if (salesCount === 40) {
      const cp = await checkpointReport(2);
      const remaining = 65 - salesCount;
      const remainingTarget = 380000 - cp.revenue;
      const avgRemaining = remainingTarget / Math.max(1, remaining);
      const avgSoFar = cp.revenue / cp.count;
      qtyScale = Math.max(0.5, Math.min(2.5, avgRemaining / avgSoFar));
      console.log(`Pace adjustment: avgSoFar=${avgSoFar.toFixed(0)}, avgNeeded=${avgRemaining.toFixed(0)}, qtyScale=${qtyScale.toFixed(2)}`);
    }
  }

  console.log(`\nAll planned April sales attempted. Total sales created: ${salesCount}, revenue: ${revenueTotal.toFixed(2)}`);
  await checkpointReport(3);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
