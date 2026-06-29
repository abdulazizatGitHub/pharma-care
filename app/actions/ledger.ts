'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type {
  UserRole,
  JournalEntry,
  BorrowingTransactionType,
  PaymentMethod,
} from '@/lib/db-types'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getCallerContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, role: null as UserRole | null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { supabase, user, role: (profile?.role ?? null) as UserRole | null }
}

function canReadLedger(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin'
}

const LEDGER_PATHS = ['/superadmin/ledger', '/admin/ledger']

// ─── Exported response types (used by UI components) ─────────────────────────

export interface AccountBalance {
  account_id:     string
  code:           string
  name:           string
  account_type:   string
  normal_balance: 'debit' | 'credit'
  balance:        number
}

export interface PartyLedgerLine {
  entry_id:        string
  entry_date:      string
  entry_no:        string
  description:     string
  account_code:    string
  account_name:    string
  debit_amount:    number
  credit_amount:   number
  running_balance: number
}

export interface CashBookEntry {
  entry_time:      string
  entry_id:        string
  entry_no:        string
  description:     string
  in_amount:       number
  out_amount:      number
  opening_balance: number
  running_balance: number
}

export interface FinancialSummary {
  revenue:      number
  cogs:         number
  grossProfit:  number
  expenses:     number
  netProfit:    number
  dateFrom:     string
  dateTo:       string
}

export interface ManualJournalLineInput {
  account_code: string
  direction:    'debit' | 'credit'
  amount:       number
  party_type?:  'supplier' | 'customer' | 'pharmacy'
  party_id?:    string
  description?: string
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ManualLineSchema = z.object({
  account_code: z.string().min(1, 'Account code required'),
  direction:    z.enum(['debit', 'credit']),
  amount:       z.number().positive('Amount must be positive'),
  party_type:   z.enum(['supplier', 'customer', 'pharmacy']).optional(),
  party_id:     z.string().uuid('Invalid party ID').optional(),
  description:  z.string().max(500).optional(),
})

const ManualJournalSchema = z.object({
  entry_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().min(1, 'Description required').max(500),
  lines:       z.array(ManualLineSchema).min(2, 'At least 2 lines required'),
})

const SupplierPaymentSchema = z.object({
  supplier_id:    z.string().uuid(),
  amount:         z.number().positive('Amount must be positive'),
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['cash', 'bank_transfer', 'cheque']),
  reference_no:   z.string().max(100).optional(),
  notes:          z.string().max(500).optional(),
})

const CustomerPaymentSchema = z.object({
  customer_id:    z.string().uuid(),
  amount:         z.number().positive('Amount must be positive'),
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.string().max(50).default('cash'),
  notes:          z.string().max(500).optional(),
})

const BorrowingPharmacySchema = z.object({
  name:           z.string().min(1, 'Name required').max(200),
  contact_person: z.string().max(200).optional(),
  phone:          z.string().max(30).optional(),
  address:        z.string().max(500).optional(),
  notes:          z.string().max(500).optional(),
})

