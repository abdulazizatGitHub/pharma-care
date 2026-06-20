'use server'

import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

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

const POS_ROLES: UserRole[] = ['pharmacist', 'admin', 'superadmin']

// ─── Return types ─────────────────────────────────────────────────────────────

export interface BorrowToFulfillResult {
  medicineId:   string
  medicineName: string
  batchId:      string
  batchNo:      string
  quantity:     number
  unitPrice:    number
  isBorrowed:   true
  borrowedFrom: string
  borrowCost:   number
}

export interface DailyBorrowTransaction {
  transactionId:   string
  transactionType: 'borrow_in' | 'borrow_out' | 'payment_in' | 'payment_out'
  medicineName:    string | null
  quantity:        number | null
  unitPrice:       number | null
  totalAmount:     number
  saleReceiptNo:   string | null
  notes:           string | null
  createdAt:       string
}

export interface DailyBorrowPharmacyGroup {
  pharmacyId:    string
  pharmacyName:  string
  currentBalance: number
  transactions:  DailyBorrowTransaction[]
  borrowedTotal: number
  lentTotal:     number
}

export interface DailyBorrowingReport {
  date:               string
  pharmacies:         DailyBorrowPharmacyGroup[]
  totalBorrowedToday: number
  totalLentToday:     number
  netToday:           number
}

export interface SettlementDuePharmacy {
  pharmacyId:        string
  pharmacyName:      string
  currentBalance:    number
  settlementCadence: string
  settlementDay:     number | null
  lastSettledAt:     string | null
}

// ─── getBorrowingPharmacies ───────────────────────────────────────────────────
// Returns active borrowing pharmacies for dropdowns in borrow/lend modals.

export async function getBorrowingPharmacies(): Promise<{
  data: { id: string; name: string; currentBalance: number }[] | null
  error: string | null
}> {
  const { supabase, user } = await getCallerContext()
  if (!user) return { data: null, error: 'Unauthenticated' }

  const { data, error } = await supabase
    .from('borrowing_pharmacies')
    .select('id, name, current_balance')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('name')

  if (error) return { data: null, error: error.message }

  return {
    data: (data ?? []).map(p => ({
      id:             p.id,
      name:           p.name,
      currentBalance: Number(p.current_balance),
    })),
    error: null,
  }
}

// ─── borrowToFulfill ──────────────────────────────────────────────────────────
// Creates a temporary stock batch for out-of-stock borrow-to-fulfill at POS.
// Does NOT create a borrowing transaction — that happens after complete_sale().
// The caller adds the returned data as a cart item; batchId feeds into
// CompleteSaleInput.items so complete_sale() RPC decrements the temp batch.

export async function borrowToFulfill(input: {
  medicineId: string
  pharmacyId: string
  quantity:   number
  borrowCost: number
  salePrice:  number
}): Promise<{ data: BorrowToFulfillResult | null; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)                  return { data: null, error: 'Unauthenticated' }
  if (!POS_ROLES.includes(role))       return { data: null, error: 'Insufficient permissions' }
  if (input.quantity <= 0)             return { data: null, error: 'Quantity must be positive' }
  if (input.borrowCost < 0)           return { data: null, error: 'Borrow cost must be non-negative' }

  const { data: med, error: medError } = await supabase
    .from('medicines')
    .select('name, mrp')
    .eq('id', input.medicineId)
    .eq('is_deleted', false)
    .single()

  if (medError || !med) return { data: null, error: 'Medicine not found' }

  if (input.salePrice > Number(med.mrp)) {
    return { data: null, error: `Sale price (${input.salePrice}) exceeds MRP (${med.mrp})` }
  }

  // Unique batch_no to avoid UNIQUE(medicine_id, batch_no) collision on repeat borrows
  const batchNo = `BRW-${input.pharmacyId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`

  const { data: batch, error: batchError } = await supabase
    .from('stock_batches')
    .insert({
      medicine_id:    input.medicineId,
      batch_no:       batchNo,
      expiry_date:    '2099-12-31',   // placeholder — borrowed stock has no real expiry
      quantity:       input.quantity,
      purchase_price: input.borrowCost,
      sale_price:     input.salePrice,
      mrp:            Number(med.mrp),
      supplier_id:    null,
      is_borrowed:    true,
      created_by:     user.id,
    })
    .select('id, batch_no')
    .single()

  if (batchError || !batch) {
    return { data: null, error: batchError?.message ?? 'Failed to create temporary batch' }
  }

  return {
    data: {
      medicineId:   input.medicineId,
      medicineName: med.name,
      batchId:      batch.id,
      batchNo:      batch.batch_no,
      quantity:     input.quantity,
      unitPrice:    input.salePrice,
      isBorrowed:   true,
      borrowedFrom: input.pharmacyId,
      borrowCost:   input.borrowCost,
    },
    error: null,
  }
}

