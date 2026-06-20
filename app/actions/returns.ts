'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

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

function canInitiateReturn(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'pharmacist'
}

async function fetchReturnPolicySettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'return_window_days',
      'return_auto_approve_limit',
      'return_opened_pack_allowed',
      'return_requires_receipt',
    ])

  const map = new Map((data ?? []).map(s => [s.key as string, s.value as string]))
  return {
    windowDays:      parseInt(map.get('return_window_days')        ?? '3',    10),
    autoLimit:       parseFloat(map.get('return_auto_approve_limit') ?? '1000'),
    openedAllowed:   map.get('return_opened_pack_allowed') === 'true',
    requiresReceipt: map.get('return_requires_receipt')   === 'true',
  }
}

const RETURN_PATHS = [
  '/superadmin/returns',
  '/admin/returns',
  '/pharmacist/pos',
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleItemForReturn {
  id:                  string   // sale_item_id
  medicine_id:         string
  medicine_name:       string
  medicine_schedule:   string
  batch_id:            string
  batch_no:            string
  quantity:            number   // originally sold
  unit_price:          number
  already_returned:    number   // across all non-denied returns
  available_to_return: number   // quantity - already_returned
}

export interface SaleForReturn {
  id:              string
  receipt_no:      string
  created_at:      string
  total_amount:    number
  return_status:   string
  returned_amount: number
  items:           SaleItemForReturn[]
}

export interface PolicyEvalResult {
  wouldAutoApprove: boolean
  flags:            string[]   // window_expired | opened_pack | exceeds_limit
  refundAmount:     number
  controlledItems:  Array<{ sale_item_id: string; medicine_name: string }>
  // Non-empty means the RPC will HARD-BLOCK these items — must remove them
}

export interface ReturnItemRecord {
  id:               string
  sale_item_id:     string
  medicine_id:      string
  medicine_name:    string
  batch_id:         string
  batch_no:         string
  quantity_returned: number
  unit_price:       number
  line_refund:      number
}

export interface ReturnRecord {
  id:               string
  return_no:        string
  original_sale_id: string
  receipt_no:       string | null   // original sale receipt
  return_type:      'return' | 'exchange'
  status:           string
  policy_flags:     string[]
  refund_amount:    number
  charge_amount:    number
  net_amount:       number
  reason:           string
  pack_opened:      boolean
  requested_by:     string
  requester_name:   string | null
  approved_by:      string | null
  approver_name:    string | null
  approved_at:      string | null
  denial_reason:    string | null
  exchange_sale_id: string | null
  journal_entry_id: string | null
  created_at:       string
  completed_at:     string | null
  items:            ReturnItemRecord[]
}

// ─── 1. evaluateReturnPolicy ──────────────────────────────────────────────────
// Pure read — mirrors the policy checks inside process_return() for instant
// UI feedback before submission. Does NOT call the RPC.
// All three roles may call this.

export async function evaluateReturnPolicy(
  saleId:   string,
  items:    Array<{ sale_item_id: string; quantity_returned: number }>,
  packOpened: boolean,
): Promise<{ data: PolicyEvalResult | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)            return { data: null, error: 'Not authenticated' }
  if (!canInitiateReturn(role))  return { data: null, error: 'Insufficient permissions' }
  if (!saleId || items.length === 0)
    return { data: null, error: 'saleId and items are required' }

  // Fetch sale date
  const { data: sale } = await supabase
    .from('sales')
    .select('created_at')
    .eq('id', saleId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!sale) return { data: null, error: 'Sale not found' }

  // Fetch policy settings
  const policy = await fetchReturnPolicySettings(supabase)

  // Fetch sale_items joined to medicines for unit_price + schedule
  const saleItemIds = items.map(i => i.sale_item_id)
  const { data: saleItems, error: siErr } = await supabase
    .from('sale_items')
    .select('id, unit_price, quantity, medicines ( name, schedule )')
    .in('id', saleItemIds)

  if (siErr) return { data: null, error: siErr.message }

  // Build a lookup map
  type SaleItemRow = {
    id: string
    unit_price: number
    quantity: number
    medicines: { name: string; schedule: string } | null
  }
  const siMap = new Map<string, SaleItemRow>(
    ((saleItems ?? []) as unknown as SaleItemRow[]).map(si => [si.id, si])
  )

  let totalRefund = 0
  const controlledItems: PolicyEvalResult['controlledItems'] = []

  for (const item of items) {
    const si = siMap.get(item.sale_item_id)
    if (!si) continue

    if (si.medicines?.schedule === 'controlled') {
      controlledItems.push({
        sale_item_id:  item.sale_item_id,
        medicine_name: si.medicines.name,
      })
      continue  // skip from refund calculation — will be hard-blocked by RPC
    }

    totalRefund += item.quantity_returned * Number(si.unit_price)
  }

  // Evaluate policy flags (same logic as RPC)
  const saleDate = new Date(sale.created_at)
  const daysSinceSale = Math.floor(
    (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  const flags: string[] = []
  if (daysSinceSale > policy.windowDays) flags.push('window_expired')
  if (packOpened && !policy.openedAllowed) flags.push('opened_pack')
  if (totalRefund > policy.autoLimit)     flags.push('exceeds_limit')

  return {
    data: {
      wouldAutoApprove: flags.length === 0 && controlledItems.length === 0,
      flags,
      refundAmount: totalRefund,
      controlledItems,
    },
    error: null,
  }
}

// ─── 2. getSaleForReturn ──────────────────────────────────────────────────────
// Looks up a completed sale + items for the return builder UI.
// Returns per-item already_returned quantities so the UI can cap the selector.
// All three roles may call this.

export async function getSaleForReturn(
  receiptNo: string,
): Promise<{ data: SaleForReturn | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)           return { data: null, error: 'Not authenticated' }
  if (!canInitiateReturn(role)) return { data: null, error: 'Insufficient permissions' }

  const receipt = receiptNo.trim()
  if (!receipt) return { data: null, error: 'Receipt number is required' }

  // 1. Fetch the sale
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id, receipt_no, created_at, total_amount, return_status, returned_amount, status')
    .eq('receipt_no', receipt)
    .eq('is_deleted', false)
    .maybeSingle()

  if (saleErr) return { data: null, error: saleErr.message }
  if (!sale)   return { data: null, error: `Sale ${receipt} not found` }

  if (sale.status === 'voided')
    return { data: null, error: 'Voided sales cannot be returned' }
  if (sale.status === 'held')
    return { data: null, error: 'Parked (held) sales cannot be returned until completed' }
  if (sale.return_status === 'full')
    return { data: null, error: 'This sale has already been fully returned' }

  // 2. Fetch sale_items with medicine name + schedule
  const { data: saleItems, error: itemsErr } = await supabase
    .from('sale_items')
    .select('id, medicine_id, batch_id, batch_no, quantity, unit_price, medicines ( name, schedule )')
    .eq('sale_id', sale.id)

  if (itemsErr) return { data: null, error: itemsErr.message }

  // 3. Fetch all non-denied returns for this sale
  const { data: existingReturns } = await supabase
    .from('returns')
    .select('id')
    .eq('original_sale_id', sale.id)
    .neq('status', 'denied')
    .eq('is_deleted', false)

  // 4. Sum already-returned quantities per sale_item_id
  const alreadyReturnedMap = new Map<string, number>()
  const returnIds = (existingReturns ?? []).map(r => r.id as string)

  if (returnIds.length > 0) {
    const { data: returnItems } = await supabase
      .from('return_items')
      .select('sale_item_id, quantity_returned')
      .in('return_id', returnIds)

    for (const ri of returnItems ?? []) {
      const curr = alreadyReturnedMap.get(ri.sale_item_id as string) ?? 0
      alreadyReturnedMap.set(ri.sale_item_id as string, curr + Number(ri.quantity_returned))
    }
  }

  // 5. Build result
  type SaleItemRow = {
    id: string
    medicine_id: string
    batch_id: string
    batch_no: string
    quantity: number
    unit_price: number
    medicines: { name: string; schedule: string } | null
  }

  const items: SaleItemForReturn[] = ((saleItems ?? []) as unknown as SaleItemRow[]).map(si => {
    const already = alreadyReturnedMap.get(si.id) ?? 0
    return {
      id:                  si.id,
      medicine_id:         si.medicine_id,
      medicine_name:       si.medicines?.name     ?? 'Unknown',
      medicine_schedule:   si.medicines?.schedule ?? 'OTC',
      batch_id:            si.batch_id,
      batch_no:            si.batch_no,
      quantity:            Number(si.quantity),
      unit_price:          Number(si.unit_price),
      already_returned:    already,
      available_to_return: Math.max(0, Number(si.quantity) - already),
    }
  })

  return {
    data: {
      id:              sale.id,
      receipt_no:      sale.receipt_no,
      created_at:      sale.created_at,
      total_amount:    Number(sale.total_amount),
      return_status:   sale.return_status  ?? 'none',
      returned_amount: Number(sale.returned_amount ?? 0),
      items,
    },
    error: null,
  }
}

// ─── 3. initiateReturn ────────────────────────────────────────────────────────
// pharmacist, admin, superadmin.
// Calls process_return() Mode A — validates, evaluates policy, saves return.
// Returns immediately with status='auto_approved' or 'pending_approval'.

export interface InitiateReturnInput {
  originalSaleId: string
  returnItems:    Array<{ sale_item_id: string; quantity_returned: number }>
  exchangeItems?: Array<{ medicine_id: string; batch_id: string; quantity: number; unit_price: number }>
  reason:         string
  packOpened:     boolean
}

export async function initiateReturn(
  input: InitiateReturnInput,
): Promise<{
  data?: { returnId: string; returnNo: string; status: string; policyFlags: string[] }
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)           return { error: 'Not authenticated' }
  if (!canInitiateReturn(role)) return { error: 'Insufficient permissions' }

  const { originalSaleId, returnItems, exchangeItems, reason, packOpened } = input

  if (!originalSaleId)         return { error: 'originalSaleId is required' }
  if (!returnItems?.length)    return { error: 'At least one return item is required' }
  if (!reason?.trim())         return { error: 'Return reason is required' }

  const { data: result, error: rpcErr } = await supabase.rpc('process_return', {
    p_original_sale_id: originalSaleId,
    p_return_items:     returnItems,
    p_exchange_items:   exchangeItems ?? null,
    p_reason:           reason.trim(),
    p_pack_opened:      packOpened,
    p_requested_by:     user.id,
    p_return_id:        null,
  })

  if (rpcErr) return { error: rpcErr.message }

  const res = result as {
    return_id:    string
    return_no:    string
    status:       string
    policy_flags: string[]
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.INITIATE_RETURN,
    tableName: 'returns',
    recordId:  res.return_id,
    newValue: {
      return_no:   res.return_no,
      status:      res.status,
      policy_flags: res.policy_flags,
      reason:       reason.trim(),
      pack_opened:  packOpened,
      item_count:   returnItems.length,
    },
  })

  RETURN_PATHS.forEach(p => revalidatePath(p))
  return {
    data: {
      returnId:    res.return_id,
      returnNo:    res.return_no,
      status:      res.status,
      policyFlags: res.policy_flags ?? [],
    },
    error: null,
  }
}

