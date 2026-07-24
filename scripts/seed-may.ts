import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url.includes('gnxtmvkfawfkmyyqebwi')) { console.error('REFUSING: wrong project ref:', url); process.exit(1); }

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';
const WALKIN_ID = '4ca6acf2-67a3-46c0-a4d3-d3b5d7659729';
const CUSTOMERS: Record<string, string> = {
  zafar: 'eae5a627-0642-4553-b303-b41cd1e85979',
  imran: '399a3630-4c2a-40b4-b724-3f05be82abce',
  ahmad: 'e6af5171-2d23-48ab-ac05-80023f12d0ed',
  hassan: '91f85b82-a588-4b9d-933a-a76f810411d2',
  malik: 'b2607065-bd14-4598-a411-bf606869484c',
};

const EXCLUDED = new Set(['Insulin Glargine 100IU/ml (Lantus)']);
// Watch-list: consumed heavily in April or naturally thin — cap total May usage, leave stock for June
const WATCH_BUDGET: Record<string, number> = {
  'Levofloxacin 500mg Tablets (Levaquin)': 15,
  'Alprazolam 0.5mg Tablets (Xanax)': 30,
  'Ipratropium 20mcg Inhaler (Atrovent)': 32,
  'Naproxen 500mg Tablets (Naprosyn)': 34,
  'Ampicillin 250mg Capsules (Penbritin)': 35,
  'Cefixime 400mg Tablets (Cefix)': 28,
  'Fluticasone 125mcg Inhaler (Flixotide)': 18,
  'Paracetamol 250mg Syrup (Calpol)': 18,
  'Codeine Phosphate 30mg Tablets': 25,
};
const monthlyUsed: Record<string, number> = {};

const NORMAL_POOL = [
  'Amoxicillin 500mg Capsules (Amoxil)', 'Cephalexin 500mg Capsules (Keflex)', 'Ciprofloxacin 500mg Tablets (Cifran)',
  'Ibuprofen 400mg Tablets (Brufen)', 'Diclofenac 50mg Tablets (Voltaren)', 'Paracetamol 500mg Tablets (Panadol)',
  'Amlodipine 5mg Tablets (Norvasc)', 'Losartan 50mg Tablets (Cozaar)', 'Atenolol 50mg Tablets (Tenormin)',
  'Atorvastatin 20mg Tablets (Lipitor)', 'Rosuvastatin 10mg Tablets (Crestor)', 'Metformin 500mg Tablets (Glucophage)',
  'Glibenclamide 5mg Tablets (Daonil)', 'Sitagliptin 100mg Tablets (Januvia)', 'Salbutamol 100mcg Inhaler (Ventolin)',
  'Budesonide 200mcg Inhaler (Pulmicort)', 'Omeprazole 20mg Capsules (Losec)', 'Pantoprazole 40mg Tablets (Protonix)',
  'Aluminium Hydroxide Suspension (Gaviscon)', 'Domperidone 10mg Tablets (Motilium)', 'Centrum Adults Tablets',
  'Neurobion Forte Tablets', 'Vitamin D3 1000IU Tablets (D-Sol)', 'Vitamin C 500mg Tablets (Redoxon)',
  'Ferrous Sulphate 200mg Tablets (Feospan)', 'Calcium Carbonate 500mg Tablets (Caltrate)', 'Diazepam 5mg Tablets (Valium)',
  'Fusidic Acid 2% Cream (Fucidin)', 'Mupirocin 2% Ointment (Bactroban)', 'Clotrimazole 1% Cream (Canesten)',
  'Terbinafine 1% Cream (Lamisil)', 'Ciprofloxacin 0.3% Eye Drops (Ciloxan)', 'Sodium Chloride 0.9% Eye Drops',
  'Latanoprost 0.005% Eye Drops (Xalatan)', 'Tramadol 50mg Capsules (Tramal)',
];
const WATCH_POOL = Object.keys(WATCH_BUDGET);

function rand(min: number, max: number) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }
function randomBusinessTime(): string {
  const m = rand(9 * 60 + 30, 19 * 60 + 30);
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
    if (b.quantity - usedQty - 2 >= qty) { used.set(b.batch_id, usedQty + qty); return b; }
  }
  return null;
}

async function getShiftForDate(client: Client, date: string): Promise<string> {
  const { rows } = await client.query(`SELECT id FROM shifts WHERE opened_at::date = $1::date`, [date]);
  if (rows.length === 0) throw new Error(`No shift for date ${date}`);
  return rows[0].id;
}

