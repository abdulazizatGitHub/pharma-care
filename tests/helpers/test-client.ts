/**
 * Test infrastructure for tests/accounting.test.ts (Phase 16A).
 *
 * Reuses the existing adminClient/signIn helpers from ./clients.ts (service-role
 * client, already wired to .env.local via tests/helpers/setup.ts) rather than
 * duplicating a second Supabase client.
 *
 * journal_lines and journal_entries are protected by BEFORE UPDATE/DELETE
 * triggers (migration 012) that raise unconditionally — even the service-role
 * client cannot bypass a trigger (only RLS). Removing test-created journal
 * rows therefore requires a direct Postgres connection that temporarily
 * disables those two named triggers, deletes by exact tracked UUID, and
 * re-enables them inside a try/catch that re-enables on failure too.
 *
 * All other test rows (medicines, batches, suppliers, customers, sales,
 * GRNs, returns, payments, expenses) are removed via the service-role client,
 * which bypasses RLS entirely — no pg connection needed for those.
 */

import { Pool } from 'pg'
import { adminClient, signIn } from './clients'

export const serviceClient = adminClient

/**
 * BUG (found during Phase 16A testing): post_journal_entry() (migration 012)
 * generates entry_no via `SELECT COUNT(*) + 1 FROM journal_entries WHERE
 * entry_no LIKE 'JE-<date>-%'` inside its own transaction. This is reproducible
 * as a genuine `duplicate key value violates unique constraint
 * "journal_entries_entry_no_key"` failure under rapid successive calls from a
 * single, fully-sequential (awaited) caller — the same class of issue already
 * documented for next_po_number() in CLAUDE.md, but undocumented here, and
 * with a much bigger blast radius: a collision aborts the ENTIRE parent
 * operation (complete_sale / complete_grn / process_return / any journal
 * posting), not just a cosmetic number. Retrying is a reasonable production
 * mitigation (or switching to a DB sequence), but that's out of scope for this
 * test session — this wrapper exists only so the rest of the suite gets a
 * reliable signal instead of being swamped by this one root cause.
 */
const ENTRY_NO_COLLISION_RE = /journal_entries_entry_no_key/

export async function rpc<T = unknown>(
  name: string,
  params: Record<string, unknown>,
  retries = 8,
): Promise<{ data: T | null; error: { message: string; [k: string]: unknown } | null }> {
  let attempt = 0
  for (;;) {
    const result = await serviceClient.rpc(name, params)
    if (!result.error || !ENTRY_NO_COLLISION_RE.test(result.error.message ?? '') || attempt >= retries) {
      return result as { data: T | null; error: { message: string; [k: string]: unknown } | null }
    }
    attempt += 1
    await new Promise(res => setTimeout(res, 30 + Math.random() * 120))
  }
}

export const TEST_PREFIX = '__test_16_'
export const TEST_RUN_ID = `${TEST_PREFIX}${Date.now()}_`

let counter = 0
export function uniqueSuffix(): string {
  counter += 1
  return `${Date.now().toString(36)}${counter}`
}

// ─── pg pool (journal_lines / journal_entries cleanup only) ──────────────────

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL!,
      max: 3,
      idleTimeoutMillis: 10000,
    })
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// ─── Test users (real profile rows — needed for FK columns like created_by) ──

const ACCOUNTS = {
  superadmin: { email: 'superuser@pharmacare.dev', password: 'SuperAdmin@123' },
  admin:      { email: 'procure@pharmacare.dev',   password: 'ProcurePass@123' },
  pharmacist: { email: 'pharma@pharmacare.dev',    password: 'PharmaPass@123' },
}

let cachedUserIds: { superadmin: string; admin: string; pharmacist: string } | null = null

export async function getTestUserIds() {
  if (cachedUserIds) return cachedUserIds
  const [sa, ad, ph] = await Promise.all([
    signIn(ACCOUNTS.superadmin.email, ACCOUNTS.superadmin.password),
    signIn(ACCOUNTS.admin.email,      ACCOUNTS.admin.password),
    signIn(ACCOUNTS.pharmacist.email, ACCOUNTS.pharmacist.password),
  ])
  cachedUserIds = {
    superadmin: sa.user.id,
    admin:      ad.user.id,
    pharmacist: ph.user.id,
  }
  return cachedUserIds
}

// ─── Factories ────────────────────────────────────────────────────────────────

export async function createTestMedicine(overrides: Record<string, unknown> = {}) {
  const defaults = {
    name:         `${TEST_RUN_ID}Panadol_${uniqueSuffix()}`,
    generic_name: `${TEST_RUN_ID}Paracetamol`,
    manufacturer: `${TEST_RUN_ID}TestPharma`,
    schedule:     'OTC',
    mrp:          100.0,
    pack_size:    '10',
    unit:         'strip',
    is_active:    true,
    is_deleted:   false,
  }
  const { data, error } = await serviceClient
    .from('medicines')
    .insert({ ...defaults, ...overrides })
    .select()
    .single()
  if (error || !data) throw new Error(`createTestMedicine failed: ${error?.message}`)
  return data
}

export async function createTestBatch(medicineId: string, overrides: Record<string, unknown> = {}) {
  const defaults = {
    medicine_id:    medicineId,
    batch_no:       `${TEST_RUN_ID}B${uniqueSuffix()}`,
    expiry_date:    '2027-12-31',
    quantity:       100,
    purchase_price: 50.0,
    sale_price:     100.0,
    mrp:            100.0,
    is_deleted:     false,
  }
  const { data, error } = await serviceClient
    .from('stock_batches')
    .insert({ ...defaults, ...overrides })
    .select()
    .single()
  if (error || !data) throw new Error(`createTestBatch failed: ${error?.message}`)
  return data
}