// ─── completeBorrowingSale ────────────────────────────────────────────────────
// Called by completeSale() AFTER complete_sale() RPC succeeds.
// For each borrowed item: posts journal entry, creates borrowing_transaction,
// updates pharmacy balance, and backfills is_borrowed on the sale_item row.
// Errors are returned rather than thrown so completeSale can log and continue —
// the sale has already committed and cannot be rolled back here.

export async function completeBorrowingSale(
  saleId: string,
  borrowedItems: Array<{
    medicineId:   string
    medicineName: string
    batchId:      string
    borrowedFrom: string
    borrowCost:   number
    quantity:     number
  }>,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Unauthenticated' }

  const today = new Date().toISOString().slice(0, 10)

  for (const item of borrowedItems) {
    const total = Number((item.quantity * item.borrowCost).toFixed(4))

    // 1. Post journal: DEBIT 1200 (Inventory), CREDIT 2010 (Borrowing Payable)
    const { data: journalEntryId, error: journalError } = await supabase.rpc('post_journal_entry', {
      p_entry_date:     today,
      p_description:    `Borrow-in: ${item.medicineName} ×${item.quantity} (sale ${saleId.slice(0, 8)})`,
      p_reference_type: 'borrowing_in',
      p_reference_id:   null,
      p_currency:       'PKR',
      p_exchange_rate:  1.0,
      p_lines: [
        {
          account_code: '1200',
          direction:    'debit',
          amount:       total.toString(),
          party_type:   'pharmacy',
          party_id:     item.borrowedFrom,
          description:  `Borrowed inventory: ${item.medicineName}`,
        },
        {
          account_code: '2010',
          direction:    'credit',
          amount:       total.toString(),
          party_type:   'pharmacy',
          party_id:     item.borrowedFrom,
          description:  `Borrowing payable to pharmacy`,
        },
      ],
      p_created_by: user.id,
    })

    if (journalError) {
      console.error('[completeBorrowingSale] Journal entry failed:', journalError.message)
      return { error: `Journal entry failed: ${journalError.message}` }
    }

    // 2. Create borrowing_transaction (borrow_in)
    const { data: btRow, error: btError } = await supabase
      .from('borrowing_transactions')
      .insert({
        pharmacy_id:      item.borrowedFrom,
        transaction_type: 'borrow_in',
        medicine_id:      item.medicineId,
        medicine_name:    item.medicineName,
        quantity:         item.quantity,
        unit_price:       item.borrowCost,
        total_amount:     total,
        sale_id:          saleId,
        is_pos_borrow:    true,
        journal_entry_id: journalEntryId as string,
        transaction_date: today,
        created_by:       user.id,
      })
      .select('id')
      .single()

    if (btError || !btRow) {
      console.error('[completeBorrowingSale] Transaction insert failed:', btError?.message)
      return { error: btError?.message ?? 'Failed to create borrowing transaction' }
    }

    // 3. Update pharmacy balance: current_balance -= total (we owe them more)
    const { data: pharma } = await supabase
      .from('borrowing_pharmacies')
      .select('current_balance')
      .eq('id', item.borrowedFrom)
      .single()

    if (pharma) {
      await supabase
        .from('borrowing_pharmacies')
        .update({ current_balance: Number(pharma.current_balance) - total })
        .eq('id', item.borrowedFrom)
    }

    // 4. Find the sale_item the RPC created (matched by sale_id + batch_id)
    //    then backfill borrowed flags and link sale_item_id on the transaction
    const { data: saleItem } = await supabase
      .from('sale_items')
      .select('id')
      .eq('sale_id', saleId)
      .eq('batch_id', item.batchId)
      .maybeSingle()

    if (saleItem) {
      await supabase
        .from('sale_items')
        .update({
          is_borrowed:   true,
          borrowed_from: item.borrowedFrom,
          borrow_cost:   item.borrowCost,
        })
        .eq('id', saleItem.id)

      await supabase
        .from('borrowing_transactions')
        .update({ sale_item_id: saleItem.id })
        .eq('id', btRow.id)
    }
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.BORROW_TO_FULFILL,
    tableName: 'borrowing_transactions',
    recordId:  saleId,
    newValue:  { sale_id: saleId, borrowed_item_count: borrowedItems.length },
  })

  return { error: null }
}

