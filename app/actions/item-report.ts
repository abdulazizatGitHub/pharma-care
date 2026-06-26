'use server'

import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/db-types'

// ─── Return-row types ────────────────────────────────────────────────────────

export interface MedicineDetail {
  id: string
  name: string
  code: string | null
  generic_name: string | null
  manufacturer: string | null
  mrp: number | null
  is_active: boolean
}

export interface MedicineSearchResult {
  id: string
  name: string
  code: string | null
}

export interface ItemBatch {
  batch_id: string
  batch_no: string
  expiry_date: string | null
  quantity: number
  purchase_price: number | null
  sale_price: number | null
  mrp: number | null
  supplier_id: string | null
  supplier_name: string | null
  created_at: string
}

export interface ItemSaleRow {
  sale_date: string
  sale_reference: string
  quantity_sold: number
  unit_price: number
  discount_amount: number
  line_total: number
  payment_type: string | null
  customer_name: string | null
  pharmacist_name: string | null
  batch_no: string
}

export interface ItemSupplierRow {
  grn_date: string
  grn_number: string
  po_number: string | null
  supplier_name: string | null
  batch_no: string
  quantity_received: number
  unit_price: number | null
  line_total: number
}

export interface ItemReturnRow {
  return_date: string
  return_number: string
  original_sale_reference: string
  quantity_returned: number
  refund_amount: number | null
  reason: string | null
  status: string
  batch_no: string
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

const NOT_AUTH:      Result<never> = { data: null, error: 'Not authenticated' }
const ACCESS_DENIED: Result<never> = { data: null, error: 'Access denied' }

// ─── 1. getMedicineById ───────────────────────────────────────────────────────

export async function getMedicineById(
  medicineId: string,
): Promise<Result<MedicineDetail>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase
    .from('medicines')
    .select('id, name, code, generic_name, manufacturer, mrp, is_active')
    .eq('id', medicineId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data as MedicineDetail | null, error: null }
}

// ─── 2. searchMedicines ───────────────────────────────────────────────────────

export async function searchMedicines(
  query: string,
): Promise<Result<MedicineSearchResult[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase
    .from('medicines')
    .select('id, name, code')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
    .order('name', { ascending: true })
    .limit(20)

  if (error) return { data: null, error: error.message }
  return { data: (data as MedicineSearchResult[]) ?? [], error: null }
}

// ─── 3. getItemBatchDetail ────────────────────────────────────────────────────

export async function getItemBatchDetail(
  medicineId: string,
): Promise<Result<ItemBatch[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_item_batch_detail', {
    p_medicine_id: medicineId,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ItemBatch[]) ?? [], error: null }
}

// ─── 4. getItemSalesDetail ────────────────────────────────────────────────────

export async function getItemSalesDetail(
  medicineId: string,
  dateFrom:   string,
  dateTo:     string,
): Promise<Result<ItemSaleRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_item_sales_detail', {
    p_medicine_id: medicineId,
    p_date_from:   dateFrom,
    p_date_to:     dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ItemSaleRow[]) ?? [], error: null }
}

// ─── 5. getItemSupplierHistory ────────────────────────────────────────────────

export async function getItemSupplierHistory(
  medicineId: string,
  dateFrom:   string,
  dateTo:     string,
): Promise<Result<ItemSupplierRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_item_supplier_history', {
    p_medicine_id: medicineId,
    p_date_from:   dateFrom,
    p_date_to:     dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ItemSupplierRow[]) ?? [], error: null }
}

// ─── 6. getItemReturnHistory ──────────────────────────────────────────────────

export async function getItemReturnHistory(
  medicineId: string,
  dateFrom:   string,
  dateTo:     string,
): Promise<Result<ItemReturnRow[]>> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return NOT_AUTH
  if (role === 'pharmacist') return ACCESS_DENIED

  const { data, error } = await supabase.rpc('get_item_return_history', {
    p_medicine_id: medicineId,
    p_date_from:   dateFrom,
    p_date_to:     dateTo,
  })

  if (error) return { data: null, error: error.message }
  return { data: (data as ItemReturnRow[]) ?? [], error: null }
}
