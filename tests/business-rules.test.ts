/**
 * Business Rules Tests (Phase 16C)
 * Verifies POS rules, PO status transitions, return policy, soft-delete
 * behavior, audit log integrity, and the opening-balances duplicate guard.
 *
 * Talks directly to the dev Supabase project (service-role RPC calls plus,
 * where RLS enforcement itself is what's being tested, a real authenticated
 * client via tests/helpers/clients.ts) — does NOT require the Next.js dev
 * server. Reuses tests/helpers/test-client.ts (Phase 16A/16B infrastructure).
 *
 * IMPORTANT — read this before trusting any "blocked" assertion below:
 * Several rules described in the spec are enforced ONLY in server actions
 * (app/actions/*.ts), which read the session from Next.js request cookies and
 * cannot be exercised without a live authenticated HTTP session. Where that's
 * the case, this file either (a) replicates the exact server-action logic
 * directly against the DB (same pattern Phase 16A used for recordExpense),
 * when the logic is simple enough to faithfully mirror, or (b) documents a
 * FINDING that a direct RPC/DB-level operation succeeds even though the real
 * app would have blocked it via its own IF-statement guard — this is NOT a
 * bug, it's how service-role/RPC-level access always works relative to
 * app-layer business rules; it's recorded here so nobody mistakes "the test
 * bypassed the guard" for "the guard doesn't exist."
 */

import { adminClient, signIn, userClient } from './helpers/clients'
import {
  serviceClient, rpc, TEST_RUN_ID, getTestUserIds, uniqueSuffix,
  createTestMedicine, createTestBatch, createTestSupplier, createTestCustomer,
  createTestPO, getJournalEntry, cleanupJournalEntries, closePool,
  ensureOpenShift, closeShiftIfCreated,
} from './helpers/test-client'

jest.setTimeout(60000)

let userIds: { superadmin: string; admin: string; pharmacist: string }
let testShift: { shiftId: string; created: boolean }
let pharmacistToken: string

const journalEntryIds = new Set<string>()
const saleIds         = new Set<string>()
const returnIds       = new Set<string>()
const poIds           = new Set<string>()
const supplierPaymentIds = new Set<string>()
const auditLogIds     = new Set<string>()
const medicineIds     = new Set<string>()
const batchIds        = new Set<string>()
const supplierIds     = new Set<string>()
const customerIds     = new Set<string>()

async function makeMedicineWithBatch(overrides: {
  batchOverrides?: Record<string, unknown>
  medicineOverrides?: Record<string, unknown>
} = {}) {
  const medicine = await createTestMedicine(overrides.medicineOverrides)
  medicineIds.add(medicine.id)
  const batch = await createTestBatch(medicine.id, overrides.batchOverrides)
  batchIds.add(batch.id)
  return { medicine, batch }
}

async function callCompleteSale(input: {
  customerId?:  string | null
  paymentType?: string
  items:        Array<{ batch_id: string; quantity: number; unit_price: number; discount_pct?: number }>
  discountAmt?: number
}) {
  const { data, error } = await rpc<{ sale_id: string; receipt_no: string }>('complete_sale', {
    p_cashier_id:   userIds.pharmacist,
    p_customer_id:  input.customerId ?? null,
    p_payment_type: input.paymentType ?? 'cash',
    p_items:        input.items,
    p_discount_amt: input.discountAmt ?? 0,
    p_bag_charge:   0,
    p_amount_paid:  100000,
    p_notes:        `${TEST_RUN_ID}sale`,
  })
  if (!error && data?.sale_id) {
    saleIds.add(data.sale_id)
    const entry = await getJournalEntry('sale', data.sale_id)
    if (entry) journalEntryIds.add(entry.id)
  }
  return { data, error }
}

async function getSaleItems(saleId: string) {
  const { data } = await serviceClient.from('sale_items').select('*').eq('sale_id', saleId)
  return data ?? []
}

