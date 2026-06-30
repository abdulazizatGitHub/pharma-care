'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShiftRow {
  id:              string
  cashier_id:      string
  cashier_name:    string | null
  opened_at:       string
  closed_at:       string | null
  opening_cash:    number
  closing_cash:    number | null
  expected_cash:   number | null
  cash_difference: number | null
  status:          'open' | 'closed'
  notes:           string | null
  sales_total?:    number   // populated by getCurrentShift only
}

export interface ShiftSummaryData {
  shift:            ShiftRow
  cashSalesTotal:   number
  creditSalesTotal: number
  totalSalesCount:  number
  expensesTotal:    number
  expectedCash:     number
  salesByHour:      { hour: number; total: number; count: number }[]
}

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

const SHIFT_PATHS = ['/pharmacist/shifts', '/admin/shifts', '/superadmin/shifts']

// ─── openShift ────────────────────────────────────────────────────────────────

export async function openShift(openingCash: number) {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthorized' }
  if (!['superadmin', 'admin', 'pharmacist'].includes(role)) return { data: null, error: 'Unauthorized' }

  const { data: existing } = await supabase
    .from('shifts')
    .select('id')
    .eq('cashier_id', user.id)
    .eq('status', 'open')
    .maybeSingle()

  if (existing) return { data: null, error: 'You already have an open shift' }

  const { data, error } = await supabase
    .from('shifts')
    .insert({
      cashier_id:   user.id,
      opening_cash: openingCash,
      status:       'open',
      created_by:   user.id,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.OPEN_SHIFT,
    tableName: 'shifts',
    recordId:  data.id,
    newValue:  { opening_cash: openingCash },
  })

  for (const path of SHIFT_PATHS) revalidatePath(path)
  revalidatePath('/pharmacist/pos')
  revalidatePath('/pharmacist/dashboard')

  return { data, error: null }
}

// ─── closeShift ───────────────────────────────────────────────────────────────

export async function closeShift(shiftId: string, closingCash: number, notes?: string) {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthorized' }

  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .eq('status', 'open')
    .single()

  if (fetchErr || !shift) return { data: null, error: 'Shift not found or already closed' }

  if (role === 'pharmacist' && shift.cashier_id !== user.id) {
    return { data: null, error: 'Unauthorized' }
  }

  const now = new Date().toISOString()

  // Cash sales during shift
  const { data: salesData } = await supabase
    .from('sales')
    .select('total_amount')
    .eq('cashier_id', shift.cashier_id)
    .eq('payment_type', 'cash')
    .eq('status', 'completed')
    .eq('is_deleted', false)
    .gte('created_at', shift.opened_at)
    .lte('created_at', now)

  const cashSalesTotal = (salesData ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  // Cash expenses during shift
  const { data: expData } = await supabase
    .from('expenses')
    .select('amount')
    .eq('is_deleted', false)
    .eq('payment_method', 'cash')
    .gte('created_at', shift.opened_at)
    .lte('created_at', now)

  const expensesTotal = (expData ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const expectedCash    = Number(shift.opening_cash) + cashSalesTotal - expensesTotal
  const cashDifference  = closingCash - expectedCash

  const { data, error } = await supabase
    .from('shifts')
    .update({
      status:          'closed',
      closed_at:       now,
      closing_cash:    closingCash,
      expected_cash:   expectedCash,
      cash_difference: cashDifference,
      notes:           notes ?? null,
    })
    .eq('id', shiftId)
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CLOSE_SHIFT,
    tableName: 'shifts',
    recordId:  shiftId,
    newValue:  { closing_cash: closingCash, expected_cash: expectedCash, cash_difference: cashDifference },
  })

  for (const path of SHIFT_PATHS) revalidatePath(path)
  revalidatePath('/pharmacist/pos')
  revalidatePath('/pharmacist/dashboard')

  return { data, error: null }
}

// ─── getCurrentShift ──────────────────────────────────────────────────────────

