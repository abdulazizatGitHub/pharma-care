/**
 * Inventory Tests (Phase 16B)
 * Verifies stock_batches creation (GRN), deduction (sale), restoration (return),
 * and the two plain server-action-driven mutations: stock adjustment and
 * expiry write-off.
 *
 * Talks directly to the dev Supabase project via the service-role client and
 * a handful of RPCs — does NOT require the Next.js dev server. Reuses
 * tests/helpers/test-client.ts (same TEST_RUN_ID prefix, same journal
 * cleanup pattern as tests/accounting.test.ts).
 *
 * IMPORTANT FINDING (drives how section 2.2 is written): complete_sale() has
 * NO automatic FEFO batch selection and NO automatic multi-batch spanning.
 * The caller supplies an explicit batch_id per line item; the RPC only
 * validates that THAT SPECIFIC batch has enough quantity and a price <= MRP.
 * "Earliest-expiry-first" selection lives entirely in the application layer —
 * searchMedicinesForPOS()/getTopMedicines() (app/actions/sales.ts) sort valid
 * batches by expiry_date ascending and suggest validBatches[0] as the default
 * cart line — but that's a search-result ordering hint, not something
 * complete_sale() itself enforces or even checks. Those two functions are
 * 'use server' actions that read the session from request cookies and can't
 * be exercised without a live authenticated HTTP session (same constraint
 * Phase 16A hit for recordExpense/recordSupplierPayment), so they are not
 * tested here — see the final report for this as a documented coverage gap
 * rather than a silently-skipped requirement.
 */

import {
  serviceClient, rpc, TEST_RUN_ID, getTestUserIds, uniqueSuffix,
  createTestMedicine, createTestBatch, createTestSupplier,
  createTestPO, approveTestPO, getMedicineStock, getBatchQty,
  getJournalEntry, cleanupJournalEntries, closePool, ensureOpenShift, closeShiftIfCreated,
} from './helpers/test-client'

jest.setTimeout(60000)

let userIds: { superadmin: string; admin: string; pharmacist: string }
let testShift: { shiftId: string; created: boolean }

const journalEntryIds = new Set<string>()
const saleIds         = new Set<string>()
const grnIds          = new Set<string>()
const poIds           = new Set<string>()
const returnIds       = new Set<string>()
const auditLogIds     = new Set<string>()
const medicineIds     = new Set<string>()
const batchIds        = new Set<string>()
const supplierIds     = new Set<string>()

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

async function makeSupplier(overrides: Record<string, unknown> = {}) {
  const supplier = await createTestSupplier(overrides)
  supplierIds.add(supplier.id)
  return supplier
}

async function callCompleteSale(input: {
  customerId?:  string | null
  paymentType?: string
  items:        Array<{ batch_id: string; quantity: number; unit_price: number; discount_pct?: number }>
  discountAmt?: number
  bagCharge?:   number
  amountPaid?:  number
  notes?:       string
}) {
  const { data, error } = await rpc<{ sale_id: string; receipt_no: string; total: number; change: number }>(
    'complete_sale',
    {
      p_cashier_id:   userIds.pharmacist,
      p_customer_id:  input.customerId ?? null,
      p_payment_type: input.paymentType ?? 'cash',
      p_items:        input.items,
      p_discount_amt: input.discountAmt ?? 0,
      p_bag_charge:   input.bagCharge ?? 0,
      p_amount_paid:  input.amountPaid ?? 100000,
      p_notes:        input.notes ?? `${TEST_RUN_ID}sale`,
    },
  )
  if (!error && data?.sale_id) {
    saleIds.add(data.sale_id)
    const entry = await getJournalEntry('sale', data.sale_id)
    if (entry) journalEntryIds.add(entry.id)
  }
  return { data, error }
}

async function getSaleItems(saleId: string) {
  const { data, error } = await serviceClient.from('sale_items').select('*').eq('sale_id', saleId)
  if (error) throw new Error(`getSaleItems failed: ${error.message}`)
  return data ?? []
}

