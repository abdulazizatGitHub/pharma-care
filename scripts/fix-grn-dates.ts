import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import { backdateJournalEntry } from './lib/backdate';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
  console.error('REFUSING: wrong project ref:', url);
  process.exit(1);
}

// PO number -> intended order date
const PO_DATES: Record<string, string> = {
  'PO-001': '2026-04-03',
  'PO-002': '2026-04-08',
  'PO-003': '2026-04-15',
  'PO-004': '2026-05-06',
  'PO-005': '2026-05-14',
  'PO-006': '2026-05-22',
  'PO-007': '2026-06-04',
  'PO-008': '2026-06-18',
};

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: grns } = await client.query(`
    SELECT gr.id as grn_id, gr.grn_number, po.po_number
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id = gr.po_id
    ORDER BY po.po_number
  `);

  for (const grn of grns) {
    const targetDate = PO_DATES[grn.po_number];
    if (!targetDate) { console.log(`Skipping ${grn.grn_number} (${grn.po_number}) - no target date mapped`); continue; }

    const { rows: jeRows } = await client.query(
      `SELECT id FROM journal_entries WHERE reference_type = 'grn' AND reference_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [grn.grn_id]
    );
    if (jeRows.length === 0) { console.log(`No journal entry found for ${grn.grn_number}`); continue; }

    await backdateJournalEntry(client, {
      entryId: jeRows[0].id,
      entryDate: targetDate,
      sourceTable: 'goods_receipts',
      sourceId: grn.grn_id,
      sourceDateColumn: 'received_at',
      sourceTimestamp: `${targetDate}T10:00:00+05:00`,
    });
    console.log(`Backdated ${grn.grn_number} (${grn.po_number}) -> entry_date=${targetDate}, journal_entry=${jeRows[0].id}`);
  }

  console.log('\n--- Verification: journal_entries WHERE reference_type=grn ---');
  const { rows: verify } = await client.query(
    `SELECT entry_date, description FROM journal_entries WHERE reference_type = 'grn' ORDER BY entry_date`
  );
  console.table(verify);

  await client.end();
}

main();