// ─── 4. approveReturn ────────────────────────────────────────────────────────
// superadmin only.
// Calls process_return() Mode B — fetches stored items, executes full reversal.
// Stock and ledger changes happen here for previously-pending returns.

export async function approveReturn(
  returnId: string,
): Promise<{
  data?: { returnNo: string; netAmount: number; journalEntryId: string }
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can approve returns' }

  if (!returnId) return { error: 'returnId is required' }

  const { data: result, error: rpcErr } = await supabase.rpc('process_return', {
    p_original_sale_id: null,
    p_return_items:     null,
    p_exchange_items:   null,
    p_reason:           null,
    p_pack_opened:      false,
    p_requested_by:     user.id,    // approver UUID
    p_return_id:        returnId,
  })

  if (rpcErr) return { error: rpcErr.message }

  const res = result as {
    return_id:        string
    return_no:        string
    net_amount:       number
    journal_entry_id: string
  }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.APPROVE_RETURN,
    tableName: 'returns',
    recordId:  returnId,
    newValue:  { status: 'completed', net_amount: res.net_amount },
  })

  RETURN_PATHS.forEach(p => revalidatePath(p))
  return {
    data: {
      returnNo:       res.return_no,
      netAmount:      Number(res.net_amount),
      journalEntryId: res.journal_entry_id,
    },
    error: null,
  }
}

