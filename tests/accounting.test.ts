/**
 * Accounting Tests (Phase 16A)
 * Verifies double-entry journal output of complete_sale(), complete_grn(),
 * process_return(), post_journal_entry(), and the journal-posting logic used
 * by recordExpense(), recordSupplierPayment(), recordCustomerPayment(), and
 * the borrowing server actions.
 *
 * Talks directly to the dev Supabase project via the service-role client and
 * a handful of RPCs — does NOT require the Next.js dev server.
 *
 * Server actions (recordExpense, recordSupplierPayment, createBorrowingTransaction,
 * completeBorrowingSale, lendToPharmacy) use `createClient()` from
 * '@/lib/supabase/server', which reads the session from Next.js request cookies
 * and cannot run outside a request context. Per the Phase 16 test plan, those
 * are tested here by calling the same RPC (post_journal_entry / record_customer_payment)
 * with the exact lines/params the server action builds — this exercises the
 * real accounting logic without needing an authenticated HTTP session.
 */

import {
  serviceClient, rpc, TEST_RUN_ID, getTestUserIds, uniqueSuffix,
  createTestMedicine, createTestBatch, createTestSupplier, createTestCustomer,
  getJournalEntry, getJournalEntryById, getJournalLines, findLine, assertBalanced, computeBalance,
  getBatchQty, cleanupJournalEntries, closePool,
} from './helpers/test-client'

jest.setTimeout(60000)

let userIds: { superadmin: string; admin: string; pharmacist: string }

// Tracked IDs for final cleanup (afterAll, bottom of file)
const journalEntryIds = new Set<string>()
const saleIds         = new Set<string>()
const grnIds          = new Set<string>()
const poIds           = new Set<string>()
const returnIds       = new Set<string>()
const expenseIds      = new Set<string>()
const supplierPaymentIds = new Set<string>()
const customerPaymentIds = new Set<string>()
const borrowingPharmacyIds = new Set<string>()
const medicineIds = new Set<string>()
const batchIds    = new Set<string>()
const supplierIds = new Set<string>()
const customerIds = new Set<string>()

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

async function makeCustomer(overrides: Record<string, unknown> = {}) {
  const customer = await createTestCustomer(overrides)
  customerIds.add(customer.id)
  return customer
}

/**
 * Calls complete_sale() and tracks both the resulting sale id AND its journal
 * entry for cleanup. Every describe block in this file uses this single
 * helper for sale setup specifically so that tracking can never be forgotten
 * in a block that doesn't otherwise need to assert on the sale's own entry
 * (e.g. process_return() setup, which only asserts on the return's entry).
 */
async function callCompleteSale(input: {
  customerId?:  string | null
  paymentType:  string
  items:        Array<{ batch_id: string; quantity: number; unit_price: number; discount_pct?: number }>
  discountAmt?: number
  bagCharge?:   number
  amountPaid?:  number
  notes?:       string
}) {
  const { data, error } = await rpc('complete_sale', {
    p_cashier_id:   userIds.pharmacist,
    p_customer_id:  input.customerId ?? null,
    p_payment_type: input.paymentType,
    p_items:        input.items,
    p_discount_amt: input.discountAmt ?? 0,
    p_bag_charge:   input.bagCharge ?? 0,
    p_amount_paid:  input.amountPaid ?? 100000,
    p_notes:        input.notes ?? `${TEST_RUN_ID}sale`,
  })
  if (!error && data?.sale_id) {
    saleIds.add(data.sale_id as string)
    const entry = await getJournalEntry('sale', data.sale_id as string)
    if (entry) journalEntryIds.add(entry.id)
  }
  return { data: data as { sale_id: string; receipt_no: string; total: number; change: number } | null, error }
}

async function getSaleItems(saleId: string) {
  const { data, error } = await serviceClient.from('sale_items').select('*').eq('sale_id', saleId)
  if (error) throw new Error(`getSaleItems failed: ${error.message}`)
  return data ?? []
}

beforeAll(async () => {
  userIds = await getTestUserIds()
})

afterAll(async () => {
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (err) {
      console.error(`[cleanup] ${label} failed:`, err instanceof Error ? err.message : err)
    }
  }

  try {
    // Rows with a journal_entry_id FK must be removed (or unlinked) BEFORE the
    // journal entries themselves, or the journal_entries DELETE violates that FK.
    if (expenseIds.size) {
      await step('expenses', () => serviceClient.from('expenses').delete().in('id', [...expenseIds]))
    }
    if (supplierPaymentIds.size) {
      await step('supplier_payments', () => serviceClient.from('supplier_payments').delete().in('id', [...supplierPaymentIds]))
    }
    if (customerPaymentIds.size) {
      await step('customer_payments', () => serviceClient.from('customer_payments').delete().in('id', [...customerPaymentIds]))
    }
    if (returnIds.size) {
      const ids = [...returnIds]
      await step('return_items', () => serviceClient.from('return_items').delete().in('return_id', ids))
      await step('exchange_items', () => serviceClient.from('exchange_items').delete().in('return_id', ids))
      await step('returns', () => serviceClient.from('returns').delete().in('id', ids))
    }
    if (borrowingPharmacyIds.size) {
      await step('borrowing_transactions', () => serviceClient.from('borrowing_transactions').delete().in('pharmacy_id', [...borrowingPharmacyIds]))
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
      await step('purchase_orders', () => serviceClient.from('purchase_orders').delete().in('id', [...poIds]))
    }
    if (borrowingPharmacyIds.size) {
      await step('borrowing_pharmacies', () => serviceClient.from('borrowing_pharmacies').delete().in('id', [...borrowingPharmacyIds]))
    }
    if (batchIds.size)    await step('stock_batches', () => serviceClient.from('stock_batches').delete().in('id', [...batchIds]))
    if (medicineIds.size) await step('medicines', () => serviceClient.from('medicines').delete().in('id', [...medicineIds]))
    if (supplierIds.size) await step('suppliers', () => serviceClient.from('suppliers').delete().in('id', [...supplierIds]))
    if (customerIds.size) await step('customers', () => serviceClient.from('customers').delete().in('id', [...customerIds]))
  } finally {
    await closePool()
  }
})