const BorrowingTransactionSchema = z.object({
  pharmacy_id:      z.string().uuid(),
  transaction_type: z.enum(['borrow_out', 'borrow_in', 'payment_out', 'payment_in']),
  medicine_id:      z.string().uuid().optional(),
  medicine_name:    z.string().max(200).optional(),
  quantity:         z.number().int().positive().optional(),
  unit_price:       z.number().positive().optional(),
  total_amount:     z.number().positive('Total amount must be positive'),
  payment_amount:   z.number().positive().optional(),
  payment_notes:    z.string().max(500).optional(),
  notes:            z.string().max(500).optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// ─── 1. getAccountBalances ────────────────────────────────────────────────────
// Returns balance for all active accounts.
// Balance direction follows each account's normal_balance convention.
// All calculation done in SQL via get_account_balances() — no JS arithmetic.

export async function getAccountBalances(): Promise<{
  data: AccountBalance[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)            return { data: null, error: 'Not authenticated' }
  if (!canReadLedger(role))      return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase.rpc('get_account_balances')
  if (error) return { data: null, error: error.message }

  return { data: (data ?? []) as AccountBalance[], error: null }
}

// ─── 2. getPartyLedger ────────────────────────────────────────────────────────
// Returns all journal lines tagged to a specific party with a running balance.
// running_balance sign: positive = net debit (party owes us); negative = net credit (we owe them).
// All calculation done in SQL via get_party_ledger().

export async function getPartyLedger(
  partyType: 'supplier' | 'customer' | 'pharmacy',
  partyId:   string,
  dateFrom?: string,
  dateTo?:   string,
): Promise<{
  data: PartyLedgerLine[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)       return { data: null, error: 'Not authenticated' }
  if (!canReadLedger(role)) return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase.rpc('get_party_ledger', {
    p_party_type: partyType,
    p_party_id:   partyId,
    p_date_from:  dateFrom ?? null,
    p_date_to:    dateTo   ?? null,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as PartyLedgerLine[], error: null }
}

// ─── 3. getCashBook ───────────────────────────────────────────────────────────
// Returns all Cash (account 1000) movements for a given date.
// opening_balance is pre-computed in SQL (sum of all prior Cash movements).
// running_balance = opening_balance + cumulative day movements per row.
// Returns { entries, openingBalance } — openingBalance is read from the first
// row (same value on all rows) or 0 when no entries exist for the day.

export async function getCashBook(date: string): Promise<{
  data: { entries: CashBookEntry[]; openingBalance: number } | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)       return { data: null, error: 'Not authenticated' }
  if (!canReadLedger(role)) return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase.rpc('get_cash_book', {
    p_date: date,
  })

  if (error) return { data: null, error: error.message }

  const entries = (data ?? []) as CashBookEntry[]
  const openingBalance = Number(entries[0]?.opening_balance ?? 0)

  return { data: { entries, openingBalance }, error: null }
}

// ─── 4. getJournalEntries ─────────────────────────────────────────────────────
// Returns a paginated list of journal entries.
// Filters: dateFrom/dateTo, status, referenceType.
// Does NOT return lines inline — call a detail action to load lines for a single entry.

export async function getJournalEntries(filters?: {
  dateFrom?:     string
  dateTo?:       string
  status?:       string
  referenceType?: string
  page?:         number
  pageSize?:     number
}): Promise<{
  data:  JournalEntry[] | null
  total: number
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)       return { data: null, total: 0, error: 'Not authenticated' }
  if (!canReadLedger(role)) return { data: null, total: 0, error: 'Insufficient permissions' }

  const page     = filters?.page     ?? 1
  const pageSize = filters?.pageSize ?? 20
  const offset   = (page - 1) * pageSize

  let query = supabase
    .from('journal_entries')
    .select('*', { count: 'exact' })
    .order('entry_date', { ascending: false })
    .order('entry_no',   { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (filters?.dateFrom)      query = query.gte('entry_date',    filters.dateFrom)
  if (filters?.dateTo)        query = query.lte('entry_date',    filters.dateTo)
  if (filters?.status)        query = query.eq('status',         filters.status)
  if (filters?.referenceType) query = query.eq('reference_type', filters.referenceType)

  const { data, count, error } = await query
  if (error) return { data: null, total: 0, error: error.message }

  return {
    data:  (data ?? []) as JournalEntry[],
    total: count ?? 0,
    error: null,
  }
}

// ─── 5. createManualJournalEntry ─────────────────────────────────────────────
// superadmin only.
// Validates that lines balance (JS pre-check for UX), then calls
// post_journal_entry() RPC which re-validates and enforces the balance
// constraint at the DB level. The DB check is authoritative.

export async function createManualJournalEntry(input: {
  entry_date:  string
  description: string
  lines:       ManualJournalLineInput[]
}): Promise<{ data?: { entryId: string; entryNo: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can create manual journal entries' }

  const parsed = ManualJournalSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { entry_date, description, lines } = parsed.data

  // UX pre-check: verify balance before calling the RPC
  // The RPC enforces this too — this check just gives a better error message
  const debitTotal  = lines.filter(l => l.direction === 'debit').reduce((s, l) => s + l.amount, 0)
  const creditTotal = lines.filter(l => l.direction === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(debitTotal - creditTotal) >= 0.01) {
    return {
      error: `Entry does not balance: debits Rs ${debitTotal.toFixed(2)}, credits Rs ${creditTotal.toFixed(2)}`,
    }
  }

  // Build the JSONB lines array for post_journal_entry()
  const rpcLines = lines.map(l => ({
    account_code: l.account_code,
    direction:    l.direction,
    amount:       l.amount.toString(),
    ...(l.party_type  ? { party_type:  l.party_type  } : {}),
    ...(l.party_id    ? { party_id:    l.party_id    } : {}),
    ...(l.description ? { description: l.description } : {}),
  }))

  const { data: entryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     entry_date,
    p_description:    description,
    p_reference_type: 'manual',
    p_reference_id:   null,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines:          rpcLines,
    p_created_by:     user.id,
  })

  if (rpcError || !entryId) return { error: rpcError?.message ?? 'Failed to create journal entry' }

  // Fetch the generated entry_no for the response
  const { data: entryRow } = await supabase
    .from('journal_entries')
    .select('entry_no')
    .eq('id', entryId as string)
    .single()

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.MANUAL_JOURNAL_ENTRY,
    tableName: 'journal_entries',
    recordId:  entryId as string,
    newValue:  { entry_date, description, line_count: lines.length, debit_total: debitTotal },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  return {
    data:  { entryId: entryId as string, entryNo: entryRow?.entry_no ?? '' },
    error: null,
  }
}

// ─── 6. reverseJournalEntry ───────────────────────────────────────────────────
// superadmin only.
// Creates a new equal-and-opposite journal entry (all debit/credit directions
// flipped), then calls mark_entry_reversed() RPC to atomically:
//   • set original entry status='reversed', reversed_by=new_entry_id
//   • set new entry reversal_of=original_entry_id
// The original entry's lines are never modified.

export async function reverseJournalEntry(
  entryId: string,
  reason:  string,
): Promise<{ data?: { reversalEntryId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can reverse journal entries' }

  if (!reason.trim()) return { error: 'Reason is required for reversals' }

  // Fetch the original entry — must be 'posted'
  const { data: original, error: fetchErr } = await supabase
    .from('journal_entries')
    .select('id, entry_no, entry_date, description, currency, exchange_rate, status')
    .eq('id', entryId)
    .single()

  if (fetchErr || !original) return { error: fetchErr?.message ?? 'Journal entry not found' }
  if (original.status !== 'posted') {
    return { error: `Cannot reverse a ${original.status} entry — only posted entries can be reversed` }
  }

  // Fetch all lines with account codes
  type RawLine = {
    amount:      number
    direction:   string
    amount_pkr:  number
    party_type:  string | null
    party_id:    string | null
    description: string | null
    accounts:    { code: string }
  }

  const { data: lines, error: linesErr } = await supabase
    .from('journal_lines')
    .select('amount, direction, amount_pkr, party_type, party_id, description, accounts(code)')
    .eq('entry_id', entryId)

  if (linesErr || !lines || lines.length === 0) {
    return { error: linesErr?.message ?? 'No journal lines found for this entry' }
  }

  // Build reversed lines (flip debit ↔ credit, preserve all other fields)
  const reversedLines = (lines as unknown as RawLine[]).map(l => ({
    account_code: l.accounts.code,
    direction:    l.direction === 'debit' ? 'credit' : 'debit',
    amount:       l.amount.toString(),
    ...(l.party_type ? { party_type: l.party_type } : {}),
    ...(l.party_id   ? { party_id:   l.party_id   } : {}),
    description:  l.description ? `[Reversal] ${l.description}` : '[Reversal]',
  }))

  // Create the reversal entry
  const { data: reversalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     original.entry_date,
    p_description:    `Reversal of ${original.entry_no}: ${reason.trim()}`,
    p_reference_type: 'adjustment',
    p_reference_id:   entryId,
    p_currency:       original.currency,
    p_exchange_rate:  original.exchange_rate,
    p_lines:          reversedLines,
    p_created_by:     user.id,
  })

  if (rpcError || !reversalEntryId) {
    return { error: rpcError?.message ?? 'Failed to create reversal entry' }
  }

  // Atomically link original ↔ reversal
  const { error: markError } = await supabase.rpc('mark_entry_reversed', {
    p_original_id: entryId,
    p_reversal_id: reversalEntryId as string,
  })

  if (markError) {
    // Reversal entry was created but linking failed — log for investigation
    console.error('[reverseJournalEntry] mark_entry_reversed failed:', markError.message,
      '| reversal_entry_id:', reversalEntryId)
    return { error: `Reversal entry created but linking failed: ${markError.message}` }
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.REVERSE_JOURNAL_ENTRY,
    tableName: 'journal_entries',
    recordId:  entryId,
    newValue:  { reversal_entry_id: reversalEntryId as string, reason: reason.trim() },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  return { data: { reversalEntryId: reversalEntryId as string }, error: null }
}

// ─── 7. recordSupplierPayment ─────────────────────────────────────────────────
// superadmin only.
// Records a payment to a supplier:
//   DEBIT  2000 Accounts Payable  amount  [party: supplier]
//   CREDIT 1000 Cash / 1001 Bank  amount  (routed by payment_method)
// Inserts payment row first (gets its ID), then posts journal entry with
// p_reference_id=paymentId so the journal entry FK back to payment is populated.

export async function recordSupplierPayment(input: {
  supplier_id:    string
  amount:         number
  payment_date:   string
  payment_method: PaymentMethod
  reference_no?:  string
  notes?:         string
}): Promise<{ data?: { paymentId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can record supplier payments' }

  const parsed = SupplierPaymentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supplier_id, amount, payment_date, payment_method, reference_no, notes } = parsed.data

  // Verify supplier exists
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('id', supplier_id)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!supplier) return { error: 'Supplier not found' }

  // Route payment to correct account: cash→1000, bank/cheque→1001
  const creditAccount =
    payment_method === 'bank_transfer' ? '1001' :
    payment_method === 'cheque'        ? '1001' : '1000'

  // Insert payment record first so its ID can be threaded as p_reference_id
  const { data: payment, error: insertError } = await supabase
    .from('supplier_payments')
    .insert({
      supplier_id,
      amount,
      payment_date,
      payment_method,
      reference_no: reference_no ?? null,
      notes:        notes ?? null,
      created_by:   user.id,
    })
    .select('id')
    .single()

  if (insertError || !payment) return { error: insertError?.message ?? 'Failed to save payment record' }

  // Post journal entry: Debit AP, Credit payment account
  const { data: journalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     payment_date,
    p_description:    `Payment to ${supplier.name}${reference_no ? ` (${reference_no})` : ''}`,
    p_reference_type: 'supplier_payment',
    p_reference_id:   payment.id,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines: [
      {
        account_code: '2000',
        direction:    'debit',
        amount:       amount.toString(),
        party_type:   'supplier',
        party_id:     supplier_id,
        description:  `AP reduction — ${supplier.name}`,
      },
      {
        account_code: creditAccount,
        direction:    'credit',
        amount:       amount.toString(),
        description:  `Payment to ${supplier.name}`,
      },
    ],
    p_created_by: user.id,
  })

  if (rpcError || !journalEntryId) return { error: rpcError?.message ?? 'Failed to post journal entry' }

  // Link journal entry back to the payment record
  const { error: linkError } = await supabase
    .from('supplier_payments')
    .update({ journal_entry_id: journalEntryId as string })
    .eq('id', payment.id)

  if (linkError) {
    console.error('[recordSupplierPayment] journal_entry_id link failed:', linkError.message,
      '| payment_id:', payment.id, '| je_id:', journalEntryId)
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.SUPPLIER_PAYMENT,
    tableName: 'supplier_payments',
    recordId:  payment.id,
    newValue:  { supplier_id, amount, payment_date, payment_method },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/ledger/suppliers')
  return { data: { paymentId: payment.id as string }, error: null }
}

// ─── 8. recordCustomerPayment ─────────────────────────────────────────────────
// superadmin only.
// Records an udhaar collection from a customer:
//   DEBIT  1000 Cash / 1001 Bank        amount  (routed by payment_method)
//   CREDIT 1100 Accounts Receivable     amount  [party: customer]
// Inserts payment row first (gets its ID), then posts journal entry with
// p_reference_id=paymentId. Then decrements customers.credit_balance.
//
// Note: journal entry and credit_balance decrement are separate operations.
// Full atomicity requires migration 033 (record_customer_payment RPC).
// If credit_balance update fails, an error is returned so the caller can alert
// the user — the payment row and journal entry are already committed.

export async function recordCustomerPayment(input: {
  customer_id:    string
  amount:         number
  payment_date:   string
  payment_method?: string
  notes?:         string
}): Promise<{ data?: { paymentId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can record customer payments' }

  const parsed = CustomerPaymentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { customer_id, amount, payment_date, payment_method, notes } = parsed.data

  // Verify customer exists and has sufficient outstanding balance
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, credit_balance')
    .eq('id', customer_id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!customer) return { error: 'Customer not found' }

  const outstanding = Number(customer.credit_balance ?? 0)
  if (amount > outstanding + 0.01) {
    return {
      error: `Payment amount Rs ${amount} exceeds outstanding balance Rs ${outstanding.toFixed(2)}`,
    }
  }

  // Route payment to correct account: cash→1000, bank/cheque→1001
  const debitAccount =
    payment_method === 'bank_transfer' ? '1001' :
    payment_method === 'cheque'        ? '1001' : '1000'

  // Insert payment record first so its ID can be threaded as p_reference_id
  const { data: payment, error: insertError } = await supabase
    .from('customer_payments')
    .insert({
      customer_id,
      amount,
      payment_date,
      payment_method: payment_method ?? 'cash',
      notes:          notes ?? null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !payment) return { error: insertError?.message ?? 'Failed to save payment record' }

  // Post journal entry: Debit payment account, Credit AR
  const { data: journalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     payment_date,
    p_description:    `Udhaar collection from ${customer.name}`,
    p_reference_type: 'customer_payment',
    p_reference_id:   payment.id,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines: [
      {
        account_code: debitAccount,
        direction:    'debit',
        amount:       amount.toString(),
        description:  `Cash received from ${customer.name}`,
      },
      {
        account_code: '1100',
        direction:    'credit',
        amount:       amount.toString(),
        party_type:   'customer',
        party_id:     customer_id,
        description:  `AR reduction — ${customer.name}`,
      },
    ],
    p_created_by: user.id,
  })

  if (rpcError || !journalEntryId) return { error: rpcError?.message ?? 'Failed to post journal entry' }

  // Link journal entry back to the payment record
  const { error: linkError } = await supabase
    .from('customer_payments')
    .update({ journal_entry_id: journalEntryId as string })
    .eq('id', payment.id)

  if (linkError) {
    console.error('[recordCustomerPayment] journal_entry_id link failed:', linkError.message,
      '| payment_id:', payment.id, '| je_id:', journalEntryId)
  }

  // Decrement customer's denormalized credit balance
  const { error: balanceError } = await supabase
    .from('customers')
    .update({
      credit_balance: Math.max(0, outstanding - amount),
      updated_at:     new Date().toISOString(),
    })
    .eq('id', customer_id)

  if (balanceError) {
    console.error('[recordCustomerPayment] credit_balance update failed:', balanceError.message,
      '| payment_id:', payment.id, '| amount:', amount)
    return {
      error: `Payment recorded but customer balance update failed. Please contact support. Payment ID: ${payment.id}`,
    }
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CUSTOMER_PAYMENT,
    tableName: 'customer_payments',
    recordId:  payment.id,
    newValue:  { customer_id, amount, payment_date, payment_method },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/ledger/customers')
  return { data: { paymentId: payment.id as string }, error: null }
}

// ─── 9. createBorrowingPharmacy ───────────────────────────────────────────────
// superadmin only.
// Registers a neighboring pharmacy for the borrowing module.

export async function createBorrowingPharmacy(input: {
  name:           string
  contact_person?: string
  phone?:         string
  address?:       string
  notes?:         string
}): Promise<{ data?: { pharmacyId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can manage borrowing pharmacies' }

  const parsed = BorrowingPharmacySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: row, error: insertError } = await supabase
    .from('borrowing_pharmacies')
    .insert({
      name:           parsed.data.name,
      contact_person: parsed.data.contact_person ?? null,
      phone:          parsed.data.phone          ?? null,
      address:        parsed.data.address        ?? null,
      notes:          parsed.data.notes          ?? null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create borrowing pharmacy' }

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/ledger/borrowing')
  return { data: { pharmacyId: row.id as string }, error: null }
}

// ─── 10. createBorrowingTransaction ───────────────────────────────────────────
// superadmin only.
// Records a medicine borrow or cash settlement with a neighboring pharmacy.
//
// Auto-posting rules per transaction_type (Section 4.1):
//   borrow_out  → DEBIT 1110 Borrowing Receivable, CREDIT 1200 Inventory [party:pharmacy]
//   borrow_in   → DEBIT 1200 Inventory, CREDIT 2010 Borrowing Payable    [party:pharmacy]
//   payment_in  → DEBIT 1000 Cash, CREDIT 1110 Borrowing Receivable      [party:pharmacy]
//   payment_out → DEBIT 2010 Borrowing Payable, CREDIT 1000 Cash         [party:pharmacy]
//
// current_balance update:
//   borrow_out  → +total_amount  (they owe us more)
//   borrow_in   → -total_amount  (we owe them more)
//   payment_in  → -total_amount  (their debt to us decreases)
//   payment_out → +total_amount  (our debt to them decreases)

const BORROW_JOURNAL_MAP: Record<
  BorrowingTransactionType,
  { debit: string; credit: string; balanceDelta: 1 | -1 }
> = {
  borrow_out:  { debit: '1110', credit: '1200', balanceDelta:  1 },
  borrow_in:   { debit: '1200', credit: '2010', balanceDelta: -1 },
  payment_in:  { debit: '1000', credit: '1110', balanceDelta: -1 },
  payment_out: { debit: '2010', credit: '1000', balanceDelta:  1 },
}

export async function createBorrowingTransaction(input: {
  pharmacy_id:       string
  transaction_type:  BorrowingTransactionType
  medicine_id?:      string
  medicine_name?:    string
  quantity?:         number
  unit_price?:       number
  total_amount:      number
  payment_amount?:   number
  payment_notes?:    string
  notes?:            string
  transaction_date:  string
}): Promise<{ data?: { transactionId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can record borrowing transactions' }

  const parsed = BorrowingTransactionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const {
    pharmacy_id, transaction_type, medicine_id, medicine_name,
    quantity, unit_price, total_amount, payment_amount, payment_notes,
    notes, transaction_date,
  } = parsed.data

  // Verify pharmacy exists and is active
  const { data: pharmacy } = await supabase
    .from('borrowing_pharmacies')
    .select('id, name, current_balance')
    .eq('id', pharmacy_id)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .maybeSingle()

  if (!pharmacy) return { error: 'Borrowing pharmacy not found or inactive' }

  const { debit, credit, balanceDelta } = BORROW_JOURNAL_MAP[transaction_type]
  const typeLabel = transaction_type.replace('_', ' ')

  // Build description
  const description = medicine_name
    ? `${typeLabel} — ${medicine_name} — ${pharmacy.name}`
    : `${typeLabel} — ${pharmacy.name}`

  // Post journal entry
  const { data: journalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     transaction_date,
    p_description:    description,
    p_reference_type: transaction_type === 'borrow_out' ? 'borrowing_out'
                    : transaction_type === 'borrow_in'  ? 'borrowing_in'
                    : 'borrowing_payment',
    p_reference_id:   null,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines: [
      {
        account_code: debit,
        direction:    'debit',
        amount:       total_amount.toString(),
        party_type:   'pharmacy',
        party_id:     pharmacy_id,
        description,
      },
      {
        account_code: credit,
        direction:    'credit',
        amount:       total_amount.toString(),
        party_type:   'pharmacy',
        party_id:     pharmacy_id,
        description,
      },
    ],
    p_created_by: user.id,
  })

  if (rpcError || !journalEntryId) return { error: rpcError?.message ?? 'Failed to post journal entry' }

  // Insert transaction record
  const { data: txRow, error: insertError } = await supabase
    .from('borrowing_transactions')
    .insert({
      pharmacy_id,
      transaction_type,
      medicine_id:      medicine_id      ?? null,
      medicine_name:    medicine_name    ?? null,
      quantity:         quantity         ?? null,
      unit_price:       unit_price       ?? null,
      total_amount,
      payment_amount:   payment_amount   ?? null,
      payment_notes:    payment_notes    ?? null,
      journal_entry_id: journalEntryId as string,
      notes:            notes            ?? null,
      transaction_date,
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (insertError || !txRow) return { error: insertError?.message ?? 'Failed to save transaction' }

  // Update borrowing pharmacy's running balance
  const newBalance = Number(pharmacy.current_balance ?? 0) + (balanceDelta * total_amount)
  const { error: balanceError } = await supabase
    .from('borrowing_pharmacies')
    .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', pharmacy_id)

  if (balanceError) {
    console.error('[createBorrowingTransaction] balance update failed:', balanceError.message)
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.BORROWING_TRANSACTION,
    tableName: 'borrowing_transactions',
    recordId:  txRow.id,
    newValue:  { pharmacy_id, transaction_type, total_amount, transaction_date },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/ledger/borrowing')
  return { data: { transactionId: txRow.id as string }, error: null }
}

// ─── 11. getFinancialSummary ──────────────────────────────────────────────────
// superadmin, admin.
// Returns aggregated P&L for a date range.
// Revenue, COGS, and expense totals are computed in SQL via get_financial_summary().
// Gross profit and net profit are derived from those three totals.

export async function getFinancialSummary(
  dateFrom: string,
  dateTo:   string,
): Promise<{ data: FinancialSummary | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)       return { data: null, error: 'Not authenticated' }
  if (!canReadLedger(role)) return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase.rpc('get_financial_summary', {
    p_date_from: dateFrom,
    p_date_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }

  type SummaryRow = { account_type: string; total_amount: number }
  const rows = (data ?? []) as SummaryRow[]

  const find = (type: string) =>
    Number(rows.find(r => r.account_type === type)?.total_amount ?? 0)

  const revenue     = find('revenue')
  const cogs        = find('cogs')
  const expenses    = find('expense')
  const grossProfit = revenue - cogs
  const netProfit   = grossProfit - expenses

  return {
    data: { revenue, cogs, grossProfit, expenses, netProfit, dateFrom, dateTo },
    error: null,
  }
}

// ─── 12. getJournalEntryLines ──────────────────────────────────────────────────
// superadmin, admin.
// Returns all lines for a single journal entry, with account code + name resolved.
// Used for inline expansion on the journal entries list page.

export interface JournalLineDisplay {
  id:           string
  account_code: string
  account_name: string
  direction:    string
  amount_pkr:   number
  description:  string | null
}

export async function getJournalEntryLines(entryId: string): Promise<{
  data:  JournalLineDisplay[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)       return { data: null, error: 'Not authenticated' }
  if (!canReadLedger(role)) return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase
    .from('journal_lines')
    .select('id, direction, amount_pkr, description, accounts(code, name)')
    .eq('entry_id', entryId)
    .order('direction')   // debits first

  if (error) return { data: null, error: error.message }

  type RawLine = {
    id:          string
    direction:   string
    amount_pkr:  number
    description: string | null
    accounts:    { code: string; name: string }
  }

  const lines = (data ?? []) as unknown as RawLine[]
  return {
    data: lines.map(l => ({
      id:           l.id,
      account_code: l.accounts.code,
      account_name: l.accounts.name,
      direction:    l.direction,
      amount_pkr:   Number(l.amount_pkr),
      description:  l.description,
    })),
    error: null,
  }
}

// ─── 13. createDraftJournalEntry ──────────────────────────────────────────────
// superadmin only.
// Creates a journal entry with status='draft' — no balance validation.
// Lines are inserted immediately and are immutable after creation.
// Drafts can be posted via postDraftJournalEntry() if they balance.

export async function createDraftJournalEntry(input: {
  entry_date:  string
  description: string
  lines:       ManualJournalLineInput[]
}): Promise<{ data?: { entryId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can create journal entries' }

  const parsed = ManualJournalSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { entry_date, description, lines } = parsed.data

  // Resolve account codes → IDs
  const codes = [...new Set(lines.map(l => l.account_code))]
  const { data: acctRows, error: acctErr } = await supabase
    .from('accounts')
    .select('id, code')
    .in('code', codes)
    .eq('is_active',  true)
    .eq('is_deleted', false)

  if (acctErr) return { error: acctErr.message }

  const codeToId = new Map(((acctRows ?? []) as { id: string; code: string }[]).map(a => [a.code, a.id]))
  for (const line of lines) {
    if (!codeToId.has(line.account_code)) {
      return { error: `Account code ${line.account_code} not found or inactive` }
    }
  }

  // Generate a draft entry_no
  const now      = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  const entry_no = `DRAFT-${datePart}-${timePart}`

  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      entry_no,
      entry_date,
      description,
      reference_type: 'manual',
      reference_id:   null,
      status:         'draft',
      currency:       'PKR',
      exchange_rate:  1.0,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (entryErr || !entry) return { error: entryErr?.message ?? 'Failed to create draft entry' }

  const lineRows = lines.map(l => ({
    entry_id:    entry.id,
    account_id:  codeToId.get(l.account_code)!,
    amount:      l.amount,
    direction:   l.direction,
    amount_pkr:  l.amount,       // PKR, exchange_rate = 1
    party_type:  l.party_type  ?? null,
    party_id:    l.party_id    ?? null,
    description: l.description ?? null,
  }))

  const { error: linesErr } = await supabase.from('journal_lines').insert(lineRows)
  if (linesErr) return { error: linesErr.message }

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  return { data: { entryId: entry.id as string }, error: null }
}

// ─── 14. postDraftJournalEntry ────────────────────────────────────────────────
// superadmin only.
// Validates that existing lines balance, then transitions status draft→posted.
// Lines cannot be edited (immutable), so balance must have been correct at
// draft creation time. Returns error if entry is not 'draft' or does not balance.

export async function postDraftJournalEntry(
  entryId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can post journal entries' }

  const { data: entry } = await supabase
    .from('journal_entries')
    .select('id, status, entry_no')
    .eq('id', entryId)
    .single()

  if (!entry) return { error: 'Journal entry not found' }
  if (entry.status !== 'draft') {
    return { error: `Cannot post a ${entry.status} entry — only draft entries can be posted this way` }
  }

  const { data: lines, error: linesErr } = await supabase
    .from('journal_lines')
    .select('direction, amount_pkr')
    .eq('entry_id', entryId)

  if (linesErr || !lines) return { error: linesErr?.message ?? 'Failed to fetch lines' }

  const debits  = (lines as { direction: string; amount_pkr: number }[])
    .filter(l => l.direction === 'debit')
    .reduce((s, l) => s + Number(l.amount_pkr), 0)
  const credits = (lines as { direction: string; amount_pkr: number }[])
    .filter(l => l.direction === 'credit')
    .reduce((s, l) => s + Number(l.amount_pkr), 0)

  if (Math.abs(debits - credits) >= 0.01) {
    return {
      error: `Entry does not balance: debits Rs ${debits.toFixed(2)}, credits Rs ${credits.toFixed(2)}`,
    }
  }

  const { error: updateErr } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', entryId)
    .eq('status', 'draft')

  if (updateErr) return { error: updateErr.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.MANUAL_JOURNAL_ENTRY,
    tableName: 'journal_entries',
    recordId:  entryId,
    newValue:  { action: 'post_draft', entry_no: entry.entry_no, debits, credits },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 15. postOpeningBalances ──────────────────────────────────────────────────
// superadmin only.
// Posts a single 'opening_balance' journal entry to establish starting balances.
// Can only be done once — if an entry already exists, returns an error.
// Callers must void the existing entry before re-posting.
// Balance enforcement is delegated to post_journal_entry() RPC.

interface OpeningBalanceLine {
  accountCode: string
  amount:      number
  direction:   'debit' | 'credit'
  description: string
}

export async function postOpeningBalances(
  lines:     OpeningBalanceLine[],
  asOfDate:  string,
  notes:     string,
): Promise<{ data: { journalEntryId: string } | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { data: null, error: 'Not authenticated' }
  if (role !== 'superadmin') return { data: null, error: 'Only superadmin can post opening balances' }

  // Validate lines
  if (!lines || lines.length === 0) {
    return { data: null, error: 'At least one line is required' }
  }
  for (const line of lines) {
    if (line.amount <= 0) {
      return { data: null, error: `Amount must be positive for account ${line.accountCode}` }
    }
  }

  // Validate date
  const parsedDate = new Date(asOfDate)
  if (isNaN(parsedDate.getTime())) {
    return { data: null, error: 'Invalid date' }
  }
  const today = new Date().toISOString().split('T')[0]
  if (asOfDate > today) {
    return { data: null, error: 'As-of date cannot be in the future' }
  }

  // Check for existing opening balance entry
  const { data: existing } = await supabase
    .from('journal_entries')
    .select('id, entry_date')
    .eq('reference_type', 'opening_balance')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      data: null,
      error: `Opening balances have already been posted on ${existing.entry_date}. To re-enter, void the existing entry first.`,
    }
  }

  // Map to snake_case for RPC
  const mappedLines = lines.map(l => ({
    account_code: l.accountCode,
    direction:    l.direction,
    amount:       l.amount.toString(),
    description:  l.description || 'Opening balance',
  }))

  const description = notes?.trim()
    ? `Opening balances: ${notes.trim()}`
    : 'Opening balances'

  const { data: journalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     asOfDate,
    p_description:    description,
    p_reference_type: 'opening_balance',
    p_reference_id:   null,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines:          mappedLines,
    p_created_by:     user.id,
  })

  if (rpcError || !journalEntryId) {
    return { data: null, error: rpcError?.message ?? 'Failed to post opening balances' }
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.MANUAL_JOURNAL_ENTRY,
    tableName: 'journal_entries',
    recordId:  journalEntryId as string,
    newValue:  { opening_balances_posted: true, asOfDate },
  })

  LEDGER_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/opening-balances')
  return { data: { journalEntryId: journalEntryId as string }, error: null }
}
