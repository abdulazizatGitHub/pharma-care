import type { UserRole, Permission } from '@/lib/permissions'

export type { UserRole }

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  phone: string | null
  cnic: string | null
  joined_at: string
  force_password_change: boolean
  username: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface UserPermissionOverride {
  id: string
  user_id: string
  permission: Permission
  type: 'grant' | 'restrict'
  granted_by: string
  granted_at: string
}

export interface MedicineCategory {
  id: string
  name: string
  slug: string
  is_deleted: boolean
  created_at: string
}

export interface MedicineSubcategory {
  id: string
  category_id: string
  name: string
  slug: string
  is_deleted: boolean
  created_at: string
}

export interface Medicine {
  id: string
  name: string
  code: string | null
  generic_name: string | null
  manufacturer: string | null
  drap_reg_no: string | null
  category_id: string | null
  subcategory_id: string | null
  schedule: 'OTC' | 'prescription' | 'controlled'
  mrp: number
  pack_size: string | null
  unit: string
  reorder_level: number
  barcode: string | null
  is_active: boolean
  instructions: string | null
  precautions: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  is_deleted: boolean
}

export interface StockBatch {
  id: string
  medicine_id: string
  batch_no: string
  expiry_date: string
  quantity: number
  purchase_price: number | null
  sale_price: number | null
  mrp: number | null
  supplier_id: string | null
  grn_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  is_deleted: boolean
}

// MedicineRow = Medicine + stock totals from get_stock_summary()
// Used by server pages and all medicine UI components
export interface MedicineRow extends Medicine {
  total_stock:    number
  nearest_expiry: string | null
}

// ─── Supplier & Procurement ───────────────────────────────────────────────────

export interface Supplier {
  id:             string
  name:           string
  contact_person: string | null
  phone:          string | null
  email:          string | null
  address:        string | null
  ntn:            string | null
  credit_days:    number
  credit_limit:   number | null
  notes:          string | null
  is_active:      boolean
  created_at:     string
  updated_at:     string
  created_by:     string | null
  is_deleted:     boolean
}

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'confirmed'
  | 'received'
  | 'cancelled'

export interface PurchaseOrder {
  id:             string
  po_number:      string
  supplier_id:    string
  status:         POStatus
  total_amount:   number
  notes:          string | null
  // approval
  approved_by:    string | null
  approved_at:    string | null
  // rejection (pending_approval → draft)
  rejected_by:    string | null
  rejected_at:    string | null
  rejection_note: string | null
  // closure
  received_at:    string | null
  cancelled_at:   string | null
  cancelled_by:   string | null
  // audit
  created_at:     string
  updated_at:     string
  created_by:     string | null
  is_deleted:     boolean
}

export interface PurchaseOrderItem {
  id:                string
  po_id:             string
  medicine_id:       string
  quantity:          number
  unit_price:        number
  total_price:       number   // GENERATED ALWAYS AS (quantity * unit_price) STORED
  received_quantity: number
  notes:             string | null
  created_at:        string
}

export interface GoodsReceipt {
  id:           string
  grn_number:   string
  po_id:        string | null
  supplier_id:  string
  received_by:  string
  received_at:  string
  notes:        string | null
  total_amount: number | null
  created_at:   string
  updated_at:   string
  created_by:   string | null
  is_deleted:   boolean
}

export interface GRNItem {
  id:          string
  grn_id:      string
  medicine_id: string
  batch_no:    string
  expiry_date: string
  quantity:    number
  unit_price:  number | null
  created_at:  string
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id:             string
  name:           string
  phone:          string | null
  cnic:           string | null
  credit_limit:   number
  credit_balance: number
  notes:          string | null
  created_at:     string
  updated_at:     string
  created_by:     string | null
  is_deleted:     boolean
}

// ─── Shifts (Phase 11) ───────────────────────────────────────────────────────

