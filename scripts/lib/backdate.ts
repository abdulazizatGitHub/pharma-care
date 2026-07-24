import { Client } from 'pg';

// Mirrors tests/helpers/test-client.ts's cleanupJournalEntries() pattern exactly:
// disable the immutability trigger inside a transaction, do an exact-UUID-scoped
// update, re-enable the trigger, commit. Guaranteed re-enable even on error.
export async function backdateJournalEntry(
  client: Client,
  opts: {
    entryId: string;
    entryDate: string; // 'YYYY-MM-DD'
    sourceTable?: string;
    sourceIdColumn?: string;
    sourceId?: string;
    sourceDateColumn?: string;
    sourceTimestamp?: string;
  }
): Promise<void> {
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_protect_posted');

    await client.query('UPDATE journal_entries SET entry_date = $1 WHERE id = $2', [opts.entryDate, opts.entryId]);

    if (opts.sourceTable && opts.sourceDateColumn && opts.sourceId) {
      const idCol = opts.sourceIdColumn || 'id';
      await client.query(
        `UPDATE ${opts.sourceTable} SET ${opts.sourceDateColumn} = $1 WHERE ${idCol} = $2`,
        [opts.sourceTimestamp, opts.sourceId]
      );
    }

    await client.query('ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_protect_posted');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    try {
      await client.query('ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_protect_posted');
    } catch {
      console.error('CRITICAL: failed to re-enable journal_entries_protect_posted after backdate error');
    }
    throw err;
  }
}