// =============================================================================
// 1.1 complete_sale() Journal Entries
// =============================================================================
describe('complete_sale() accounting', () => {

  describe('cash sale with no discount', () => {
    let saleId: string
    let entry: any
    let lines: any[]

    beforeAll(async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 5, unit_price: 50 }],
      })
      if (error) throw new Error(`complete_sale failed: ${error.message}`)
      saleId = data!.sale_id
      entry = await getJournalEntry('sale', saleId)
      if (entry) journalEntryIds.add(entry.id)
      lines = entry ? await getJournalLines(entry.id) : []
    })

    it('creates a journal entry with reference_type = sale', () => {
      expect(entry).not.toBeNull()
      expect(entry.reference_type).toBe('sale')
    })

    it('journal entry reference_id matches the sale ID', () => {
      expect(entry.reference_id).toBe(saleId)
    })

    it('journal entry status is posted', () => {
      expect(entry.status).toBe('posted')
    })

    it('debits 1000 Cash for the sale total', () => {
      const line = findLine(lines, '1000', 'debit')
      expect(line).toBeDefined()
      expect(line!.amount_pkr).toBeCloseTo(250, 2)
    })

    it('credits 4000 Revenue for the gross subtotal', () => {
      const line = findLine(lines, '4000', 'credit')
      expect(line).toBeDefined()
      expect(line!.amount_pkr).toBeCloseTo(250, 2)
    })

    it('credits 5000 COGS-side inventory: debits 5000 COGS for the cost amount', () => {
      const line = findLine(lines, '5000', 'debit')
      expect(line).toBeDefined()
      expect(line!.amount_pkr).toBeCloseTo(250, 2) // 5 x purchase_price 50
    })

    it('credits 1200 Inventory for the cost amount', () => {
      const line = findLine(lines, '1200', 'credit')
      expect(line).toBeDefined()
      expect(line!.amount_pkr).toBeCloseTo(250, 2)
    })

    it('does NOT create a 4900 Sales Discount line', () => {
      expect(findLine(lines, '4900', 'debit')).toBeUndefined()
    })

    it('journal entry balances (total debits = total credits)', () => {
      assertBalanced(lines)
    })
  })

  describe('cash sale with discount', () => {
    let saleId: string
    let lines: any[]

    beforeAll(async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 2, unit_price: 100 }], // subtotal 200
        discountAmt: 30,
      })
      if (error) throw new Error(`complete_sale failed: ${error.message}`)
      saleId = data!.sale_id
      const entry = await getJournalEntry('sale', saleId)
      if (entry) journalEntryIds.add(entry.id)
      lines = entry ? await getJournalLines(entry.id) : []
    })

    it('credits 4000 Revenue for the GROSS subtotal (not net)', () => {
      const line = findLine(lines, '4000', 'credit')
      expect(line!.amount_pkr).toBeCloseTo(200, 2)
    })

    it('debits 4900 Sales Discount for the discount amount', () => {
      const line = findLine(lines, '4900', 'debit')
      expect(line).toBeDefined()
      expect(line!.amount_pkr).toBeCloseTo(30, 2)
    })

    it('debits 1000 Cash for (subtotal - discount)', () => {
      const line = findLine(lines, '1000', 'debit')
      expect(line!.amount_pkr).toBeCloseTo(170, 2)
    })

    it('the net effect: 4000 - 4900 = net revenue', () => {
      const revenue  = findLine(lines, '4000', 'credit')!.amount_pkr
      const discount = findLine(lines, '4900', 'debit')!.amount_pkr
      expect(revenue - discount).toBeCloseTo(170, 2)
    })

    it('journal entry balances', () => {
      assertBalanced(lines)
    })
  })

  describe('bank transfer sale', () => {
    it('debits 1001 Bank Account (NOT 1000 Cash), journal balances', async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'bank_transfer',
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }],
      })
      if (error) {
        // BUG CANDIDATE: sales.payment_type CHECK constraint (migration 011) only
        // allows ('cash','credit') — 'bank_transfer' was never added despite
        // complete_sale() (migration 032) having explicit routing logic for it.
        throw new Error(`complete_sale('bank_transfer') failed — likely CHECK constraint violation: ${error.message}`)
      }
      const entry = await getJournalEntry('sale', data!.sale_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)
      expect(findLine(lines, '1001', 'debit')).toBeDefined()
      expect(findLine(lines, '1000', 'debit')).toBeUndefined()
      assertBalanced(lines)
    })
  })

  describe('cheque sale', () => {
    it('debits 1001 Bank Account (same as bank_transfer), journal balances', async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'cheque',
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }],
      })
      if (error) {
        throw new Error(`complete_sale('cheque') failed — likely CHECK constraint violation: ${error.message}`)
      }
      const entry = await getJournalEntry('sale', data!.sale_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)
      expect(findLine(lines, '1001', 'debit')).toBeDefined()
      assertBalanced(lines)
    })
  })

  describe('credit sale', () => {
    let customerId: string
    let saleId: string
    let lines: any[]

    beforeAll(async () => {
      const customer = await makeCustomer()
      customerId = customer.id
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'credit',
        customerId,
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }],
      })
      if (error) throw new Error(`complete_sale('credit') failed: ${error.message}`)
      saleId = data!.sale_id
      const entry = await getJournalEntry('sale', saleId)
      if (entry) journalEntryIds.add(entry.id)
      lines = entry ? await getJournalLines(entry.id) : []
    })

    it('debits 1100 Accounts Receivable (NOT 1000 Cash)', () => {
      expect(findLine(lines, '1100', 'debit')).toBeDefined()
      expect(findLine(lines, '1000', 'debit')).toBeUndefined()
    })

    it('1100 line carries party_type = customer', () => {
      expect(findLine(lines, '1100', 'debit')!.party_type).toBe('customer')
    })

    it('1100 line carries party_id = customer UUID', () => {
      expect(findLine(lines, '1100', 'debit')!.party_id).toBe(customerId)
    })

    it('journal entry balances', () => {
      assertBalanced(lines)
    })

    it('increments customer credit_balance by the sale total', async () => {
      const { data: cust } = await serviceClient.from('customers').select('credit_balance').eq('id', customerId).single()
      expect(Number(cust!.credit_balance)).toBeCloseTo(100, 2)
    })
  })

  describe('zero-amount sale (100% discount)', () => {
    it('documents actual behaviour when the debit line amount is 0', async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }],
        discountAmt: 100, // v_total = 0
      })
      if (error) {
        // journal_lines.amount has CHECK(amount > 0) — a zero-value debit line
        // raises a constraint violation inside post_journal_entry(), rolling
        // back the entire complete_sale() transaction (sale + sale_items too).
        expect(error.message).toBeTruthy()
        console.log('[zero-amount sale] complete_sale rejected zero-value entry:', error.message)
      } else {
        const entry = await getJournalEntry('sale', data!.sale_id)
        if (entry) journalEntryIds.add(entry.id)
        expect(entry).not.toBeNull()
      }
    })
  })

  describe('sale with service fee (bag charge)', () => {
    it('service fee is included in the total debited to cash, and 4010 is credited; journal balances', async () => {
      const { batch } = await makeMedicineWithBatch()
      const { data, error } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 100 }],
        bagCharge: 5,
      })
      if (error) throw new Error(`complete_sale with bag charge failed: ${error.message}`)
      const entry = await getJournalEntry('sale', data!.sale_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)

      expect(findLine(lines, '1000', 'debit')!.amount_pkr).toBeCloseTo(105, 2)
      expect(findLine(lines, '4010', 'credit')!.amount_pkr).toBeCloseTo(5, 2)
      assertBalanced(lines)
    })
  })
})

