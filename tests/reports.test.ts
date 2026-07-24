/**
 * Report Function Tests (Phase 16C)
 * Verifies get_financial_summary(), get_balance_sheet(), get_trial_balance(),
 * get_cash_book(), get_party_ledger().
 *
 * These RPCs aggregate over the ENTIRE shared dev database, not just this
 * test run's own rows — there are months of prior Phase 16 test data (and
 * whatever real seed/demo data exists) already posted. Structural invariants
 * (debits=credits, Assets=L+E, NET row present) are tested by calling the
 * function once and checking the property holds — that's valid regardless of
 * data content, since the double-entry system guarantees it by construction.
 * Anything that needs to attribute a SPECIFIC number to THIS test's own data
 * uses a before/after DELTA instead of an absolute assertion, so unrelated
 * historical rows can't produce a false pass or false fail.
 *
 * Talks directly to the dev Supabase project — no dev server needed. Reuses
 * tests/helpers/test-client.ts (Phase 16A/16B/16C infrastructure).
 */

import {
  serviceClient, rpc, TEST_RUN_ID, getTestUserIds, uniqueSuffix,
  createTestMedicine, createTestBatch, createTestSupplier, createTestCustomer,
  getJournalEntry, getJournalLines, findLine, cleanupJournalEntries, closePool,
  ensureOpenShift, closeShiftIfCreated,
} from './helpers/test-client'

jest.setTimeout(60000)

let userIds: { superadmin: string; admin: string; pharmacist: string }
let testShift: { shiftId: string; created: boolean }

const journalEntryIds = new Set<string>()
const saleIds         = new Set<string>()
const grnIds          = new Set<string>()
const expenseIds      = new Set<string>()
const supplierPaymentIds = new Set<string>()
const customerPaymentIds = new Set<string>()
const medicineIds     = new Set<string>()
const batchIds        = new Set<string>()
const supplierIds     = new Set<string>()
const customerIds     = new Set<string>()

const today = new Date().toISOString().split('T')[0]

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
  notes?:       string
}) {
  const { data, error } = await rpc<{ sale_id: string; receipt_no: string }>('complete_sale', {
    p_cashier_id:   userIds.pharmacist,
    p_customer_id:  input.customerId ?? null,
    p_payment_type: input.paymentType ?? 'cash',
    p_items:        input.items,
    p_discount_amt: 0,
    p_bag_charge:   0,
    p_amount_paid:  100000,
    p_notes:        input.notes ?? `${TEST_RUN_ID}sale`,
  })
  if (!error && data?.sale_id) {
    saleIds.add(data.sale_id)
    const entry = await getJournalEntry('sale', data.sale_id)
    if (entry) journalEntryIds.add(entry.id)
  }
  return { data, error }
}

/** Mirrors app/actions/expenses.ts recordExpense() exactly. */
async function postExpense(amount: number, description: string, date = today) {
  const { data: expense } = await serviceClient.from('expenses').insert({
    expense_date: date, account_code: '6001', amount, description,
    payment_method: 'cash', recorded_by: userIds.superadmin, category: 'other',
  }).select().single()
  expenseIds.add(expense!.id)

  const { data: journalEntryId, error } = await rpc<string>('post_journal_entry', {
    p_entry_date: date, p_description: `Electricity: ${description}`, p_reference_type: 'expense',
    p_reference_id: expense!.id, p_currency: 'PKR', p_exchange_rate: 1.0,
    p_lines: [
      { account_code: '6001', direction: 'debit',  amount: amount.toString(), description },
      { account_code: '1000', direction: 'credit', amount: amount.toString(), description: 'Cash paid' },
    ],
    p_created_by: userIds.superadmin,
  })
  if (error || !journalEntryId) throw new Error(`postExpense journal failed: ${error?.message}`)
  journalEntryIds.add(journalEntryId)
  await serviceClient.from('expenses').update({ journal_entry_id: journalEntryId }).eq('id', expense!.id)
  return { expenseId: expense!.id as string, journalEntryId }
}