// ─── 5. denyReturn ───────────────────────────────────────────────────────────
// superadmin only.
// Sets status='denied', records denial_reason.
// No stock or ledger changes — nothing was ever applied for a pending return.

export async function denyReturn(
  returnId: string,
  reason:   string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can deny returns' }

  if (!returnId)       return { error: 'returnId is required' }
  if (!reason?.trim()) return { error: 'Denial reason is required' }

  // Verify the return is in pending_approval state before denying
  const { data: ret } = await supabase
    .from('returns')
    .select('id, return_no, status')
    .eq('id', returnId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!ret)                          return { error: 'Return not found' }
  if (ret.status !== 'pending_approval')
    return { error: `Return is not pending approval (current status: ${ret.status})` }

  const { error: updateErr } = await supabase
    .from('returns')
    .update({
      status:        'denied',
      denial_reason: reason.trim(),
      approved_by:   user.id,
      approved_at:   new Date().toISOString(),
    })
    .eq('id', returnId)

  if (updateErr) return { error: updateErr.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.DENY_RETURN,
    tableName: 'returns',
    recordId:  returnId,
    newValue:  { status: 'denied', denial_reason: reason.trim() },
  })

  RETURN_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 6. getPendingReturns ────────────────────────────────────────────────────
// superadmin only.
// Returns all status='pending_approval' returns with full detail for the
// approval queue.

