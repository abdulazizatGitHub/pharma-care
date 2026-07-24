/**
 * Smoke Tests (Phase 16D)
 * End-to-end scenarios verifying complete business flows produce correct
 * results across ALL layers at once (DB records, journal entries, stock
 * movements, party ledger visibility) — the "if anything works, these must
 * work" tests.
 *
 * Talks directly to the dev Supabase project via RPCs and the service-role
 * client — does NOT require the Next.js dev server or an authenticated HTTP
 * session. Reuses the Phase 16A/16B/16C infrastructure in
 * tests/helpers/test-client.ts; no new factories were needed, as expected.
 *
 * FIXED (migration 036, was Phase 16C KNOWN BUG): get_financial_summary(),
 * get_balance_sheet(), get_trial_balance(), get_cash_book(), and
 * get_party_ledger() previously undercounted when a reversal landed in the
 * same query window as its original — the original was fully excluded once
 * marked 'reversed', while the reversal entry counted as ordinary new
 * activity. All five now filter on status IN ('posted', 'reversed'), so a
 * reversal nets to zero against its original — see 4.6 below.
 */

import {
  serviceClient, rpc, TEST_RUN_ID, getTestUserIds, uniqueSuffix,
  createTestMedicine, createTestBatch, createTestSupplier, createTestCustomer,
  createTestPO, approveTestPO, getBatchQty,
  getJournalEntry, getJournalEntryById, getJournalLines, findLine, assertBalanced,
  cleanupJournalEntries, closePool, ensureOpenShift, closeShiftIfCreated,
} from './helpers/test-client'

jest.setTimeout(60000)

let userIds: { superadmin: string; admin: string; pharmacist: string }
let testShift: { shiftId: string; created: boolean }
const today = new Date().toISOString().split('T')[0]