function buildTargetedBasket(stock: Map<string, StockRow[]>, used: Map<string, number>, itemCount: number, target: number) {
  const items: { batch_id: string; medicine_id: string; unit_price: number; quantity: number; name: string }[] = [];
  let attempts = 0;
  while (items.length < itemCount && attempts < 40) {
    attempts++;
    const useWatch = Math.random() < 0.12; // occasionally include a watch-list item
    const name = useWatch ? pick(WATCH_POOL) : pick(NORMAL_POOL);
    if (items.some(i => i.name === name)) continue;
    if (WATCH_BUDGET[name] !== undefined) {
      const used_ = monthlyUsed[name] || 0;
      if (used_ >= WATCH_BUDGET[name]) continue;
    }
    const batches = stock.get(name);
    if (!batches) continue;
    const price = batches[0].mrp;
    const portionTarget = target / itemCount;
    let qty = Math.max(1, Math.round(portionTarget / price));
    if (WATCH_BUDGET[name] !== undefined) qty = Math.min(qty, 3, WATCH_BUDGET[name] - (monthlyUsed[name] || 0));
    if (qty <= 0) continue;
    const batch = pickBatch(stock, used, name, qty);
    if (!batch) continue;
    if (WATCH_BUDGET[name] !== undefined) monthlyUsed[name] = (monthlyUsed[name] || 0) + qty;
    items.push({ batch_id: batch.batch_id, medicine_id: batch.medicine_id, unit_price: batch.mrp, quantity: qty, name });
  }
  return items;
}

async function makeSale(client: Client, date: string, customerId: string, paymentType: string,
  items: { batch_id: string; medicine_id: string; unit_price: number; quantity: number }[], discountAmt: number, notes: string | null) {
  const shiftId = await getShiftForDate(client, date);
  await client.query(`UPDATE shifts SET status = 'open' WHERE id = $1`, [shiftId]);
  try {
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const total = subtotal - discountAmt;
    const amountPaid = paymentType === 'credit' ? 0 : total;
    const itemsJson = JSON.stringify(items.map(i => ({ medicine_id: i.medicine_id, batch_id: i.batch_id, quantity: i.quantity, unit_price: i.unit_price, discount_pct: 0 })));
    const res = await client.query(
      `SELECT complete_sale($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::numeric, 0::numeric, $6::numeric, $7::text) as result`,
      [PHARMACIST_ID, customerId, paymentType, itemsJson, discountAmt, amountPaid, notes]
    );
    const saleId = res.rows[0].result.sale_id;
    const { rows: jeRows } = await client.query(`SELECT id FROM journal_entries WHERE reference_type='sale' AND reference_id=$1 ORDER BY created_at DESC LIMIT 1`, [saleId]);
    const timestamp = `${date}T${randomBusinessTime()}+05:00`;
    if (jeRows.length > 0) {
      await backdateJournalEntry(client, { entryId: jeRows[0].id, entryDate: date, sourceTable: 'sales', sourceId: saleId, sourceDateColumn: 'created_at', sourceTimestamp: timestamp });
    }
    return { saleId, total, subtotal };
  } finally {
    await client.query(`UPDATE shifts SET status = 'closed' WHERE id = $1`, [shiftId]);
  }
}

