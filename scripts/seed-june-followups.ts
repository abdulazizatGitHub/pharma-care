import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';
const ZAFAR_ID = 'eae5a627-0642-4553-b303-b41cd1e85979';
const MALIK_ID = 'b2607065-bd14-4598-a411-bf606869484c';

async function recordCustomerPayment(client: Client, customerId: string, amount: number, method: string, date: string, notes: string) {
  const res = await client.query(
    `SELECT record_customer_payment($1::uuid, $2::numeric, $3::text, NULL, $4::text, $5::uuid) as payment_id`,
    [customerId, amount, method, notes, PHARMACIST_ID]
  );
  const paymentId = res.rows[0].payment_id;
  const { rows: jeRows } = await client.query(
    `SELECT id FROM journal_entries WHERE reference_type = 'customer_payment' AND reference_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [paymentId]
  );
  await backdateJournalEntry(client, {
    entryId: jeRows[0].id, entryDate: date,
    sourceTable: 'customer_payments', sourceId: paymentId, sourceDateColumn: 'created_at', sourceTimestamp: `${date}T11:00:00+05:00`,
  });
  console.log(`Customer payment ${paymentId}: PKR ${amount} via ${method} on ${date}, backdated`);
}

async function processReturn(client: Client, saleId: string, saleItemId: string, qty: number, reason: string, date: string) {
  const returnItems = JSON.stringify([{ sale_item_id: saleItemId, quantity_returned: qty }]);
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

  console.log('--- Customer payment 1: Zafar partial ---');
  await recordCustomerPayment(client, ZAFAR_ID, 25000, 'bank_transfer', '2026-06-18', 'Partial payment received');
  const { rows: zafarBal } = await client.query(`SELECT credit_balance FROM customers WHERE id = $1`, [ZAFAR_ID]);
  console.log('Zafar balance after payment:', zafarBal[0].credit_balance);

  console.log('\n--- Customer payment 2: Malik partial ---');
  await recordCustomerPayment(client, MALIK_ID, 15000, 'cash', '2026-06-22', 'Partial payment received');
  const { rows: malikBal } = await client.query(`SELECT credit_balance FROM customers WHERE id = $1`, [MALIK_ID]);
  console.log('Malik balance after payment:', malikBal[0].credit_balance);

  console.log('\n--- Return candidates ---');
  const r1 = await client.query(`SELECT si.id as sale_item_id, si.sale_id, si.quantity, si.total_price, s.created_at::date::text as sale_date, m.name, m.schedule FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN medicines m ON m.id=si.medicine_id WHERE s.payment_type='cash' AND s.created_at::date BETWEEN '2026-06-10' AND '2026-06-14' AND m.schedule != 'controlled' ORDER BY ABS(si.total_price - 650) ASC LIMIT 5`);
  console.log('Return 1 candidates (~650, around Jun 12):', r1.rows);
  const r2 = await client.query(`SELECT si.id as sale_item_id, si.sale_id, si.quantity, si.total_price, s.created_at::date::text as sale_date, m.name, m.schedule FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN medicines m ON m.id=si.medicine_id WHERE s.payment_type='cash' AND s.created_at::date BETWEEN '2026-06-20' AND '2026-06-24' AND m.schedule != 'controlled' ORDER BY ABS(si.total_price - 1850) ASC LIMIT 5`);
  console.log('Return 2 candidates (~1850, around Jun 22):', r2.rows);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