// ─── lendToPharmacy ──────────────────────────────────────────────────────────
// Decrements our stock and records a borrow_out transaction + journal entry.
// The lending pharmacy's balance increases (they owe us more).

export async function lendToPharmacy(input: {
  pharmacyId:   string
  medicineId:   string
  batchId:      string
  quantity:     number
  pricePerUnit: number
  notes?:       string
}): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)            return { error: 'Unauthenticated' }
  if (!POS_ROLES.includes(role)) return { error: 'Insufficient permissions' }
  if (input.quantity <= 0)       return { error: 'Quantity must be positive' }
  if (input.pricePerUnit < 0)    return { error: 'Price must be non-negative' }

  // Validate batch exists and has sufficient stock
  type BatchWithMed = {
    quantity:  number
    medicines: { name: string } | null
  }

  const { data: batch, error: batchError } = await supabase
    .from('stock_batches')
    .select('quantity, medicines ( name )')
    .eq('id', input.batchId)
    .eq('is_deleted', false)
    .single()

  if (batchError || !batch) return { error: 'Batch not found' }

  const typedBatch = batch as unknown as BatchWithMed
  if (typedBatch.quantity < input.quantity) {
    return {
      error: `Insufficient stock — available: ${typedBatch.quantity}, requested: ${input.quantity}`,
    }
  }

  const { data: pharma, error: pharmaError } = await supabase
    .from('borrowing_pharmacies')
    .select('name, current_balance')
    .eq('id', input.pharmacyId)
    .eq('is_deleted', false)
    .single()

  if (pharmaError || !pharma) return { error: 'Pharmacy not found' }

  const medicineName = typedBatch.medicines?.name ?? 'Unknown'
  const total        = Number((input.quantity * input.pricePerUnit).toFixed(4))
  const today        = new Date().toISOString().slice(0, 10)

  // a. Decrement stock
  const { error: stockError } = await supabase
    .from('stock_batches')
    .update({
      quantity:   typedBatch.quantity - input.quantity,
      updated_by: user.id,
    })
    .eq('id', input.batchId)

  if (stockError) return { error: stockError.message }

  // b. Post journal: DEBIT 1110 (Borrowing Receivable), CREDIT 1200 (Inventory)
  const { data: journalEntryId, error: journalError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     today,
    p_description:    `Lend to ${pharma.name}: ${medicineName} ×${input.quantity}`,
    p_reference_type: 'borrowing_out',
    p_reference_id:   null,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines: [
      {
        account_code: '1110',
        direction:    'debit',
        amount:       total.toString(),
        party_type:   'pharmacy',
        party_id:     input.pharmacyId,
        description:  `Receivable from ${pharma.name}`,
      },
      {
        account_code: '1200',
        direction:    'credit',
        amount:       total.toString(),
        description:  `Inventory lent to ${pharma.name}: ${medicineName}`,
      },
    ],
    p_created_by: user.id,
  })

  if (journalError) return { error: `Journal entry failed: ${journalError.message}` }

  // c. Create borrowing_transaction (borrow_out)
  await supabase.from('borrowing_transactions').insert({
    pharmacy_id:      input.pharmacyId,
    transaction_type: 'borrow_out',
    medicine_id:      input.medicineId,
    medicine_name:    medicineName,
    quantity:         input.quantity,
    unit_price:       input.pricePerUnit,
    total_amount:     total,
    journal_entry_id: journalEntryId as string,
    notes:            input.notes ?? null,
    transaction_date: today,
    is_pos_borrow:    false,
    created_by:       user.id,
  })

  // d. Update pharmacy balance: current_balance += total (they owe us more)
  await supabase
    .from('borrowing_pharmacies')
    .update({ current_balance: Number(pharma.current_balance) + total })
    .eq('id', input.pharmacyId)

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.LEND_TO_PHARMACY,
    tableName: 'borrowing_transactions',
    newValue:  {
      pharmacy_id:   input.pharmacyId,
      medicine_id:   input.medicineId,
      quantity:      input.quantity,
      price_per_unit: input.pricePerUnit,
      total,
    },
  })

  return { error: null }
}