const journalEntryIds = new Set<string>()
const saleIds         = new Set<string>()
const grnIds          = new Set<string>()
const poIds           = new Set<string>()
const returnIds       = new Set<string>()
const expenseIds      = new Set<string>()
const supplierPaymentIds = new Set<string>()
const customerPaymentIds = new Set<string>()
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
  items:        Array<{ batch_id: string; quantity: number; unit_price: number }>
  discountAmt?: number
}) {
  const { data, error } = await rpc<{ sale_id: string; receipt_no: string; total: number }>('complete_sale', {
    p_cashier_id:   userIds.pharmacist,
    p_customer_id:  input.customerId ?? null,
    p_payment_type: input.paymentType ?? 'cash',
    p_items:        input.items,
    p_discount_amt: input.discountAmt ?? 0,
    p_bag_charge:   0,
    p_amount_paid:  100000,
    p_notes:        `${TEST_RUN_ID}smoke-sale`,
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
}) {
  const { data, error } = await rpc<any>('process_return', {
    p_original_sale_id: input.saleId,
    p_return_items:     input.returnItems,
    p_exchange_items:   null,
    p_reason:           `${TEST_RUN_ID}smoke-return`,
    p_pack_opened:      false,
    p_requested_by:     userIds.pharmacist,
    p_return_id:        null,
  })
  if (error) return { data: null, error }
  if (data.return_id) returnIds.add(data.return_id)
  if (data.status === 'pending_approval') {
    const { data: approved, error: err2 } = await rpc<any>('process_return', {
      p_original_sale_id: null, p_return_items: null, p_exchange_items: null, p_reason: null,
      p_pack_opened: false, p_requested_by: userIds.superadmin, p_return_id: data.return_id,
    })
    if (!err2 && approved?.journal_entry_id) journalEntryIds.add(approved.journal_entry_id)
    return { data: approved, error: err2 }
  }
  if (data.journal_entry_id) journalEntryIds.add(data.journal_entry_id)
  return { data, error: null }
}

async function postExpense(amount: number, description: string) {
  const { data: expense } = await serviceClient.from('expenses').insert({
    expense_date: today, account_code: '6001', amount, description,
    payment_method: 'cash', recorded_by: userIds.superadmin, category: 'other',
  }).select().single()
  expenseIds.add(expense!.id)

  const { data: journalEntryId, error } = await rpc<string>('post_journal_entry', {
    p_entry_date: today, p_description: `Electricity: ${description}`, p_reference_type: 'expense',
    p_reference_id: expense!.id, p_currency: 'PKR', p_exchange_rate: 1.0,
    p_lines: [
      { account_code: '6001', direction: 'debit',  amount: amount.toString(), description },
      { account_code: '1000', direction: 'credit', amount: amount.toString(), description: 'Cash paid' },
    ],
    p_created_by: userIds.superadmin,
  })
  if (error || !journalEntryId) throw new Error(`postExpense failed: ${error?.message}`)
  journalEntryIds.add(journalEntryId)
  await serviceClient.from('expenses').update({ journal_entry_id: journalEntryId }).eq('id', expense!.id)
  return { expenseId: expense!.id as string, journalEntryId }
}

async function voidExpense(expenseId: string, journalEntryId: string) {
  const lines = await getJournalLines(journalEntryId)
  const reversedLines = lines.map(l => ({
    account_code: l.account_code, direction: l.direction === 'debit' ? 'credit' : 'debit',
    amount: l.amount.toString(), description: `[Void] ${l.description ?? ''}`,
  }))
  const { data: reversalId, error } = await rpc<string>('post_journal_entry', {
    p_entry_date: today, p_description: `${TEST_RUN_ID}void`, p_reference_type: 'expense_void',
    p_reference_id: expenseId, p_currency: 'PKR', p_exchange_rate: 1.0, p_lines: reversedLines,
    p_created_by: userIds.superadmin,
  })
  if (error || !reversalId) throw new Error(`voidExpense failed: ${error?.message}`)
  journalEntryIds.add(reversalId)
  const { error: markErr } = await serviceClient.rpc('mark_entry_reversed', { p_original_id: journalEntryId, p_reversal_id: reversalId })
  if (markErr) throw new Error(`mark_entry_reversed failed: ${markErr.message}`)
  await serviceClient.from('expenses').update({ is_voided: true, voided_at: new Date().toISOString(), voided_by: userIds.superadmin, void_journal_entry_id: reversalId }).eq('id', expenseId)
  return reversalId
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
    if (expenseIds.size)         await step('expenses', () => serviceClient.from('expenses').delete().in('id', [...expenseIds]))
    if (supplierPaymentIds.size) await step('supplier_payments', () => serviceClient.from('supplier_payments').delete().in('id', [...supplierPaymentIds]))
    if (customerPaymentIds.size) await step('customer_payments', () => serviceClient.from('customer_payments').delete().in('id', [...customerPaymentIds]))
    if (returnIds.size) {
      const ids = [...returnIds]
      await step('return_items', () => serviceClient.from('return_items').delete().in('return_id', ids))
      await step('returns', () => serviceClient.from('returns').delete().in('id', ids))
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
    if (customerIds.size) await step('customers', () => serviceClient.from('customers').delete().in('id', [...customerIds]))
    await step('shift', () => closeShiftIfCreated(testShift.shiftId, testShift.created))
  } finally {
    await closePool()
  }
})

// =============================================================================
// 4.1 Complete Sale Flow
// =============================================================================
describe('SMOKE: complete sale -> journal -> stock', () => {

  it('end-to-end cash sale: sale row, sale_items, balanced journal entry, stock deduction', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100, purchase_price: 50, mrp: 100 } })

    const { data: sale, error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 5, unit_price: 80 }] })
    if (error) throw new Error(`complete_sale failed: ${error.message}`)

    const { data: saleRow } = await serviceClient.from('sales').select('*').eq('id', sale!.sale_id).single()
    expect(saleRow).not.toBeNull()
    expect(Number(saleRow!.total_amount)).toBeCloseTo(400, 2)

    const items = await getSaleItems(sale!.sale_id)
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(5)
    expect(Number(items[0].unit_price)).toBeCloseTo(80, 2)

    const entry = await getJournalEntry('sale', sale!.sale_id)
    expect(entry).not.toBeNull()
    expect(entry.reference_type).toBe('sale')
    expect(entry.status).toBe('posted')

    const lines = await getJournalLines(entry.id)
    expect(findLine(lines, '1000', 'debit')!.amount_pkr).toBeCloseTo(400, 2)
    expect(findLine(lines, '4000', 'credit')!.amount_pkr).toBeCloseTo(400, 2)
    expect(findLine(lines, '5000', 'debit')!.amount_pkr).toBeCloseTo(250, 2)  // 5 x 50 purchase_price
    expect(findLine(lines, '1200', 'credit')!.amount_pkr).toBeCloseTo(250, 2)
    assertBalanced(lines)

    expect(await getBatchQty(batch.id)).toBe(95) // 100 - 5
  })
})