export async function getCurrentShift(userId?: string) {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthorized' }

  const targetId = userId ?? user.id

  const { data: shift, error } = await supabase
    .from('shifts')
    .select('id, cashier_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_difference, status, notes')
    .eq('cashier_id', targetId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!shift) return { data: null, error: null }

  // Auto-close stale shift: if it was opened on a previous UTC day, close it at midnight of that day
  const shiftUtcDay = shift.opened_at.slice(0, 10)
  const todayUtcDay = new Date().toISOString().slice(0, 10)

  if (shiftUtcDay < todayUtcDay) {
    const openedDate = new Date(shift.opened_at)
    const eod = new Date(Date.UTC(
      openedDate.getUTCFullYear(),
      openedDate.getUTCMonth(),
      openedDate.getUTCDate(),
      23, 59, 59, 999,
    ))
    const eodISO = eod.toISOString()

    const [{ data: salesData }, { data: expData }] = await Promise.all([
      supabase.from('sales')
        .select('total_amount')
        .eq('cashier_id', shift.cashier_id)
        .eq('payment_type', 'cash')
        .eq('status', 'completed')
        .eq('is_deleted', false)
        .gte('created_at', shift.opened_at)
        .lte('created_at', eodISO),
      supabase.from('expenses')
        .select('amount')
        .eq('is_deleted', false)
        .eq('payment_method', 'cash')
        .gte('created_at', shift.opened_at)
        .lte('created_at', eodISO),
    ])

    const cashSales    = (salesData ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const expenses     = (expData   ?? []).reduce((s, r) => s + Number(r.amount      ?? 0), 0)
    const expectedCash = Number(shift.opening_cash) + cashSales - expenses
    const dateLabel    = openedDate.toLocaleDateString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    })

    await supabase.from('shifts').update({
      status:          'closed',
      closed_at:       eodISO,
      closing_cash:    null,
      expected_cash:   expectedCash,
      cash_difference: null,
      notes:           `Auto-closed: shift was not closed before midnight on ${dateLabel}`,
    }).eq('id', shift.id)

    await logAction({
      supabase,
      userId:    user.id,
      userRole:  role,
      action:    ACTION_TYPES.AUTO_CLOSE_SHIFT,
      tableName: 'shifts',
      recordId:  shift.id,
      newValue:  { expected_cash: expectedCash, closed_at: eodISO },
    })

    // Do not call revalidatePath here — getCurrentShift is invoked during
    // server render, and revalidatePath is illegal inside a render pass in
    // Next.js 16. The caller already receives fresh data (null shift) from
    // this same request; other pages will get updated on their next load.

    return { data: null, error: null, wasAutoClosed: true }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', targetId)
    .single()

  // Sales total since shift opened
  const { data: salesRows } = await supabase
    .from('sales')
    .select('total_amount')
    .eq('cashier_id', targetId)
    .eq('status', 'completed')
    .eq('is_deleted', false)
    .gte('created_at', shift.opened_at)

  const salesTotal = (salesRows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  return {
    data: {
      ...shift,
      cashier_name: profile?.full_name ?? null,
      sales_total:  salesTotal,
    } as ShiftRow,
    error: null,
  }
}

// ─── getShiftHistory ──────────────────────────────────────────────────────────

export async function getShiftHistory(
  userId?: string,
  dateFrom?: string,
  dateTo?: string,
  page?: number,
  pageSize?: number,
): Promise<{ data: ShiftRow[]; total: number; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: [] as ShiftRow[], total: 0, error: 'Unauthorized' }

  let query = supabase
    .from('shifts')
    .select('id, cashier_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_difference, status, notes', { count: 'exact' })
    .eq('status', 'closed')
    .order('opened_at', { ascending: false })

  if (role === 'pharmacist') {
    query = query.eq('cashier_id', user.id)
  } else if (userId) {
    query = query.eq('cashier_id', userId)
  }

  if (dateFrom) query = query.gte('opened_at', dateFrom)
  if (dateTo)   query = query.lte('opened_at', dateTo + 'T23:59:59Z')

  if (page !== undefined && pageSize !== undefined) {
    const offset = (page - 1) * pageSize
    query = query.range(offset, offset + pageSize - 1)
  } else {
    query = query.limit(200)
  }

  const { data: shifts, count, error } = await query
  if (error) return { data: [] as ShiftRow[], total: 0, error: error.message }
  if (!shifts?.length) return { data: [] as ShiftRow[], total: count ?? 0, error: null }

  // Fetch cashier names
  const cashierIds = [...new Set(shifts.map(s => s.cashier_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', cashierIds)

  const nameMap: Record<string, string | null> = {}
  for (const p of (profiles ?? [])) nameMap[p.id] = p.full_name ?? null

  return {
    data: shifts.map(s => ({
      ...s,
      cashier_name: nameMap[s.cashier_id] ?? null,
    })) as ShiftRow[],
    total: count ?? shifts.length,
    error: null,
  }
}

// ─── getShiftSummary ──────────────────────────────────────────────────────────

export async function getShiftSummary(shiftId: string) {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthorized' }

  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, cashier_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_difference, status, notes')
    .eq('id', shiftId)
    .single()

  if (shiftErr || !shift) return { data: null, error: 'Shift not found' }

  if (role === 'pharmacist' && shift.cashier_id !== user.id) {
    return { data: null, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', shift.cashier_id)
    .single()

  const closedAt = shift.closed_at ?? new Date().toISOString()

  const { data: salesData } = await supabase
    .from('sales')
    .select('total_amount, payment_type, created_at')
    .eq('cashier_id', shift.cashier_id)
    .eq('status', 'completed')
    .eq('is_deleted', false)
    .gte('created_at', shift.opened_at)
    .lte('created_at', closedAt)

  const sales = salesData ?? []
  const cashSalesTotal   = sales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0)
  const creditSalesTotal = sales.filter(s => s.payment_type === 'credit').reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0)

  const hourMap: Record<number, { total: number; count: number }> = {}
  for (const s of sales) {
    const h = new Date(s.created_at).getHours()
    if (!hourMap[h]) hourMap[h] = { total: 0, count: 0 }
    hourMap[h].total += Number(s.total_amount ?? 0)
    hourMap[h].count += 1
  }
  const salesByHour = Object.entries(hourMap)
    .map(([hour, v]) => ({ hour: Number(hour), ...v }))
    .sort((a, b) => a.hour - b.hour)

  const { data: expData } = await supabase
    .from('expenses')
    .select('amount')
    .eq('is_deleted', false)
    .eq('payment_method', 'cash')
    .gte('created_at', shift.opened_at)
    .lte('created_at', closedAt)

  const expensesTotal = (expData ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const expectedCash  = Number(shift.opening_cash) + cashSalesTotal - expensesTotal

  return {
    data: {
      shift: {
        ...shift,
        cashier_name: profile?.full_name ?? null,
      } as ShiftRow,
      cashSalesTotal,
      creditSalesTotal,
      totalSalesCount: sales.length,
      expensesTotal,
      expectedCash,
      salesByHour,
    } as ShiftSummaryData,
    error: null,
  }
}
