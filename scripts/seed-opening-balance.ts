import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
  console.error('REFUSING: wrong project ref:', url);
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: sa } = await client.query("SELECT id FROM profiles WHERE role = 'superadmin'");
  const superadminId = sa[0].id;

  const lines = JSON.stringify([
    { account_code: '1000', direction: 'debit', amount: '85000', description: 'Opening cash balance' },
    { account_code: '1001', direction: 'debit', amount: '120000', description: 'Opening bank balance' },
    { account_code: '3000', direction: 'credit', amount: '205000', description: 'Owner equity — opening' },
  ]);

  const res = await client.query(
    `SELECT post_journal_entry($1::date, $2::text, $3::text, NULL, $4::text, $5::numeric, $6::jsonb, $7::uuid) as entry_id`,
    ['2026-04-01', 'Opening balances — PharmaCare launch', 'opening_balance', 'PKR', 1.0, lines, superadminId]
  );
  const entryId = res.rows[0].entry_id;
  console.log(`Opening balance journal entry created: ${entryId}`);

  const { rows: verify } = await client.query(
    `SELECT je.entry_date::text, je.status,
            SUM(CASE WHEN jl.direction='debit' THEN jl.amount ELSE 0 END) as total_debit,
            SUM(CASE WHEN jl.direction='credit' THEN jl.amount ELSE 0 END) as total_credit
     FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id
     WHERE je.id = $1 GROUP BY je.entry_date, je.status`,
    [entryId]
  );
  console.log('Verification:', verify[0]);

  console.log('\nAttempting a second opening_balance entry (should fail on unique index)...');
  try {
    await client.query(
      `SELECT post_journal_entry($1::date, $2::text, $3::text, NULL, $4::text, $5::numeric, $6::jsonb, $7::uuid) as entry_id`,
      ['2026-04-01', 'Duplicate opening balance attempt', 'opening_balance', 'PKR', 1.0, lines, superadminId]
    );
    console.log('UNEXPECTED: second opening_balance entry succeeded — guard NOT working!');
  } catch (e: any) {
    console.log('Guard confirmed working — second attempt correctly rejected:', e.message);
  }

  await client.end();
}

main();