/** Mirrors app/actions/procurement.ts createGRN()'s downstream complete_grn() call. */
async function postGRN(supplierId: string, medicineId: string, quantity: number, unitPrice: number) {
  const { data: po } = await serviceClient.from('purchase_orders').insert({
    po_number: `${TEST_RUN_ID}PO-${uniqueSuffix()}`, supplier_id: supplierId, status: 'confirmed',
    total_amount: quantity * unitPrice,
  }).select().single()

  const { data: grnId, error } = await rpc<string>('complete_grn', {
    p_po_id: po!.id, p_received_by: userIds.admin, p_notes: `${TEST_RUN_ID}grn`,
    p_items: [{ medicine_id: medicineId, batch_no: `${TEST_RUN_ID}GB-${uniqueSuffix()}`, expiry_date: '2028-01-01', quantity, unit_price: unitPrice }],
    p_is_partial: false,
  })
  if (error || !grnId) throw new Error(`postGRN failed: ${error?.message}`)
  grnIds.add(grnId)
  await serviceClient.from('purchase_orders').update({ status: 'received' }).eq('id', po!.id) // already set by RPC; kept for clarity
  const { data: newBatches } = await serviceClient.from('stock_batches').select('id').eq('grn_id', grnId)
  for (const b of newBatches ?? []) batchIds.add(b.id)
  const entry = await getJournalEntry('grn', grnId)
  if (entry) journalEntryIds.add(entry.id)
  return { poId: po!.id as string, grnId }
}

/** Mirrors app/actions/ledger.ts recordSupplierPayment() exactly. */
async function postSupplierPayment(supplierId: string, amount: number) {
  const { data: payment } = await serviceClient.from('supplier_payments').insert({
    supplier_id: supplierId, amount, payment_date: today, payment_method: 'cash',
    notes: `${TEST_RUN_ID}payment`, created_by: userIds.superadmin,
  }).select().single()
  supplierPaymentIds.add(payment!.id)

  const { data: journalEntryId, error } = await rpc<string>('post_journal_entry', {
    p_entry_date: today, p_description: `${TEST_RUN_ID}Payment to supplier`, p_reference_type: 'supplier_payment',
    p_reference_id: payment!.id, p_currency: 'PKR', p_exchange_rate: 1.0,
    p_lines: [
      { account_code: '2000', direction: 'debit', amount: amount.toString(), party_type: 'supplier', party_id: supplierId, description: 'AP reduction' },
      { account_code: '1000', direction: 'credit', amount: amount.toString(), description: 'Payment' },
    ],
    p_created_by: userIds.superadmin,
  })
  if (error || !journalEntryId) throw new Error(`postSupplierPayment failed: ${error?.message}`)
  journalEntryIds.add(journalEntryId)
  await serviceClient.from('supplier_payments').update({ journal_entry_id: journalEntryId }).eq('id', payment!.id)
  return { paymentId: payment!.id as string, journalEntryId }
}

async function reverseJournalEntry(entryId: string, requestedBy: string) {
  const lines = await getJournalLines(entryId)
  const reversedLines = lines.map(l => ({
    account_code: l.account_code, direction: l.direction === 'debit' ? 'credit' : 'debit',
    amount: l.amount.toString(), description: `[Reversal] ${l.description ?? ''}`,
  }))
  const { data: reversalId, error } = await rpc<string>('post_journal_entry', {
    p_entry_date: today, p_description: `${TEST_RUN_ID}reversal`, p_reference_type: 'adjustment',
    p_reference_id: entryId, p_currency: 'PKR', p_exchange_rate: 1.0, p_lines: reversedLines, p_created_by: requestedBy,
  })
  if (error || !reversalId) throw new Error(`reverseJournalEntry failed: ${error?.message}`)
  journalEntryIds.add(reversalId)
  const { error: markErr } = await serviceClient.rpc('mark_entry_reversed', { p_original_id: entryId, p_reversal_id: reversalId })
  if (markErr) throw new Error(`mark_entry_reversed failed: ${markErr.message}`)
  return reversalId
}