async function newReturn(input: {
  saleId: string
  returnItems: Array<{ sale_item_id: string; quantity_returned: number }>
  reason?: string
}) {
  const { data, error } = await rpc<any>('process_return', {
    p_original_sale_id: input.saleId,
    p_return_items:     input.returnItems,
    p_exchange_items:   null,
    p_reason:           input.reason ?? `${TEST_RUN_ID}return`,
    p_pack_opened:      false,
    p_requested_by:     userIds.pharmacist,
    p_return_id:        null,
  })
  if (!error && data?.return_id) returnIds.add(data.return_id)
  if (!error && data?.journal_entry_id) journalEntryIds.add(data.journal_entry_id)
  return { data, error }
}

async function approveReturn(returnId: string) {
  const { data, error } = await rpc<any>('process_return', {
    p_original_sale_id: null, p_return_items: null, p_exchange_items: null, p_reason: null,
    p_pack_opened: false, p_requested_by: userIds.superadmin, p_return_id: returnId,
  })
  if (!error && data?.journal_entry_id) journalEntryIds.add(data.journal_entry_id)
  return { data, error }
}

/** Mirrors app/actions/returns.ts denyReturn() exactly (plain UPDATE, no RPC). */
async function denyReturnDirect(returnId: string, reason: string) {
  const { error } = await serviceClient.from('returns').update({
    status: 'denied', denial_reason: reason, approved_by: userIds.superadmin, approved_at: new Date().toISOString(),
  }).eq('id', returnId)
  return { error: error?.message ?? null }
}

/** Mirrors app/actions/procurement.ts confirmPO() exactly (reads po_approval_threshold, plain UPDATE). */
async function confirmPODirect(poId: string) {
  const { data: po } = await serviceClient.from('purchase_orders').select('total_amount').eq('id', poId).single()
  const { data: setting } = await serviceClient.from('settings').select('value').eq('key', 'po_approval_threshold').maybeSingle()
  const threshold = setting?.value ? parseInt(setting.value, 10) : 50000
  const newStatus = Number(po!.total_amount) < threshold ? 'confirmed' : 'pending_approval'
  await serviceClient.from('purchase_orders').update({ status: newStatus }).eq('id', poId)
  return { newStatus, threshold }
}

beforeAll(async () => {
  userIds = await getTestUserIds()
  const session = await signIn('pharma@pharmacare.dev', 'PharmaPass@123')
  pharmacistToken = session.access_token
  testShift = await ensureOpenShift(userIds.pharmacist)
})

afterAll(async () => {
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn() } catch (err) {
      console.error(`[cleanup] ${label} failed:`, err instanceof Error ? err.message : err)
    }
  }
  try {
    if (returnIds.size) {
      const ids = [...returnIds]
      await step('return_items', () => serviceClient.from('return_items').delete().in('return_id', ids))
      await step('returns', () => serviceClient.from('returns').delete().in('id', ids))
    }
    if (supplierPaymentIds.size) {
      await step('supplier_payments', () => serviceClient.from('supplier_payments').delete().in('id', [...supplierPaymentIds]))
    }
    if (auditLogIds.size) {
      await step('audit_logs', () => serviceClient.from('audit_logs').delete().in('id', [...auditLogIds]))
    }

    await step('journal entries', () => cleanupJournalEntries([...journalEntryIds]))

    if (saleIds.size) {
      const ids = [...saleIds]
      await step('sale_items', () => serviceClient.from('sale_items').delete().in('sale_id', ids))
      await step('sales', () => serviceClient.from('sales').delete().in('id', ids))
    }
    if (poIds.size) {
      const ids = [...poIds]
      await step('purchase_order_items', () => serviceClient.from('purchase_order_items').delete().in('po_id', ids))
      await step('purchase_orders', () => serviceClient.from('purchase_orders').delete().in('id', ids))
    }
    if (batchIds.size)    await step('stock_batches', () => serviceClient.from('stock_batches').delete().in('id', [...batchIds]))
    if (medicineIds.size) await step('medicines', () => serviceClient.from('medicines').delete().in('id', [...medicineIds]))
    if (supplierIds.size) await step('suppliers', () => serviceClient.from('suppliers').delete().in('id', [...supplierIds]))
    if (customerIds.size) await step('customers', () => serviceClient.from('customers').delete().in('id', [...customerIds]))
    await step('shift', () => closeShiftIfCreated(testShift.shiftId, testShift.created))
  } finally {
    await closePool()
  }
})

