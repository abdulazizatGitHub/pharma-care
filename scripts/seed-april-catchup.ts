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
    if (!map.has(r.name)) map.set(r.name, []);
    map.get(r.name)!.push({ batch_id: r.batch_id, medicine_id: r.medicine_id, name: r.name, mrp: Number(r.mrp), quantity: r.quantity });
  }
  return map;
}

function pickBatch(stock: Map<string, StockRow[]>, name: string, qty: number) {
  const batches = stock.get(name);
  if (!batches) return null;
  for (const b of batches) {
    if (b.quantity - 2 >= qty) return b;
  }
  return null;
}

async function getShiftForDate(client: Client, date: string): Promise<string> {
  const { rows } = await client.query(`SELECT id FROM shifts WHERE opened_at::date = $1::date`, [date]);
  if (rows.length === 0) throw new Error(`No shift for date ${date}`);
  return rows[0].id;
}

const PLANS: { date: string; target: number; items: [string, number][] }[] = [
  { date: '2026-04-07', target: 9600, items: [['Sitagliptin 100mg Tablets (Januvia)', 4], ['Rosuvastatin 10mg Tablets (Crestor)', 5]] },
  { date: '2026-04-09', target: 9600, items: [['Latanoprost 0.005% Eye Drops (Xalatan)', 6], ['Terbinafine 1% Cream (Lamisil)', 4]] },
  { date: '2026-04-13', target: 9600, items: [['Centrum Adults Tablets', 6], ['Mupirocin 2% Ointment (Bactroban)', 5]] },
  { date: '2026-04-16', target: 9600, items: [['Budesonide 200mcg Inhaler (Pulmicort)', 11], ['Ferrous Sulphate 200mg Tablets (Feospan)', 10]] },
  { date: '2026-04-18', target: 9600, items: [['Fluticasone 125mcg Inhaler (Flixotide)', 12], ['Vitamin D3 1000IU Tablets (D-Sol)', 3]] },
  { date: '2026-04-21', target: 9600, items: [['Atorvastatin 20mg Tablets (Lipitor)', 20], ['Cephalexin 500mg Capsules (Keflex)', 7]] },
  { date: '2026-04-23', target: 9600, items: [['Cefixime 400mg Tablets (Cefix)', 20], ['Rosuvastatin 10mg Tablets (Crestor)', 7]] },
  { date: '2026-04-28', target: 9600, items: [['Sitagliptin 100mg Tablets (Januvia)', 4], ['Terbinafine 1% Cream (Lamisil)', 5]] },
  { date: '2026-04-29', target: 9770, items: [['Latanoprost 0.005% Eye Drops (Xalatan)', 6], ['Centrum Adults Tablets', 2]] },
];

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let totalAdded = 0;
  for (const plan of PLANS) {
    const stock = await refreshStock(client);
    const items = [];
    let subtotal = 0;
    for (const [name, qty] of plan.items) {
      const batch = pickBatch(stock, name, qty);
      if (!batch) { console.error(`FAILED: no batch for ${name} qty ${qty} on ${plan.date}`); process.exit(1); }
      items.push({ medicine_id: batch.medicine_id, batch_id: batch.batch_id, quantity: qty, unit_price: batch.mrp, discount_pct: 0 });
      subtotal += batch.mrp * qty;
    }
    const discountAmt = Math.max(0, Math.round((subtotal - plan.target) * 100) / 100);
    const total = subtotal - discountAmt;

    const shiftId = await getShiftForDate(client, plan.date);
    await client.query(`UPDATE shifts SET status = 'open' WHERE id = $1`, [shiftId]);
    try {
      const res = await client.query(
        `SELECT complete_sale($1::uuid, $2::uuid, 'cash'::text, $3::jsonb, $4::numeric, 0::numeric, $5::numeric, 'Catch-up bulk sale'::text) as result`,
        [PHARMACIST_ID, WALKIN_ID, JSON.stringify(items), discountAmt, total]
      );
      const saleId = res.rows[0].result.sale_id;
      const { rows: jeRows } = await client.query(
        `SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [saleId]
      );
      const timestamp = `${plan.date}T14:00:00+05:00`;
      await backdateJournalEntry(client, {
        entryId: jeRows[0].id, entryDate: plan.date,
        sourceTable: 'sales', sourceId: saleId, sourceDateColumn: 'created_at', sourceTimestamp: timestamp,
      });
      totalAdded += total;
      console.log(`${plan.date}: subtotal=${subtotal.toFixed(2)} discount=${discountAmt.toFixed(2)} total=${total.toFixed(2)} sale_id=${saleId}`);
    } finally {
      await client.query(`UPDATE shifts SET status = 'closed' WHERE id = $1`, [shiftId]);
    }
  }

  console.log(`\nCatch-up total added: PKR ${totalAdded.toFixed(2)}`);

  const { rows } = await client.query(
    `SELECT COUNT(*)::int as cnt, COALESCE(SUM(total_amount),0) as rev FROM sales WHERE created_at >= '2026-04-01' AND created_at < '2026-05-01'`
  );
  console.log(`April final: ${rows[0].cnt} sales, PKR ${rows[0].rev}`);

  const { rows: balRows } = await client.query(
    `SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits, SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits
     FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')`
  );
  console.log(`Journal balance: debits=${balRows[0].debits} credits=${balRows[0].credits}`);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
