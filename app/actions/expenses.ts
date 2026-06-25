'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import { EXPENSE_ACCOUNT_LABELS } from '@/lib/expense-constants'
import type { UserRole } from '@/lib/db-types'
import type { Expense } from '@/lib/db-types'


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

function canAccessExpenses(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin'
}

const EXPENSE_PATHS = [
  '/superadmin/expenses',
  '/admin/expenses',
  '/superadmin/dashboard',
  '/superadmin/ledger/cashbook',
  '/superadmin/ledger/journal',
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseRow extends Expense {
  account_name: string | null
}

export interface ExpenseSummaryLine {
  account_code: string
  account_name: string
  total:        number
}

export interface ExpenseSummary {
  lines:       ExpenseSummaryLine[]
  grandTotal:  number
  dateFrom:    string
  dateTo:      string
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const RecordExpenseSchema = z.object({
  expense_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  account_code:   z.string().min(1, 'Account is required'),
  amount:         z.number().positive('Amount must be positive'),
  description:    z.string().min(1, 'Description is required').max(500),
  payment_method: z.enum(['cash', 'bank_transfer', 'cheque']).default('cash'),
  reference_no:   z.string().max(100).optional(),
})

// ─── 1. recordExpense ─────────────────────────────────────────────────────────
// superadmin, admin.
// Validates account is a 6xxx expense account.
// Validates date is not in the future.
// Flow: INSERT expense → post_journal_entry (Dr expense / Cr Cash) →
//       UPDATE expense.journal_entry_id → logAction

export async function recordExpense(input: {
  expense_date:    string
  account_code:    string
  amount:          number
  description:     string
  payment_method?: string
  reference_no?:   string
}): Promise<{ data?: { expenseId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)             return { error: 'Not authenticated' }
  if (!canAccessExpenses(role))   return { error: 'Insufficient permissions' }

  const parsed = RecordExpenseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { expense_date, account_code, amount, description, payment_method, reference_no } = parsed.data

  // Validate: account_code must be a 6xxx expense account
  if (!account_code.startsWith('6')) {
    return { error: `Account ${account_code} is not an expense account (must start with 6)` }
  }

  // Validate: date must not be in the future
  const today = new Date().toISOString().split('T')[0]
  if (expense_date > today) {
    return { error: 'Expense date cannot be in the future' }
  }

  // Verify account exists and is active
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('code', account_code)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!account) {
    return { error: `Account ${account_code} not found or inactive` }
  }

  // Step 1: INSERT expense row (journal_entry_id populated after RPC)
  const { data: expense, error: insertErr } = await supabase
    .from('expenses')
    .insert({
      expense_date,
      account_code,
      amount,
      description,
      payment_method: payment_method ?? 'cash',
      reference_no:   reference_no ?? null,
      recorded_by:    user.id,
      category:       'other',  // legacy column — kept for backwards compat
    })
    .select('id')
    .single()

  if (insertErr || !expense) {
    return { error: insertErr?.message ?? 'Failed to create expense record' }
  }

  // Step 2: Post journal entry — DEBIT expense account, CREDIT Cash (1000)
  const { data: journalEntryId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     expense_date,
    p_description:    `${account.name}: ${description}`,
    p_reference_type: 'expense',
    p_reference_id:   expense.id,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines: [
      {
        account_code: account_code,
        direction:    'debit',
        amount:       amount.toString(),
        description:  description,
      },
      {
        account_code: '1000',
        direction:    'credit',
        amount:       amount.toString(),
        description:  `Cash paid — ${account.name}`,
      },
    ],
    p_created_by: user.id,
  })

  if (rpcError || !journalEntryId) {
    // Soft-delete the orphaned expense row so it doesn't linger
    await supabase
      .from('expenses')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', expense.id)
    return { error: rpcError?.message ?? 'Failed to post journal entry' }
  }

  // Step 3: Link journal entry back to the expense row
  const { error: updateErr } = await supabase
    .from('expenses')
    .update({ journal_entry_id: journalEntryId as string })
    .eq('id', expense.id)

  if (updateErr) {
    console.error('[recordExpense] Failed to link journal_entry_id:', updateErr.message,
      '| expense_id:', expense.id, '| je_id:', journalEntryId)
  }

  // Step 4: Audit log
  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.RECORD_EXPENSE,
    tableName: 'expenses',
    recordId:  expense.id,
    newValue:  { expense_date, account_code, amount, description, payment_method },
  })

  EXPENSE_PATHS.forEach(p => revalidatePath(p))
  return { data: { expenseId: expense.id }, error: null }
}