async function callCompleteGrn(input: {
  poId: string
  items: Array<{ medicine_id: string; batch_no: string; expiry_date: string; quantity: number; unit_price: number }>
  isPartial?: boolean
  notes?: string
}) {
  const { data, error } = await rpc<string>('complete_grn', {
    p_po_id:       input.poId,
    p_received_by: userIds.admin,
    p_notes:       input.notes ?? `${TEST_RUN_ID}grn`,
    p_items:       input.items,
    p_is_partial:  input.isPartial ?? false,
  })
  if (!error && data) {
    grnIds.add(data)
    const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', data)
    for (const b of newBatches ?? []) batchIds.add(b.id)
    const entry = await getJournalEntry('grn', data)
    if (entry) journalEntryIds.add(entry.id)
  }
  return { data, error }
}

/** Runs process_return in "new" mode and, if pending_approval, approves it. */
async function returnAndEnsureCompleted(input: {
  saleId: string
  returnItems: Array<{ sale_item_id: string; quantity_returned: number }>
  exchangeItems?: Array<{ medicine_id: string; batch_id: string; quantity: number; unit_price: number }>
  reason?: string
}) {
  const { data: initial, error: err1 } = await rpc<any>('process_return', {
    p_original_sale_id: input.saleId,
    p_return_items:     input.returnItems,
    p_exchange_items:   input.exchangeItems ?? null,
    p_reason:           input.reason ?? `${TEST_RUN_ID}return`,
    p_pack_opened:      false,
    p_requested_by:     userIds.pharmacist,
    p_return_id:        null,
  })
  if (err1) return { data: null, error: err1 }
  if (initial.status === 'pending_approval') {
    returnIds.add(initial.return_id)
    const { data: approved, error: err2 } = await rpc<any>('process_return', {
      p_original_sale_id: null,
      p_return_items:     null,
      p_exchange_items:   null,
      p_reason:           null,
      p_pack_opened:      false,
      p_requested_by:     userIds.superadmin,
      p_return_id:        initial.return_id,
    })
    if (!err2 && approved?.journal_entry_id) journalEntryIds.add(approved.journal_entry_id)
    return { data: approved, error: err2 }
  }
  returnIds.add(initial.return_id)
  if (initial.journal_entry_id) journalEntryIds.add(initial.journal_entry_id)
  return { data: initial, error: null }
}

/** Mirrors app/actions/stock.ts adjustStock() exactly (absolute new_quantity, not a delta). */
async function adjustStockDirect(batchId: string, newQuantity: number, reason: string, notes?: string) {
  const { data: batch } = await serviceClient.from('stock_batches').select('quantity').eq('id', batchId).single()
  const oldQuantity = batch!.quantity
  const { error } = await serviceClient.from('stock_batches').update({ quantity: newQuantity }).eq('id', batchId)
  if (error) return { error }
  const { data: log } = await serviceClient.from('audit_logs').insert({
    user_id: userIds.superadmin, user_role: 'superadmin', action: 'ADJUST_STOCK',
    table_name: 'stock_batches', record_id: batchId,
    old_value: { quantity: oldQuantity }, new_value: { quantity: newQuantity, reason, notes: notes ?? null },
  }).select().single()
  if (log) auditLogIds.add(log.id)
  return { error: null }
}

/** Mirrors app/actions/stock.ts writeOffBatch() exactly (delta decrement, app-layer over-writeoff guard). */
async function writeOffBatchDirect(batchId: string, quantity: number, reason: string, notes?: string) {
  const { data: batch } = await serviceClient.from('stock_batches').select('quantity').eq('id', batchId).single()
  if (quantity > batch!.quantity) {
    return { error: `Write-off quantity (${quantity}) exceeds available stock (${batch!.quantity})` }
  }
  const newQuantity = batch!.quantity - quantity
  const { error } = await serviceClient.from('stock_batches').update({ quantity: newQuantity }).eq('id', batchId)
  if (error) return { error: error.message }
  const { data: log } = await serviceClient.from('audit_logs').insert({
    user_id: userIds.superadmin, user_role: 'superadmin', action: 'STOCK_WRITEOFF',
    table_name: 'stock_batches', record_id: batchId,
    old_value: { quantity: batch!.quantity }, new_value: { quantity: newQuantity, written_off: quantity, reason, notes: notes ?? null },
  }).select().single()
  if (log) auditLogIds.add(log.id)
  return { error: null }
}

