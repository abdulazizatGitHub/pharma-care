// ─── Cart types ───────────────────────────────────────────────────────────────

export interface CartItem {
  id:             string        // temp UUID generated client-side
  medicineId:     string
  medicineName:   string
  batchId:        string
  batchNo:        string
  expiryDate:         string | null
  quantity:           number
  unitPrice:          number        // sale_price from batch
  mrp:                number        // for display; unit_price cannot exceed this
  specialDiscountPct: number        // always 0 until Phase 5B-2 adds UI
  discountPct:        number        // 0 – maxDiscountPct
  totalPrice:     number        // qty × unitPrice × (1 - discountPct/100)
  isControlled:   boolean       // true if schedule = 'controlled'
  isPrescription: boolean       // true if schedule = 'prescription'
  // Phase 7F — borrowed item fields
  isBorrowed?:       boolean
  borrowedFrom?:     string     // borrowing_pharmacies.id
  borrowedFromName?: string     // display name
  borrowCost?:       number     // amount we owe the lending pharmacy per unit
}

export interface Cart {
  items:          CartItem[]
  customerId:     string | null
  customerName:   string | null
  discountAmount: number        // overall sale discount (owner/superadmin only)
  serviceFee:     number        // from settings, applied per sale (DB column: bag_charge)
  notes:          string
  holdLabel:      string | null // set when parked
}

export interface ParkedSale {
  saleId:    string            // saved to DB as held sale
  holdLabel: string
  itemCount: number
  total:     number
  heldAt:    string
}

// ─── POS search result types ──────────────────────────────────────────────────

export interface POSBatchOption {
  batchId:       string
  batchNo:       string
  expiryDate:    string
  quantity:      number
  salePrice:     number           // sale_price from stock_batches; falls back to medicine mrp
  mrp:           number           // effective MRP (batch mrp ?? medicine mrp)
  purchasePrice: number | null    // for LendToPharmacy default price
}

export interface POSMedicineResult {
  medicineId:    string
  medicineName:  string
  genericName:   string | null
  manufacturer:  string | null
  code:          string | null
  barcode:       string | null
  schedule:      'OTC' | 'prescription' | 'controlled'
  mrp:           number
  packSize:      string | null  // medicines.pack_size — shown on grid cards
  reorderLevel:  number         // medicines.reorder_level — for low-stock indicator
  totalStock:    number         // sum of all valid (non-expired, qty>0) batch quantities
  batches:       POSBatchOption[]
  isOutOfStock:  boolean        // true when all batches are depleted or expired
}

// ─── Batch replacement patch ─────────────────────────────────────────────────

export interface BatchPatch {
  batchId:      string
  batchNo:      string
  expiryDate:   string | null
  mrp:          number
  unitPrice:    number       // batch.sale_price — new effective sale price
  availableQty: number       // batch.quantity — caps existing cart qty if needed
}

// ─── Return credit (exchange sale flow) ──────────────────────────────────────

export interface ReturnCredit {
  returnId: string
  returnNo: string
  amount:   number
}

// ─── Checkout input ───────────────────────────────────────────────────────────

export interface BorrowedCartItem {
  medicineId:   string
  medicineName: string
  batchId:      string
  borrowedFrom: string   // borrowing_pharmacies.id
  borrowCost:   number   // amount we owe per unit
  quantity:     number
}

export interface CompleteSaleInput {
  cashierId:    string
  customerId:   string | null
  paymentType:  'cash' | 'credit'
  items: Array<{
    medicine_id:  string
    batch_id:     string
    quantity:     number
    unit_price:   number
    discount_pct: number
  }>
  discountAmt:   number
  serviceFee:    number          // maps to p_bag_charge RPC param (DB column: bag_charge)
  amountPaid:    number
  notes:         string
  borrowedItems?: BorrowedCartItem[]  // populated when cart contains borrowed items
}