// ─── getDailyBorrowingReport ──────────────────────────────────────────────────
// Returns all borrowing activity for a given date (YYYY-MM-DD), grouped by
// pharmacy. Includes sale receipt_no for POS-originated borrow_in entries.

export async function getDailyBorrowingReport(date: string): Promise<{
  data: DailyBorrowingReport | null
  error: string | null
}> {
  const { supabase, user } = await getCallerContext()
  if (!user) return { data: null, error: 'Unauthenticated' }

  type RawRow = {
    id:               string
    pharmacy_id:      string
    transaction_type: 'borrow_in' | 'borrow_out' | 'payment_in' | 'payment_out'
    medicine_name:    string | null
    quantity:         number | null
    unit_price:       number | null
    total_amount:     number
    notes:            string | null
    created_at:       string
    sales:            { receipt_no: string } | null
    borrowing_pharmacies: { name: string; current_balance: number }
  }

  const { data: rows, error } = await supabase
    .from('borrowing_transactions')
    .select(`
      id, pharmacy_id, transaction_type,
      medicine_name, quantity, unit_price, total_amount,
      notes, created_at,
      sales ( receipt_no ),
      borrowing_pharmacies ( name, current_balance )
    `)
    .eq('transaction_date', date)
    .eq('is_deleted', false)
    .order('pharmacy_id')
    .order('created_at')

  if (error) return { data: null, error: error.message }

  const pharmacyMap = new Map<string, DailyBorrowPharmacyGroup>()

  for (const row of ((rows ?? []) as unknown as RawRow[])) {
    const pharma = row.borrowing_pharmacies
    if (!pharmacyMap.has(row.pharmacy_id)) {
      pharmacyMap.set(row.pharmacy_id, {
        pharmacyId:     row.pharmacy_id,
        pharmacyName:   pharma.name,
        currentBalance: Number(pharma.current_balance),
        transactions:   [],
        borrowedTotal:  0,
        lentTotal:      0,
      })
    }
    const group = pharmacyMap.get(row.pharmacy_id)!
    const amount = Number(row.total_amount)

    group.transactions.push({
      transactionId:   row.id,
      transactionType: row.transaction_type,
      medicineName:    row.medicine_name,
      quantity:        row.quantity,
      unitPrice:       row.unit_price != null ? Number(row.unit_price) : null,
      totalAmount:     amount,
      saleReceiptNo:   (row.sales as { receipt_no: string } | null)?.receipt_no ?? null,
      notes:           row.notes,
      createdAt:       row.created_at,
    })

    if (row.transaction_type === 'borrow_in')  group.borrowedTotal += amount
    if (row.transaction_type === 'borrow_out') group.lentTotal     += amount
  }

  const pharmacies        = Array.from(pharmacyMap.values())
  const totalBorrowedToday = pharmacies.reduce((s, p) => s + p.borrowedTotal, 0)
  const totalLentToday     = pharmacies.reduce((s, p) => s + p.lentTotal,    0)

  return {
    data: {
      date,
      pharmacies,
      totalBorrowedToday,
      totalLentToday,
      netToday: totalLentToday - totalBorrowedToday,
    },
    error: null,
  }
}