// =============================================================================
// 1.2 complete_grn() Journal Entries
// =============================================================================
describe('complete_grn() accounting', () => {

  async function makeConfirmedPO(supplierId: string) {
    const { data, error } = await serviceClient
      .from('purchase_orders')
      .insert({
        po_number:   `${TEST_RUN_ID}PO-${uniqueSuffix()}`,
        supplier_id: supplierId,
        status:      'confirmed',
        total_amount: 0,
        created_by:  userIds.admin,
      })
      .select()
      .single()
    if (error || !data) throw new Error(`makeConfirmedPO failed: ${error?.message}`)
    poIds.add(data.id)
    return data
  }

  describe('full GRN (all items received)', () => {
    let grnId: string
    let lines: any[]
    let entry: any

    beforeAll(async () => {
      const supplier = await makeSupplier()
      const po = await makeConfirmedPO(supplier.id)
      const { medicine: med1 } = await makeMedicineWithBatch()
      const { medicine: med2 } = await makeMedicineWithBatch()

      const { data: grnIdData, error } = await rpc('complete_grn', {
        p_po_id:       po.id,
        p_received_by: userIds.admin,
        p_notes:       `${TEST_RUN_ID}grn-full`,
        p_items: [
          { medicine_id: med1.id, batch_no: `${TEST_RUN_ID}GB1-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 10, unit_price: 20 },
          { medicine_id: med2.id, batch_no: `${TEST_RUN_ID}GB2-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 5,  unit_price: 40 },
        ],
        p_is_partial: false,
      })
      if (error || !grnIdData) throw new Error(`complete_grn failed: ${error?.message}`)
      grnId = grnIdData as string
      grnIds.add(grnId)

      // Track the stock_batches complete_grn() created, for cleanup
      const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
      for (const b of newBatches ?? []) batchIds.add(b.id)

      entry = await getJournalEntry('grn', grnId)
      if (entry) journalEntryIds.add(entry.id)
      lines = entry ? await getJournalLines(entry.id) : []
    })

    it('creates a journal entry with reference_type = grn', () => {
      expect(entry).not.toBeNull()
      expect(entry.reference_type).toBe('grn')
    })

    it('journal entry reference_id matches the GRN ID', () => {
      expect(entry.reference_id).toBe(grnId)
    })

    it('GRN value = SUM(qty_received x unit_price) across all items (10x20 + 5x40 = 400)', () => {
      const debit = findLine(lines, '1200', 'debit')
      expect(debit!.amount_pkr).toBeCloseTo(400, 2)
    })

    it('debits 1200 Inventory for the total GRN value', () => {
      expect(findLine(lines, '1200', 'debit')).toBeDefined()
    })

    it('credits 2000 Accounts Payable for the total GRN value', () => {
      const credit = findLine(lines, '2000', 'credit')
      expect(credit).toBeDefined()
      expect(credit!.amount_pkr).toBeCloseTo(400, 2)
    })

    it('2000 line carries party_type = supplier and party_id = supplier UUID', async () => {
      // BUG: migration 032's complete_grn() 2000 credit line has no party_type/party_id
      // (see supabase/migrations/032_accounting_fixes.sql lines 179-184), even though
      // CLAUDE.md's Phase 13A changelog claims this was fixed. get_party_ledger()
      // (migration 014) filters strictly on jl.party_type/jl.party_id, so GRNs never
      // appear in the Supplier Ledger UI.
      const { data: grnRow } = await serviceClient.from('goods_receipts').select('supplier_id').eq('id', grnId).single()
      const credit = findLine(lines, '2000', 'credit')!
      expect(credit.party_type).toBe('supplier')
      expect(credit.party_id).toBe(grnRow!.supplier_id)
    })

    it('journal entry balances', () => {
      assertBalanced(lines)
    })
  })

  describe('partial GRN (some items received)', () => {
    it('GRN value includes ONLY received items; journal balances', async () => {
      const supplier = await makeSupplier()
      const po = await makeConfirmedPO(supplier.id)
      const { medicine } = await makeMedicineWithBatch()

      const { data: grnIdData, error } = await rpc('complete_grn', {
        p_po_id:       po.id,
        p_received_by: userIds.admin,
        p_notes:       `${TEST_RUN_ID}grn-partial`,
        p_items: [
          { medicine_id: medicine.id, batch_no: `${TEST_RUN_ID}GBp-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 3, unit_price: 30 },
        ],
        p_is_partial: true,
      })
      if (error || !grnIdData) throw new Error(`complete_grn (partial) failed: ${error?.message}`)
      const grnId = grnIdData as string
      grnIds.add(grnId)
      const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
      for (const b of newBatches ?? []) batchIds.add(b.id)

      const entry = await getJournalEntry('grn', grnId)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)

      expect(findLine(lines, '1200', 'debit')!.amount_pkr).toBeCloseTo(90, 2)
      expect(findLine(lines, '2000', 'credit')!.amount_pkr).toBeCloseTo(90, 2)
      assertBalanced(lines)

      const { data: poRow } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(poRow!.status).toBe('partially_received')
    })
  })

  describe('multiple GRNs on same PO', () => {
    it('each GRN creates a separate journal entry; both balance independently', async () => {
      const supplier = await makeSupplier()
      const po = await makeConfirmedPO(supplier.id)
      const { medicine } = await makeMedicineWithBatch()

      const { data: grn1Id, error: err1 } = await rpc('complete_grn', {
        p_po_id: po.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}grn-multi-1`,
        p_items: [{ medicine_id: medicine.id, batch_no: `${TEST_RUN_ID}GM1-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 2, unit_price: 10 }],
        p_is_partial: true,
      })
      if (err1 || !grn1Id) throw new Error(`complete_grn (multi 1) failed: ${err1?.message}`)
      grnIds.add(grn1Id as string)

      const { data: grn2Id, error: err2 } = await rpc('complete_grn', {
        p_po_id: po.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}grn-multi-2`,
        p_items: [{ medicine_id: medicine.id, batch_no: `${TEST_RUN_ID}GM2-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 3, unit_price: 10 }],
        p_is_partial: false,
      })
      if (err2 || !grn2Id) throw new Error(`complete_grn (multi 2) failed: ${err2?.message}`)
      grnIds.add(grn2Id as string)

      for (const gid of [grn1Id, grn2Id]) {
        const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', gid as string)
        for (const b of newBatches ?? []) batchIds.add(b.id)
      }

      const entry1 = await getJournalEntry('grn', grn1Id as string)
      const entry2 = await getJournalEntry('grn', grn2Id as string)
      journalEntryIds.add(entry1.id)
      journalEntryIds.add(entry2.id)
      expect(entry1.id).not.toBe(entry2.id)

      const lines1 = await getJournalLines(entry1.id)
      const lines2 = await getJournalLines(entry2.id)
      assertBalanced(lines1)
      assertBalanced(lines2)

      const sum = computeBalance(lines1).debit + computeBalance(lines2).debit
      expect(sum).toBeCloseTo(20 + 30, 2) // 2x10 + 3x10

      const { data: poRow } = await serviceClient.from('purchase_orders').select('status').eq('id', po.id).single()
      expect(poRow!.status).toBe('received')
    })
  })

  describe('zero-value GRN', () => {
    it('does NOT create a journal entry when v_total = 0', async () => {
      const supplier = await makeSupplier()
      const po = await makeConfirmedPO(supplier.id)
      const { medicine } = await makeMedicineWithBatch()

      const { data: grnIdData, error } = await rpc('complete_grn', {
        p_po_id: po.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}grn-zero`,
        p_items: [{ medicine_id: medicine.id, batch_no: `${TEST_RUN_ID}GZ-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 5, unit_price: 0 }],
        p_is_partial: false,
      })
      if (error || !grnIdData) throw new Error(`complete_grn (zero-value) failed: ${error?.message}`)
      const grnId = grnIdData as string
      grnIds.add(grnId)
      const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
      for (const b of newBatches ?? []) batchIds.add(b.id)

      const entry = await getJournalEntry('grn', grnId)
      expect(entry).toBeNull()
    })
  })
})

// =============================================================================
// 1.3 process_return() Journal Entries
// =============================================================================
describe('process_return() accounting', () => {

  async function readReturnPolicySettings() {
    const { data } = await serviceClient
      .from('settings')
      .select('key, value')
      .in('key', ['return_window_days', 'return_auto_approve_limit', 'return_opened_pack_allowed'])
    const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
    return {
      windowDays: Number(map.return_window_days ?? 3),
      autoLimit:  Number(map.return_auto_approve_limit ?? 1000),
    }
  }

  /** Runs process_return in "new" mode and, if it comes back pending_approval, approves it. */
  async function returnAndEnsureCompleted(input: {
    saleId: string
    returnItems: Array<{ sale_item_id: string; quantity_returned: number }>
    exchangeItems?: Array<{ medicine_id: string; batch_id: string; quantity: number; unit_price: number }>
    reason?: string
  }) {
    const { data: initial, error: err1 } = await rpc('process_return', {
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
      const { data: approved, error: err2 } = await rpc('process_return', {
        p_original_sale_id: null,
        p_return_items:     null,
        p_exchange_items:   null,
        p_reason:           null,
        p_pack_opened:      false,
        p_requested_by:     userIds.superadmin,
        p_return_id:        initial.return_id,
      })
      return { data: approved, error: err2 }
    }
    returnIds.add(initial.return_id)
    return { data: initial, error: null }
  }

  describe('full return on cash sale', () => {
    let lines: any[]
    let entry: any

    beforeAll(async () => {
      const { autoLimit } = await readReturnPolicySettings()
      const price = Math.min(50, Math.max(1, autoLimit - 1))
      const { batch } = await makeMedicineWithBatch()
      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 2, unit_price: price }],
      })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data: result, error } = await returnAndEnsureCompleted({
        saleId: sale!.sale_id,
        returnItems: [{ sale_item_id: items[0].id, quantity_returned: 2 }],
      })
      if (error || !result) throw new Error(`process_return failed: ${error?.message}`)

      entry = await getJournalEntry('sale_return', result.return_id)
      if (entry) journalEntryIds.add(entry.id)
      lines = entry ? await getJournalLines(entry.id) : []
    })

    it('creates a journal entry with reference_type = sale_return', () => {
      expect(entry).not.toBeNull()
      expect(entry.reference_type).toBe('sale_return')
    })

    it('debits 4000 Revenue (reverse the original credit)', () => {
      expect(findLine(lines, '4000', 'debit')).toBeDefined()
    })

    it('credits 1000 Cash (money going back to customer)', () => {
      expect(findLine(lines, '1000', 'credit')).toBeDefined()
    })

    it('debits 1200 Inventory and credits 5000 COGS on reversal', () => {
      expect(findLine(lines, '1200', 'debit')).toBeDefined()
      expect(findLine(lines, '5000', 'credit')).toBeDefined()
    })

    it('journal entry balances', () => {
      assertBalanced(lines)
    })
  })

  describe('full return on credit sale', () => {
    it('credits 1100 Accounts Receivable (reduce receivable); does NOT credit 1000 Cash; balances', async () => {
      const customer = await makeCustomer()
      const { batch } = await makeMedicineWithBatch()
      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'credit',
        customerId: customer.id,
        items: [{ batch_id: batch.id, quantity: 1, unit_price: 40 }],
      })
      if (saleErr) throw new Error(`setup credit sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data: result, error } = await returnAndEnsureCompleted({
        saleId: sale!.sale_id,
        returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }],
      })
      if (error || !result) throw new Error(`process_return (credit) failed: ${error?.message}`)

      const entry = await getJournalEntry('sale_return', result.return_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)

      expect(findLine(lines, '1100', 'credit')).toBeDefined()
      expect(findLine(lines, '1000', 'credit')).toBeUndefined()
      assertBalanced(lines)
    })
  })

  describe('partial return (some items)', () => {
    it('return journal value reflects only returned items; journal balances', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100 } })
      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 3, unit_price: 20 }],
      })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data: result, error } = await returnAndEnsureCompleted({
        saleId: sale!.sale_id,
        returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }], // return 1 of 3
      })
      if (error || !result) throw new Error(`process_return (partial) failed: ${error?.message}`)

      expect(Number(result.refund_amount)).toBeCloseTo(20, 2)

      const entry = await getJournalEntry('sale_return', result.return_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)
      expect(findLine(lines, '4000', 'debit')!.amount_pkr).toBeCloseTo(20, 2)
      assertBalanced(lines)

      const { data: saleRow } = await serviceClient.from('sales').select('return_status').eq('id', sale!.sale_id).single()
      expect(saleRow!.return_status).toBe('partial')
    })
  })

  describe('exchange (return + new item, upgrade)', () => {
    it('cash sale exchange: debits 1000 Cash for the price difference (customer pays more); balances', async () => {
      const { medicine: cheapMed, batch: cheapBatch }   = await makeMedicineWithBatch({ batchOverrides: { purchase_price: 10 } })
      const { medicine: pricierMed, batch: pricierBatch } = await makeMedicineWithBatch({
        medicineOverrides: { mrp: 200 },
        batchOverrides:    { purchase_price: 30, mrp: 200, sale_price: 200 },
      })

      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: cheapBatch.id, quantity: 1, unit_price: 30 }],
      })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data: result, error } = await returnAndEnsureCompleted({
        saleId: sale!.sale_id,
        returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }],
        exchangeItems: [{ medicine_id: pricierMed.id, batch_id: pricierBatch.id, quantity: 1, unit_price: 80 }],
      })
      if (error || !result) throw new Error(`process_return (exchange) failed: ${error?.message}`)
      if (result.exchange_sale_id) saleIds.add(result.exchange_sale_id)

      expect(Number(result.net_amount)).toBeCloseTo(30 - 80, 2) // -50, customer owes more

      const entry = await getJournalEntry('sale_return', result.return_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)

      const cashDebit = findLine(lines, '1000', 'debit')
      expect(cashDebit).toBeDefined()
      expect(cashDebit!.amount_pkr).toBeCloseTo(50, 2)
      assertBalanced(lines)
    })
  })

  describe('return on sale with discount', () => {
    it('documents whether the return reverses the proportional 4900 discount', async () => {
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100 } })
      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'cash',
        items: [{ batch_id: batch.id, quantity: 2, unit_price: 100 }], // subtotal 200
        discountAmt: 20,
      })
      if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
      const items = await getSaleItems(sale!.sale_id)

      const { data: result, error } = await returnAndEnsureCompleted({
        saleId: sale!.sale_id,
        returnItems: [{ sale_item_id: items[0].id, quantity_returned: 1 }],
      })
      if (error || !result) throw new Error(`process_return (discount) failed: ${error?.message}`)

      const entry = await getJournalEntry('sale_return', result.return_id)
      journalEntryIds.add(entry.id)
      const lines = await getJournalLines(entry.id)

      // Refund is based on sale_items.unit_price (100), which is NOT net of the
      // order-level discount_amt — process_return() never posts a 4900 line at all.
      const discountLine = findLine(lines, '4900', 'credit')
      if (discountLine) {
        console.log('[return on discounted sale] 4900 WAS reversed:', discountLine)
      } else {
        console.log(
          '[return on discounted sale] FINDING: process_return() posts no 4900 line — ' +
          'the order-level Sales Discount is never proportionally reversed on a return.',
        )
      }
      expect(findLine(lines, '4000', 'debit')!.amount_pkr).toBeCloseTo(100, 2)
      assertBalanced(lines)
    })
  })
})