export async function getPendingReturns(): Promise<{
  data: ReturnRecord[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { data: null, error: 'Not authenticated' }
  if (role !== 'superadmin') return { data: null, error: 'Insufficient permissions' }

  // 1. Fetch pending returns with return_items → medicines join
  const { data: returns, error: retErr } = await supabase
    .from('returns')
    .select(`
      id, return_no, original_sale_id, return_type, status, policy_flags,
      refund_amount, charge_amount, net_amount, reason, pack_opened,
      requested_by, created_at,
      return_items (
        id, sale_item_id, batch_id, quantity_returned, unit_price, line_refund,
        medicines ( name, schedule ),
        stock_batches ( batch_no )
      )
    `)
    .eq('status', 'pending_approval')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  if (retErr) return { data: null, error: retErr.message }

  if (!returns?.length) return { data: [], error: null }

  // 2. Fetch original sale receipt_nos
  const saleIds = [...new Set(returns.map(r => r.original_sale_id as string))]
  const { data: sales } = await supabase
    .from('sales')
    .select('id, receipt_no')
    .in('id', saleIds)

  const saleMap = new Map((sales ?? []).map(s => [s.id, s.receipt_no as string]))

  // 3. Fetch requester profiles
  const userIds = [...new Set(returns.map(r => r.requested_by as string).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name as string | null]))

  // 4. Shape the result
  type ReturnRow = typeof returns[number]
  type ReturnItemRow = {
    id: string
    sale_item_id: string
    batch_id: string
    quantity_returned: number
    unit_price: number
    line_refund: number
    medicines: { name: string; schedule: string } | null
    stock_batches: { batch_no: string } | null
  }

  const data: ReturnRecord[] = returns.map((r: ReturnRow) => ({
    id:               r.id,
    return_no:        r.return_no,
    original_sale_id: r.original_sale_id,
    receipt_no:       saleMap.get(r.original_sale_id as string) ?? null,
    return_type:      r.return_type as 'return' | 'exchange',
    status:           r.status,
    policy_flags:     (r.policy_flags ?? []) as string[],
    refund_amount:    Number(r.refund_amount),
    charge_amount:    Number(r.charge_amount),
    net_amount:       Number(r.net_amount),
    reason:           r.reason,
    pack_opened:      r.pack_opened,
    requested_by:     r.requested_by,
    requester_name:   profileMap.get(r.requested_by as string) ?? null,
    approved_by:      null,
    approver_name:    null,
    approved_at:      null,
    denial_reason:    null,
    exchange_sale_id: null,
    journal_entry_id: null,
    created_at:       r.created_at,
    completed_at:     null,
    items: ((r.return_items ?? []) as unknown as ReturnItemRow[]).map(ri => ({
      id:                ri.id,
      sale_item_id:      ri.sale_item_id,
      medicine_id:       '',  // not selected; use medicine_name
      medicine_name:     ri.medicines?.name     ?? 'Unknown',
      batch_id:          ri.batch_id,
      batch_no:          ri.stock_batches?.batch_no ?? '',
      quantity_returned: Number(ri.quantity_returned),
      unit_price:        Number(ri.unit_price),
      line_refund:       Number(ri.line_refund),
    })),
  }))

  return { data, error: null }
}

// ─── 7. getReturnHistory ─────────────────────────────────────────────────────
// superadmin, admin.
// Paginated list of all returns with filters.
// Does NOT include return_items detail (list view only — avoids large payloads).

export interface ReturnHistoryFilters {
  dateFrom?:   string   // YYYY-MM-DD
  dateTo?:     string   // YYYY-MM-DD
  status?:     string   // auto_approved | pending_approval | approved | denied | completed
  returnType?: string   // return | exchange
  page?:       number
  pageSize?:   number
}

