'use server'

import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'
import type {
  CartItem,
  Cart,
  ParkedSale,
  CompleteSaleInput,
  POSMedicineResult,
} from '@/lib/pos-types'
import { completeBorrowingSale } from '@/app/actions/borrowing'

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

// ─── completeSale ─────────────────────────────────────────────────────────────
// Calls complete_sale() RPC atomically.
// Stock is decremented and receipt_no is generated inside the RPC.
// Audit log is written ONLY after a successful RPC response.

export async function completeSale(
  input: CompleteSaleInput,
): Promise<{
  data: { saleId: string; receiptNo: string; total: number; change: number } | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthenticated' }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('complete_sale', {
    p_cashier_id:   input.cashierId,
    p_customer_id:  input.customerId,
    p_payment_type: input.paymentType,
    p_items:        input.items,
    p_discount_amt: input.discountAmt,
    p_bag_charge:   input.serviceFee,
    p_amount_paid:  input.amountPaid,
    p_notes:        input.notes,
  })

  if (rpcError) return { data: null, error: rpcError.message }

  // Post-process borrowed items AFTER the RPC commits.
  // Errors here are logged but do not fail the sale — the sale has already completed.
  if (input.borrowedItems && input.borrowedItems.length > 0) {
    const { error: borrowError } = await completeBorrowingSale(
      rpcResult.sale_id,
      input.borrowedItems,
    )
    if (borrowError) {
      console.error(
        '[completeSale] Borrowing post-processing failed for sale',
        rpcResult.sale_id,
        ':',
        borrowError,
      )
    }
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CREATE_SALE,
    tableName: 'sales',
    recordId:  rpcResult.sale_id,
    newValue:  {
      receipt_no:         rpcResult.receipt_no,
      total:              rpcResult.total,
      payment_type:       input.paymentType,
      item_count:         input.items.length,
      borrowed_item_count: input.borrowedItems?.length ?? 0,
    },
  })

  return {
    data: {
      saleId:    rpcResult.sale_id,
      receiptNo: rpcResult.receipt_no,
      total:     Number(rpcResult.total),
      change:    Number(rpcResult.change),
    },
    error: null,
  }
}

// ─── holdSale ─────────────────────────────────────────────────────────────────
// Saves the current cart as a held (parked) sale in the DB.
// Cart items are stored as a JSONB snapshot (held_cart_data) — NO sale_items
// rows are inserted. This avoids orphaned sale_items when the held sale is
// eventually soft-deleted after checkout. complete_sale() inserts fresh
// sale_items atomically at checkout time.
// Does NOT decrement stock — stock is only decremented when the sale completes.