// =============================================================================
// 1.4 post_journal_entry() RPC Validation
// =============================================================================
describe('post_journal_entry() enforcement', () => {

  it('rejects an entry where debits != credits', async () => {
    const { data, error } = await rpc('post_journal_entry', {
      p_entry_date:     new Date().toISOString().split('T')[0],
      p_description:    `${TEST_RUN_ID}unbalanced`,
      p_reference_type: 'manual',
      p_reference_id:   null,
      p_currency:       'PKR',
      p_exchange_rate:  1.0,
      p_lines: [
        { account_code: '1000', direction: 'debit',  amount: '500' },
        { account_code: '4000', direction: 'credit', amount: '400' },
      ],
      p_created_by: userIds.superadmin,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/does not balance/i)
  })

  it('accepts an entry where debits = credits exactly', async () => {
    const { data, error } = await rpc('post_journal_entry', {
      p_entry_date:     new Date().toISOString().split('T')[0],
      p_description:    `${TEST_RUN_ID}balanced`,
      p_reference_type: 'manual',
      p_reference_id:   null,
      p_currency:       'PKR',
      p_exchange_rate:  1.0,
      p_lines: [
        { account_code: '6008', direction: 'debit',  amount: '1' },
        { account_code: '1000', direction: 'credit', amount: '1' },
      ],
      p_created_by: userIds.superadmin,
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    journalEntryIds.add(data as string)

    const entry = await getJournalEntryById(data as string)
    expect(entry.status).toBe('posted')
  })

  describe('immutability guards', () => {
    let entryId: string
    let firstLineId: string

    beforeAll(async () => {
      const { data, error } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `${TEST_RUN_ID}immutability-check`,
        p_reference_type: 'manual',
        p_reference_id:   null,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines: [
          { account_code: '6008', direction: 'debit',  amount: '2' },
          { account_code: '1000', direction: 'credit', amount: '2' },
        ],
        p_created_by: userIds.superadmin,
      })
      if (error || !data) throw new Error(`setup entry failed: ${error?.message}`)
      entryId = data as string
      journalEntryIds.add(entryId)
      const lines = await getJournalLines(entryId)
      firstLineId = lines[0].id
    })

    it('creates journal_lines that are immutable (UPDATE blocked)', async () => {
      const { error } = await serviceClient.from('journal_lines').update({ description: 'TAMPERED' }).eq('id', firstLineId)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/immutable/i)
    })

    it('creates journal_lines that cannot be deleted', async () => {
      const { error } = await serviceClient.from('journal_lines').delete().eq('id', firstLineId)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/immutable/i)
    })

    it('prevents mutation of posted journal entry fields (description)', async () => {
      const { error } = await serviceClient.from('journal_entries').update({ description: 'TAMPERED' }).eq('id', entryId)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/cannot modify financial fields/i)
    })

    it('allows status change from posted to reversed', async () => {
      const { data: reversalId, error: reversalErr } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `${TEST_RUN_ID}reversal-of-immutability-check`,
        p_reference_type: 'adjustment',
        p_reference_id:   entryId,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines: [
          { account_code: '1000', direction: 'debit',  amount: '2' },
          { account_code: '6008', direction: 'credit', amount: '2' },
        ],
        p_created_by: userIds.superadmin,
      })
      if (reversalErr || !reversalId) throw new Error(`reversal entry failed: ${reversalErr?.message}`)
      journalEntryIds.add(reversalId as string)

      const { error: markErr } = await rpc('mark_entry_reversed', {
        p_original_id: entryId,
        p_reversal_id: reversalId,
      })
      expect(markErr).toBeNull()

      const original = await getJournalEntryById(entryId)
      expect(original.status).toBe('reversed')
      expect(original.reversed_by).toBe(reversalId)
    })
  })

  it('assigns sequential (strictly increasing) entry numbers', async () => {
    const entryNos: string[] = []
    for (let i = 0; i < 3; i++) {
      const { data, error } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `${TEST_RUN_ID}seq-${i}`,
        p_reference_type: 'manual',
        p_reference_id:   null,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines: [
          { account_code: '6008', direction: 'debit',  amount: '1' },
          { account_code: '1000', direction: 'credit', amount: '1' },
        ],
        p_created_by: userIds.superadmin,
      })
      if (error || !data) throw new Error(`seq entry ${i} failed: ${error?.message}`)
      journalEntryIds.add(data as string)
      const entry = await getJournalEntryById(data as string)
      entryNos.push(entry.entry_no)
    }
    for (let i = 1; i < entryNos.length; i++) {
      expect(entryNos[i] > entryNos[i - 1]).toBe(true)
    }
  })
})