export interface ReturnHistorySummary {
  id:               string
  return_no:        string
  original_sale_id: string
  receipt_no:       string | null
  return_type:      string
  status:           string
  refund_amount:    number
  net_amount:       number
  reason:           string
  pack_opened:      boolean
  policy_flags:     string[]
  requested_by:     string
  requester_name:   string | null
  approved_by:      string | null
  approver_name:    string | null
  approved_at:      string | null
  denial_reason:    string | null
  created_at:       string
  completed_at:     string | null
}

export async function getReturnHistory(
  filters?: ReturnHistoryFilters,
): Promise<{
  data: { items: ReturnHistorySummary[]; total: number } | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)                                  return { data: null, error: 'Not authenticated' }
  if (role !== 'superadmin' && role !== 'admin')       return { data: null, error: 'Insufficient permissions' }

  const page     = Math.max(1, filters?.page     ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
  const from     = (page - 1) * pageSize
  const to       = from + pageSize - 1

  const selectCols = `id, return_no, original_sale_id, return_type, status, policy_flags,
    refund_amount, net_amount, reason, pack_opened,
    requested_by, approved_by, approved_at, denial_reason,
    created_at, completed_at`

  let query = supabase
    .from('returns')
    .select(selectCols, { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters?.status)     query = query.eq('status',      filters.status)
  if (filters?.returnType) query = query.eq('return_type', filters.returnType)
  if (filters?.dateFrom)   query = query.gte('created_at', filters.dateFrom)
  if (filters?.dateTo)     query = query.lte('created_at', filters.dateTo + 'T23:59:59')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawReturns, count, error: retErr } = await (query as any)
  const returns = (rawReturns ?? []) as Array<{
    id: string; return_no: string; original_sale_id: string
    return_type: string; status: string; policy_flags: unknown
    refund_amount: number; net_amount: number; reason: string; pack_opened: boolean
    requested_by: string; approved_by: string | null; approved_at: string | null
    denial_reason: string | null; created_at: string; completed_at: string | null
  }>

  if (retErr) return { data: null, error: retErr.message }
  if (!returns?.length) return { data: { items: [], total: count ?? 0 }, error: null }

  // Batch-fetch original sale receipt_nos
  const saleIds = [...new Set(returns.map(r => r.original_sale_id as string))]
  const { data: sales } = await supabase
    .from('sales')
    .select('id, receipt_no')
    .in('id', saleIds)

  const saleMap = new Map((sales ?? []).map(s => [s.id, s.receipt_no as string]))

  // Batch-fetch profile names (requested_by + approved_by)
  const allUserIds = [...new Set([
    ...returns.map(r => r.requested_by as string),
    ...returns.map(r => r.approved_by  as string).filter(Boolean),
  ])]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', allUserIds)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name as string | null]))

  type RetRow = typeof returns[number]

  const items: ReturnHistorySummary[] = returns.map((r: RetRow) => ({
    id:               r.id,
    return_no:        r.return_no,
    original_sale_id: r.original_sale_id,
    receipt_no:       saleMap.get(r.original_sale_id as string) ?? null,
    return_type:      r.return_type,
    status:           r.status,
    refund_amount:    Number(r.refund_amount),
    net_amount:       Number(r.net_amount),
    reason:           r.reason,
    pack_opened:      r.pack_opened,
    policy_flags:     (r.policy_flags ?? []) as string[],
    requested_by:     r.requested_by,
    requester_name:   profileMap.get(r.requested_by as string)    ?? null,
    approved_by:      r.approved_by ?? null,
    approver_name:    r.approved_by ? (profileMap.get(r.approved_by as string) ?? null) : null,
    approved_at:      r.approved_at  ?? null,
    denial_reason:    r.denial_reason ?? null,
    created_at:       r.created_at,
    completed_at:     r.completed_at ?? null,
  }))

  return { data: { items, total: count ?? 0 }, error: null }
}

// ─── linkExchangeSale ─────────────────────────────────────────────────────────
// Called after an exchange sale completes. Links the return record to the new
// sale via exchange_sale_id so the exchange is fully tracked.

export async function linkExchangeSale(
  returnId: string,
  saleId:   string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)           return { error: 'Not authenticated' }
  if (!canInitiateReturn(role)) return { error: 'Insufficient permissions' }
  if (!returnId || !saleId)     return { error: 'returnId and saleId are required' }

  const { error } = await supabase
    .from('returns')
    .update({ exchange_sale_id: saleId })
    .eq('id', returnId)
    .eq('is_deleted', false)

  if (error) return { error: error.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.APPROVE_RETURN,
    tableName: 'returns',
    recordId:  returnId,
    newValue:  { exchange_sale_id: saleId },
  })

  return { error: null }
}

