import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';

const ADMIN_ID = 'e355dfd5-3dc6-428b-802b-ba8e735232af';
const SUPERADMIN_ID = '5085df41-6d82-4e55-8d5c-7c92934945b3';

const EXPENSES = [
  { date: '2026-04-01', desc: 'Shop Rent', amount: 25000, account: '6002', category: 'rent' },
  { date: '2026-04-05', desc: 'Electricity Bill', amount: 8500, account: '6001', category: 'electricity' },
  { date: '2026-04-10', desc: 'Internet & Phone', amount: 2800, account: '6006', category: 'other' },
  { date: '2026-04-15', desc: 'Miscellaneous', amount: 3200, account: '6008', category: 'other' },
  { date: '2026-04-30', desc: 'Staff Salary — Usman Raza', amount: 12000, account: '6003', category: 'salaries' },
  { date: '2026-05-01', desc: 'Shop Rent', amount: 25000, account: '6002', category: 'rent' },
  { date: '2026-05-05', desc: 'Electricity Bill', amount: 9200, account: '6001', category: 'electricity' },
  { date: '2026-05-10', desc: 'Internet & Phone', amount: 2800, account: '6006', category: 'other' },
  { date: '2026-05-15', desc: 'Miscellaneous', amount: 2100, account: '6008', category: 'other' },
  { date: '2026-05-31', desc: 'Staff Salary — Usman Raza', amount: 12000, account: '6003', category: 'salaries' },
  { date: '2026-06-01', desc: 'Shop Rent', amount: 25000, account: '6002', category: 'rent' },
  { date: '2026-06-05', desc: 'Electricity Bill', amount: 7800, account: '6001', category: 'electricity' },
  { date: '2026-06-10', desc: 'Internet & Phone', amount: 2800, account: '6006', category: 'other' },
  { date: '2026-06-20', desc: 'Miscellaneous', amount: 4500, account: '6008', category: 'other' },
  { date: '2026-06-30', desc: 'Staff Salary — Usman Raza', amount: 12000, account: '6003', category: 'salaries' },
];

async function postJournalEntry(client: Client, date: string, desc: string, refType: string, refId: string | null, lines: any[], createdBy: string) {
  const { rows } = await client.query(
    `SELECT post_journal_entry($1::date, $2::text, $3::text, $4::uuid, 'PKR', 1.0, $5::jsonb, $6::uuid) as entry_id`,
    [date, desc, refType, refId, JSON.stringify(lines), createdBy]
  );
  return rows[0].entry_id;
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('=== STEP E6: Expenses ===');
  for (const exp of EXPENSES) {
    const { rows: expRow } = await client.query(
      `INSERT INTO expenses (amount, category, description, expense_date, account_code, payment_method, recorded_by) VALUES ($1,$2,$3,$4,$5,'cash',$6) RETURNING id`,
      [exp.amount, exp.category, exp.desc, exp.date, exp.account, ADMIN_ID]
    );
    const expenseId = expRow[0].id;
    const lines = [
      { account_code: exp.account, direction: 'debit', amount: String(exp.amount), description: exp.desc },
      { account_code: '1000', direction: 'credit', amount: String(exp.amount), description: exp.desc },
    ];
    const entryId = await postJournalEntry(client, exp.date, exp.desc, 'expense', expenseId, lines, ADMIN_ID);
    await client.query(`UPDATE expenses SET journal_entry_id = $1 WHERE id = $2`, [entryId, expenseId]);
    console.log(`${exp.date}: ${exp.desc} PKR ${exp.amount} -> account ${exp.account}, expense ${expenseId}, entry ${entryId}`);
  }

  const { rows: expCount } = await client.query(`SELECT COUNT(*)::int as cnt, SUM(amount) as total FROM expenses`);
  console.log('Expenses total:', expCount[0]);

  console.log('\n=== STEP E7: Borrowing ===');
  const borrowEntry = await postJournalEntry(client, '2026-04-15', 'Capital supplement — owner loan', 'borrowing_in', null, [
    { account_code: '1000', direction: 'debit', amount: '50000', description: 'Owner loan received' },
    { account_code: '2010', direction: 'credit', amount: '50000', description: 'Owner loan received' },
  ], SUPERADMIN_ID);
  console.log('Borrow entry:', borrowEntry);

  const repayEntry = await postJournalEntry(client, '2026-05-20', 'Partial loan repayment', 'borrowing_payment', null, [
    { account_code: '2010', direction: 'debit', amount: '30000', description: 'Partial loan repayment' },
    { account_code: '1000', direction: 'credit', amount: '30000', description: 'Partial loan repayment' },
  ], SUPERADMIN_ID);
  console.log('Repay entry:', repayEntry);

  const { rows: borrowBal } = await client.query(`
    SELECT SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount ELSE -jl.amount END) as outstanding
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
    WHERE a.code = '2010' AND je.status IN ('posted','reversed')
  `);
  console.log('Outstanding borrowing (2010):', borrowBal[0].outstanding);

  console.log('\n=== STEP E8: Manual entry + reversal ===');
  const manualEntry = await postJournalEntry(client, '2026-05-05', 'Miscellaneous income — equipment sale', 'manual', null, [
    { account_code: '1000', direction: 'debit', amount: '5000', description: 'Equipment sale proceeds' },
    { account_code: '4010', direction: 'credit', amount: '5000', description: 'Equipment sale proceeds' },
  ], SUPERADMIN_ID);
  console.log('Manual entry posted:', manualEntry);

  const reversalEntry = await postJournalEntry(client, '2026-05-08', 'Reversal — entry posted in error', 'manual', null, [
    { account_code: '4010', direction: 'debit', amount: '5000', description: 'Reversal of equipment sale proceeds' },
    { account_code: '1000', direction: 'credit', amount: '5000', description: 'Reversal of equipment sale proceeds' },
  ], SUPERADMIN_ID);
  console.log('Reversal entry posted:', reversalEntry);

  await client.query(`SELECT mark_entry_reversed($1::uuid, $2::uuid)`, [manualEntry, reversalEntry]);
  console.log('mark_entry_reversed() called');

  const { rows: statusCheck } = await client.query(
    `SELECT id, entry_date::text, status FROM journal_entries WHERE id IN ($1,$2) ORDER BY entry_date`,
    [manualEntry, reversalEntry]
  );
  console.log('Status check:', statusCheck);

  const { rows: cashNet } = await client.query(`
    SELECT SUM(CASE WHEN jl.direction='debit' THEN jl.amount ELSE -jl.amount END) as net
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
    WHERE je.id IN ($1,$2) AND a.code = '1000'
  `, [manualEntry, reversalEntry]);
  console.log('Net effect on Cash (1000) from these 2 entries:', cashNet[0].net);

  console.log('\n=== FINAL VERIFICATION ===');
  const { rows: bal } = await client.query(`
    SELECT SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) as debits,
           SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) as credits
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.status IN ('posted','reversed')
  `);
  console.log('Global journal balance:', bal[0], 'diff=', (Number(bal[0].debits) - Number(bal[0].credits)).toFixed(4));

  const { rows: breakdown } = await client.query(`
    SELECT reference_type, COUNT(*) as cnt FROM journal_entries WHERE status IN ('posted','reversed') GROUP BY reference_type ORDER BY cnt DESC
  `);
  console.log('Journal entry type breakdown:');
  console.table(breakdown);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