// =============================================================================
// 1.5 recordExpense() Accounting
// (server action requires an authenticated session; the journal-posting logic
//  it runs is replicated here directly against the RPC — see file header)
// =============================================================================
describe('recordExpense() accounting', () => {

  async function postExpense(paymentMethod: 'cash' | 'bank_transfer' | 'cheque', amount = 500) {
    const { data: expense, error: insertErr } = await serviceClient
      .from('expenses')
      .insert({
        expense_date:   new Date().toISOString().split('T')[0],
        account_code:   '6001',
        amount,
        description:    `${TEST_RUN_ID}expense-${paymentMethod}`,
        payment_method: paymentMethod,
        recorded_by:    userIds.superadmin,
        category:       'other',
      })
      .select()
      .single()
    if (insertErr || !expense) throw new Error(`expense insert failed: ${insertErr?.message}`)
    expenseIds.add(expense.id)

    const creditAccount = paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' ? '1001' : '1000'
    const { data: journalEntryId, error: rpcErr } = await rpc('post_journal_entry', {
      p_entry_date:     expense.expense_date,
      p_description:    `Electricity: ${expense.description}`,
      p_reference_type: 'expense',
      p_reference_id:   expense.id,
      p_currency:       'PKR',
      p_exchange_rate:  1.0,
      p_lines: [
        { account_code: '6001',        direction: 'debit',  amount: amount.toString(), description: expense.description },
        { account_code: creditAccount, direction: 'credit', amount: amount.toString(), description: 'Cash paid' },
      ],
      p_created_by: userIds.superadmin,
    })
    if (rpcErr || !journalEntryId) throw new Error(`expense journal post failed: ${rpcErr?.message}`)
    journalEntryIds.add(journalEntryId as string)
    await serviceClient.from('expenses').update({ journal_entry_id: journalEntryId as string }).eq('id', expense.id)

    return { expense, journalEntryId: journalEntryId as string }
  }

  it('cash expense: debits the 6xxx account, credits 1000 Cash, balances, reference_type=expense', async () => {
    const { expense, journalEntryId } = await postExpense('cash')
    const entry = await getJournalEntryById(journalEntryId)
    expect(entry.reference_type).toBe('expense')
    expect(entry.reference_id).toBe(expense.id)
    const lines = await getJournalLines(journalEntryId)
    expect(findLine(lines, '6001', 'debit')!.amount_pkr).toBeCloseTo(500, 2)
    expect(findLine(lines, '1000', 'credit')!.amount_pkr).toBeCloseTo(500, 2)
    assertBalanced(lines)
  })

  it('bank_transfer expense: credits 1001 Bank Account (NOT 1000 Cash); balances', async () => {
    const { journalEntryId } = await postExpense('bank_transfer')
    const lines = await getJournalLines(journalEntryId)
    expect(findLine(lines, '1001', 'credit')).toBeDefined()
    expect(findLine(lines, '1000', 'credit')).toBeUndefined()
    assertBalanced(lines)
  })

  it('cheque expense: credits 1001 Bank Account; balances', async () => {
    const { journalEntryId } = await postExpense('cheque')
    const lines = await getJournalLines(journalEntryId)
    expect(findLine(lines, '1001', 'credit')).toBeDefined()
    assertBalanced(lines)
  })

  describe('expense void', () => {
    it('creates a reversal entry (debits/credits opposite), marks original reversed, reversal balances', async () => {
      const { expense, journalEntryId: originalId } = await postExpense('cash', 300)
      const originalLines = await getJournalLines(originalId)

      const reversedLines = originalLines.map(l => ({
        account_code: l.account_code,
        direction:    l.direction === 'debit' ? 'credit' : 'debit',
        amount:       l.amount.toString(),
        description:  `[Void] ${l.description ?? ''}`,
      }))

      const { data: reversalId, error: rpcErr } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `Void: ${expense.description}`,
        p_reference_type: 'expense_void',
        p_reference_id:   expense.id,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines:          reversedLines,
        p_created_by:     userIds.superadmin,
      })
      if (rpcErr || !reversalId) throw new Error(`void reversal failed: ${rpcErr?.message}`)
      journalEntryIds.add(reversalId as string)

      const { error: markErr } = await rpc('mark_entry_reversed', {
        p_original_id: originalId,
        p_reversal_id: reversalId,
      })
      expect(markErr).toBeNull()

      await serviceClient.from('expenses').update({
        is_voided: true, voided_at: new Date().toISOString(), voided_by: userIds.superadmin,
        void_journal_entry_id: reversalId as string,
      }).eq('id', expense.id)

      const reversalLines = await getJournalLines(reversalId as string)
      expect(findLine(reversalLines, '6001', 'credit')).toBeDefined()
      expect(findLine(reversalLines, '1000', 'debit')).toBeDefined()
      assertBalanced(reversalLines)

      const original = await getJournalEntryById(originalId)
      expect(original.status).toBe('reversed')
    })
  })
})