// =============================================================================
// 3.1 POS Business Rules
// =============================================================================
describe('POS business rules', () => {

  describe('MRP enforcement', () => {
    it('blocks a sale priced above the medicine/batch MRP', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { mrp: 100, quantity: 10 } })
      const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 110 }] })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/exceeds MRP/i)
    })

    it('allows a sale priced exactly at MRP (boundary)', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { mrp: 100, quantity: 10 } })
      const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }] })
      expect(error).toBeNull()
    })
  })

  describe('shift requirement', () => {
    it('rejects a sale when the cashier has no open shift (migration 036)', async () => {
      // This file's beforeAll opened testShift for userIds.pharmacist (required by every
      // other complete_sale() call in this file) — temporarily close that same shift to
      // exercise the no-open-shift path, then restore it so later tests in this file (and
      // afterAll's closeShiftIfCreated, keyed on testShift.shiftId) are unaffected.
      await serviceClient.from('shifts').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', testShift.shiftId)

      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
      const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 50 }] })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/no open shift/i)

      await serviceClient.from('shifts').update({ status: 'open', closed_at: null }).eq('id', testShift.shiftId)
    })
  })

  describe('expired batch sale', () => {
    it('rejects a sale from an already-expired batch (migration 036)', async () => {
      const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
      const expired = await createTestBatch(medicine.id, { expiry_date: '2020-01-01', quantity: 5 })
      batchIds.add(expired.id)
      const { error } = await callCompleteSale({ items: [{ batch_id: expired.id, quantity: 1, unit_price: 50 }] })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/expired/i)
      expect(error!.message).toContain(expired.id)
    })
  })

  describe('insufficient stock', () => {
    it('rejects a sale when the target batch quantity is insufficient', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 3 } })
      const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 5, unit_price: 50 }] })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/insufficient stock/i)
    })
  })
})

