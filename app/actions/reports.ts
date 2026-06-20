'use server'

import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/db-types'

// ─── Return-row types ────────────────────────────────────────────────────────
// Exported so client components can type their state without a separate file.

export interface SalesSummaryRow {
  total_sales:    number
  total_revenue:  number
  total_discount: number
  total_cogs:     number
  gross_profit:   number
  cash_sales:     number
  credit_sales:   number
  avg_sale_value: number
}

export interface SalesByDayRow {
  sale_date:  string
  sale_count: number
  revenue:    number
  discount:   number
}

export interface SalesByPharmacistRow {
  cashier_id:   string
  cashier_name: string
  sale_count:   number
  revenue:      number
  avg_sale:     number
}

export interface ItemSalesRow {
  medicine_id:   string
  medicine_name: string
  medicine_code: string | null
  total_qty:     number
  total_revenue: number
  avg_price:     number
}

export interface StockValuationRow {
  medicine_id:   string
  medicine_name: string
  medicine_code: string | null
  total_qty:     number
  avg_cost:      number
  total_value:   number
  sale_value:    number
}

export interface PLStatementRow {
  account_code: string
  account_name: string
  account_type: string
  total_amount: number
}

export interface CashFlowRow {
  flow_date: string
  cash_in:   number
  cash_out:  number
  net_flow:  number
}

export interface SupplierAnalysisRow {
  supplier_id:     string
  supplier_name:   string
  total_orders:    number
  total_purchased: number
  total_paid:      number
  outstanding:     number
}

export interface ExpiryReportRow {
  medicine_id:    string
  medicine_name:  string
  batch_no:       string
  expiry_date:    string
  days_to_expiry: number
  quantity:       number
  value:          number
}

export interface DeadStockRow {
  medicine_id:    string
  medicine_name:  string
  last_sale_date: string | null
  days_inactive:  number
  current_qty:    number
  stock_value:    number
}

export interface OutstandingReceivableRow {
  id:               string
  name:             string
  phone:            string | null
  credit_balance:   number
  credit_limit:     number | null
}

export interface MonthlyBalanceRow {
  month_num:    number
  month_name:   string
  revenue:      number
  cogs:         number
  gross_profit: number
  expenses:     number
  net_profit:   number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

type Result<T> = { data: T | null; error: string | null }

const NOT_AUTH:     Result<never> = { data: null, error: 'Not authenticated' }
const ACCESS_DENIED: Result<never> = { data: null, error: 'Access denied' }

// ─── 1. getSalesSummary ───────────────────────────────────────────────────────
// All roles. Pharmacist: cashierId forced to caller's own id.

export async function getSalesSummary(
  dateFrom:   string,
  dateTo:     string,
  cashierId?: string,
): Promise<Result<SalesSummaryRow>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH

  const effectiveCashierId =
    role === 'pharmacist' ? user.id : (cashierId ?? null)

  const { data, error } = await supabase.rpc('get_sales_summary', {
    p_from:       dateFrom,
    p_to:         dateTo,
    p_cashier_id: effectiveCashierId,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SalesSummaryRow[])?.[0] ?? null, error: null }
}

// ─── 2. getSalesByDay ─────────────────────────────────────────────────────────
// All roles. Pharmacist: cashierId forced to caller's own id.

export async function getSalesByDay(
  dateFrom:   string,
  dateTo:     string,
  cashierId?: string,
): Promise<Result<SalesByDayRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH

  const effectiveCashierId =
    role === 'pharmacist' ? user.id : (cashierId ?? null)

  const { data, error } = await supabase.rpc('get_sales_by_day', {
    p_from:       dateFrom,
    p_to:         dateTo,
    p_cashier_id: effectiveCashierId,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SalesByDayRow[]) ?? [], error: null }
}

// ─── 3. getSalesByPharmacist ──────────────────────────────────────────────────
// Superadmin + admin only.

export async function getSalesByPharmacist(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<SalesByPharmacistRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_sales_by_pharmacist', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SalesByPharmacistRow[]) ?? [], error: null }
}

// ─── 4. getItemSales ──────────────────────────────────────────────────────────
// Superadmin + admin only.

export async function getItemSales(
  dateFrom: string,
  dateTo:   string,
  limit?:   number,
): Promise<Result<ItemSalesRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_item_sales', {
    p_from:  dateFrom,
    p_to:    dateTo,
    p_limit: limit ?? 20,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ItemSalesRow[]) ?? [], error: null }
}

// ─── 5. getStockValuation ─────────────────────────────────────────────────────
// Superadmin + admin only. No date range — snapshot of now.

export async function getStockValuation(): Promise<Result<StockValuationRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_stock_valuation')

  if (error) return { data: null, error: error.message }
  return { data: (data as StockValuationRow[]) ?? [], error: null }
}

// ─── 6. getPLStatement ───────────────────────────────────────────────────────
// Superadmin only.

export async function getPLStatement(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<PLStatementRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role !== 'superadmin') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_pl_statement', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as PLStatementRow[]) ?? [], error: null }
}

// ─── 7. getCashFlow ───────────────────────────────────────────────────────────
// Superadmin only.

export async function getCashFlow(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<CashFlowRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role !== 'superadmin') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_cash_flow', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as CashFlowRow[]) ?? [], error: null }
}

// ─── 8. getSupplierAnalysis ───────────────────────────────────────────────────
// Superadmin + admin only.

export async function getSupplierAnalysis(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<SupplierAnalysisRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_supplier_analysis', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SupplierAnalysisRow[]) ?? [], error: null }
}

// ─── 9. getExpiryReport ───────────────────────────────────────────────────────
// Superadmin + admin only.