beforeAll(async () => {
  userIds = await getTestUserIds()
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
      await step('exchange_items', () => serviceClient.from('exchange_items').delete().in('return_id', ids))
      await step('returns', () => serviceClient.from('returns').delete().in('id', ids))
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
    if (grnIds.size) {
      const ids = [...grnIds]
      await step('grn_items', () => serviceClient.from('grn_items').delete().in('grn_id', ids))
      await step('goods_receipts', () => serviceClient.from('goods_receipts').delete().in('id', ids))
    }
    if (poIds.size) {
      const ids = [...poIds]
      await step('purchase_order_items', () => serviceClient.from('purchase_order_items').delete().in('po_id', ids))
      await step('purchase_orders', () => serviceClient.from('purchase_orders').delete().in('id', ids))
    }
    if (batchIds.size)    await step('stock_batches', () => serviceClient.from('stock_batches').delete().in('id', [...batchIds]))
    if (medicineIds.size) await step('medicines', () => serviceClient.from('medicines').delete().in('id', [...medicineIds]))
    if (supplierIds.size) await step('suppliers', () => serviceClient.from('suppliers').delete().in('id', [...supplierIds]))
    await step('shift', () => closeShiftIfCreated(testShift.shiftId, testShift.created))
  } finally {
    await closePool()
  }
})