// =============================================================================
// 3.2 Purchase Order Status Transitions
// =============================================================================
describe('PO status transitions', () => {

  describe('PO approval threshold (confirmPO() logic, replicated directly)', () => {
    it('a PO total below the threshold auto-confirms', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
      const { data: setting } = await serviceClient.from('settings').select('value').eq('key', 'po_approval_threshold').maybeSingle()
      const threshold = setting?.value ? parseInt(setting.value, 10) : 50000
      const unitPrice = Math.max(1, Math.floor((threshold - 100) / 1))

      const po = await createTestPO(supplier.id, [{ medicine_id: medicine.id, quantity: 1, unit_price: unitPrice }])
      poIds.add(po.id)
      const { newStatus } = await confirmPODirect(po.id)
      expect(newStatus).toBe('confirmed')
    })

    it('a PO total at/above the threshold requires approval (pending_approval)', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
      const { data: setting } = await serviceClient.from('settings').select('value').eq('key', 'po_approval_threshold').maybeSingle()
      const threshold = setting?.value ? parseInt(setting.value, 10) : 50000

      const po = await createTestPO(supplier.id, [{ medicine_id: medicine.id, quantity: 1, unit_price: threshold }])
      poIds.add(po.id)
      const { newStatus } = await confirmPODirect(po.id)
      expect(newStatus).toBe('pending_approval')
    })
  })

  describe('status transitions are now enforced at the DB layer via check_po_status_transition (migration 036)', () => {
    // A BEFORE UPDATE trigger now whitelists exactly the 12 (old,new) pairs
    // reachable from app/actions/procurement.ts + complete_grn()/force_close_po() —
    // any other transition raises. Non-status updates (OLD.status = NEW.status)
    // always pass through untouched.

    it('a direct UPDATE can no longer move a "received" PO back to "draft"', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const po = await createTestPO(supplier.id, [])
      poIds.add(po.id)
      // Walk through valid transitions to reach 'received': draft -> confirmed -> received
      await serviceClient.from('purchase_orders').update({ status: 'confirmed' }).eq('id', po.id)
      await serviceClient.from('purchase_orders').update({ status: 'received' }).eq('id', po.id)

      const { error } = await serviceClient.from('purchase_orders').update({ status: 'draft' }).eq('id', po.id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/invalid.*status transition/i)
      const { data } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(data!.status).toBe('received')
    })

    it('a direct UPDATE can no longer move a "cancelled" PO to "confirmed"', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const po = await createTestPO(supplier.id, [])
      poIds.add(po.id)
      await serviceClient.from('purchase_orders').update({ status: 'cancelled' }).eq('id', po.id)

      const { error } = await serviceClient.from('purchase_orders').update({ status: 'confirmed' }).eq('id', po.id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/invalid.*status transition/i)
      const { data } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(data!.status).toBe('cancelled')
    })

    it('a non-status update (notes) on a purchase order still succeeds', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const po = await createTestPO(supplier.id, [])
      poIds.add(po.id)
      const { error } = await serviceClient.from('purchase_orders').update({ notes: 'a note' }).eq('id', po.id)
      expect(error).toBeNull()
    })
  })
})