export interface Shift {
  id:              string
  cashier_id:      string
  opened_at:       string
  closed_at:       string | null
  opening_cash:    number
  closing_cash:    number | null
  expected_cash:   number | null
  cash_difference: number | null
  status:          'open' | 'closed'
  notes:           string | null
  created_at:      string
  updated_at:      string
  created_by:      string | null
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export type SaleStatus = 'completed' | 'voided' | 'pending_approval' | 'held'

export interface Sale {
  id:              string
  receipt_no:      string
  cashier_id:      string
  pharmacist_id:   string | null
  customer_id:     string | null
  shift_id:        string | null
  sale_type:       'cash' | 'credit' | 'return'
  status:          SaleStatus
  subtotal:        number
  discount_amount: number
  discount_pct:    number
  tax_amount:      number
  total_amount:    number
  amount_paid:     number | null
  change_amount:   number | null
  notes:           string | null
  // POS columns — added in migration 011
  held_at:         string | null
  hold_label:      string | null
  bag_charge:      number
  payment_type:    'cash' | 'credit'
  held_cart_data:  unknown | null  // JSONB snapshot of CartItem[] for parked sales
  // void
  voided_by:       string | null
  voided_at:       string | null
  void_reason:     string | null
  // audit
  created_at:      string
  updated_at:      string
  created_by:      string | null
  is_deleted:      boolean
}

export interface SaleItem {
  id:           string
  sale_id:      string
  medicine_id:  string
  batch_id:     string
  batch_no:     string
  quantity:     number
  unit_price:   number
  mrp:          number
  discount_pct: number
  total_price:  number
  created_at:   string
}

// ─── Ledger & Accounting (Phase 7) ────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense'
export type NormalBalance = 'debit' | 'credit'

export interface Account {
  id:             string
  code:           string
  name:           string
  account_type:   AccountType
  normal_balance: NormalBalance
  parent_code:    string | null
  is_system:      boolean
  is_active:      boolean
  description:    string | null
  currency:       string
  created_at:     string
  updated_at:     string
  created_by:     string | null
  is_deleted:     boolean
  deleted_at:     string | null
}

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed'

export type JournalReferenceType =
  | 'sale' | 'sale_return' | 'purchase_order' | 'grn'
  | 'supplier_payment' | 'customer_payment'
  | 'borrowing_out' | 'borrowing_in'
  | 'borrowing_payment' | 'expense'
  | 'manual' | 'opening_balance' | 'adjustment'

export interface JournalEntry {
  id:             string
  entry_no:       string
  entry_date:     string         // DATE stored as YYYY-MM-DD string
  description:    string
  reference_type: JournalReferenceType | null
  reference_id:   string | null
  status:         JournalEntryStatus
  reversed_by:    string | null  // UUID of reversal entry
  reversal_of:    string | null  // UUID of entry this reverses
  currency:       string
  exchange_rate:  number
  created_at:     string
  created_by:     string | null
}

export type JournalDirection = 'debit' | 'credit'
export type PartyType = 'supplier' | 'customer' | 'pharmacy'

export interface JournalLine {
  id:          string
  entry_id:    string
  account_id:  string
  amount:      number          // in transaction currency
  direction:   JournalDirection
  amount_pkr:  number          // pre-calculated PKR equivalent
  party_type:  PartyType | null
  party_id:    string | null
  description: string | null
  created_at:  string
}

export interface BorrowingPharmacy {
  id:                  string
  name:                string
  contact_person:      string | null
  phone:               string | null
  address:             string | null
  notes:               string | null
  current_balance:     number       // positive = they owe us; negative = we owe them
  settlement_cadence:  'daily' | 'weekly' | 'monthly' | 'custom' | null
  settlement_day:      number | null
  last_settled_at:     string | null
  settlement_notes:    string | null
  created_at:          string
  updated_at:          string
  created_by:          string | null
  is_active:           boolean
  is_deleted:          boolean
  deleted_at:          string | null
}

export type BorrowingTransactionType = 'borrow_out' | 'borrow_in' | 'payment_out' | 'payment_in'

export interface BorrowingTransaction {
  id:               string
  pharmacy_id:      string
  transaction_type: BorrowingTransactionType
  medicine_id:      string | null
  medicine_name:    string | null
  quantity:         number | null
  unit_price:       number | null
  total_amount:     number
  payment_amount:   number | null
  payment_notes:    string | null
  journal_entry_id: string | null
  notes:            string | null
  transaction_date: string
  created_at:       string
  created_by:       string | null
  is_deleted:       boolean
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque'

export interface SupplierPayment {
  id:               string
  supplier_id:      string
  amount:           number
  payment_date:     string
  payment_method:   PaymentMethod
  reference_no:     string | null
  notes:            string | null
  journal_entry_id: string | null
  created_at:       string
  created_by:       string | null
}

export interface CustomerPayment {
  id:               string
  customer_id:      string
  amount:           number
  payment_date:     string
  payment_method:   string
  notes:            string | null
  journal_entry_id: string | null
  created_at:       string
  created_by:       string | null
}

export interface ExchangeRate {
  id:          string
  currency:    string
  rate_to_pkr: number
  rate_date:   string
  source:      string
  created_at:  string
  created_by:  string | null
}

// ─── Expenses (Phase 8) ───────────────────────────────────────────────────────

export interface Expense {
  id:               string
  expense_date:     string         // DATE as YYYY-MM-DD
  account_code:     string | null  // FK to accounts(code), 6xxx
  amount:           number
  description:      string
  payment_method:   string | null  // 'cash' | 'bank_transfer' | 'cheque'
  reference_no:     string | null
  recorded_by:      string | null  // UUID → profiles
  journal_entry_id: string | null  // UUID → journal_entries
  category:         string         // legacy column from migration 001
  created_at:       string
  is_deleted:       boolean
}