// =============================================================================
// 1.6 recordSupplierPayment() Accounting
// =============================================================================
describe('recordSupplierPayment() accounting', () => {

  async function postSupplierPayment(paymentMethod: 'cash' | 'bank_transfer' | 'cheque', amount = 1000) {
    const supplier = await makeSupplier()
    const { data: payment, error: insertErr } = await serviceClient
      .from('supplier_payments')
      .insert({
        supplier_id: supplier.id, amount, payment_date: new Date().toISOString().split('T')[0],
        payment_method: paymentMethod, notes: `${TEST_RUN_ID}supplier-payment`, created_by: userIds.superadmin,
      })
      .select()
      .single()
    if (insertErr || !payment) throw new Error(`supplier_payments insert failed: ${insertErr?.message}`)
    supplierPaymentIds.add(payment.id)

    const creditAccount = paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' ? '1001' : '1000'
    const { data: journalEntryId, error: rpcErr } = await rpc('post_journal_entry', {
      p_entry_date:     payment.payment_date,
      p_description:    `Payment to ${supplier.name}`,
      p_reference_type: 'supplier_payment',
      p_reference_id:   payment.id,
      p_currency:       'PKR',
      p_exchange_rate:  1.0,
      p_lines: [
        { account_code: '2000', direction: 'debit', amount: amount.toString(), party_type: 'supplier', party_id: supplier.id, description: 'AP reduction' },
        { account_code: creditAccount, direction: 'credit', amount: amount.toString(), description: 'Payment' },
      ],
      p_created_by: userIds.superadmin,
    })
    if (rpcErr || !journalEntryId) throw new Error(`supplier payment journal post failed: ${rpcErr?.message}`)
    journalEntryIds.add(journalEntryId as string)
    await serviceClient.from('supplier_payments').update({ journal_entry_id: journalEntryId as string }).eq('id', payment.id)

    return { supplier, payment, journalEntryId: journalEntryId as string }
  }

  it('cash payment: debits 2000 AP (party=supplier), credits 1000 Cash, reference matches payment id, balances', async () => {
    const { supplier, payment, journalEntryId } = await postSupplierPayment('cash')
    const entry = await getJournalEntryById(journalEntryId)
    expect(entry.reference_type).toBe('supplier_payment')
    expect(entry.reference_id).toBe(payment.id)

    const lines = await getJournalLines(journalEntryId)
    const apLine = findLine(lines, '2000', 'debit')!
    expect(apLine.party_type).toBe('supplier')
    expect(apLine.party_id).toBe(supplier.id)
    expect(findLine(lines, '1000', 'credit')).toBeDefined()
    assertBalanced(lines)

    const { data: paymentRow } = await serviceClient.from('supplier_payments').select('journal_entry_id').eq('id', payment.id).single()
    expect(paymentRow!.journal_entry_id).toBe(journalEntryId)
  })

  it('bank_transfer payment: credits 1001 Bank Account (NOT 1000 Cash); balances', async () => {
    const { journalEntryId } = await postSupplierPayment('bank_transfer')
    const lines = await getJournalLines(journalEntryId)
    expect(findLine(lines, '1001', 'credit')).toBeDefined()
    expect(findLine(lines, '1000', 'credit')).toBeUndefined()
    assertBalanced(lines)
  })

  it('cheque payment: credits 1001 Bank Account; balances', async () => {
    const { journalEntryId } = await postSupplierPayment('cheque')
    const lines = await getJournalLines(journalEntryId)
    expect(findLine(lines, '1001', 'credit')).toBeDefined()
    assertBalanced(lines)
  })
})