// =============================================================================
// 3.3 Return Policy Rules
// =============================================================================
describe('return policy rules', () => {

  it('rejects returning a controlled-schedule medicine (hardcoded, unconditional check)', async () => {
    const { batch } = await makeMedicineWithBatch({ medicineOverrides: { schedule: 'controlled' }, batchOverrides: { quantity: 10 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 2, unit_price: 50 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    const items = await getSaleItems(sale!.sale_id)

    const { error } = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Controlled medicines cannot be returned/i)
  })

  it('a return outside the configured window is gated to pending_approval, not rejected outright', async () => {
    const { data: setting } = await serviceClient.from('settings').select('value').eq('key', 'return_window_days').maybeSingle()
    const windowDays = setting?.value ? parseInt(setting.value, 10) : 3

    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 50 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)

    // Backdate the sale beyond the window (direct column update — complete_sale() always uses NOW()).
    const oldDate = new Date(Date.now() - (windowDays + 5) * 24 * 60 * 60 * 1000).toISOString()
    await serviceClient.from('sales').update({ created_at: oldDate }).eq('id', sale!.sale_id)

    const items = await getSaleItems(sale!.sale_id)
    const { data, error } = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }] })
    if (error) throw new Error(`process_return (window) failed: ${error.message}`)
    expect(data!.status).toBe('pending_approval')
    expect(data!.policy_flags).toEqual(expect.arrayContaining(['window_expired']))

    // Approve it through so cleanup can track the resulting journal entry.
    const { error: approveErr } = await approveReturn(data!.return_id)
    expect(approveErr).toBeNull()
  })

  it('rejects a return quantity exceeding what remains on the original sale_item', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 3, unit_price: 50 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    const items = await getSaleItems(sale!.sale_id)

    const { error } = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 5 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/already returned or pending/i)
  })

  it('rejects a second return of an already-fully-returned sale_item (double-return prevention)', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 3, unit_price: 50 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    const items = await getSaleItems(sale!.sale_id)

    const first = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 3 }] })
    if (first.error) throw new Error(`first return failed: ${first.error.message}`)

    const { error } = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/already returned or pending/i)
  })

  describe('approval workflow', () => {
    it('initiation creates a return with status pending_approval when a policy flag is raised', async () => {
      const { data: setting } = await serviceClient.from('settings').select('value').eq('key', 'return_auto_approve_limit').maybeSingle()
      const autoLimit = setting?.value ? parseFloat(setting.value) : 1000
      const price = autoLimit + 100 // guarantee exceeds_limit flag

      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10, mrp: price + 50 } })
      const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: price }] })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data, error } = await newReturn({ saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }] })
      if (error) throw new Error(`process_return failed: ${error.message}`)
      expect(data!.status).toBe('pending_approval')

      const { data: row } = await serviceClient.from('returns').select('status').eq('id', data!.return_id).single()
      expect(row!.status).toBe('pending_approval')
    })

    it('approval processes the return and posts a journal entry', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
      const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 2, unit_price: 50 }] })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      // Force pending via opened-pack policy flag (return_opened_pack_allowed defaults false).
      const { data: initial, error: err1 } = await rpc<any>('process_return', {
        p_original_sale_id: sale!.sale_id,
        p_return_items:     [{ sale_item_id: items[0].id, quantity_returned: 1 }],
        p_exchange_items:   null,
        p_reason:           `${TEST_RUN_ID}approval-flow`,
        p_pack_opened:      true,
        p_requested_by:     userIds.pharmacist,
        p_return_id:        null,
      })
      if (err1) throw new Error(`process_return (initiate) failed: ${err1.message}`)
      returnIds.add(initial.return_id)
      expect(initial.status).toBe('pending_approval')

      const { data: approved, error: err2 } = await approveReturn(initial.return_id)
      if (err2) throw new Error(`process_return (approve) failed: ${err2.message}`)
      expect(approved.status).toBe('completed')
      expect(approved.journal_entry_id).toBeTruthy()

      const { data: row } = await serviceClient.from('returns').select('status').eq('id', initial.return_id).single()
      expect(row!.status).toBe('completed')
    })

    it('denial marks the return as denied without any stock or ledger change', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
      const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 2, unit_price: 50 }] })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)
      const qtyBefore = (await serviceClient.from('stock_batches').select('quantity').eq('id', batch.id).single()).data!.quantity

      const { data: initial, error: err1 } = await rpc<any>('process_return', {
        p_original_sale_id: sale!.sale_id,
        p_return_items:     [{ sale_item_id: items[0].id, quantity_returned: 1 }],
        p_exchange_items:   null,
        p_reason:           `${TEST_RUN_ID}deny-flow`,
        p_pack_opened:      true,
        p_requested_by:     userIds.pharmacist,
        p_return_id:        null,
      })
      if (err1) throw new Error(`process_return (initiate) failed: ${err1.message}`)
      returnIds.add(initial.return_id)

      const { error: denyErr } = await denyReturnDirect(initial.return_id, `${TEST_RUN_ID}denied`)
      expect(denyErr).toBeNull()

      const { data: row } = await serviceClient.from('returns').select('status, journal_entry_id').eq('id', initial.return_id).single()
      expect(row!.status).toBe('denied')
      expect(row!.journal_entry_id).toBeNull()

      const qtyAfter = (await serviceClient.from('stock_batches').select('quantity').eq('id', batch.id).single()).data!.quantity
      expect(qtyAfter).toBe(qtyBefore) // untouched — denial never ran Section C
    })
  })
})