// ─── 2. getExpenses ───────────────────────────────────────────────────────────
// superadmin, admin.
// Returns expenses with account name resolved from the EXPENSE_ACCOUNT_LABELS map.
// Filters: dateFrom, dateTo, accountCode.

export async function getExpenses(filters?: {
  dateFrom?:    string
  dateTo?:      string
  accountCode?: string
}): Promise<{ data: ExpenseRow[] | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)           return { data: null, error: 'Not authenticated' }
  if (!canAccessExpenses(role)) return { data: null, error: 'Insufficient permissions' }

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('is_deleted', false)
    .order('expense_date', { ascending: false })
    .order('created_at',   { ascending: false })

  if (filters?.dateFrom)    query = query.gte('expense_date', filters.dateFrom)
  if (filters?.dateTo)      query = query.lte('expense_date', filters.dateTo)
  if (filters?.accountCode) query = query.eq('account_code',  filters.accountCode)

  const { data, error } = await query
  if (error) return { data: null, error: error.message }

  const rows: ExpenseRow[] = ((data ?? []) as Expense[]).map(e => ({
    ...e,
    account_name: e.account_code
      ? (EXPENSE_ACCOUNT_LABELS[e.account_code] ?? e.account_code)
      : null,
  }))

  return { data: rows, error: null }
}

// ─── 3. getExpenseSummary ─────────────────────────────────────────────────────
// superadmin, admin.
// Aggregates total spent per expense account for a date range.
// All arithmetic in JS on pre-fetched rows — acceptable for pharmacy volume.

export async function getExpenseSummary(
  dateFrom: string,
  dateTo:   string,
): Promise<{ data: ExpenseSummary | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)           return { data: null, error: 'Not authenticated' }
  if (!canAccessExpenses(role)) return { data: null, error: 'Insufficient permissions' }

  const { data, error } = await supabase
    .from('expenses')
    .select('account_code, amount')
    .eq('is_deleted', false)
    .eq('is_voided', false)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .not('account_code', 'is', null)

  if (error) return { data: null, error: error.message }

  // Aggregate per account code
  const totalsMap = new Map<string, number>()
  for (const row of (data ?? []) as { account_code: string | null; amount: number }[]) {
    if (!row.account_code) continue
    totalsMap.set(row.account_code, (totalsMap.get(row.account_code) ?? 0) + Number(row.amount))
  }

  const lines: ExpenseSummaryLine[] = Array.from(totalsMap.entries())
    .map(([code, total]) => ({
      account_code: code,
      account_name: EXPENSE_ACCOUNT_LABELS[code] ?? code,
      total,
    }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = lines.reduce((s, l) => s + l.total, 0)

  return {
    data: { lines, grandTotal, dateFrom, dateTo },
    error: null,
  }
}

// ─── 4. softDeleteExpense ─────────────────────────────────────────────────────
// superadmin only.
// If journal_entry_id is set (posted): reject — use reversal journal entry instead.
// If null (edge case — je posting failed): soft-delete allowed.

export async function softDeleteExpense(
  expenseId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can delete expense records' }

  const { data: expense } = await supabase
    .from('expenses')
    .select('id, journal_entry_id, description')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!expense) return { error: 'Expense not found' }

  if (expense.journal_entry_id) {
    return {
      error:
        'Cannot delete a posted expense — the journal entry is permanent. ' +
        'Create a reversal journal entry in the Journal page instead.',
    }
  }

  const { error: updateErr } = await supabase
    .from('expenses')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq('id', expenseId)

  if (updateErr) return { error: updateErr.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.DELETE_EXPENSE,
    tableName: 'expenses',
    recordId:  expenseId,
    newValue:  { is_deleted: true },
  })

  EXPENSE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 5. updateExpenseDetails ──────────────────────────────────────────────────
// superadmin only.
// Edits cosmetic fields only — description, reference_no, category.
// Amount, account_code, expense_date, payment_method, and journal_entry_id
// are intentionally excluded and will never be touched by this action.