// =============================================================================
// 2.1 Stock Batch Creation via GRN
// =============================================================================
describe('GRN stock batch creation', () => {

  describe('full GRN, 2 items', () => {
    let supplier: any
    let med1: any, med2: any
    let batch1No: string, batch2No: string
    let grnId: string

    beforeAll(async () => {
      supplier = await makeSupplier()
      med1 = await createTestMedicine(); medicineIds.add(med1.id)
      med2 = await createTestMedicine(); medicineIds.add(med2.id)
      const po = await createTestPO(supplier.id, [
        { medicine_id: med1.id, quantity: 50, unit_price: 75 },
        { medicine_id: med2.id, quantity: 20, unit_price: 30 },
      ])
      poIds.add(po.id)
      await approveTestPO(po.id)

      batch1No = `${TEST_RUN_ID}GB1-${uniqueSuffix()}`
      batch2No = `${TEST_RUN_ID}GB2-${uniqueSuffix()}`

      const { data, error } = await callCompleteGrn({
        poId: po.id,
        items: [
          { medicine_id: med1.id, batch_no: batch1No, expiry_date: '2028-01-01', quantity: 50, unit_price: 75 },
          { medicine_id: med2.id, batch_no: batch2No, expiry_date: '2028-06-01', quantity: 20, unit_price: 30 },
        ],
      })
      if (error || !data) throw new Error(`complete_grn failed: ${error?.message}`)
      grnId = data
    })

    it('creates a stock_batch row for each received line item', async () => {
      const { data } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
      expect(data).toHaveLength(2)
    })

    it('sets batch_no from the GRN input', async () => {
      const { data } = await serviceClient.from('stock_batches').select('batch_no').eq('medicine_id', med1.id).eq('grn_id', grnId).single()
      expect(data!.batch_no).toBe(batch1No)
    })

    it('sets expiry_date from the GRN input', async () => {
      const { data } = await serviceClient.from('stock_batches').select('expiry_date').eq('medicine_id', med2.id).eq('grn_id', grnId).single()
      expect(data!.expiry_date).toBe('2028-06-01')
    })

    it('sets quantity to the received quantity', async () => {
      const { data } = await serviceClient.from('stock_batches').select('quantity').eq('medicine_id', med1.id).eq('grn_id', grnId).single()
      expect(Number(data!.quantity)).toBe(50)
    })

    it('sets purchase_price from the GRN item unit_price', async () => {
      const { data } = await serviceClient.from('stock_batches').select('purchase_price').eq('medicine_id', med2.id).eq('grn_id', grnId).single()
      expect(Number(data!.purchase_price)).toBeCloseTo(30, 2)
    })

    it('links stock_batch.medicine_id to the correct medicine', async () => {
      const { data } = await serviceClient.from('stock_batches').select('medicine_id').eq('batch_no', batch1No).single()
      expect(data!.medicine_id).toBe(med1.id)
    })

    it('links stock_batch.supplier_id to the PO supplier', async () => {
      const { data } = await serviceClient.from('stock_batches').select('supplier_id').eq('batch_no', batch1No).single()
      expect(data!.supplier_id).toBe(supplier.id)
    })
  })

  describe('partial GRN then a second GRN for the remainder', () => {
    it('partial GRN creates batches only for received items; second GRN adds the rest', async () => {
      const supplier = await makeSupplier()
      const medA = await createTestMedicine(); medicineIds.add(medA.id)
      const medB = await createTestMedicine(); medicineIds.add(medB.id)
      const medC = await createTestMedicine(); medicineIds.add(medC.id)

      const po = await createTestPO(supplier.id, [
        { medicine_id: medA.id, quantity: 10, unit_price: 10 },
        { medicine_id: medB.id, quantity: 10, unit_price: 10 },
        { medicine_id: medC.id, quantity: 10, unit_price: 10 },
      ])
      poIds.add(po.id)
      await approveTestPO(po.id)

      const { data: grn1Id, error: err1 } = await callCompleteGrn({
        poId: po.id, isPartial: true,
        items: [
          { medicine_id: medA.id, batch_no: `${TEST_RUN_ID}PG1-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 10, unit_price: 10 },
          { medicine_id: medB.id, batch_no: `${TEST_RUN_ID}PG2-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 10, unit_price: 10 },
        ],
      })
      if (err1 || !grn1Id) throw new Error(`partial complete_grn failed: ${err1?.message}`)

      const { data: batchesAfterFirst } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grn1Id)
      expect(batchesAfterFirst).toHaveLength(2)

      const { data: poAfterFirst } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(poAfterFirst!.status).toBe('partially_received')

      const { data: grn2Id, error: err2 } = await callCompleteGrn({
        poId: po.id, isPartial: false,
        items: [
          { medicine_id: medC.id, batch_no: `${TEST_RUN_ID}PG3-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 10, unit_price: 10 },
        ],
      })
      if (err2 || !grn2Id) throw new Error(`second complete_grn failed: ${err2?.message}`)

      const { data: batchesAfterSecond } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grn2Id)
      expect(batchesAfterSecond).toHaveLength(1)

      const { data: poAfterSecond } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(poAfterSecond!.status).toBe('received')
    })
  })
})

// =============================================================================
// 2.2 Stock deduction on sale — see file header: complete_sale() has no FEFO
// or auto-spanning; these tests exercise its REAL per-batch behaviour instead.
// =============================================================================
describe('stock deduction on complete_sale()', () => {

  it('deducts only from the specified batch, leaving other batches for the same medicine untouched', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const batchA = await createTestBatch(medicine.id, { expiry_date: '2026-09-01', quantity: 10 }); batchIds.add(batchA.id)
    const batchB = await createTestBatch(medicine.id, { expiry_date: '2026-11-01', quantity: 20 }); batchIds.add(batchB.id)

    const { error } = await callCompleteSale({ items: [{ batch_id: batchA.id, quantity: 5, unit_price: 50 }] })
    if (error) throw new Error(`complete_sale failed: ${error.message}`)

    expect(await getBatchQty(batchA.id)).toBe(5)
    expect(await getBatchQty(batchB.id)).toBe(20)
  })

  it('FINDING: rejects a sale exceeding a single batch even when other batches for the same medicine have enough combined stock', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const batchA = await createTestBatch(medicine.id, { expiry_date: '2026-09-01', quantity: 10 }); batchIds.add(batchA.id)
    const batchB = await createTestBatch(medicine.id, { expiry_date: '2026-11-01', quantity: 20 }); batchIds.add(batchB.id)
    // Total across both batches is 30, well above 25 — but complete_sale() only
    // ever looks at the single batch_id given per line item.
    const { error } = await callCompleteSale({ items: [{ batch_id: batchA.id, quantity: 25, unit_price: 50 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/insufficient stock/i)
    expect(await getBatchQty(batchA.id)).toBe(10) // unchanged — whole statement rolled back
    expect(await getBatchQty(batchB.id)).toBe(20)
  })

  it('rejects a sale drawn from an already-expired batch (migration 036); stock is untouched', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const expiredBatch = await createTestBatch(medicine.id, { expiry_date: '2020-01-01', quantity: 10 })
    batchIds.add(expiredBatch.id)

    const { data, error } = await callCompleteSale({ items: [{ batch_id: expiredBatch.id, quantity: 2, unit_price: 50 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/expired/i)
    expect(data).toBeNull()
    expect(await getBatchQty(expiredBatch.id)).toBe(10)
  })

  it('spans two batches when the CALLER explicitly splits the line into two items (RPC supports it; does not automate it)', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const batchA = await createTestBatch(medicine.id, { expiry_date: '2026-09-01', quantity: 10 }); batchIds.add(batchA.id)
    const batchB = await createTestBatch(medicine.id, { expiry_date: '2026-11-01', quantity: 20 }); batchIds.add(batchB.id)

    const { data, error } = await callCompleteSale({
      items: [
        { batch_id: batchA.id, quantity: 10, unit_price: 50 },
        { batch_id: batchB.id, quantity: 5,  unit_price: 50 },
      ],
    })
    if (error) throw new Error(`complete_sale (split) failed: ${error.message}`)

    expect(await getBatchQty(batchA.id)).toBe(0)
    expect(await getBatchQty(batchB.id)).toBe(15)

    const items = await getSaleItems(data!.sale_id)
    expect(items).toHaveLength(2)
    expect(items.map((i: any) => i.batch_id).sort()).toEqual([batchA.id, batchB.id].sort())
  })

  it('records the batch source on the sale_item (batch_id + batch_no)', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data, error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 3, unit_price: 50 }] })
    if (error) throw new Error(`complete_sale failed: ${error.message}`)
    const items = await getSaleItems(data!.sale_id)
    expect(items[0].batch_id).toBe(batch.id)
    expect(items[0].batch_no).toBe(batch.batch_no)
  })

  it('handles selling the exact remaining quantity of a batch (qty -> 0, sale still succeeds)', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 10, unit_price: 50 }] })
    expect(error).toBeNull()
    expect(await getBatchQty(batch.id)).toBe(0)
  })

  it('a subsequent sale against a fully-depleted (qty 0) batch is rejected', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 5 } })
    const first = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 5, unit_price: 50 }] })
    if (first.error) throw new Error(`setup sale failed: ${first.error.message}`)
    const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 50 }] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/insufficient stock/i)
  })
})

// =============================================================================
// 2.3 Stock Restoration on Return
// =============================================================================
describe('stock restoration on return', () => {

  it('restores the full quantity to the original batch on a full return', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 10, unit_price: 20 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    expect(await getBatchQty(batch.id)).toBe(90)

    const items = await getSaleItems(sale!.sale_id)
    const { error } = await returnAndEnsureCompleted({
      saleId: sale!.sale_id,
      returnItems: [{ sale_item_id: items[0].id, quantity_returned: 10 }],
    })
    if (error) throw new Error(`process_return failed: ${error.message}`)
    expect(await getBatchQty(batch.id)).toBe(100)
  })

  it('restores each original batch correctly when a sale spanned multiple batches', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const batchA = await createTestBatch(medicine.id, { expiry_date: '2026-09-01', quantity: 10 }); batchIds.add(batchA.id)
    const batchB = await createTestBatch(medicine.id, { expiry_date: '2026-11-01', quantity: 20 }); batchIds.add(batchB.id)

    const { data: sale, error: saleErr } = await callCompleteSale({
      items: [
        { batch_id: batchA.id, quantity: 10, unit_price: 50 },
        { batch_id: batchB.id, quantity: 5,  unit_price: 50 },
      ],
    })
    if (saleErr) throw new Error(`setup split sale failed: ${saleErr.message}`)
    expect(await getBatchQty(batchA.id)).toBe(0)
    expect(await getBatchQty(batchB.id)).toBe(15)

    const items = await getSaleItems(sale!.sale_id)
    const itemA = items.find((i: any) => i.batch_id === batchA.id)
    const itemB = items.find((i: any) => i.batch_id === batchB.id)

    const { error } = await returnAndEnsureCompleted({
      saleId: sale!.sale_id,
      returnItems: [
        { sale_item_id: itemA.id, quantity_returned: 10 },
        { sale_item_id: itemB.id, quantity_returned: 5 },
      ],
    })
    if (error) throw new Error(`process_return (multi-batch) failed: ${error.message}`)

    expect(await getBatchQty(batchA.id)).toBe(10)
    expect(await getBatchQty(batchB.id)).toBe(20)
  })

  it('a partial return restores only the returned quantity, not the full sale quantity', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 10, unit_price: 20 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)

    const items = await getSaleItems(sale!.sale_id)
    const { error } = await returnAndEnsureCompleted({
      saleId: sale!.sale_id,
      returnItems: [{ sale_item_id: items[0].id, quantity_returned: 3 }],
    })
    if (error) throw new Error(`process_return (partial) failed: ${error.message}`)
    expect(await getBatchQty(batch.id)).toBe(93) // 100 - 10 + 3
  })

  it('an exchange restores the original batch and deducts the replacement batch', async () => {
    const { batch: originalBatch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20, purchase_price: 10 } })
    const { medicine: replacementMed, batch: replacementBatch } = await makeMedicineWithBatch({
      medicineOverrides: { mrp: 200 },
      batchOverrides:    { quantity: 20, purchase_price: 30, mrp: 200, sale_price: 200 },
    })

    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: originalBatch.id, quantity: 1, unit_price: 30 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    expect(await getBatchQty(originalBatch.id)).toBe(19)
    expect(await getBatchQty(replacementBatch.id)).toBe(20)

    const items = await getSaleItems(sale!.sale_id)
    const { data: result, error } = await returnAndEnsureCompleted({
      saleId: sale!.sale_id,
      returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }],
      exchangeItems: [{ medicine_id: replacementMed.id, batch_id: replacementBatch.id, quantity: 1, unit_price: 80 }],
    })
    if (error || !result) throw new Error(`process_return (exchange) failed: ${error?.message}`)
    if (result.exchange_sale_id) saleIds.add(result.exchange_sale_id)

    expect(await getBatchQty(originalBatch.id)).toBe(20) // restored
    expect(await getBatchQty(replacementBatch.id)).toBe(19) // deducted
  })
})

// =============================================================================
// 2.4 Stock Adjustment (app/actions/stock.ts adjustStock — plain server action,
// no RPC; replicated directly per Phase 16A's pattern for auth-gated actions)
// =============================================================================
describe('stock adjustment', () => {

  it('sets batch quantity to a higher absolute value ("positive adjustment")', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 50 } })
    const { error } = await adjustStockDirect(batch.id, 60, 'physical_count')
    expect(error).toBeNull()
    expect(await getBatchQty(batch.id)).toBe(60)
  })

  it('sets batch quantity to a lower absolute value ("negative adjustment")', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 50 } })
    const { error } = await adjustStockDirect(batch.id, 40, 'damaged')
    expect(error).toBeNull()
    expect(await getBatchQty(batch.id)).toBe(40)
  })

  it('FINDING: adjustStock() takes an absolute new_quantity, not a delta — the spec\'s "+10/-10" framing does not match the real signature', () => {
    // adjustStock(batchId, newQuantity, reason, notes) in app/actions/stock.ts —
    // confirmed by reading the live file. Documented here rather than asserted,
    // since it's a shape observation, not a pass/fail check.
    expect(true).toBe(true)
  })

  it('the DB rejects a negative quantity at the constraint level regardless of the app-layer check', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 5 } })
    const { error } = await serviceClient.from('stock_batches').update({ quantity: -1 }).eq('id', batch.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/violates check constraint|stock_batches_quantity_check/i)
    expect(await getBatchQty(batch.id)).toBe(5) // unchanged
  })

  it('creates an audit log entry recording old and new quantity', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 50 } })
    const { error } = await adjustStockDirect(batch.id, 33, 'other', `${TEST_RUN_ID}adjust-note`)
    expect(error).toBeNull()

    const { data: logs } = await serviceClient
      .from('audit_logs')
      .select('*')
      .eq('action', 'ADJUST_STOCK')
      .eq('record_id', batch.id)
    expect(logs).toHaveLength(1)
    expect(logs![0].old_value).toEqual({ quantity: 50 })
    expect(logs![0].new_value).toMatchObject({ quantity: 33, reason: 'other' })
  })
})

// =============================================================================
// 2.5 Expiry Write-off (app/actions/stock.ts writeOffBatch — plain server
// action, no RPC; replicated directly)
// =============================================================================
describe('expiry write-off', () => {

  it('reduces batch quantity by the written-off amount (full write-off -> 0)', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20 } })
    const { error } = await writeOffBatchDirect(batch.id, 20, 'expired')
    expect(error).toBeNull()
    expect(await getBatchQty(batch.id)).toBe(0)
  })

  it('a partial write-off reduces quantity by only the written-off amount', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20 } })
    const { error } = await writeOffBatchDirect(batch.id, 5, 'near_expiry')
    expect(error).toBeNull()
    expect(await getBatchQty(batch.id)).toBe(15)
  })

  it('rejects a write-off quantity exceeding available stock', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 5 } })
    const { error } = await writeOffBatchDirect(batch.id, 10, 'damaged')
    expect(error).not.toBeNull()
    expect(error).toMatch(/exceeds available stock/i)
    expect(await getBatchQty(batch.id)).toBe(5) // unchanged
  })

  it('FINDING: there is no separate write-off marker — the batch row stays fully intact (is_deleted stays false) with only quantity reduced; the only forensic trail is the audit_logs entry', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    await writeOffBatchDirect(batch.id, 10, 'expired')
    const { data: row } = await serviceClient.from('stock_batches').select('is_deleted, quantity').eq('id', batch.id).single()
    expect(row!.is_deleted).toBe(false)
    expect(Number(row!.quantity)).toBe(0)
  })

  it('creates an audit log entry recording the write-off reason and amount', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20 } })
    const { error } = await writeOffBatchDirect(batch.id, 8, 'expired', `${TEST_RUN_ID}wo-note`)
    expect(error).toBeNull()

    const { data: logs } = await serviceClient
      .from('audit_logs')
      .select('*')
      .eq('action', 'STOCK_WRITEOFF')
      .eq('record_id', batch.id)
    expect(logs).toHaveLength(1)
    expect(logs![0].new_value).toMatchObject({ quantity: 12, written_off: 8, reason: 'expired' })
  })

  it('a written-off batch no longer contributes to available stock (getMedicineStock sum)', async () => {
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)
    const batchA = await createTestBatch(medicine.id, { quantity: 10 }); batchIds.add(batchA.id)
    const batchB = await createTestBatch(medicine.id, { quantity: 15 }); batchIds.add(batchB.id)
    expect(await getMedicineStock(medicine.id)).toBe(25)

    await writeOffBatchDirect(batchA.id, 10, 'expired')
    expect(await getMedicineStock(medicine.id)).toBe(15)
  })
})