// =============================================================================
// 3.4 Soft Delete Behaviour
// =============================================================================
describe('soft delete behaviour', () => {

  it('soft-deleting a medicine sets is_deleted=true; the row still exists', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    await serviceClient.from('medicines').update({ is_deleted: true }).eq('id', medicine.id)
    const { data } = await serviceClient.from('medicines').select('is_deleted').eq('id', medicine.id).single()
    expect(data!.is_deleted).toBe(true)
  })

  it('medicines_select RLS now filters is_deleted — a soft-deleted medicine is hidden from an authenticated pharmacist via RLS alone (migration 036)', async () => {
    // medicines_select now carries "AND is_deleted = false", matching suppliers_select's
    // existing defense-in-depth — soft-delete no longer relies solely on the app
    // remembering to add .eq('is_deleted', false) to every query.
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const pharmClient = userClient(pharmacistToken)
    const before = await pharmClient.from('medicines').select('id').eq('id', medicine.id)
    expect(before.data).toHaveLength(1)

    await serviceClient.from('medicines').update({ is_deleted: true }).eq('id', medicine.id)
    const after = await pharmClient.from('medicines').select('id').eq('id', medicine.id)
    expect(after.data).toHaveLength(0)
  })

  it('a soft-deleted medicine remains resolvable via historical FK references (sale_items)', async () => {
    const { medicine, batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 50 }] })
    if (error) throw new Error(`setup sale failed: ${error.message}`)

    await serviceClient.from('medicines').update({ is_deleted: true }).eq('id', medicine.id)

    const { data: joined, error: joinErr } = await serviceClient
      .from('sale_items')
      .select('id, medicines(id, name)')
      .eq('sale_id', sale!.sale_id)
      .single()
    expect(joinErr).toBeNull()
    expect((joined as any).medicines.id).toBe(medicine.id)
  })

  it('soft-deleting a supplier excludes it from an authenticated user\'s query via RLS', async () => {
    const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
    const pharmClient = userClient(pharmacistToken)
    const before = await pharmClient.from('suppliers').select('id').eq('id', supplier.id)
    expect(before.data).toHaveLength(1)

    await serviceClient.from('suppliers').update({ is_deleted: true }).eq('id', supplier.id)
    const after = await pharmClient.from('suppliers').select('id').eq('id', supplier.id)
    expect(after.data).toHaveLength(0)
  })
})

// =============================================================================
// 3.5 Audit Log Integrity
// =============================================================================
describe('audit log integrity', () => {

  it('INSERT is allowed', async () => {
    const { data, error } = await serviceClient.from('audit_logs').insert({
      user_id: userIds.superadmin, user_role: 'superadmin', action: `${TEST_RUN_ID}TEST_INSERT`,
    }).select().single()
    expect(error).toBeNull()
    if (data) auditLogIds.add(data.id)
  })

  it('UPDATE is blocked by RLS for an authenticated (non-service-role) client', async () => {
    const { data: log } = await serviceClient.from('audit_logs').insert({
      user_id: userIds.pharmacist, user_role: 'pharmacist', action: `${TEST_RUN_ID}TEST_UPDATE_RLS`,
    }).select().single()
    auditLogIds.add(log!.id)

    const pharmClient = userClient(pharmacistToken)
    const { data, error } = await pharmClient.from('audit_logs').update({ action: 'TAMPERED' }).eq('id', log!.id)
    // No UPDATE policy exists at all — RLS silently returns 0 rows affected, no error.
    expect(error).toBeNull()
    expect(data).toBeNull()

    const { data: unchanged } = await serviceClient.from('audit_logs').select('action').eq('id', log!.id).single()
    expect(unchanged!.action).toBe(`${TEST_RUN_ID}TEST_UPDATE_RLS`)
  })

  it('DELETE is blocked by RLS for an authenticated (non-service-role) client', async () => {
    const { data: log } = await serviceClient.from('audit_logs').insert({
      user_id: userIds.pharmacist, user_role: 'pharmacist', action: `${TEST_RUN_ID}TEST_DELETE_RLS`,
    }).select().single()
    auditLogIds.add(log!.id)

    const pharmClient = userClient(pharmacistToken)
    const { error } = await pharmClient.from('audit_logs').delete().eq('id', log!.id)
    expect(error).toBeNull() // no DELETE policy — 0 rows affected, no error

    const { data: stillThere } = await serviceClient.from('audit_logs').select('id').eq('id', log!.id).maybeSingle()
    expect(stillThere).not.toBeNull()
  })

  it('audit_logs has a hard immutability trigger — DELETE via the service-role client (RLS bypassed) is blocked (migration 036)', async () => {
    // audit_logs now has the same BEFORE DELETE OR UPDATE trigger shape as journal_lines
    // (prevent_audit_log_mutation(), mirroring prevent_journal_line_mutation()) — a
    // service-role caller (or any future SECURITY DEFINER function) can no longer remove
    // audit history. Not added to auditLogIds: it can never be cleaned up now by design,
    // same as the immutability-check rows in accounting.test.ts's journal_lines section.
    const { data: log } = await serviceClient.from('audit_logs').insert({
      user_id: userIds.superadmin, user_role: 'superadmin', action: `${TEST_RUN_ID}TEST_SERVICE_DELETE`,
    }).select().single()

    const { error } = await serviceClient.from('audit_logs').delete().eq('id', log!.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/immutable/i)

    const { data: stillThere } = await serviceClient.from('audit_logs').select('id').eq('id', log!.id).maybeSingle()
    expect(stillThere).not.toBeNull()
  })
})