async function financialSummaryMap(from: string, to: string) {
  const { data, error } = await serviceClient.rpc('get_financial_summary', { p_date_from: from, p_date_to: to })
  if (error) throw new Error(`get_financial_summary failed: ${error.message}`)
  const rows = (data ?? []) as { account_type: string; total_amount: number }[]
  return {
    revenue: Number(rows.find(r => r.account_type === 'revenue')?.total_amount ?? 0),
    cogs:    Number(rows.find(r => r.account_type === 'cogs')?.total_amount ?? 0),
    expense: Number(rows.find(r => r.account_type === 'expense')?.total_amount ?? 0),
  }
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
    // POs created by postGRN() aren't individually tracked — match by our prefix instead.
    await step('purchase_orders', () => serviceClient.from('purchase_orders').delete().like('po_number', `${TEST_RUN_ID}%`))

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
// 5.1 Financial Summary
// =============================================================================
describe('get_financial_summary()', () => {

  it('revenue/cogs/expense deltas match a known sale + expense exactly', async () => {
    const before = await financialSummaryMap(today, today)

    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10, purchase_price: 30 } })
    const { error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 2, unit_price: 80 }] }) // subtotal 160, cogs 60
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    await postExpense(45, `${TEST_RUN_ID}fin-summary-expense`)

    const after = await financialSummaryMap(today, today)

    expect(after.revenue - before.revenue).toBeCloseTo(160, 2)
    expect(after.cogs - before.cogs).toBeCloseTo(60, 2)
    expect(after.expense - before.expense).toBeCloseTo(45, 2)

    const grossProfitDelta = (after.revenue - before.revenue) - (after.cogs - before.cogs)
    const netProfitDelta   = grossProfitDelta - (after.expense - before.expense)
    expect(grossProfitDelta).toBeCloseTo(100, 2) // 160 - 60
    expect(netProfitDelta).toBeCloseTo(55, 2)     // 100 - 45
  })

  it('a sale AND its reversal in the same query window net to zero revenue (migration 036)', async () => {
    // get_financial_summary now includes status IN ('posted', 'reversed') — the reversed
    // original and its 'posted' reversal entry both count, so they net to zero naturally.
    const before = await financialSummaryMap(today, today)

    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 70 }] })
    if (error) throw new Error(`setup sale failed: ${error.message}`)
    const entry = await getJournalEntry('sale', sale!.sale_id)
    await reverseJournalEntry(entry.id, userIds.superadmin)

    const after = await financialSummaryMap(today, today)
    expect(after.revenue - before.revenue).toBeCloseTo(0, 2)
  })
})