// =============================================================================
// 1.7 recordCustomerPayment() Accounting (Atomic RPC record_customer_payment)
// =============================================================================
describe('recordCustomerPayment() accounting', () => {

  it('cash payment: debits 1000 Cash, credits 1100 AR (party=customer), reference matches payment id, decrements credit_balance, balances', async () => {
    const customer = await makeCustomer({ credit_balance: 500 })

    const { data: paymentId, error } = await rpc('record_customer_payment', {
      p_customer_id:    customer.id,
      p_amount:         200,
      p_payment_method: 'cash',
      p_reference_no:   null,
      p_notes:          `${TEST_RUN_ID}customer-payment`,
      p_recorded_by:    userIds.superadmin,
    })
    if (error || !paymentId) throw new Error(`record_customer_payment failed: ${error?.message}`)
    customerPaymentIds.add(paymentId as string)

    const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
    expect(paymentRow!.journal_entry_id).toBeTruthy()
    journalEntryIds.add(paymentRow!.journal_entry_id as string)

    const entry = await getJournalEntryById(paymentRow!.journal_entry_id as string)
    expect(entry.reference_type).toBe('customer_payment')
    expect(entry.reference_id).toBe(paymentId)

    const lines = await getJournalLines(entry.id)
    expect(findLine(lines, '1000', 'debit')!.amount_pkr).toBeCloseTo(200, 2)
    const arLine = findLine(lines, '1100', 'credit')!
    expect(arLine.amount_pkr).toBeCloseTo(200, 2)
    expect(arLine.party_type).toBe('customer')
    expect(arLine.party_id).toBe(customer.id)
    assertBalanced(lines)

    const { data: custRow } = await serviceClient.from('customers').select('credit_balance').eq('id', customer.id).single()
    expect(Number(custRow!.credit_balance)).toBeCloseTo(300, 2)
  })

  it('bank_transfer payment: debits 1001 Bank Account (NOT 1000 Cash); balances', async () => {
    const customer = await makeCustomer({ credit_balance: 500 })
    const { data: paymentId, error } = await rpc('record_customer_payment', {
      p_customer_id: customer.id, p_amount: 150, p_payment_method: 'bank_transfer',
      p_reference_no: null, p_notes: `${TEST_RUN_ID}customer-payment-bank`, p_recorded_by: userIds.superadmin,
    })
    if (error || !paymentId) throw new Error(`record_customer_payment (bank) failed: ${error?.message}`)
    customerPaymentIds.add(paymentId as string)

    const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
    journalEntryIds.add(paymentRow!.journal_entry_id as string)
    const lines = await getJournalLines(paymentRow!.journal_entry_id as string)
    expect(findLine(lines, '1001', 'debit')).toBeDefined()
    expect(findLine(lines, '1000', 'debit')).toBeUndefined()
    assertBalanced(lines)
  })

  describe('atomicity (Gap 5)', () => {
    it('journal entry and credit_balance update happen together (both present after a successful call)', async () => {
      const customer = await makeCustomer({ credit_balance: 100 })
      const { data: paymentId, error } = await rpc('record_customer_payment', {
        p_customer_id: customer.id, p_amount: 100, p_payment_method: 'cash',
        p_reference_no: null, p_notes: `${TEST_RUN_ID}atomic`, p_recorded_by: userIds.superadmin,
      })
      if (error || !paymentId) throw new Error(`record_customer_payment (atomic) failed: ${error?.message}`)
      customerPaymentIds.add(paymentId as string)

      const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
      expect(paymentRow!.journal_entry_id).toBeTruthy()
      journalEntryIds.add(paymentRow!.journal_entry_id as string)

      const { data: custRow } = await serviceClient.from('customers').select('credit_balance').eq('id', customer.id).single()
      expect(Number(custRow!.credit_balance)).toBeCloseTo(0, 2)
    })

    it('documents behaviour when amount exceeds credit_balance (RPC has no guard — only the server action pre-checks)', async () => {
      const customer = await makeCustomer({ credit_balance: 50 })
      const { data: paymentId, error } = await rpc('record_customer_payment', {
        p_customer_id: customer.id, p_amount: 500, p_payment_method: 'cash',
        p_reference_no: null, p_notes: `${TEST_RUN_ID}overpay`, p_recorded_by: userIds.superadmin,
      })
      if (paymentId) customerPaymentIds.add(paymentId as string)

      if (error) {
        console.log('[overpayment] RPC rejected overpayment:', error.message)
      } else {
        const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
        journalEntryIds.add(paymentRow!.journal_entry_id as string)
        const { data: custRow } = await serviceClient.from('customers').select('credit_balance').eq('id', customer.id).single()
        console.log(
          `[overpayment] FINDING: record_customer_payment() has no overpayment guard — ` +
          `credit_balance went from 50 to ${custRow!.credit_balance} (negative). ` +
          `The Rs-exceeds-outstanding check lives only in recordCustomerPayment() (app/actions/ledger.ts), ` +
          `not in the RPC itself.`,
        )
        expect(Number(custRow!.credit_balance)).toBeLessThan(0)
      }
    })
  })
})