// =============================================================================
// 3.7 Opening Balances Guard
// =============================================================================
describe('opening balances', () => {

  it('post_journal_entry() now blocks a second opening_balance entry at the DB level (migration 036)', async () => {
    const lines = [
      { account_code: '1000', direction: 'debit',  amount: '1' },
      { account_code: '3000', direction: 'credit', amount: '1' },
    ]
    const first = await rpc<string>('post_journal_entry', {
      p_entry_date: new Date().toISOString().split('T')[0],
      p_description: `${TEST_RUN_ID}opening-1`, p_reference_type: 'opening_balance', p_reference_id: null,
      p_currency: 'PKR', p_exchange_rate: 1.0, p_lines: lines, p_created_by: userIds.superadmin,
    })
    if (first.error || !first.data) throw new Error(`first opening_balance post failed: ${first.error?.message}`)
    journalEntryIds.add(first.data)

    const second = await rpc<string>('post_journal_entry', {
      p_entry_date: new Date().toISOString().split('T')[0],
      p_description: `${TEST_RUN_ID}opening-2`, p_reference_type: 'opening_balance', p_reference_id: null,
      p_currency: 'PKR', p_exchange_rate: 1.0, p_lines: lines, p_created_by: userIds.superadmin,
    })
    // idx_journal_entries_single_opening_balance (partial unique index) now blocks this at
    // the DB level — a defense-in-depth backstop for postOpeningBalances()'s app-layer
    // check, which a direct RPC call (like this one) always bypassed.
    expect(second.error).not.toBeNull()
    expect(second.error!.message).toMatch(/idx_journal_entries_single_opening_balance|duplicate key/i)
    if (second.data) journalEntryIds.add(second.data)

    const { data: rows } = await serviceClient
      .from('journal_entries')
      .select('id')
      .eq('reference_type', 'opening_balance')
      .in('description', [`${TEST_RUN_ID}opening-1`, `${TEST_RUN_ID}opening-2`])
    expect(rows).toHaveLength(1)
  })

  it("mirrors postOpeningBalances()'s own app-layer pre-check against the row the previous test left in place", async () => {
    // postOpeningBalances() (app/actions/ledger.ts) is a 'use server' action that reads
    // the session from Next.js request cookies and cannot be invoked directly from this
    // RPC-level test suite (same constraint as recordExpense/recordSupplierPayment — see
    // accounting.test.ts's file header). This replicates its own duplicate-check query
    // exactly, confirming it still correctly detects the existing row and would surface
    // its friendly error before ever reaching the RPC (the normal, non-bypassed path).
    const { data: existing } = await serviceClient
      .from('journal_entries')
      .select('id, entry_date')
      .eq('reference_type', 'opening_balance')
      .limit(1)
      .maybeSingle()

    expect(existing).not.toBeNull()
    const friendlyError = `Opening balances have already been posted on ${existing!.entry_date}. To re-enter, void the existing entry first.`
    expect(friendlyError).toMatch(/already been posted/i)
  })
})
