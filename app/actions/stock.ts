'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole, StockBatch } from '@/lib/db-types'

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

// Stock write actions are allowed for all 3 active roles
function canWriteStock(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'pharmacist'
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const AddBatchSchema = z.object({
  medicine_id:    z.string().uuid(),
  batch_no:       z.string().min(1, 'Batch number is required').max(50),
  expiry_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  quantity:       z.number().int().positive('Quantity must be a positive integer'),
  purchase_price: z.number().positive('Purchase price must be positive'),
  sale_price:     z.number().positive('Sale price must be positive'),
  mrp:            z.number().positive('MRP must be positive').optional(),
  supplier_id:    z.string().uuid().optional(),
  notes:          z.string().optional(),
})

const AdjustStockSchema = z.object({
  new_quantity: z.number().int().min(0, 'Quantity cannot be negative'),
  reason: z.enum([
    'physical_count',
    'damaged',
    'theft',
    'other',
  ], { message: 'Reason is required' }),
  notes: z.string().optional(),
})

const WriteOffSchema = z.object({
  quantity: z.number().int().positive('Write-off quantity must be positive'),
  reason: z.enum([
    'expired',
    'near_expiry',
    'damaged',
    'other',
  ], { message: 'Reason is required' }),
  notes: z.string().optional(),
})

// ─── Input types (exported for component use) ─────────────────────────────────

export type AddBatchInput = z.input<typeof AddBatchSchema>

export interface StockSummary {
  medicine_id:    string
  total_quantity: number
  nearest_expiry: string | null
  batches:        StockBatch[]
}

// ─── 1. addStockBatch ─────────────────────────────────────────────────────────

export async function addStockBatch(
  input: AddBatchInput,
): Promise<{ data?: { id: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteStock(role)) return { error: 'Insufficient permissions' }

  const parsed = AddBatchSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const data = parsed.data

  // Verify medicine exists and is active
  const { data: medicine } = await supabase
    .from('medicines')
    .select('id, name, mrp')
    .eq('id', data.medicine_id)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .maybeSingle()
  if (!medicine) return { error: 'Medicine not found or inactive' }

  // Check batch_no uniqueness per medicine
  const { data: dupBatch } = await supabase
    .from('stock_batches')
    .select('id')
    .eq('medicine_id', data.medicine_id)
    .eq('batch_no', data.batch_no)
    .eq('is_deleted', false)
    .maybeSingle()
  if (dupBatch) return { error: `Batch number "${data.batch_no}" already exists for this medicine` }

  // Resolve MRP: use provided or fall back to medicine master MRP
  const batchMrp = data.mrp ?? medicine.mrp

  // App-layer check: sale_price > mrp
  if (data.sale_price > batchMrp) {
    return { error: `Sale price (${data.sale_price}) cannot exceed MRP (${batchMrp})` }
  }

  const { data: row, error: insertError } = await supabase
    .from('stock_batches')
    .insert({
      medicine_id:    data.medicine_id,
      batch_no:       data.batch_no,
      expiry_date:    data.expiry_date,
      quantity:       data.quantity,
      purchase_price: data.purchase_price,
      sale_price:     data.sale_price,
      mrp:            batchMrp,
      supplier_id:    data.supplier_id ?? null,
      notes:          data.notes ?? null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to add stock batch' }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.ADD_STOCK_BATCH,
    tableName: 'stock_batches',
    recordId:  row.id,
    newValue:  {
      medicine_id:    data.medicine_id,
      batch_no:       data.batch_no,
      quantity:       data.quantity,
      expiry_date:    data.expiry_date,
      mrp:            batchMrp,
    },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { data: { id: row.id }, error: null }
}

// ─── 2. adjustStock ───────────────────────────────────────────────────────────

export async function adjustStock(
  batchId: string,
  newQuantity: number,
  reason: 'physical_count' | 'damaged' | 'theft' | 'other',
  notes?: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteStock(role)) return { error: 'Insufficient permissions' }

  const parsed = AdjustStockSchema.safeParse({ new_quantity: newQuantity, reason, notes })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: batch } = await supabase
    .from('stock_batches')
    .select('id, quantity, medicine_id')
    .eq('id', batchId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!batch) return { error: 'Stock batch not found' }

  const oldQuantity = batch.quantity

  const { error: updateError } = await supabase
    .from('stock_batches')
    .update({ quantity: newQuantity, updated_by: user.id })
    .eq('id', batchId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.ADJUST_STOCK,
    tableName: 'stock_batches',
    recordId:  batchId,
    oldValue:  { quantity: oldQuantity },
    newValue:  { quantity: newQuantity, reason, notes: notes ?? null },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 3. writeOffBatch ─────────────────────────────────────────────────────────

export async function writeOffBatch(
  batchId: string,
  quantity: number,
  reason: 'expired' | 'near_expiry' | 'damaged' | 'other',
  notes?: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteStock(role)) return { error: 'Insufficient permissions' }

  const parsed = WriteOffSchema.safeParse({ quantity, reason, notes })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: batch } = await supabase
    .from('stock_batches')
    .select('id, quantity, medicine_id')
    .eq('id', batchId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!batch) return { error: 'Stock batch not found' }

  if (parsed.data.quantity > batch.quantity) {
    return { error: `Write-off quantity (${parsed.data.quantity}) exceeds available stock (${batch.quantity})` }
  }

  const newQuantity = batch.quantity - parsed.data.quantity

  const { error: updateError } = await supabase
    .from('stock_batches')
    .update({ quantity: newQuantity, updated_by: user.id })
    .eq('id', batchId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.STOCK_WRITEOFF,
    tableName: 'stock_batches',
    recordId:  batchId,
    oldValue:  { quantity: batch.quantity },
    newValue:  { quantity: newQuantity, written_off: parsed.data.quantity, reason, notes: notes ?? null },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── Alert types (exported for dashboard components) ─────────────────────────

export interface LowStockMedicine {
  id: string
  name: string
  code: string | null
  total_stock: number
  reorder_level: number
}

export interface ExpiringBatch {
  id: string
  medicine_id: string
  medicine_name: string
  batch_no: string
  expiry_date: string
  quantity: number
}

export interface AlertSummary {
  lowStockMedicines: LowStockMedicine[]
  expiringBatches:   ExpiringBatch[]
  expiryAlertDays:   number
}

// ─── 4. getStockSummary ───────────────────────────────────────────────────────

export async function getStockSummary(
  medicineId: string,
): Promise<{ data?: StockSummary; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role === 'pending') return { error: 'Insufficient permissions' }

  const { data: batches, error: fetchError } = await supabase
    .from('stock_batches')
    .select('*')
    .eq('medicine_id', medicineId)
    .eq('is_deleted', false)
    .order('expiry_date', { ascending: true })

  if (fetchError) return { error: fetchError.message }

  const rows = (batches ?? []) as StockBatch[]
  const totalQuantity = rows.reduce((sum, b) => sum + b.quantity, 0)
  const activeBatches = rows.filter(b => b.quantity > 0)
  const nearestExpiry = activeBatches.length > 0 ? activeBatches[0].expiry_date : null

  return {
    data: {
      medicine_id:    medicineId,
      total_quantity: totalQuantity,
      nearest_expiry: nearestExpiry,
      batches:        rows,
    },
    error: null,
  }
}

// ─── 5. getAlertSummary ───────────────────────────────────────────────────────

export async function getAlertSummary(): Promise<{ data?: AlertSummary; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role === 'pending') return { error: 'Insufficient permissions' }

  // Read expiry_alert_days from settings; self-heal with default 90 if missing
  let expiryAlertDays = 90
  const { data: settingRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'expiry_alert_days')
    .maybeSingle()

  if (settingRow?.value) {
    const parsed = parseInt(settingRow.value, 10)
    if (!isNaN(parsed) && parsed > 0) expiryAlertDays = parsed
  } else {
    // Self-healing seed: insert default; never blocks main operation
    try {
      await supabase
        .from('settings')
        .upsert({ key: 'expiry_alert_days', value: '90' }, { onConflict: 'key' })
    } catch (e) {
      console.error('getAlertSummary: failed to seed expiry_alert_days', e)
    }
  }

  // Stock summary for all medicines
  const { data: stockSummary, error: stockError } = await supabase.rpc('get_stock_summary')
  if (stockError) return { error: stockError.message }

  // Medicines with reorder levels
  const { data: medicines, error: medError } = await supabase
    .from('medicines')
    .select('id, name, code, reorder_level')
    .eq('is_deleted', false)
    .eq('is_active', true)
  if (medError) return { error: medError.message }

  const stockMap = new Map<string, number>(
    (stockSummary ?? []).map((s: { medicine_id: string; total_quantity: number }) => [
      s.medicine_id, Number(s.total_quantity),
    ])
  )

  const lowStockMedicines: LowStockMedicine[] = (medicines ?? [])
    .filter((m: { id: string; reorder_level: number }) => (stockMap.get(m.id) ?? 0) < m.reorder_level)
    .map((m: { id: string; name: string; code: string | null; reorder_level: number }) => ({
      id:            m.id,
      name:          m.name,
      code:          m.code,
      total_stock:   stockMap.get(m.id) ?? 0,
      reorder_level: m.reorder_level,
    }))

  // Expiring batches: quantity > 0 and expiry_date within the alert window
  const alertDate = new Date()
  alertDate.setDate(alertDate.getDate() + expiryAlertDays)
  const alertDateStr = alertDate.toISOString().split('T')[0]

  const { data: expiringRaw, error: expError } = await supabase
    .from('stock_batches')
    .select('id, medicine_id, batch_no, expiry_date, quantity')
    .eq('is_deleted', false)
    .gt('quantity', 0)
    .lte('expiry_date', alertDateStr)
    .order('expiry_date', { ascending: true })
  if (expError) return { error: expError.message }

  // Resolve medicine names separately to avoid join complexity on untyped client
  const medicineIds = [...new Set((expiringRaw ?? []).map((b: { medicine_id: string }) => b.medicine_id))]
  let medNameMap = new Map<string, string>()
  if (medicineIds.length > 0) {
    const { data: medNames } = await supabase
      .from('medicines')
      .select('id, name')
      .in('id', medicineIds)
      .eq('is_deleted', false)
    medNameMap = new Map((medNames ?? []).map((m: { id: string; name: string }) => [m.id, m.name]))
  }

  const expiringBatches: ExpiringBatch[] = (expiringRaw ?? []).map(
    (b: { id: string; medicine_id: string; batch_no: string; expiry_date: string; quantity: number }) => ({
      id:            b.id,
      medicine_id:   b.medicine_id,
      medicine_name: medNameMap.get(b.medicine_id) ?? 'Unknown',
      batch_no:      b.batch_no,
      expiry_date:   b.expiry_date,
      quantity:      b.quantity,
    })
  )

  return {
    data: { lowStockMedicines, expiringBatches, expiryAlertDays },
    error: null,
  }
}