// =============================================================================
// 1.8 Borrowing Accounting
// (completeBorrowingSale / lendToPharmacy are server actions requiring an
//  authenticated session; the exact journal lines they build are replicated
//  here directly against post_journal_entry() — see file header)
// =============================================================================
describe('borrowing accounting', () => {

  async function makeBorrowingPharmacy() {
    const { data, error } = await serviceClient
      .from('borrowing_pharmacies')
      .insert({ name: `${TEST_RUN_ID}Pharmacy-${uniqueSuffix()}`, is_active: true, is_deleted: false })
      .select()
      .single()
    if (error || !data) throw new Error(`borrowing_pharmacies insert failed: ${error?.message}`)
    borrowingPharmacyIds.add(data.id)
    return data
  }

  describe('borrow_in (we receive stock from another pharmacy to fulfil a sale)', () => {
    it('debits 1200 Inventory, credits 2010 Borrowing Payable, reference_type=borrowing_in, balances', async () => {
      const pharmacy = await makeBorrowingPharmacy()
      const total = (3 * 25).toString()

      const { data: journalEntryId, error } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `Borrow-in: ${TEST_RUN_ID}medicine x3`,
        p_reference_type: 'borrowing_in',
        p_reference_id:   null,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines: [
          { account_code: '1200', direction: 'debit',  amount: total, party_type: 'pharmacy', party_id: pharmacy.id, description: 'Borrowed inventory' },
          { account_code: '2010', direction: 'credit', amount: total, party_type: 'pharmacy', party_id: pharmacy.id, description: 'Borrowing payable' },
        ],
        p_created_by: userIds.pharmacist,
      })
      if (error || !journalEntryId) throw new Error(`borrow_in post failed: ${error?.message}`)
      journalEntryIds.add(journalEntryId as string)

      const entry = await getJournalEntryById(journalEntryId as string)
      expect(entry.reference_type).toBe('borrowing_in')
      const lines = await getJournalLines(journalEntryId as string)
      expect(findLine(lines, '1200', 'debit')!.amount_pkr).toBeCloseTo(75, 2)
      expect(findLine(lines, '2010', 'credit')!.amount_pkr).toBeCloseTo(75, 2)
      assertBalanced(lines)
    })
  })

  describe('borrow_out (we lend stock to another pharmacy)', () => {
    it('debits 1110 Borrowing Receivable, credits 1200 Inventory, reference_type=borrowing_out, balances', async () => {
      const pharmacy = await makeBorrowingPharmacy()
      const total = (2 * 40).toString()

      const { data: journalEntryId, error } = await rpc('post_journal_entry', {
        p_entry_date:     new Date().toISOString().split('T')[0],
        p_description:    `Lend to ${pharmacy.name}: ${TEST_RUN_ID}medicine x2`,
        p_reference_type: 'borrowing_out',
        p_reference_id:   null,
        p_currency:       'PKR',
        p_exchange_rate:  1.0,
        p_lines: [
          { account_code: '1110', direction: 'debit',  amount: total, party_type: 'pharmacy', party_id: pharmacy.id, description: 'Receivable' },
          { account_code: '1200', direction: 'credit', amount: total, description: 'Inventory lent' },
        ],
        p_created_by: userIds.pharmacist,
      })
      if (error || !journalEntryId) throw new Error(`borrow_out post failed: ${error?.message}`)
      journalEntryIds.add(journalEntryId as string)

      const entry = await getJournalEntryById(journalEntryId as string)
      expect(entry.reference_type).toBe('borrowing_out')
      const lines = await getJournalLines(journalEntryId as string)
      expect(findLine(lines, '1110', 'debit')!.amount_pkr).toBeCloseTo(80, 2)
      expect(findLine(lines, '1200', 'credit')!.amount_pkr).toBeCloseTo(80, 2)
      assertBalanced(lines)
    })
  })
})