const UpdateExpenseDetailsSchema = z.object({
  description:  z.string().max(500).optional(),
  reference_no: z.string().max(100).optional(),
  category:     z.string().max(100).optional(),
})

export async function updateExpenseDetails(
  expenseId: string,
  fields: { description?: string; reference_no?: string; category?: string },
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can edit expense details' }

  const parsed = UpdateExpenseDetailsSchema.safeParse(fields)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: expense } = await supabase
    .from('expenses')
    .select('id, description, reference_no, category')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!expense) return { error: 'Expense not found' }

  const patch: Record<string, string | undefined> = {}
  if (parsed.data.description  !== undefined) patch.description  = parsed.data.description
  if (parsed.data.reference_no !== undefined) patch.reference_no = parsed.data.reference_no
  if (parsed.data.category     !== undefined) patch.category     = parsed.data.category

  if (Object.keys(patch).length === 0) return { error: null }

  const { error: updateErr } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', expenseId)

  if (updateErr) return { error: updateErr.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.EDIT_EXPENSE,
    tableName: 'expenses',
    recordId:  expenseId,
    oldValue:  { description: expense.description, reference_no: expense.reference_no, category: expense.category },
    newValue:  patch,
  })

  EXPENSE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 6. voidExpense ───────────────────────────────────────────────────────────
// superadmin only.
// Reverses the original journal entry, links the two entries via
// mark_entry_reversed(), then marks the expense row as voided.
// The expense remains visible in the list with a "Voided" badge.
// Requires migration 026 (is_voided, voided_at, voided_by, void_journal_entry_id).

export async function voidExpense(
  expenseId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can void expenses' }

  const { data: expense } = await supabase
    .from('expenses')
    .select('id, is_voided, journal_entry_id, description')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!expense) return { error: 'Expense not found' }
  if (expense.is_voided) return { error: 'This expense has already been voided' }
  if (!expense.journal_entry_id) {
    return { error: 'Cannot void an expense with no posted journal entry — delete it instead' }
  }

  const { data: originalEntry } = await supabase
    .from('journal_entries')
    .select('description')
    .eq('id', expense.journal_entry_id)
    .maybeSingle()

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
    .eq('entry_id', expense.journal_entry_id)

  if (linesErr || !lines || lines.length === 0) {
    return { error: linesErr?.message ?? 'No journal lines found for this expense' }
  }

  const reversedLines = (lines as unknown as RawLine[]).map(l => ({
    account_code: l.accounts.code,
    direction:    l.direction === 'debit' ? 'credit' : 'debit',
    amount:       l.amount.toString(),
    ...(l.party_type ? { party_type: l.party_type } : {}),
    ...(l.party_id   ? { party_id:   l.party_id   } : {}),
    description:  l.description ? `[Void] ${l.description}` : '[Void]',
  }))

  const today    = new Date().toISOString().split('T')[0]
  const voidDesc = `Void: ${originalEntry?.description ?? expense.description}`

  const { data: reversalId, error: rpcError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     today,
    p_description:    voidDesc,
    p_reference_type: 'expense_void',
    p_reference_id:   expenseId,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines:          reversedLines,
    p_created_by:     user.id,
  })

  if (rpcError || !reversalId) {
    return { error: rpcError?.message ?? 'Failed to post reversal journal entry' }
  }

  const { error: markError } = await supabase.rpc('mark_entry_reversed', {
    p_original_id: expense.journal_entry_id,
    p_reversal_id: reversalId as string,
  })

  if (markError) {
    console.error('[voidExpense] mark_entry_reversed failed:', markError.message,
      '| reversal_id:', reversalId)
    return { error: `Reversal entry created but linking failed: ${markError.message}` }
  }

  const { error: updateErr } = await supabase
    .from('expenses')
    .update({
      is_voided:             true,
      voided_at:             new Date().toISOString(),
      voided_by:             user.id,
      void_journal_entry_id: reversalId as string,
    })
    .eq('id', expenseId)

  if (updateErr) return { error: updateErr.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.VOID_EXPENSE,
    tableName: 'expenses',
    recordId:  expenseId,
    oldValue:  { is_voided: false, journal_entry_id: expense.journal_entry_id },
    newValue:  { is_voided: true, void_journal_entry_id: reversalId as string },
  })

  EXPENSE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}