const CREDIT_PLANS = [
  { key: 'zafar', date: '2026-05-08', target: 15600, items: [
    ['Amlodipine 5mg Tablets (Norvasc)', 20], ['Losartan 50mg Tablets (Cozaar)', 20], ['Atorvastatin 20mg Tablets (Lipitor)', 10],
  ]},
  { key: 'imran', date: '2026-05-12', target: 9800, items: [
    ['Amoxicillin 500mg Capsules (Amoxil)', 20], ['Cephalexin 500mg Capsules (Keflex)', 10], ['Vitamin C 500mg Tablets (Redoxon)', 10],
  ]},
  { key: 'ahmad', date: '2026-05-16', target: 7200, items: [
    ['Ibuprofen 400mg Tablets (Brufen)', 20], ['Centrum Adults Tablets', 3], ['Vitamin D3 1000IU Tablets (D-Sol)', 5],
  ]},
  { key: 'hassan', date: '2026-05-21', target: 3950, items: [
    ['Metformin 500mg Tablets (Glucophage)', 12], ['Atenolol 50mg Tablets (Tenormin)', 8],
  ]},
  { key: 'malik', date: '2026-05-26', target: 11400, items: [
    ['Sitagliptin 100mg Tablets (Januvia)', 4], ['Rosuvastatin 10mg Tablets (Crestor)', 6], ['Latanoprost 0.005% Eye Drops (Xalatan)', 1],
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

async function checkpointReport(client: Client, n: number) {
  const { rows } = await client.query(`SELECT COUNT(*)::int as cnt, COALESCE(SUM(total_amount),0) as rev FROM sales WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'`);
  const { rows: bal } = await client.query(`SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits, SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')`);
  console.log(`\n=== CHECKPOINT ${n} ===`);
  console.log(`May sales so far: ${rows[0].cnt}, Revenue: PKR ${rows[0].rev}`);
  console.log(`Journal balance: debits=${bal[0].debits} credits=${bal[0].credits} diff=${(Number(bal[0].debits) - Number(bal[0].credits)).toFixed(4)}`);
  return { count: rows[0].cnt, revenue: Number(rows[0].rev) };
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const week1 = workingDaysBetween('2026-05-01', '2026-05-09');
  const week2 = workingDaysBetween('2026-05-11', '2026-05-16');
  const week3 = workingDaysBetween('2026-05-18', '2026-05-23');
  const week4 = workingDaysBetween('2026-05-25', '2026-05-30');
  console.log('Working days per week:', week1.length, week2.length, week3.length, week4.length, '(total', week1.length+week2.length+week3.length+week4.length, ')');

  let stock = await refreshStock(client);
  const used = new Map<string, number>();
  let salesCount = 0;
  let revenueTotal = 0;

  // --- 5 credit sales ---
  for (const plan of CREDIT_PLANS) {
    const customerId = CUSTOMERS[plan.key];
    const items = [];
    let subtotal = 0;
    for (const [name, qty] of plan.items as [string, number][]) {
      const batch = pickBatch(stock, used, name, qty);
      if (!batch) { console.error(`FAILED to find batch for ${name} qty ${qty}`); process.exit(1); }
      items.push({ batch_id: batch.batch_id, medicine_id: batch.medicine_id, unit_price: batch.mrp, quantity: qty });
      subtotal += batch.mrp * qty;
    }
    const discountAmt = Math.max(0, Math.round((subtotal - plan.target) * 100) / 100);
    const result = await makeSale(client, plan.date, customerId, 'credit', items, discountAmt, `Credit sale — ${plan.key}`);
    salesCount++; revenueTotal += result.total;
    console.log(`Credit sale ${plan.key} (${plan.date}): subtotal=${subtotal.toFixed(2)} discount=${discountAmt.toFixed(2)} total=${result.total.toFixed(2)}`);
  }

  // --- 72 cash sales, week-targeted ---
  const weekPlans = [
    { days: week1, count: 20, cashTarget: 100000 - 15600 },
    { days: week2, count: 18, cashTarget: 125000 - 17000 },
    { days: week3, count: 20, cashTarget: 135000 - 3950 },
    { days: week4, count: 14, cashTarget: 120000 - 11400 },
  ];

  for (const wp of weekPlans) {
    const perSaleTarget = wp.cashTarget / wp.count;
    for (let i = 0; i < wp.count; i++) {
      const date = wp.days[i % wp.days.length];
      const jitter = 0.7 + Math.random() * 0.6; // +/-30%
      const target = perSaleTarget * jitter;
      const itemCount = rand(1, 3);
      const items = buildTargetedBasket(stock, used, itemCount, target);
      if (items.length === 0) { console.error(`Could not build basket for ${date} (sale ${salesCount + 1})`); continue; }
      const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
      const discountAmt = Math.max(0, Math.round((subtotal - target) * 100) / 100);
      const result = await makeSale(client, date, WALKIN_ID, 'cash', items, discountAmt, null);
      salesCount++; revenueTotal += result.total;

      if (salesCount % 10 === 0) { stock = await refreshStock(client); used.clear(); }
      if (salesCount === 25) await checkpointReport(client, 1);
      if (salesCount === 55) await checkpointReport(client, 2);
    }
  }

  console.log(`\nAll planned May sales attempted. Total: ${salesCount} sales, revenue PKR ${revenueTotal.toFixed(2)}`);
  const cp = await checkpointReport(client, '3-pre-catchup' as any);

  if (cp.revenue < 478000) {
    console.log(`\nRevenue below target range — adding catch-up sales immediately (per instruction, no need to ask).`);
    let shortfall = 480000 - cp.revenue;
    const catchupDays = [...week1, ...week2, ...week3, ...week4];
    let di = 0;
    stock = await refreshStock(client);
    used.clear();
    while (shortfall > 500 && di < 15) {
      const date = catchupDays[(di * 3) % catchupDays.length];
      const target = Math.min(shortfall, 9000 + rand(-500, 500));
      const items = buildTargetedBasket(stock, used, rand(2, 3), target);
      if (items.length > 0) {
        const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
        const discountAmt = Math.max(0, Math.round((subtotal - target) * 100) / 100);
        const result = await makeSale(client, date, WALKIN_ID, 'cash', items, discountAmt, 'Catch-up bulk sale');
        salesCount++; revenueTotal += result.total; shortfall -= result.total;
        console.log(`Catch-up ${date}: total=${result.total.toFixed(2)}, remaining shortfall=${shortfall.toFixed(2)}`);
      }
      di++;
    }
  }

  await checkpointReport(client, '3-final' as any);
  console.log(`\nFinal sales count: ${salesCount}`);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