// =============================================================================
// 5.2 Balance Sheet
// =============================================================================
describe('get_balance_sheet()', () => {

  it('satisfies the accounting equation: Assets = Liabilities + Equity', async () => {
    const { data, error } = await serviceClient.rpc('get_balance_sheet', { p_as_of_date: today })
    if (error) throw new Error(`get_balance_sheet failed: ${error.message}`)
    const rows = data as { section: string; balance: number }[]

    const totalAssets      = rows.filter(r => r.section === 'asset').reduce((s, r) => s + Number(r.balance), 0)
    const totalLiabilities = rows.filter(r => r.section === 'liability').reduce((s, r) => s + Number(r.balance), 0)
    const totalEquity      = rows.filter(r => r.section === 'equity').reduce((s, r) => s + Number(r.balance), 0)

    expect(Math.abs(totalAssets - (totalLiabilities + totalEquity))).toBeLessThan(0.01)
  })

  it('includes the synthetic NET profit row (account_code=NET, display_order=999, in equity)', async () => {
    const { data, error } = await serviceClient.rpc('get_balance_sheet', { p_as_of_date: today })
    if (error) throw new Error(`get_balance_sheet failed: ${error.message}`)
    const netRow = (data as any[]).find(r => r.account_code === 'NET')
    expect(netRow).toBeDefined()
    expect(netRow.section).toBe('equity')
    expect(netRow.display_order).toBe(999)
  })

  it('a reversed cash sale leaves the 1000 Cash balance unchanged (migration 036)', async () => {
    // historical_activity now includes status IN ('posted', 'reversed') — the original
    // DEBIT 1000 line and the reversal's CREDIT 1000 line both count, netting to zero.
    const findCash = (rows: any[]) => Number(rows.find(r => r.account_code === '1000')?.balance ?? 0)

    const before = (await serviceClient.rpc('get_balance_sheet', { p_as_of_date: today })).data as any[]
    const cashBefore = findCash(before)

    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 55 }] })
    if (error) throw new Error(`setup sale failed: ${error.message}`)
    const entry = await getJournalEntry('sale', sale!.sale_id)
    await reverseJournalEntry(entry.id, userIds.superadmin)

    const after = (await serviceClient.rpc('get_balance_sheet', { p_as_of_date: today })).data as any[]
    const cashAfter = findCash(after)
    expect(cashAfter - cashBefore).toBeCloseTo(0, 2)
  })
})

// =============================================================================
// 5.3 Trial Balance
// =============================================================================
describe('get_trial_balance()', () => {

  it('total debits = total credits over the full history', async () => {
    const { data, error } = await serviceClient.rpc('get_trial_balance', { p_from: '2020-01-01', p_to: today })
    if (error) throw new Error(`get_trial_balance failed: ${error.message}`)
    const rows = data as { total_debits: number; total_credits: number }[]
    const totalDebits  = rows.reduce((s, r) => s + Number(r.total_debits), 0)
    const totalCredits = rows.reduce((s, r) => s + Number(r.total_credits), 0)
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01)
  })

  it('includes every active, non-deleted account (matches the accounts table count exactly)', async () => {
    const { data, error } = await serviceClient.rpc('get_trial_balance', { p_from: '2020-01-01', p_to: today })
    if (error) throw new Error(`get_trial_balance failed: ${error.message}`)
    const { count } = await serviceClient.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_deleted', false)
    expect((data as any[]).length).toBe(count)
  })

  it('has_activity correctly separates accounts with activity from those without, within the queried range', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { error } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 40 }] })
    if (error) throw new Error(`setup sale failed: ${error.message}`)

    const { data, error: tbErr } = await serviceClient.rpc('get_trial_balance', { p_from: today, p_to: today })
    if (tbErr) throw new Error(`get_trial_balance failed: ${tbErr.message}`)
    const rows = data as { has_activity: boolean; total_debits: number; total_credits: number }[]

    for (const r of rows) {
      const total = Number(r.total_debits) + Number(r.total_credits)
      if (r.has_activity) expect(total).toBeGreaterThan(0)
      else expect(total).toBe(0)
    }
    expect(rows.some(r => r.has_activity)).toBe(true) // the sale above guarantees at least one active account today
  })
})

