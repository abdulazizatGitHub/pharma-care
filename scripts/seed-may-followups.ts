import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';
const IMRAN_ID = '399a3630-4c2a-40b4-b724-3f05be82abce';
const HASSAN_ID = '91f85b82-a588-4b9d-933a-a76f810411d2';

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
  return paymentId;
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
  console.log(`Supplier payment ${paymentId}: PKR ${amount} via ${method} on ${date} (entry_date passed directly, no backdate needed)`);
  return paymentId;
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('--- Customer payment 1: Imran partial ---');
  await recordCustomerPayment(client, IMRAN_ID, 20000, 'bank_transfer', '2026-05-18', 'Partial payment received');
  const { rows: imranBal } = await client.query(`SELECT credit_balance FROM customers WHERE id = $1`, [IMRAN_ID]);
  console.log('Imran balance after payment:', imranBal[0].credit_balance);

  console.log('\n--- Customer payment 2: Hassan full settlement (actual balance 7460) ---');
  await recordCustomerPayment(client, HASSAN_ID, 7460, 'cash', '2026-05-24', 'Full settlement');
  const { rows: hassanBal } = await client.query(`SELECT credit_balance FROM customers WHERE id = $1`, [HASSAN_ID]);
  console.log('Hassan balance after payment:', hassanBal[0].credit_balance);

  console.log('\n--- Return 1: Latanoprost, ~1200, expired item ---');
  const { rows: beforeStock1 } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, ['bda49a67-4187-4ede-a006-28fb6fa6002f']);
  console.log('Stock before:', beforeStock1[0]);
  await processReturn(client, '1a4ddd0f-20e5-4120-b00e-f96ad3e2c982', 'bda49a67-4187-4ede-a006-28fb6fa6002f', 1, 'Expired item returned by customer', '2026-05-13');
  const { rows: afterStock1 } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, ['bda49a67-4187-4ede-a006-28fb6fa6002f']);
  console.log('Stock after:', afterStock1[0]);

  console.log('\n--- Return 2: Mupirocin, ~2400, quantity error ---');
  const { rows: beforeStock2 } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, ['639dc579-0cfb-4492-a83d-a7e3c3e8b8d6']);
  console.log('Stock before:', beforeStock2[0]);
  await processReturn(client, '1f0b56c6-5076-44aa-8515-d334d02ca491', '639dc579-0cfb-4492-a83d-a7e3c3e8b8d6', 5, 'Quantity error', '2026-05-26');
  const { rows: afterStock2 } = await client.query(`SELECT sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id=si.batch_id WHERE si.id=$1`, ['639dc579-0cfb-4492-a83d-a7e3c3e8b8d6']);
  console.log('Stock after:', afterStock2[0]);

  console.log('\n--- Supplier payments ---');
  const { rows: suppliers } = await client.query(`SELECT id, name FROM suppliers WHERE name IN ('Medi-Tech Distributors','Al-Shifa Medical Supplies')`);
  const supplierByName = new Map(suppliers.map((s: any) => [s.name, s.id]));
  await recordSupplierPayment(client, supplierByName.get('Medi-Tech Distributors') as string, 80000, 'bank_transfer', '2026-05-10', 'Payment against April POs');
  await recordSupplierPayment(client, supplierByName.get('Al-Shifa Medical Supplies') as string, 78000, 'cheque', '2026-05-25', 'Settlement of PO-002');

  const { rows: apTotal2 } = await client.query(
    `SELECT SUM(jl.amount) as total_paid FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id WHERE a.code = '2000' AND jl.direction = 'debit' AND je.status IN ('posted','reversed')`
  );
  console.log('Total AP debits (payments made against 2000):', apTotal2[0].total_paid);

  console.log('\n--- Final checkpoint 3 ---');
  const { rows: sales } = await client.query(`SELECT COUNT(*)::int as cnt, SUM(total_amount) as rev FROM sales WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'`);
  console.log('May sales:', sales[0]);
  const { rows: returns } = await client.query(`SELECT COUNT(*) FROM returns WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'`);
  console.log('May returns:', returns[0].count);
  const { rows: bal } = await client.query(`SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits, SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')`);
  console.log('Global journal balance:', bal[0]);
  const { rows: depleted } = await client.query(`SELECT COUNT(*) FROM stock_batches WHERE quantity <= 0`);
  console.log('Depleted batches:', depleted[0].count);
  const { rows: openShifts } = await client.query(`SELECT COUNT(*) FROM shifts WHERE status='open'`);
  console.log('Open shifts:', openShifts[0].count);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