// =============================================================================
// 4.2 GRN Flow
// =============================================================================
describe('SMOKE: GRN -> journal -> stock', () => {

  it('end-to-end goods receipt: grn row, stock batches, balanced journal entry with party columns', async () => {
    const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
    const medA = await createTestMedicine(); medicineIds.add(medA.id)
    const medB = await createTestMedicine(); medicineIds.add(medB.id)

    const po = await createTestPO(supplier.id, [
      { medicine_id: medA.id, quantity: 20, unit_price: 40 },
      { medicine_id: medB.id, quantity: 10, unit_price: 60 },
    ])
    poIds.add(po.id)
    await approveTestPO(po.id)

    const batchANo = `${TEST_RUN_ID}SGA-${uniqueSuffix()}`
    const batchBNo = `${TEST_RUN_ID}SGB-${uniqueSuffix()}`
    const { data: grnId, error } = await rpc<string>('complete_grn', {
      p_po_id: po.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}smoke-grn`,
      p_items: [
        { medicine_id: medA.id, batch_no: batchANo, expiry_date: '2028-01-01', quantity: 20, unit_price: 40 },
        { medicine_id: medB.id, batch_no: batchBNo, expiry_date: '2028-06-01', quantity: 10, unit_price: 60 },
      ],
      p_is_partial: false,
    })
    if (error || !grnId) throw new Error(`complete_grn failed: ${error?.message}`)
    grnIds.add(grnId)

    const { data: grnRow } = await serviceClient.from('goods_receipts').select('*').eq('id', grnId).single()
    expect(grnRow).not.toBeNull()
    expect(Number(grnRow!.total_amount)).toBeCloseTo(20 * 40 + 10 * 60, 2) // 1400

    const { data: newBatches } = await serviceClient.from('stock_batches').select('*').eq('grn_id', grnId)
    for (const b of newBatches ?? []) batchIds.add(b.id)
    expect(newBatches).toHaveLength(2)
    const batchA = newBatches!.find(b => b.batch_no === batchANo)!
    expect(Number(batchA.quantity)).toBe(20)
    expect(Number(batchA.purchase_price)).toBeCloseTo(40, 2)
    expect(batchA.expiry_date).toBe('2028-01-01')

    const entry = await getJournalEntry('grn', grnId)
    expect(entry).not.toBeNull()
    expect(entry.reference_type).toBe('grn')
    journalEntryIds.add(entry.id)

    const lines = await getJournalLines(entry.id)
    expect(findLine(lines, '1200', 'debit')!.amount_pkr).toBeCloseTo(1400, 2)
    const apLine = findLine(lines, '2000', 'credit')!
    expect(apLine.amount_pkr).toBeCloseTo(1400, 2)
    expect(apLine.party_type).toBe('supplier')
    expect(apLine.party_id).toBe(supplier.id)
    assertBalanced(lines)
  })
})

// =============================================================================
// 4.3 Return Flow
// =============================================================================
describe('SMOKE: sale -> return -> journal reversal -> stock restore', () => {

  it('end-to-end return: partial stock restore, balanced reversal journal entry', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 100 } })

    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 10, unit_price: 50 }] })
    if (saleErr) throw new Error(`complete_sale failed: ${saleErr.message}`)
    expect(await getBatchQty(batch.id)).toBe(90)

    const items = await getSaleItems(sale!.sale_id)
    const { data: returnResult, error: returnErr } = await newReturn({
      saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 5 }],
    })
    if (returnErr) throw new Error(`process_return failed: ${returnErr.message}`)
    expect(returnResult!.status).toBe('completed')

    expect(await getBatchQty(batch.id)).toBe(95) // 90 + 5 restored

    const entry = await getJournalEntryById(returnResult!.journal_entry_id)
    expect(entry.reference_type).toBe('sale_return')

    const lines = await getJournalLines(entry.id)
    expect(findLine(lines, '4000', 'debit')).toBeDefined()   // reverse revenue
    expect(findLine(lines, '1000', 'credit')).toBeDefined()  // refund cash
    expect(findLine(lines, '1200', 'debit')).toBeDefined()   // inventory restored
    expect(findLine(lines, '5000', 'credit')).toBeDefined()  // COGS reversed
    assertBalanced(lines)
  })
})

// =============================================================================
// 4.4 Supplier Payment Flow
// =============================================================================
describe('SMOKE: GRN -> supplier payment -> party ledger', () => {

  it('end-to-end supplier payment: AP debit, cash credit, party ledger shows both GRN and payment netting correctly', async () => {
    const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
    const medicine = await createTestMedicine(); medicineIds.add(medicine.id)

    const po = await createTestPO(supplier.id, [{ medicine_id: medicine.id, quantity: 10, unit_price: 100 }])
    poIds.add(po.id)
    await approveTestPO(po.id)

    const { data: grnId, error: grnErr } = await rpc<string>('complete_grn', {
      p_po_id: po.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}smoke-grn-payment`,
      p_items: [{ medicine_id: medicine.id, batch_no: `${TEST_RUN_ID}SPB-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity: 10, unit_price: 100 }],
      p_is_partial: false,
    })
    if (grnErr || !grnId) throw new Error(`complete_grn failed: ${grnErr?.message}`)
    grnIds.add(grnId)
    const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
    for (const b of newBatches ?? []) batchIds.add(b.id)
    const grnEntry = await getJournalEntry('grn', grnId)
    journalEntryIds.add(grnEntry.id)
    // GRN total = 1000

    const paymentAmount = 500 // half the GRN value
    const { data: payment } = await serviceClient.from('supplier_payments').insert({
      supplier_id: supplier.id, amount: paymentAmount, payment_date: today, payment_method: 'cash',
      notes: `${TEST_RUN_ID}smoke-payment`, created_by: userIds.superadmin,
    }).select().single()
    supplierPaymentIds.add(payment!.id)

    const { data: paymentJournalId, error: payErr } = await rpc<string>('post_journal_entry', {
      p_entry_date: today, p_description: `${TEST_RUN_ID}Payment to ${supplier.name}`, p_reference_type: 'supplier_payment',
      p_reference_id: payment!.id, p_currency: 'PKR', p_exchange_rate: 1.0,
      p_lines: [
        { account_code: '2000', direction: 'debit', amount: paymentAmount.toString(), party_type: 'supplier', party_id: supplier.id, description: 'AP reduction' },
        { account_code: '1000', direction: 'credit', amount: paymentAmount.toString(), description: 'Payment' },
      ],
      p_created_by: userIds.superadmin,
    })
    if (payErr || !paymentJournalId) throw new Error(`payment journal post failed: ${payErr?.message}`)
    journalEntryIds.add(paymentJournalId)
    await serviceClient.from('supplier_payments').update({ journal_entry_id: paymentJournalId }).eq('id', payment!.id)

    const paymentLines = await getJournalLines(paymentJournalId)
    const apLine = findLine(paymentLines, '2000', 'debit')!
    expect(apLine.amount_pkr).toBeCloseTo(paymentAmount, 2)
    expect(apLine.party_type).toBe('supplier')
    expect(findLine(paymentLines, '1000', 'credit')!.amount_pkr).toBeCloseTo(paymentAmount, 2)
    assertBalanced(paymentLines)

    const { data: ledgerRows, error: ledgerErr } = await serviceClient.rpc('get_party_ledger', {
      p_party_type: 'supplier', p_party_id: supplier.id, p_date_from: null, p_date_to: null,
    })
    if (ledgerErr) throw new Error(`get_party_ledger failed: ${ledgerErr.message}`)
    const rows = ledgerRows as { entry_id: string; debit_amount: number; credit_amount: number }[]

    const grnRow = rows.find(r => r.entry_id === grnEntry.id)!
    expect(Number(grnRow.credit_amount)).toBeCloseTo(1000, 2)
    const paymentRow = rows.find(r => r.entry_id === paymentJournalId)!
    expect(Number(paymentRow.debit_amount)).toBeCloseTo(500, 2)

    // Net balance = GRN (credit, we owe) - payment (debit, reduces what we owe) = 1000 - 500 = 500 still owed.
    // running_balance sign convention: SUM(debit - credit) — positive = net debit (receivable-style);
    // here the relevant net-owed figure is credit total - debit total for THESE two rows.
    const netOwed = Number(grnRow.credit_amount) - Number(paymentRow.debit_amount)
    expect(netOwed).toBeCloseTo(500, 2)
  })
})

// =============================================================================
// 4.5 Customer Credit Flow
// =============================================================================
describe('SMOKE: credit sale -> customer payment -> ledger', () => {

  it('end-to-end udhaar cycle: credit_balance tracking, AR journal lines, party ledger visibility', async () => {
    const customer = await createTestCustomer({ credit_balance: 0, credit_limit: 100000 })
    customerIds.add(customer.id)
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20, mrp: 1200 } })

    const { data: sale, error: saleErr } = await callCompleteSale({
      paymentType: 'credit', customerId: customer.id, items: [{ batch_id: batch.id, quantity: 1, unit_price: 1000 }],
    })
    if (saleErr) throw new Error(`credit sale failed: ${saleErr.message}`)

    const { data: custAfterSale } = await serviceClient.from('customers').select('credit_balance').eq('id', customer.id).single()
    expect(Number(custAfterSale!.credit_balance)).toBeCloseTo(1000, 2)

    const saleEntry = await getJournalEntry('sale', sale!.sale_id)
    const saleLines = await getJournalLines(saleEntry.id)
    const arLine = findLine(saleLines, '1100', 'debit')!
    expect(arLine.amount_pkr).toBeCloseTo(1000, 2)
    expect(arLine.party_type).toBe('customer')
    expect(findLine(saleLines, '1000', 'debit')).toBeUndefined()
    assertBalanced(saleLines)

    const { data: paymentId, error: payErr } = await rpc<string>('record_customer_payment', {
      p_customer_id: customer.id, p_amount: 400, p_payment_method: 'cash',
      p_reference_no: null, p_notes: `${TEST_RUN_ID}smoke-cust-payment`, p_recorded_by: userIds.superadmin,
    })
    if (payErr || !paymentId) throw new Error(`record_customer_payment failed: ${payErr?.message}`)
    customerPaymentIds.add(paymentId)

    const { data: custAfterPayment } = await serviceClient.from('customers').select('credit_balance').eq('id', customer.id).single()
    expect(Number(custAfterPayment!.credit_balance)).toBeCloseTo(600, 2) // 1000 - 400

    const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
    journalEntryIds.add(paymentRow!.journal_entry_id as string)
    const paymentLines = await getJournalLines(paymentRow!.journal_entry_id as string)
    expect(findLine(paymentLines, '1000', 'debit')!.amount_pkr).toBeCloseTo(400, 2)
    expect(findLine(paymentLines, '1100', 'credit')!.amount_pkr).toBeCloseTo(400, 2)
    assertBalanced(paymentLines)

    const { data: ledgerRows, error: ledgerErr } = await serviceClient.rpc('get_party_ledger', {
      p_party_type: 'customer', p_party_id: customer.id, p_date_from: null, p_date_to: null,
    })
    if (ledgerErr) throw new Error(`get_party_ledger failed: ${ledgerErr.message}`)
    const rows = ledgerRows as { entry_id: string; debit_amount: number; credit_amount: number }[]

    const saleRow = rows.find(r => r.entry_id === saleEntry.id)!
    expect(Number(saleRow.debit_amount)).toBeCloseTo(1000, 2) // customer owes
    const paymentLedgerRow = rows.find(r => r.entry_id === paymentRow!.journal_entry_id)!
    expect(Number(paymentLedgerRow.credit_amount)).toBeCloseTo(400, 2) // customer paid
  })
})

// =============================================================================
// 4.6 Expense + Void Flow
// =============================================================================
describe('SMOKE: expense -> void -> net zero', () => {

  it('end-to-end expense lifecycle: raw journal lines AND the report layer both net to zero (migration 036)', async () => {
    const expenseBefore = ((await serviceClient.rpc('get_financial_summary', { p_date_from: today, p_date_to: today })).data as
      { account_type: string; total_amount: number }[])
      .find(r => r.account_type === 'expense')
    const expenseTotalBefore = Number(expenseBefore?.total_amount ?? 0)

    const { expenseId, journalEntryId } = await postExpense(500, `${TEST_RUN_ID}smoke-expense`)

    const originalLines = await getJournalLines(journalEntryId)
    expect(findLine(originalLines, '6001', 'debit')!.amount_pkr).toBeCloseTo(500, 2)
    expect(findLine(originalLines, '1000', 'credit')!.amount_pkr).toBeCloseTo(500, 2)
    assertBalanced(originalLines)

    const reversalId = await voidExpense(expenseId, journalEntryId)
    const reversalLines = await getJournalLines(reversalId)
    expect(findLine(reversalLines, '1000', 'debit')!.amount_pkr).toBeCloseTo(500, 2)
    expect(findLine(reversalLines, '6001', 'credit')!.amount_pkr).toBeCloseTo(500, 2)
    assertBalanced(reversalLines)

    const original = await getJournalEntryById(journalEntryId)
    expect(original.status).toBe('reversed')

    // The RAW journal data nets to zero on 1000 Cash: the original CREDIT 500
    // (money out) plus the reversal DEBIT 500 (money back in) are equal and
    // opposite lines sitting side by side in journal_lines — that arithmetic
    // is correct and always will be, regardless of the report-layer bug below.
    const netOnCash = findLine(reversalLines, '1000', 'debit')!.amount_pkr - findLine(originalLines, '1000', 'credit')!.amount_pkr
    expect(netOnCash).toBeCloseTo(0, 2)

    // Migration 036 fix: get_financial_summary() now includes status IN
    // ('posted', 'reversed'), so the reversed original expense entry and its
    // 'posted' reversal both count and net to zero, matching the raw ledger.
    const expenseAfter = ((await serviceClient.rpc('get_financial_summary', { p_date_from: today, p_date_to: today })).data as
      { account_type: string; total_amount: number }[])
      .find(r => r.account_type === 'expense')
    const expenseTotalAfter = Number(expenseAfter?.total_amount ?? 0)
    expect(expenseTotalAfter - expenseTotalBefore).toBeCloseTo(0, 2)
  })
})

// =============================================================================
// 4.7 Discount Sale + Return (regression test for migration 035 Fix 3)
// =============================================================================
describe('SMOKE: discounted sale -> return -> proportional discount reversal', () => {

  it('a full return on a discounted sale reverses 4000, 4900, and cash to exactly zero net', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 20, mrp: 1200 } })

    // subtotal 1000 (10 x 100), discount 100 -> total 900
    const { data: sale, error: saleErr } = await callCompleteSale({
      items: [{ batch_id: batch.id, quantity: 10, unit_price: 100 }], discountAmt: 100,
    })
    if (saleErr) throw new Error(`discounted sale failed: ${saleErr.message}`)

    const saleEntry = await getJournalEntry('sale', sale!.sale_id)
    const saleLines = await getJournalLines(saleEntry.id)
    expect(findLine(saleLines, '4000', 'credit')!.amount_pkr).toBeCloseTo(1000, 2) // gross
    expect(findLine(saleLines, '4900', 'debit')!.amount_pkr).toBeCloseTo(100, 2)   // discount
    expect(findLine(saleLines, '1000', 'debit')!.amount_pkr).toBeCloseTo(900, 2)   // net cash
    assertBalanced(saleLines)

    const items = await getSaleItems(sale!.sale_id)
    const { data: returnResult, error: returnErr } = await newReturn({
      saleId: sale!.sale_id, returnItems: [{ sale_item_id: items[0].id, quantity_returned: 10 }], // full return
    })
    if (returnErr) throw new Error(`process_return failed: ${returnErr.message}`)

    const returnEntry = await getJournalEntryById(returnResult!.journal_entry_id)
    const returnLines = await getJournalLines(returnEntry.id)
    expect(findLine(returnLines, '4000', 'debit')!.amount_pkr).toBeCloseTo(1000, 2)  // reverse gross revenue
    expect(findLine(returnLines, '4900', 'credit')!.amount_pkr).toBeCloseTo(100, 2)  // reverse discount
    expect(findLine(returnLines, '1000', 'credit')!.amount_pkr).toBeCloseTo(900, 2)  // refund net cash
    assertBalanced(returnLines)

    // Net effect across both entries on each account = 0.
    const net4000 = findLine(saleLines, '4000', 'credit')!.amount_pkr - findLine(returnLines, '4000', 'debit')!.amount_pkr
    const net4900 = findLine(saleLines, '4900', 'debit')!.amount_pkr - findLine(returnLines, '4900', 'credit')!.amount_pkr
    const net1000 = findLine(saleLines, '1000', 'debit')!.amount_pkr - findLine(returnLines, '1000', 'credit')!.amount_pkr
    expect(net4000).toBeCloseTo(0, 2)
    expect(net4900).toBeCloseTo(0, 2)
    expect(net1000).toBeCloseTo(0, 2)
  })
})
