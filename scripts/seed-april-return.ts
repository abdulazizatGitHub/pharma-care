import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const PHARMACIST_ID = '69c6f228-6a95-44ee-addf-fc3ca45a3d49';
const SALE_ITEM_ID = '231818ec-7e81-4395-991e-80b84189c565';
const SALE_ID = '48ed465d-e35c-42ab-9d30-68b0cdaa2dec';
const RETURN_DATE = '2026-04-14';

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: preStock } = await client.query(
    `SELECT sb.id, sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id = si.batch_id WHERE si.id = $1`,
    [SALE_ITEM_ID]
  );
  console.log('Batch quantity BEFORE return:', preStock[0]);

  const returnItems = JSON.stringify([{ sale_item_id: SALE_ITEM_ID, quantity_returned: 2 }]);

  console.log('\n--- Mode A: initiate ---');
  const modeA = await client.query(
    `SELECT process_return($1::uuid, $2::jsonb, NULL, $3::text, false, $4::uuid, NULL) as result`,
    [SALE_ID, returnItems, 'Wrong medicine dispensed', PHARMACIST_ID]
  );
  console.log(modeA.rows[0].result);
  const returnId = modeA.rows[0].result.return_id;
  const status = modeA.rows[0].result.status;

  let finalResult = modeA.rows[0].result;
  if (status === 'pending_approval') {
    console.log('\n--- Mode B: approve ---');
    const modeB = await client.query(
      `SELECT process_return(NULL, NULL, NULL, NULL, false, $1::uuid, $2::uuid) as result`,
      [PHARMACIST_ID, returnId]
    );
    finalResult = modeB.rows[0].result;
    console.log(finalResult);
  }

  const journalEntryId = finalResult.journal_entry_id;
  if (journalEntryId) {
    await backdateJournalEntry(client, { entryId: journalEntryId, entryDate: RETURN_DATE });
    console.log(`\nBackdated return journal entry ${journalEntryId} to ${RETURN_DATE}`);
  }

  const { rows: postStock } = await client.query(
    `SELECT sb.id, sb.quantity FROM sale_items si JOIN stock_batches sb ON sb.id = si.batch_id WHERE si.id = $1`,
    [SALE_ITEM_ID]
  );
  console.log('Batch quantity AFTER return:', postStock[0]);

  const { rows: je } = await client.query(
    `SELECT je.entry_date::text, je.status, jl.direction, a.code, jl.amount
     FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id JOIN accounts a ON a.id = jl.account_id
     WHERE je.id = $1 ORDER BY jl.direction DESC`,
    [journalEntryId]
  );
  console.log('\nReversal journal entry lines:', je);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