export async function getExpiryReport(
  daysAhead?: number,
): Promise<Result<ExpiryReportRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_expiry_report', {
    p_days_ahead: daysAhead ?? 90,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ExpiryReportRow[]) ?? [], error: null }
}

// ─── 10. getDeadStock ─────────────────────────────────────────────────────────
// Superadmin + admin only.

export async function getDeadStock(
  daysInactive?: number,
): Promise<Result<DeadStockRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_dead_stock', {
    p_days_inactive: daysInactive ?? 60,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as DeadStockRow[]) ?? [], error: null }
}

// ─── 11. getOutstandingReceivables ────────────────────────────────────────────
// Superadmin + admin only. Direct table query — customers with udhaar.

export async function getOutstandingReceivables(): Promise<Result<OutstandingReceivableRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, credit_balance, credit_limit')
    .gt('credit_balance', 0)
    .eq('is_deleted', false)
    .order('credit_balance', { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data as OutstandingReceivableRow[]) ?? [], error: null }
}

// ─── 12. getOutstandingPayables ───────────────────────────────────────────────
// Superadmin + admin only.
// Calls get_supplier_analysis over the full date range so the all-time
// AP balance (outstanding column) is the meaningful figure.

export async function getOutstandingPayables(): Promise<Result<SupplierAnalysisRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase.rpc('get_supplier_analysis', {
    p_from: '2000-01-01',
    p_to:   today,
  })

  if (error) return { data: null, error: error.message }

  const filtered = ((data as SupplierAnalysisRow[]) ?? [])
    .filter(s => Number(s.outstanding) > 0)

  return { data: filtered, error: null }
}

// ─── 13. getMonthlyBalances ───────────────────────────────────────────────────
// Superadmin only. Used for yearly overview P&L charts.

export async function getMonthlyBalances(
  year: number,
): Promise<Result<MonthlyBalanceRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role !== 'superadmin') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_monthly_balances', {
    p_year: year,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as MonthlyBalanceRow[]) ?? [], error: null }
}

// ─── Return-row types for migration 017 functions ────────────────────────────

export interface SalesByHourRow {
  hour_of_day: number
  sale_count:  number
  revenue:     number
}

export interface SalesComparisonRow {
  medicine_id:     string
  medicine_name:   string
  medicine_code:   string | null
  current_qty:     number
  current_revenue: number
  prev_qty:        number
  prev_revenue:    number
  change_pct:      number | null
}

export interface StockByCategoryRow {
  category_id:    string
  category_name:  string
  medicine_count: number
  total_qty:      number
  total_value:    number
  sale_value:     number
}

export interface UdhaarAgingRow {
  bucket:         string
  customer_count: number
  total_amount:   number
}

export interface PharmacistStatsRow {
  cashier_id:       string
  cashier_name:     string
  sale_count:       number
  revenue:          number
  avg_sale:         number
  top_medicine:     string | null
  best_day_of_week: string | null
}

export interface PharmacistDailyRow {
  cashier_id:   string
  cashier_name: string
  day_of_week:  number
  day_name:     string
  revenue:      number
  sale_count:   number
}

// ─── 14. getSalesByHour ───────────────────────────────────────────────────────
// All roles. Pharmacist: cashier_id forced to caller's own id.

export async function getSalesByHour(
  dateFrom:   string,
  dateTo:     string,
  cashierId?: string,
): Promise<Result<SalesByHourRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH

  const effectiveCashierId =
    role === 'pharmacist' ? user.id : (cashierId ?? null)

  const { data, error } = await supabase.rpc('get_sales_by_hour', {
    p_from:       dateFrom,
    p_to:         dateTo,
    p_cashier_id: effectiveCashierId,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SalesByHourRow[]) ?? [], error: null }
}

// ─── 15. getSalesComparison ───────────────────────────────────────────────────
// Admin + superadmin only.

export async function getSalesComparison(
  dateFrom:   string,
  dateTo:     string,
  prevFrom:   string,
  prevTo:     string,
  limit?:     number,
): Promise<Result<SalesComparisonRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_sales_comparison', {
    p_from:      dateFrom,
    p_to:        dateTo,
    p_prev_from: prevFrom,
    p_prev_to:   prevTo,
    p_limit:     limit ?? 20,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as SalesComparisonRow[]) ?? [], error: null }
}

// ─── 16. getStockByCategory ───────────────────────────────────────────────────
// Admin + superadmin only. Snapshot of live stock.

export async function getStockByCategory(): Promise<Result<StockByCategoryRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_stock_by_category', {
    p_category_id: null,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as StockByCategoryRow[]) ?? [], error: null }
}

// ─── 17. getUdhaarAging ───────────────────────────────────────────────────────
// Admin + superadmin only.

export async function getUdhaarAging(): Promise<Result<UdhaarAgingRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_udhaar_aging')

  if (error) return { data: null, error: error.message }
  return { data: (data as UdhaarAgingRow[]) ?? [], error: null }
}

// ─── 18. getPharmacistStats ───────────────────────────────────────────────────
// Admin + superadmin only.

export async function getPharmacistStats(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<PharmacistStatsRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_pharmacist_stats', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as PharmacistStatsRow[]) ?? [], error: null }
}

// ─── 19. getPharmacistDaily ───────────────────────────────────────────────────
// Admin + superadmin only. Full pharmacist × day-of-week grid for heatmap.

export async function getPharmacistDaily(
  dateFrom: string,
  dateTo:   string,
): Promise<Result<PharmacistDailyRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_pharmacist_daily', {
    p_from: dateFrom,
    p_to:   dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as PharmacistDailyRow[]) ?? [], error: null }
}
