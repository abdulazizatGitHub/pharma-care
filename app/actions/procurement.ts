'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole, PurchaseOrder, PurchaseOrderItem } from '@/lib/db-types'

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

function canWritePO(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin'
}

const PO_PATHS = ['/superadmin/purchase-orders', '/admin/purchase-orders']

// Recalculate and write purchase_orders.total_amount from item sum.
// Called after any item add, update, or remove.
async function syncPOTotal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poId: string,
): Promise<void> {
  const { data: items } = await supabase
    .from('purchase_order_items')
    .select('total_price')
    .eq('po_id', poId)

  const total = (items ?? []).reduce(
    (sum: number, row: { total_price: number }) => sum + Number(row.total_price),
    0,
  )

  await supabase
    .from('purchase_orders')
    .update({ total_amount: total })
    .eq('id', poId)
}

// ─── Exported GRN input type ──────────────────────────────────────────────────

export interface GRNItemInput {
  medicine_id: string
  batch_no:    string
  expiry_date: string   // YYYY-MM-DD
  quantity:    number
  unit_price:  number
}

// ─── 1. createPO ─────────────────────────────────────────────────────────────
// admin, superadmin.
// Generates po_number via next_po_number() RPC, inserts with status='draft'.

export async function createPO(
  supplierId: string,
  notes?: string,
): Promise<{ data?: { poId: string; poNumber: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  if (!supplierId) return { error: 'Supplier is required' }

  // Verify supplier exists, is active, and is not deleted
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id')
    .eq('id', supplierId)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .maybeSingle()
  if (!supplier) return { error: 'Supplier not found or inactive' }

  // Generate PO number
  const { data: poNumber, error: rpcError } = await supabase.rpc('next_po_number')
  if (rpcError || !poNumber) return { error: rpcError?.message ?? 'Failed to generate PO number' }

  const { data: row, error: insertError } = await supabase
    .from('purchase_orders')
    .insert({
      po_number:   poNumber as string,
      supplier_id: supplierId,
      status:      'draft',
      total_amount: 0,
      notes:       notes ?? null,
      created_by:  user.id,
    })
    .select('id, po_number')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create PO' }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CREATE_PO,
    tableName: 'purchase_orders',
    recordId:  row.id,
    newValue:  { po_number: row.po_number, supplier_id: supplierId },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { data: { poId: row.id as string, poNumber: row.po_number as string }, error: null }
}

// ─── 2. addPOItem ─────────────────────────────────────────────────────────────
// admin, superadmin.
// Verifies PO is in 'draft' status before inserting.
// Recalculates and writes PO total_amount after insert.

export async function addPOItem(
  poId:       string,
  medicineId: string,
  quantity:   number,
  unitPrice:  number,
): Promise<{ data?: { id: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'Quantity must be a positive integer' }
  if (unitPrice <= 0) return { error: 'Unit price must be positive' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)              return { error: 'Purchase order not found' }
  if (po.status !== 'draft') return { error: 'Items can only be added to draft POs' }

  const { data: row, error: insertError } = await supabase
    .from('purchase_order_items')
    .insert({
      po_id:       poId,
      medicine_id: medicineId,
      quantity,
      unit_price:  unitPrice,
    })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to add item' }

  await syncPOTotal(supabase, poId)

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.ADD_PO_ITEM,
    tableName: 'purchase_order_items',
    recordId:  row.id,
    newValue:  { po_id: poId, medicine_id: medicineId, quantity, unit_price: unitPrice },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { data: { id: row.id as string }, error: null }
}

// ─── 3. updatePOItem ─────────────────────────────────────────────────────────
// admin, superadmin.
// Verifies parent PO is in 'draft' before updating.
// Recalculates PO total_amount after update.

export async function updatePOItem(
  itemId:    string,
  quantity:  number,
  unitPrice: number,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'Quantity must be a positive integer' }
  if (unitPrice <= 0) return { error: 'Unit price must be positive' }

  // Fetch item to get po_id and verify parent PO status
  const { data: item } = await supabase
    .from('purchase_order_items')
    .select('id, po_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { error: 'Item not found' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', item.po_id)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                    return { error: 'Purchase order not found' }
  if (po.status !== 'draft')  return { error: 'Items can only be edited on draft POs' }

  const { error: updateError } = await supabase
    .from('purchase_order_items')
    .update({ quantity, unit_price: unitPrice })
    .eq('id', itemId)

  if (updateError) return { error: updateError.message }

  await syncPOTotal(supabase, item.po_id as string)

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.UPDATE_PO_ITEM,
    tableName: 'purchase_order_items',
    recordId:  itemId,
    newValue:  { quantity, unit_price: unitPrice },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 4. removePOItem ─────────────────────────────────────────────────────────
// admin, superadmin.
// Hard delete — purchase_order_items have no independent audit value when
// removed from a draft PO.
// Requires: supabase/migrations/010_po_item_delete_policy.sql to be run first.
// Recalculates PO total_amount after deletion.

export async function removePOItem(
  itemId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  const { data: item } = await supabase
    .from('purchase_order_items')
    .select('id, po_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { error: 'Item not found' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', item.po_id)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                    return { error: 'Purchase order not found' }
  if (po.status !== 'draft')  return { error: 'Items can only be removed from draft POs' }

  const { error: deleteError } = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('id', itemId)

  if (deleteError) return { error: deleteError.message }

  await syncPOTotal(supabase, item.po_id as string)

  PO_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 5. confirmPO ────────────────────────────────────────────────────────────
// admin, superadmin.
// Checks po_approval_threshold from settings:
//   total_amount <  threshold → status = 'confirmed'
//   total_amount >= threshold → status = 'pending_approval'

export async function confirmPO(
  poId: string,
): Promise<{ data?: { newStatus: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status, total_amount')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                    return { error: 'Purchase order not found' }
  if (po.status !== 'draft')  return { error: 'Only draft POs can be confirmed' }

  // Must have at least 1 item
  const { count: itemCount } = await supabase
    .from('purchase_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('po_id', poId)
  if (!itemCount || itemCount === 0) return { error: 'PO must have at least one line item before confirming' }

  // Read approval threshold
  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'po_approval_threshold')
    .maybeSingle()

  const threshold = setting?.value ? parseInt(setting.value, 10) : 50000
  const total = Number(po.total_amount ?? 0)
  const newStatus = total < threshold ? 'confirmed' : 'pending_approval'

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: newStatus })
    .eq('id', poId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CONFIRM_PO,
    tableName: 'purchase_orders',
    recordId:  poId,
    newValue:  { status: newStatus, total_amount: total, threshold },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { data: { newStatus }, error: null }
}

// ─── 6. approvePO ────────────────────────────────────────────────────────────
// superadmin only.
// PO must be in 'pending_approval'. Sets status = 'confirmed'.

export async function approvePO(
  poId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can approve purchase orders' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                              return { error: 'Purchase order not found' }
  if (po.status !== 'pending_approval') return { error: 'Only pending_approval POs can be approved' }

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: 'confirmed', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', poId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.APPROVE_PO,
    tableName: 'purchase_orders',
    recordId:  poId,
    newValue:  { status: 'confirmed' },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 7. rejectPO ─────────────────────────────────────────────────────────────
// superadmin only.
// PO must be in 'pending_approval'. Returns to 'draft' with rejection note.

export async function rejectPO(
  poId:          string,
  rejectionNote: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can reject purchase orders' }

  if (!rejectionNote.trim()) return { error: 'Rejection note is required' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                              return { error: 'Purchase order not found' }
  if (po.status !== 'pending_approval') return { error: 'Only pending_approval POs can be rejected' }

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({
      status:         'draft',
      rejected_by:    user.id,
      rejected_at:    new Date().toISOString(),
      rejection_note: rejectionNote.trim(),
    })
    .eq('id', poId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.REJECT_PO,
    tableName: 'purchase_orders',
    recordId:  poId,
    newValue:  { status: 'draft', rejection_note: rejectionNote.trim() },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 8. cancelPO ─────────────────────────────────────────────────────────────
// admin, superadmin.
// PO must be in 'draft' or 'confirmed' — cannot cancel received POs.

export async function cancelPO(
  poId:   string,
  reason?: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWritePO(role)) return { error: 'Insufficient permissions' }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po) return { error: 'Purchase order not found' }

  if (!['draft', 'confirmed'].includes(po.status)) {
    return { error: `Cannot cancel a ${po.status} PO` }
  }

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      notes:        reason ? reason.trim() : undefined,
    })
    .eq('id', poId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CANCEL_PO,
    tableName: 'purchase_orders',
    recordId:  poId,
    newValue:  { status: 'cancelled', reason: reason ?? null },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 9. createGRN ────────────────────────────────────────────────────────────
// admin, superadmin, pharmacist (receives goods).
// Calls complete_grn() RPC for atomic execution.
// Audit log is written ONLY after the RPC succeeds.
// Do NOT use separate Supabase client calls for this operation.

const GRNItemSchema = z.object({
  medicine_id: z.string().uuid(),
  batch_no:    z.string().min(1, 'Batch number is required').max(50),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  quantity:    z.number().int().positive('Quantity must be positive'),
  unit_price:  z.number().positive('Unit price must be positive'),
})

export async function createGRN(
  poId:   string,
  items:  GRNItemInput[],
  notes?: string,
): Promise<{ data?: { grnId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role === 'pending') return { error: 'Insufficient permissions' }

  if (items.length === 0) return { error: 'At least one item is required' }

  // Validate each item
  for (const item of items) {
    const parsed = GRNItemSchema.safeParse(item)
    if (!parsed.success) return { error: parsed.error.issues[0].message }
  }

  // App-level PO status check (complete_grn also checks internally)
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status, po_number')
    .eq('id', poId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!po)                       return { error: 'Purchase order not found' }
  if (po.status !== 'confirmed') return { error: 'GRN can only be recorded for confirmed POs' }

  // Call complete_grn() RPC — atomic: GRN header + items + stock upserts + PO close
  const { data: grnId, error: rpcError } = await supabase.rpc('complete_grn', {
    p_po_id:       poId,
    p_received_by: user.id,
    p_notes:       notes ?? null,
    p_items:       items,
  })

  if (rpcError || !grnId) return { error: rpcError?.message ?? 'GRN creation failed' }

  // Audit log written only after successful RPC
  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CREATE_GRN,
    tableName: 'goods_receipts',
    recordId:  grnId as string,
    newValue:  { po_id: poId, po_number: po.po_number, item_count: items.length },
  })

  PO_PATHS.forEach(p => revalidatePath(p))
  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { data: { grnId: grnId as string }, error: null }
}