// ─── getSettlementDuePharmacies ───────────────────────────────────────────────
// Returns pharmacies whose settlement is due based on their configured cadence.

export async function getSettlementDuePharmacies(): Promise<{
  data: SettlementDuePharmacy[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)            return { data: null, error: 'Unauthenticated' }
  if (role !== 'superadmin')     return { data: null, error: 'Superadmin only' }

  const { data: pharmacies, error } = await supabase
    .from('borrowing_pharmacies')
    .select('id, name, current_balance, settlement_cadence, settlement_day, last_settled_at')
    .eq('is_active', true)
    .eq('is_deleted', false)

  if (error) return { data: null, error: error.message }

  const today = new Date()
  const due: SettlementDuePharmacy[] = []

  for (const p of (pharmacies ?? [])) {
    if (isSettlementDue(p, today)) {
      due.push({
        pharmacyId:        p.id,
        pharmacyName:      p.name,
        currentBalance:    Number(p.current_balance),
        settlementCadence: p.settlement_cadence ?? 'daily',
        settlementDay:     p.settlement_day,
        lastSettledAt:     p.last_settled_at,
      })
    }
  }

  return { data: due, error: null }
}

function isSettlementDue(
  pharmacy: {
    settlement_cadence: string | null
    settlement_day:     number | null
    last_settled_at:    string | null
  },
  today: Date,
): boolean {
  if (!pharmacy.last_settled_at) return true   // never settled

  const cadence     = pharmacy.settlement_cadence ?? 'daily'
  const lastDate    = new Date(pharmacy.last_settled_at.slice(0, 10) + 'T00:00:00')
  const todayMidnight = new Date(today.toISOString().slice(0, 10) + 'T00:00:00')

  switch (cadence) {
    case 'daily':
      return lastDate < todayMidnight

    case 'weekly': {
      const targetDay   = pharmacy.settlement_day ?? 0            // 0=Sun
      const daysBack    = (todayMidnight.getDay() - targetDay + 7) % 7
      const mostRecentDue = new Date(todayMidnight)
      mostRecentDue.setDate(mostRecentDue.getDate() - daysBack)
      return lastDate < mostRecentDue
    }

    case 'monthly': {
      const targetDay = pharmacy.settlement_day ?? 1
      const yr  = todayMidnight.getFullYear()
      const mo  = todayMidnight.getMonth()
      let dueDate = new Date(yr, mo, targetDay)
      if (dueDate > todayMidnight) dueDate = new Date(yr, mo - 1, targetDay)
      return lastDate < dueDate
    }

    case 'custom':
      return true

    default:
      return false
  }
}

// ─── processSettlement ────────────────────────────────────────────────────────
// Settles an outstanding balance with a neighbouring pharmacy.
// Direction is inferred from current_balance sign:
//   balance < 0: we owe them → payment_out; DEBIT 2010, CREDIT 1000
//   balance > 0: they owe us → payment_in;  DEBIT 1000, CREDIT 1110

