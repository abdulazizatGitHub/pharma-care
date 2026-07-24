import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';

async function processReturn(client: Client, saleId: string, saleItemId: string, qty: number, reason: string, date: string) {
  const returnItems = JSON.stringify([{ sale_item_id: saleItemId, quantity_returned: qty }]);
  const { rows: preStock } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, [saleItemId]);
  console.log('Stock before:', preStock[0]);

  const modeA = await client.query(
    `SELECT process_return($1::uuid, $2::jsonb, NULL, $3::text, false, $4::uuid, NULL) as result`,
    [saleId, returnItems, reason, PHARMACIST_ID]
  );
  let result = modeA.rows[0].result;
  console.log('Mode A:', result);
  if (result.status === 'pending_approval') {
    const modeB = await client.query(
      `SELECT process_return(NULL, NULL, NULL, NULL, false, $1::uuid, $2::uuid) as result`,
      [PHARMACIST_ID, result.return_id]
    );
    result = modeB.rows[0].result;
    console.log('Mode B:', result);
  }
  if (result.journal_entry_id) {
    await backdateJournalEntry(client, { entryId: result.journal_entry_id, entryDate: date });
  }
  await client.query(
    `UPDATE returns SET created_at = $1::timestamptz, approved_at = $1::timestamptz, completed_at = $1::timestamptz WHERE id = $2`,
    [`${date}T15:00:00+05:00`, result.return_id]
  );
  const { rows: postStock } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, [saleItemId]);
  console.log('Stock after:', postStock[0]);
  console.log(`Return ${result.return_no} backdated to ${date}, refund=${result.refund_amount}`);
  return result;
}

async function recordSupplierPayment(client: Client, supplierId: string, amount: number, method: string, date: string, notes: string) {
  const { rows: pay } = await client.query(
    `INSERT INTO supplier_payments (supplier_id, amount, payment_date, payment_method, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [supplierId, amount, date, method, notes, PHARMACIST_ID]
  );
  const paymentId = pay[0].id;
  const debitAccount = (method === 'bank_transfer' || method === 'cheque') ? '1001' : '1000';
  const lines = JSON.stringify([
    { account_code: '2000', direction: 'debit', amount: String(amount), party_type: 'supplier', party_id: supplierId, description: notes },
    { account_code: debitAccount, direction: 'credit', amount: String(amount), description: notes },
  ]);
  const { rows: je } = await client.query(
    `SELECT post_journal_entry($1::date, $2::text, 'supplier_payment', $3::uuid, 'PKR', 1.0, $4::jsonb, $5::uuid) as entry_id`,
    [date, notes, paymentId, lines, PHARMACIST_ID]
  );
  await client.query(`UPDATE supplier_payments SET journal_entry_id = $1 WHERE id = $2`, [je[0].entry_id, paymentId]);
  console.log(`Supplier payment ${paymentId}: PKR ${amount} via ${method} on ${date}`);
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('--- Return 1: Neurobion, ~650, damaged packaging ---');
  await processReturn(client, '75e443c3-6c45-45e6-88a6-6b5b6400d871', '5e5aa352-bd4f-4921-968e-e1bfbdc13787', 3, 'Damaged packaging', '2026-06-12');

  console.log('\n--- Return 2: Ciprofloxacin Eye Drops, ~1850, wrong strength ---');
  await processReturn(client, 'e26a6f2b-63d1-4bfa-bcf8-bdb94588a12b', '5dc95723-3b3b-420d-9575-f65c2388feea', 7, 'Wrong strength dispensed', '2026-06-22');

  console.log('\n--- Supplier payment: PharmaPak Wholesale ---');
  const { rows: supplier } = await client.query(`SELECT id FROM suppliers WHERE name = 'PharmaPak Wholesale'`);
  await recordSupplierPayment(client, supplier[0].id, 45000, 'cash', '2026-06-15', 'Settlement of PO-003 and PO-008');

  console.log('\n--- Final checkpoint 3 ---');
  const { rows: sales } = await client.query(`SELECT COUNT(*)::int as cnt, SUM(total_amount) as rev FROM sales WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01'`);
  console.log('June sales:', sales[0]);
  const { rows: returns } = await client.query(`SELECT COUNT(*) FROM returns WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01'`);
  console.log('June returns:', returns[0].count);
  const { rows: receivables } = await client.query(`SELECT name, credit_balance FROM customers WHERE credit_balance > 0 ORDER BY credit_balance DESC`);
  console.log('Outstanding receivables:');
  console.table(receivables);
  const { rows: bal } = await client.query(`SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits, SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')`);
  console.log('Global journal balance:', bal[0]);
  const { rows: depleted } = await client.query(`SELECT COUNT(*) FROM stock_batches WHERE quantity <= 0`);
  console.log('Depleted batches:', depleted[0].count);
  const { rows: openShifts } = await client.query(`SELECT COUNT(*) FROM shifts WHERE status='open'`);
  console.log('Open shifts:', openShifts[0].count);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