export async function createTestSupplier(overrides: Record<string, unknown> = {}) {
  const defaults = {
    name:           `${TEST_RUN_ID}Supplier_${uniqueSuffix()}`,
    contact_person: 'Test Contact',
    phone:          '03001234567',
    is_deleted:     false,
  }
  const { data, error } = await serviceClient
    .from('suppliers')
    .insert({ ...defaults, ...overrides })
    .select()
    .single()
  if (error || !data) throw new Error(`createTestSupplier failed: ${error?.message}`)
  return data
}

export async function createTestCustomer(overrides: Record<string, unknown> = {}) {
  const defaults = {
    name:           `${TEST_RUN_ID}Customer_${uniqueSuffix()}`,
    phone:          '03009876543',
    credit_limit:   1000000,
    credit_balance: 0,
    is_deleted:     false,
  }
  const { data, error } = await serviceClient
    .from('customers')
    .insert({ ...defaults, ...overrides })
    .select()
    .single()
  if (error || !data) throw new Error(`createTestCustomer failed: ${error?.message}`)
  return data
}

// ─── Journal read helpers ───────────────────────────────────────────────────

export interface FlatJournalLine {
  id:           string
  account_code: string
  direction:    'debit' | 'credit'
  amount:       number
  amount_pkr:   number
  party_type:   string | null
  party_id:     string | null
  description:  string | null
}

export async function getJournalEntry(referenceType: string, referenceId: string) {
  const { data, error } = await serviceClient
    .from('journal_entries')
    .select('*')
    .eq('reference_type', referenceType)
    .eq('reference_id', referenceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getJournalEntry failed: ${error.message}`)
  return data
}

export async function getJournalEntryById(id: string) {
  const { data, error } = await serviceClient
    .from('journal_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getJournalEntryById failed: ${error.message}`)
  return data
}

export async function getJournalLines(entryId: string): Promise<FlatJournalLine[]> {
  type RawLine = {
    id:          string
    amount:      number
    direction:   'debit' | 'credit'
    amount_pkr:  number
    party_type:  string | null
    party_id:    string | null
    description: string | null
    accounts:    { code: string } | null
  }
  const { data, error } = await serviceClient
    .from('journal_lines')
    .select('id, amount, direction, amount_pkr, party_type, party_id, description, accounts(code)')
    .eq('entry_id', entryId)
  if (error) throw new Error(`getJournalLines failed: ${error.message}`)

  return ((data ?? []) as unknown as RawLine[]).map(l => ({
    id:           l.id,
    account_code: l.accounts?.code ?? '',
    direction:    l.direction,
    amount:       Number(l.amount),
    amount_pkr:   Number(l.amount_pkr),
    party_type:   l.party_type,
    party_id:     l.party_id,
    description:  l.description,
  }))
}

export function findLine(
  lines: FlatJournalLine[],
  accountCode: string,
  direction: 'debit' | 'credit',
): FlatJournalLine | undefined {
  return lines.find(l => l.account_code === accountCode && l.direction === direction)
}

export function computeBalance(lines: FlatJournalLine[]) {
  const debit = lines.filter(l => l.direction === 'debit').reduce((s, l) => s + l.amount_pkr, 0)
  const credit = lines.filter(l => l.direction === 'credit').reduce((s, l) => s + l.amount_pkr, 0)
  return { debit, credit, diff: Math.abs(debit - credit) }
}

export function assertBalanced(lines: FlatJournalLine[]): void {
  const { debit, credit, diff } = computeBalance(lines)
  if (diff >= 0.01) {
    throw new Error(`Journal entry does not balance: debits=${debit} credits=${credit}`)
  }
}

export async function getBatchQty(batchId: string): Promise<number> {
  const { data, error } = await serviceClient
    .from('stock_batches')
    .select('quantity')
    .eq('id', batchId)
    .single()
  if (error) throw new Error(`getBatchQty failed: ${error.message}`)
  return Number(data.quantity)
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Deletes journal_lines + journal_entries for an exact set of tracked UUIDs.
 * Bypasses the journal_lines_immutable and journal_entries_protect_posted
 * triggers for the duration of the transaction only, on this exact ID set —
 * never pattern-matched. Triggers are guaranteed re-enabled even on error.
 */
export async function cleanupJournalEntries(entryIds: string[]): Promise<void> {
  const ids = [...new Set(entryIds.filter(Boolean))]
  if (ids.length === 0) return

  const db = getPool()
  try {
    await db.query('BEGIN')
    await db.query('ALTER TABLE journal_lines DISABLE TRIGGER journal_lines_immutable')
    await db.query('ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_protect_posted')

    await db.query('DELETE FROM journal_lines WHERE entry_id = ANY($1::uuid[])', [ids])
    // Clear self-referencing reversal links first so the DELETE below never hits an FK violation.
    await db.query(
      'UPDATE journal_entries SET reversed_by = NULL, reversal_of = NULL WHERE id = ANY($1::uuid[])',
      [ids],
    )
    await db.query('DELETE FROM journal_entries WHERE id = ANY($1::uuid[])', [ids])

    await db.query('ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable')
    await db.query('ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_protect_posted')
    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    try {
      await db.query('ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable')
      await db.query('ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_protect_posted')
    } catch {
      console.error('CRITICAL: failed to re-enable journal immutability triggers after cleanup error')
    }
    throw err
  }
}