export async function processSettlement(
  pharmacyId: string,
  amount:     number,
  method:     string,
  notes?:     string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Unauthenticated' }
  if (role !== 'superadmin') return { error: 'Superadmin only' }
  if (amount <= 0)           return { error: 'Amount must be positive' }

  const { data: pharma, error: pharmaError } = await supabase
    .from('borrowing_pharmacies')
    .select('name, current_balance')
    .eq('id', pharmacyId)
    .eq('is_deleted', false)
    .single()

  if (pharmaError || !pharma) return { error: 'Pharmacy not found' }

  const balance = Number(pharma.current_balance)
  if (balance === 0) return { error: 'Balance is zero — nothing to settle' }

  const total    = Number(amount.toFixed(4))
  const today    = new Date().toISOString().slice(0, 10)
  const isWeOwe  = balance < 0  // negative = we owe them

  const descPrefix = isWeOwe ? `Settlement to ${pharma.name}` : `Settlement from ${pharma.name}`
  const lines = isWeOwe
    ? [
        {
          account_code: '2010',
          direction:    'debit',
          amount:       total.toString(),
          party_type:   'pharmacy',
          party_id:     pharmacyId,
          description:  `Borrowing payable cleared — ${pharma.name}`,
        },
        {
          account_code: '1000',
          direction:    'credit',
          amount:       total.toString(),
          description:  `Cash paid to ${pharma.name}`,
        },
      ]
    : [
        {
          account_code: '1000',
          direction:    'debit',
          amount:       total.toString(),
          description:  `Cash received from ${pharma.name}`,
        },
        {
          account_code: '1110',
          direction:    'credit',
          amount:       total.toString(),
          party_type:   'pharmacy',
          party_id:     pharmacyId,
          description:  `Borrowing receivable settled — ${pharma.name}`,
        },
      ]

  const { data: journalEntryId, error: journalError } = await supabase.rpc('post_journal_entry', {
    p_entry_date:     today,
    p_description:    `${descPrefix} (${method})`,
    p_reference_type: 'borrowing_payment',
    p_reference_id:   null,
    p_currency:       'PKR',
    p_exchange_rate:  1.0,
    p_lines:          lines,
    p_created_by:     user.id,
  })

  if (journalError) return { error: `Journal entry failed: ${journalError.message}` }

  const transactionType = isWeOwe ? 'payment_out' : 'payment_in'

  await supabase.from('borrowing_transactions').insert({
    pharmacy_id:      pharmacyId,
    transaction_type: transactionType,
    total_amount:     total,
    payment_amount:   total,
    payment_notes:    notes ? `${method}: ${notes}` : method,
    notes:            notes ?? null,
    journal_entry_id: journalEntryId as string,
    transaction_date: today,
    is_pos_borrow:    false,
    created_by:       user.id,
  })

  const newBalance = isWeOwe ? balance + total : balance - total

  await supabase
    .from('borrowing_pharmacies')
    .update({
      current_balance: newBalance,
      last_settled_at: new Date().toISOString(),
    })
    .eq('id', pharmacyId)

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.BORROWING_SETTLEMENT,
    tableName: 'borrowing_transactions',
    recordId:  pharmacyId,
    newValue:  {
      pharmacy_id:      pharmacyId,
      amount:           total,
      method,
      transaction_type: transactionType,
      balance_before:   balance,
      balance_after:    newBalance,
    },
  })

  return { error: null }
}

// ─── updatePharmacySettlement ─────────────────────────────────────────────────
// Superadmin: update the settlement cadence and day for a borrowing pharmacy.

export async function updatePharmacySettlement(
  pharmacyId: string,
  cadence:    'daily' | 'weekly' | 'monthly' | 'custom',
  day?:       number | null,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Unauthenticated' }
  if (role !== 'superadmin') return { error: 'Superadmin only' }

  const { error } = await supabase
    .from('borrowing_pharmacies')
    .update({
      settlement_cadence: cadence,
      settlement_day:     day ?? null,
    })
    .eq('id', pharmacyId)
    .eq('is_deleted', false)

  return { error: error?.message ?? null }
}