export async function holdSale(
  cartItems:      CartItem[],
  holdLabel:      string,
  customerId:     string | null,
  notes:          string,
  serviceFee:     number,
  discountAmount: number,
): Promise<{ data: { saleId: string } | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthenticated' }

  const subtotal   = cartItems.reduce((sum, item) => sum + item.totalPrice, 0)
  const total      = subtotal - discountAmount + serviceFee
  const holdLabel_ = holdLabel.trim() || `Held at ${new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`

  // Temporary receipt number — satisfies NOT NULL UNIQUE constraint.
  // Format: HLD-{timestamp}-{random} — never exposed on customer-facing receipts.
  const holdReceiptNo = `HLD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const { data: saleRow, error: saleError } = await supabase
    .from('sales')
    .insert({
      receipt_no:      holdReceiptNo,
      cashier_id:      user.id,
      customer_id:     customerId,
      payment_type:    'cash',        // placeholder; overwritten at checkout
      subtotal,
      discount_amount: discountAmount,
      bag_charge:      serviceFee,
      total_amount:    total,
      notes:           notes || null,
      status:          'held',
      held_at:         new Date().toISOString(),
      hold_label:      holdLabel_,
      held_cart_data:  cartItems,     // JSONB snapshot — Supabase serialises automatically
    })
    .select('id')
    .single()

  if (saleError || !saleRow) {
    return { data: null, error: saleError?.message ?? 'Failed to hold sale' }
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.HOLD_SALE,
    tableName: 'sales',
    recordId:  saleRow.id,
    newValue:  { hold_label: holdLabel_, item_count: cartItems.length, total },
  })

  return { data: { saleId: saleRow.id }, error: null }
}

// ─── resumeHeldSale ───────────────────────────────────────────────────────────
// Loads a held sale back into cart state by parsing the held_cart_data JSONB
// snapshot — no sale_items query needed.
// Does NOT delete the DB record — that happens when the sale completes
// (deleteHeldSale is called from the client after completeSale succeeds).

export async function resumeHeldSale(saleId: string): Promise<{
  data: { cart: Cart } | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthenticated' }

  type RawSale = {
    id:              string
    customer_id:     string | null
    hold_label:      string | null
    discount_amount: number
    bag_charge:      number
    notes:           string | null
    held_cart_data:  CartItem[] | null   // Supabase auto-parses JSONB → JS object
    customers:       { id: string; name: string } | null
  }

  const { data: rawSale, error: saleError } = await supabase
    .from('sales')
    .select('id, customer_id, hold_label, discount_amount, bag_charge, notes, held_cart_data, customers ( id, name )')
    .eq('id', saleId)
    .eq('status', 'held')
    .eq('is_deleted', false)
    .maybeSingle()

  if (saleError) return { data: null, error: saleError.message }
  if (!rawSale)  return { data: null, error: 'Held sale not found' }

  const sale = rawSale as unknown as RawSale

  const cart: Cart = {
    items:          sale.held_cart_data ?? [],
    customerId:     sale.customer_id,
    customerName:   sale.customers?.name ?? null,
    discountAmount: Number(sale.discount_amount),
    serviceFee:     Number(sale.bag_charge),   // DB column stays bag_charge
    notes:          sale.notes ?? '',
    holdLabel:      sale.hold_label,
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.RESUME_SALE,
    tableName: 'sales',
    recordId:  saleId,
  })

  return { data: { cart }, error: null }
}

// ─── deleteHeldSale ───────────────────────────────────────────────────────────
// Soft-deletes a held sale record.
// Called when a held sale is completed or explicitly discarded by the cashier.

export async function deleteHeldSale(
  saleId: string,
): Promise<{ error: string | null }> {
  const { supabase, user } = await getCallerContext()
  if (!user) return { error: 'Unauthenticated' }

  const { error } = await supabase
    .from('sales')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq('id', saleId)
    .eq('status', 'held')   // guard: only soft-delete held sales via this action

  return { error: error?.message ?? null }
}

// ─── voidSale ─────────────────────────────────────────────────────────────────
// Superadmin only. Marks a completed sale as voided.
// Stock restoration is deferred to Phase 6 (requires a void RPC).

export async function voidSale(
  saleId:     string,
  voidReason: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Unauthenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can void sales' }

  const { error } = await supabase
    .from('sales')
    .update({
      status:      'voided',
      voided_by:   user.id,
      voided_at:   new Date().toISOString(),
      void_reason: voidReason,
    })
    .eq('id', saleId)
    .eq('status', 'completed')
    .eq('is_deleted', false)

  if (error) return { error: error.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.VOID_SALE,
    tableName: 'sales',
    recordId:  saleId,
    newValue:  { void_reason: voidReason },
  })

  return { error: null }
}

// ─── getHeldSales ─────────────────────────────────────────────────────────────
// Returns all held (parked) sales for the given cashier.
// Called on POS page load to restore the parked sales list.

export async function getHeldSales(cashierId: string): Promise<{
  data: ParkedSale[] | null
  error: string | null
}> {
  const { supabase, user } = await getCallerContext()
  if (!user) return { data: null, error: 'Unauthenticated' }

  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('id, hold_label, held_at, total_amount')
    .eq('cashier_id', cashierId)
    .eq('status', 'held')
    .eq('is_deleted', false)
    .order('held_at', { ascending: true })

  if (salesError) return { data: null, error: salesError.message }
  if (!sales || sales.length === 0) return { data: [], error: null }

  // Count items per held sale
  const saleIds = sales.map((s: { id: string }) => s.id)
  const { data: itemRows } = await supabase
    .from('sale_items')
    .select('sale_id')
    .in('sale_id', saleIds)

  const countMap = new Map<string, number>()
  for (const row of (itemRows ?? [])) {
    countMap.set(row.sale_id, (countMap.get(row.sale_id) ?? 0) + 1)
  }

  const parked: ParkedSale[] = sales.map((s: { id: string; hold_label: string | null; held_at: string | null; total_amount: number }) => ({
    saleId:    s.id,
    holdLabel: s.hold_label ?? 'Parked sale',
    itemCount: countMap.get(s.id) ?? 0,
    total:     Number(s.total_amount),
    heldAt:    s.held_at ?? new Date().toISOString(),
  }))

  return { data: parked, error: null }
}

// ─── getTopMedicines ──────────────────────────────────────────────────────────
// Returns top 15 medicines by all-time sale frequency for POS pre-load.
// Uses get_top_medicines() SQL function (migration 011).
// Falls back to most-recently-created medicines if no sale history exists.
// Returns FEFO batch only per medicine (initial cards don't need multi-batch).

export async function getTopMedicines(): Promise<{
  data: POSMedicineResult[] | null
  error: string | null
}> {
  const { supabase, user } = await getCallerContext()
  if (!user) return { data: null, error: 'Unauthenticated' }

  const { data: topRows } = await supabase.rpc('get_top_medicines', { p_limit: 15 })

  let medicineIds: string[] = ((topRows ?? []) as { medicine_id: string }[]).map(r => r.medicine_id)

  if (medicineIds.length === 0) {
    const { data: fallback } = await supabase
      .from('medicines')
      .select('id')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(15)
    medicineIds = ((fallback ?? []) as { id: string }[]).map(r => r.id)
  }

  if (medicineIds.length === 0) return { data: [], error: null }

  type RawBatch = {
    id:             string
    batch_no:       string
    expiry_date:    string
    quantity:       number
    sale_price:     number | null
    mrp:            number | null
    purchase_price: number | null
    is_deleted:     boolean
  }

  type RawMedicine = {
    id:            string
    name:          string
    generic_name:  string | null
    manufacturer:  string | null
    code:          string | null
    barcode:       string | null
    schedule:      'OTC' | 'prescription' | 'controlled'
    mrp:           number
    pack_size:     string | null
    reorder_level: number
    stock_batches: RawBatch[]
  }

  const { data: rawMeds, error: medError } = await supabase
    .from('medicines')
    .select(`
      id, name, generic_name, manufacturer, code, barcode, schedule, mrp,
      pack_size, reorder_level,
      stock_batches ( id, batch_no, expiry_date, quantity, sale_price, mrp, purchase_price, is_deleted )
    `)
    .in('id', medicineIds)
    .eq('is_deleted', false)
    .eq('is_active', true)

  if (medError) return { data: null, error: medError.message }

  const today    = new Date().toISOString().slice(0, 10)
  const idxMap   = new Map(medicineIds.map((id, i) => [id, i]))

  const results: POSMedicineResult[] = ((rawMeds ?? []) as unknown as RawMedicine[])
    .sort((a, b) => (idxMap.get(a.id) ?? 99) - (idxMap.get(b.id) ?? 99))
    .flatMap((med): POSMedicineResult[] => {
      const validBatches = (med.stock_batches ?? [])
        .filter(b => !b.is_deleted && b.expiry_date > today && b.quantity > 0)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))

      const isOutOfStock = validBatches.length === 0

      if (isOutOfStock) {
        return [{
          medicineId:   med.id,
          medicineName: med.name,
          genericName:  med.generic_name,
          manufacturer: med.manufacturer,
          code:         med.code,
          barcode:      med.barcode,
          schedule:     med.schedule,
          mrp:          Number(med.mrp),
          packSize:     med.pack_size,
          reorderLevel: Number(med.reorder_level ?? 0),
          totalStock:   0,
          batches:      [],
          isOutOfStock: true,
        }]
      }

      const totalStock = validBatches.reduce((sum, b) => sum + b.quantity, 0)
      const best       = validBatches[0]

      return [{
        medicineId:   med.id,
        medicineName: med.name,
        genericName:  med.generic_name,
        manufacturer: med.manufacturer,
        code:         med.code,
        barcode:      med.barcode,
        schedule:     med.schedule,
        mrp:          Number(med.mrp),
        packSize:     med.pack_size,
        reorderLevel: Number(med.reorder_level ?? 0),
        totalStock,
        isOutOfStock: false,
        batches: [{
          batchId:       best.id,
          batchNo:       best.batch_no,
          expiryDate:    best.expiry_date,
          quantity:      best.quantity,
          salePrice:     best.sale_price     != null ? Number(best.sale_price)     : Number(med.mrp),
          mrp:           best.mrp            != null ? Number(best.mrp)            : Number(med.mrp),
          purchasePrice: best.purchase_price != null ? Number(best.purchase_price) : null,
        }],
      }]
    })

  return { data: results, error: null }
}

// ─── searchMedicinesForPOS ────────────────────────────────────────────────────
// Searches medicines + available batches for the POS search panel.
// Filters: not deleted, active, stock > 0, not expired.
// Batch selection behaviour is controlled by the batch_selection_mode setting:
//   fefo     — returns single nearest-expiry batch per medicine (default)
//   manual   — returns all valid batches per medicine
//   show_all — same as manual; each batch rendered as a separate result card

export async function searchMedicinesForPOS(query: string): Promise<{
  data: POSMedicineResult[] | null
  error: string | null
}> {
  if (query.trim().length < 1) return { data: [], error: null }

  const { supabase, user } = await getCallerContext()
  if (!user) return { data: null, error: 'Unauthenticated' }

  // Read batch selection mode once per search
  const { data: settingRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'batch_selection_mode')
    .maybeSingle()
  const batchMode = settingRow?.value ?? 'fefo'

  type RawBatch = {
    id:             string
    batch_no:       string
    expiry_date:    string
    quantity:       number
    sale_price:     number | null
    mrp:            number | null
    purchase_price: number | null
    is_deleted:     boolean
  }

  type RawMedicine = {
    id:            string
    name:          string
    generic_name:  string | null
    manufacturer:  string | null
    code:          string | null
    barcode:       string | null
    schedule:      'OTC' | 'prescription' | 'controlled'
    mrp:           number
    pack_size:     string | null
    reorder_level: number
    stock_batches: RawBatch[]
  }

  const { data: rawMeds, error: medError } = await supabase
    .from('medicines')
    .select(`
      id, name, generic_name, manufacturer, code, barcode, schedule, mrp,
      pack_size, reorder_level,
      stock_batches ( id, batch_no, expiry_date, quantity, sale_price, mrp, purchase_price, is_deleted )
    `)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .or(
      `name.ilike.%${query}%,generic_name.ilike.%${query}%,code.ilike.%${query}%,barcode.ilike.%${query}%,manufacturer.ilike.%${query}%`,
    )
    .limit(20)

  if (medError) return { data: null, error: medError.message }

  const today = new Date().toISOString().slice(0, 10)
  const results: POSMedicineResult[] = []

  for (const med of ((rawMeds ?? []) as unknown as RawMedicine[])) {
    const validBatches = (med.stock_batches ?? [])
      .filter(b => !b.is_deleted && b.expiry_date > today && b.quantity > 0)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))

    const isOutOfStock = validBatches.length === 0

    if (isOutOfStock) {
      results.push({
        medicineId:   med.id,
        medicineName: med.name,
        genericName:  med.generic_name,
        manufacturer: med.manufacturer,
        code:         med.code,
        barcode:      med.barcode,
        schedule:     med.schedule,
        mrp:          Number(med.mrp),
        packSize:     med.pack_size,
        reorderLevel: Number(med.reorder_level ?? 0),
        totalStock:   0,
        batches:      [],
        isOutOfStock: true,
      })
      continue
    }

    const selectedBatches = batchMode === 'fefo' ? [validBatches[0]] : validBatches
    const totalStock       = validBatches.reduce((sum, b) => sum + b.quantity, 0)

    results.push({
      medicineId:   med.id,
      medicineName: med.name,
      genericName:  med.generic_name,
      manufacturer: med.manufacturer,
      code:         med.code,
      barcode:      med.barcode,
      schedule:     med.schedule,
      mrp:          Number(med.mrp),
      packSize:     med.pack_size,
      reorderLevel: Number(med.reorder_level ?? 0),
      totalStock,
      isOutOfStock: false,
      batches: selectedBatches.map(b => ({
        batchId:       b.id,
        batchNo:       b.batch_no,
        expiryDate:    b.expiry_date,
        quantity:      b.quantity,
        salePrice:     b.sale_price     != null ? Number(b.sale_price)     : Number(med.mrp),
        mrp:           b.mrp            != null ? Number(b.mrp)            : Number(med.mrp),
        purchasePrice: b.purchase_price != null ? Number(b.purchase_price) : null,
      })),
    })
  }

  return { data: results, error: null }
}

// ─── createCustomerQuick ──────────────────────────────────────────────────────
// Quick-add a customer from the POS customer selector (name + phone only).
// Full customer management is in the customers module.

export async function createCustomerQuick(
  name:  string,
  phone: string,
): Promise<{ data: { id: string; name: string } | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Unauthenticated' }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name:       name.trim(),
      phone:      phone.trim() || null,
      created_by: user.id,
    })
    .select('id, name')
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to create customer' }

  return { data: { id: data.id, name: data.name }, error: null }
}