// =============================================================================
// 5.4 Cash Book — get_cash_book(p_date) takes a SINGLE date, not a range
// (spec assumed a range; the live signature does not have one)
// =============================================================================
describe('get_cash_book()', () => {

  it('includes a known cash sale as an inflow and a known cash expense as an outflow, with a correct running balance', async () => {
    const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })
    const { data: sale, error: saleErr } = await callCompleteSale({ items: [{ batch_id: batch.id, quantity: 1, unit_price: 65 }] })
    if (saleErr) throw new Error(`setup sale failed: ${saleErr.message}`)
    const { journalEntryId: expenseEntryId } = await postExpense(20, `${TEST_RUN_ID}cashbook-expense`)

    const { data, error } = await serviceClient.rpc('get_cash_book', { p_date: today })
    if (error) throw new Error(`get_cash_book failed: ${error.message}`)
    const rows = data as { entry_id: string; in_amount: number; out_amount: number; opening_balance: number; running_balance: number }[]

    const saleEntry = await getJournalEntry('sale', sale!.sale_id)
    const saleRow = rows.find(r => r.entry_id === saleEntry.id)
    expect(saleRow).toBeDefined()
    expect(Number(saleRow!.in_amount)).toBeCloseTo(65, 2)
    expect(Number(saleRow!.out_amount)).toBe(0)

    const expenseRow = rows.find(r => r.entry_id === expenseEntryId)
    expect(expenseRow).toBeDefined()
    expect(Number(expenseRow!.out_amount)).toBeCloseTo(20, 2)
    expect(Number(expenseRow!.in_amount)).toBe(0)

    // Running balance replay: opening_balance (constant across all rows) + cumulative (in - out).
    const opening = Number(rows[0].opening_balance)
    let expectedRunning = opening
    for (const r of rows) {
      expectedRunning += Number(r.in_amount) - Number(r.out_amount)
      expect(Number(r.running_balance)).toBeCloseTo(expectedRunning, 2)
    }
  })
})

// =============================================================================
// 5.5 Party Ledger
// =============================================================================
describe('get_party_ledger()', () => {

  describe('supplier ledger', () => {
    it('returns only the specified supplier\'s transactions, with GRNs as credits and payments as debits', async () => {
      const supplierA = await createTestSupplier(); supplierIds.add(supplierA.id)
      const supplierB = await createTestSupplier(); supplierIds.add(supplierB.id)
      const medicine = await createTestMedicine(); medicineIds.add(medicine.id)

      const { grnId: grnA } = await postGRN(supplierA.id, medicine.id, 5, 40) // 200
      const { grnId: grnB } = await postGRN(supplierB.id, medicine.id, 5, 40)
      const { journalEntryId: paymentEntryId } = await postSupplierPayment(supplierA.id, 80)

      const { data, error } = await serviceClient.rpc('get_party_ledger', {
        p_party_type: 'supplier', p_party_id: supplierA.id, p_date_from: null, p_date_to: null,
      })
      if (error) throw new Error(`get_party_ledger failed: ${error.message}`)
      const rows = data as { entry_id: string; debit_amount: number; credit_amount: number }[]

      const grnAEntry = await getJournalEntry('grn', grnA)
      const grnBEntry = await getJournalEntry('grn', grnB)
      expect(rows.some(r => r.entry_id === grnAEntry.id)).toBe(true)
      expect(rows.some(r => r.entry_id === grnBEntry.id)).toBe(false) // supplier B excluded

      const grnRow = rows.find(r => r.entry_id === grnAEntry.id)!
      expect(Number(grnRow.credit_amount)).toBeCloseTo(200, 2)
      expect(Number(grnRow.debit_amount)).toBe(0)

      const paymentRow = rows.find(r => r.entry_id === paymentEntryId)!
      expect(Number(paymentRow.debit_amount)).toBeCloseTo(80, 2)
      expect(Number(paymentRow.credit_amount)).toBe(0)
    })
  })

  describe('customer ledger', () => {
    it('a credit sale appears as a debit and a customer payment appears as a credit', async () => {
      const customer = await createTestCustomer({ credit_balance: 0, credit_limit: 100000 })
      customerIds.add(customer.id)
      const { batch } = await makeMedicineWithBatch({ batchOverrides: { quantity: 10 } })

      const { data: sale, error: saleErr } = await callCompleteSale({
        paymentType: 'credit', customerId: customer.id, items: [{ batch_id: batch.id, quantity: 1, unit_price: 90 }],
      })
      if (saleErr) throw new Error(`setup credit sale failed: ${saleErr.message}`)
      const saleEntry = await getJournalEntry('sale', sale!.sale_id)

      const { data: paymentId, error: payErr } = await rpc<string>('record_customer_payment', {
        p_customer_id: customer.id, p_amount: 30, p_payment_method: 'cash',
        p_reference_no: null, p_notes: `${TEST_RUN_ID}cust-payment`, p_recorded_by: userIds.superadmin,
      })
      if (payErr || !paymentId) throw new Error(`record_customer_payment failed: ${payErr?.message}`)
      customerPaymentIds.add(paymentId)
      const { data: paymentRow } = await serviceClient.from('customer_payments').select('journal_entry_id').eq('id', paymentId).single()
      journalEntryIds.add(paymentRow!.journal_entry_id as string)

      const { data, error } = await serviceClient.rpc('get_party_ledger', {
        p_party_type: 'customer', p_party_id: customer.id, p_date_from: null, p_date_to: null,
      })
      if (error) throw new Error(`get_party_ledger failed: ${error.message}`)
      const rows = data as { entry_id: string; debit_amount: number; credit_amount: number }[]

      const saleRow = rows.find(r => r.entry_id === saleEntry.id)!
      expect(Number(saleRow.debit_amount)).toBeCloseTo(90, 2)
      expect(Number(saleRow.credit_amount)).toBe(0)

      const paymentRowLedger = rows.find(r => r.entry_id === paymentRow!.journal_entry_id)!
      expect(Number(paymentRowLedger.credit_amount)).toBeCloseTo(30, 2)
      expect(Number(paymentRowLedger.debit_amount)).toBe(0)
    })
  })

  describe('date filtering', () => {
    it('respects p_date_from/p_date_to, excluding entries outside the range', async () => {
      const supplier = await createTestSupplier(); supplierIds.add(supplier.id)
      const oldDate = '2020-06-15'

      const oldEntry = await rpc<string>('post_journal_entry', {
        p_entry_date: oldDate, p_description: `${TEST_RUN_ID}old-supplier-entry`, p_reference_type: 'manual',
        p_reference_id: null, p_currency: 'PKR', p_exchange_rate: 1.0,
        p_lines: [
          { account_code: '2000', direction: 'credit', amount: '15', party_type: 'supplier', party_id: supplier.id },
          { account_code: '6008', direction: 'debit',  amount: '15' },
        ],
        p_created_by: userIds.superadmin,
      })
      if (oldEntry.error || !oldEntry.data) throw new Error(`old entry failed: ${oldEntry.error?.message}`)
      journalEntryIds.add(oldEntry.data)

      const recentEntry = await rpc<string>('post_journal_entry', {
        p_entry_date: today, p_description: `${TEST_RUN_ID}recent-supplier-entry`, p_reference_type: 'manual',
        p_reference_id: null, p_currency: 'PKR', p_exchange_rate: 1.0,
        p_lines: [
          { account_code: '2000', direction: 'credit', amount: '25', party_type: 'supplier', party_id: supplier.id },
          { account_code: '6008', direction: 'debit',  amount: '25' },
        ],
        p_created_by: userIds.superadmin,
      })
      if (recentEntry.error || !recentEntry.data) throw new Error(`recent entry failed: ${recentEntry.error?.message}`)
      journalEntryIds.add(recentEntry.data)

      const { data, error } = await serviceClient.rpc('get_party_ledger', {
        p_party_type: 'supplier', p_party_id: supplier.id, p_date_from: today, p_date_to: today,
      })
      if (error) throw new Error(`get_party_ledger (date filter) failed: ${error.message}`)
      const rows = data as { entry_id: string }[]

      expect(rows.some(r => r.entry_id === recentEntry.data)).toBe(true)
      expect(rows.some(r => r.entry_id === oldEntry.data)).toBe(false)
    })
  })
})
