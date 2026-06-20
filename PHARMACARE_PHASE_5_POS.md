# PHARMACARE — PHASE 5: POINT OF SALE (POS)
> **Version:** 1.0  
> **Depends on:** All previous phases  
> **Routes:** /pharmacist/pos, /admin/pos (if admin has pos permission), /superadmin/pos  
> **Read all previous spec documents before writing any code.**

---

## 0. AGENT INSTRUCTIONS

The POS is the most-used screen in the system.
Every design decision prioritizes speed and accuracy.
Build it keyboard-first — everything reachable without a mouse.

Rules throughout:
- Every query adds .eq('is_deleted', false)
- Every write calls logAction() from lib/audit.ts
- No hard deletes
- All monetary values: NUMERIC(12,2)
- Sale completion MUST be atomic — use complete_sale() RPC

---

## 1. POS SCREEN LAYOUT

Split layout: sidebar (52px collapsed) + POS content area.

```
┌──────┬─────────────────────────────────────────────────┐
│      │  TOPBAR: [← Back] | Sale #SR-0042 | [Customer▼]│
│  S   ├──────────────────────┬──────────────────────────┤
│  I   │  SEARCH PANEL        │  CART PANEL              │
│  D   │                      │                          │
│  E   │  🔍 [Search/scan...] │  Panadol 500mg     ×2   │
│  B   │                      │  Rs 15.00 each  Rs 30.00 │
│  A   │  [Search results     │                          │
│  R   │   appear here as     │  Brufen 400mg      ×1   │
│      │   cards]             │  Rs 25.00 each  Rs 25.00 │
│      │                      │  ──────────────────────  │
│      │  ─────────────────   │  Subtotal:      Rs 55.00 │
│      │  PARKED SALES        │  Bag charge:     Rs 2.00 │
│      │  [Park A] [Park B]   │  Discount:          —    │
│      │                      │  TOTAL:         Rs 57.00 │
│      │                      │                          │
│      │                      │  [Hold Sale]             │
│      │                      │  [Complete Sale →]       │
└──────┴──────────────────────┴──────────────────────────┘
```

The POS route uses the same role layout (SuperadminShell/
AdminShell/PharmacistShell) — sidebar stays present at 52px.
The POS content area is a two-panel flex layout:
- Left panel (search): ~55% width
- Right panel (cart): ~45% width, fixed height, scrollable items

---

## 2. DATABASE CHANGES — Migration 011

### 2.1 sales table additions

```sql
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS held_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_label     TEXT,
  ADD COLUMN IF NOT EXISTS bag_charge     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type   TEXT DEFAULT 'cash'
    CHECK (payment_type IN ('cash', 'credit')),
  ADD COLUMN IF NOT EXISTS receipt_no     TEXT UNIQUE;
```

`held_at` — set when sale is parked, null when active or completed
`hold_label` — user-assigned label for parked sale (e.g. "Customer 1")
`bag_charge` — per-sale bag/printing charge from settings
`payment_type` — cash or credit (udhaar)
`receipt_no` — auto-generated: SR-YYYYMMDD-XXXX

Existing columns from 001: id, cashier_id, pharmacist_id, customer_id,
shift_id, sale_type, status, subtotal, discount_amount, discount_pct,
tax_amount, total_amount, amount_paid, change_amount, notes,
voided_by, voided_at, void_reason, audit columns.

### 2.2 customers table — verify/add balance column

```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(12,2) DEFAULT 0;
```

`credit_balance` — total outstanding (what customer owes)
`credit_limit` — maximum credit allowed (0 = no credit)

### 2.3 Settings additions

```sql
INSERT INTO settings (key, value, label) VALUES
  ('pos_discount_max_pct', '10',
   'Maximum discount % a pharmacist can apply at POS'),
  ('pos_receipt_footer', 'Thank you for your visit.',
   'Text printed at the bottom of every receipt')
ON CONFLICT (key) DO NOTHING;
```

### 2.4 complete_sale() RPC — implement Phase 3 stub

The stub was created in migration 001 and raises an exception.
Replace it in migration 011:

```sql
CREATE OR REPLACE FUNCTION complete_sale(
  p_cashier_id    UUID,
  p_customer_id   UUID,       -- nullable
  p_payment_type  TEXT,       -- 'cash' or 'credit'
  p_items         JSONB,      -- [{medicine_id, batch_id, quantity, unit_price, discount_pct}]
  p_discount_amt  NUMERIC,
  p_bag_charge    NUMERIC,
  p_amount_paid   NUMERIC,    -- for cash: amount given by customer
  p_notes         TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id     UUID;
  v_receipt_no  TEXT;
  v_subtotal    NUMERIC(12,2) := 0;
  v_total       NUMERIC(12,2);
  v_change      NUMERIC(12,2);
  v_item        JSONB;
  v_batch_qty   INTEGER;
  v_mrp         NUMERIC(12,2);
  v_date        TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
BEGIN
  -- Generate receipt number
  SELECT 'SR-' || v_date || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM sales
          WHERE receipt_no LIKE 'SR-' || v_date || '-%')::TEXT, 4, '0')
  INTO v_receipt_no;

  -- Validate items and calculate subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Check batch has sufficient stock
    SELECT quantity INTO v_batch_qty
    FROM stock_batches
    WHERE id = (v_item->>'batch_id')::UUID AND is_deleted = FALSE;

    IF v_batch_qty IS NULL OR v_batch_qty < (v_item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Insufficient stock for batch %', v_item->>'batch_id';
    END IF;

    -- Check MRP (batch mrp with fallback to medicine mrp)
    SELECT COALESCE(sb.mrp, m.mrp) INTO v_mrp
    FROM stock_batches sb
    JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.id = (v_item->>'batch_id')::UUID;

    IF (v_item->>'unit_price')::NUMERIC > v_mrp THEN
      RAISE EXCEPTION 'unit_price exceeds MRP for batch %', v_item->>'batch_id';
    END IF;

    v_subtotal := v_subtotal + (
      (v_item->>'quantity')::INTEGER *
      (v_item->>'unit_price')::NUMERIC *
      (1 - COALESCE((v_item->>'discount_pct')::NUMERIC, 0) / 100)
    );
  END LOOP;

  v_total := v_subtotal - p_discount_amt + p_bag_charge;
  v_change := CASE WHEN p_payment_type = 'cash'
                   THEN p_amount_paid - v_total
                   ELSE 0 END;

  -- Insert sale header
  INSERT INTO sales (
    receipt_no, cashier_id, customer_id, payment_type,
    subtotal, discount_amount, bag_charge, total_amount,
    amount_paid, change_amount, notes, status
  ) VALUES (
    v_receipt_no, p_cashier_id, p_customer_id, p_payment_type,
    v_subtotal, p_discount_amt, p_bag_charge, v_total,
    p_amount_paid, v_change, p_notes, 'completed'
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items + decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sale_items (
      sale_id, medicine_id, batch_id, batch_no,
      quantity, unit_price, mrp, discount_pct, total_price
    )
    SELECT
      v_sale_id,
      sb.medicine_id,
      sb.id,
      sb.batch_no,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE(sb.mrp, m.mrp),
      COALESCE((v_item->>'discount_pct')::NUMERIC, 0),
      (v_item->>'quantity')::INTEGER *
        (v_item->>'unit_price')::NUMERIC *
        (1 - COALESCE((v_item->>'discount_pct')::NUMERIC, 0) / 100)
    FROM stock_batches sb
    JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.id = (v_item->>'batch_id')::UUID;

    -- Decrement batch quantity
    UPDATE stock_batches
    SET quantity = quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'batch_id')::UUID;
  END LOOP;

  -- If credit sale: update customer balance
  IF p_payment_type = 'credit' AND p_customer_id IS NOT NULL THEN
    UPDATE customers
    SET credit_balance = credit_balance + v_total
    WHERE id = p_customer_id;
  END IF;

  RETURN jsonb_build_object(
    'sale_id',    v_sale_id,
    'receipt_no', v_receipt_no,
    'total',      v_total,
    'change',     v_change
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION complete_sale(UUID,UUID,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_sale(UUID,UUID,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;
```

---

## 3. CART STATE (client-side)

The cart lives entirely in React state — never in the database until checkout.
Parked sales ARE saved to the database as `status='held'` sales.

```typescript
// lib/pos-types.ts

export interface CartItem {
  id:           string          // temp UUID generated client-side
  medicineId:   string
  medicineName: string
  batchId:      string
  batchNo:      string
  expiryDate:   string
  quantity:     number
  unitPrice:    number          // sale_price from batch
  mrp:          number          // for display, cannot exceed
  discountPct:  number          // 0-maxDiscountPct
  totalPrice:   number          // calculated: qty × unitPrice × (1 - disc/100)
  isControlled: boolean         // true if schedule = 'controlled'
  isPrescription: boolean       // true if schedule = 'prescription'
}

export interface Cart {
  items:          CartItem[]
  customerId:     string | null
  customerName:   string | null
  discountAmount: number        // overall sale discount (owner/superadmin only)
  bagCharge:      number        // from settings, applied per sale
  notes:          string
  holdLabel:      string | null // set when parked
}

export interface ParkedSale {
  saleId:     string            // saved to DB as held sale
  holdLabel:  string
  itemCount:  number
  total:      number
  heldAt:     string
}
```

---

## 4. MEDICINE SEARCH & BATCH SELECTION

### 4.1 Search behavior

Search input is always focused when the POS page loads.
Supports two input modes:

**Keyboard search:**
- User types ≥ 2 characters
- Debounce 150ms
- Queries medicines by name, generic_name, code, barcode
- Returns top 10 results with stock info
- Results shown as cards (not a dropdown list)
- Keyboard navigation: arrow keys move between results, Enter selects

**Barcode scan:**
- Scanner sends keystrokes ending with Enter/Tab
- Detected as barcode if input arrives faster than 50ms per character
- Auto-searches and auto-selects if exactly 1 result found
- If multiple matches: shows results for manual selection

### 4.2 Search result card

```
┌────────────────────────────────────────────┐
│ Panadol 500mg                    Code: 001 │
│ GSK Pakistan · Analgesics        OTC       │
│ MRP: Rs 18.00  Sale: Rs 15.00             │
│ Stock: 50 units · Expires Dec 2026         │
│                                            │
│ [+ Add to Cart]                            │
└────────────────────────────────────────────┘
```

If medicine has multiple batches:
Show batch selector below the medicine info:
```
Select batch:
○ BTH-2026-001 · Exp Dec 2026 · Rs 15.00 · 50 qty
● BTH-2026-002 · Exp Jun 2027 · Rs 16.00 · 30 qty  ← default (FEFO)
```

Batch selection mode from settings:
- `fefo`: auto-selects nearest expiry, no UI choice shown
- `manual`: shows batch selector, user picks
- `show_all`: shows all batches as separate search results

### 4.3 Adding to cart

When user clicks "+ Add to Cart":
- If item already in cart: prompt "Already in cart. Add more? [+1] [Set Qty]"
- If controlled/prescription: show flag — "Prescription required. Add anyway?" 
  (cashier can proceed — full prescription capture is Phase 6)
- Item added to cart immediately (client state)
- Search field clears and refocuses

---

## 5. CART PANEL

### 5.1 Cart item row

```
Panadol 500mg [BTH-2026-001]              ×
GSK Pakistan · Exp Dec 2026
[-] 2 [+]   Rs 15.00/unit   Rs 30.00
            MRP: Rs 18.00   [Discount: 0%▼]
```

- Quantity: click [-]/[+] or type directly in the number field
- Unit price: shown but not editable (comes from batch sale_price)
- MRP: shown in muted text for reference
- Discount: dropdown 0-10% (or 0-maxPct from settings)
  Only pharmacist/cashier discount limit applies
  Owner/superadmin can apply up to 40%
- Remove button (×): removes item from cart

### 5.2 Cart totals

```
Items (3)                        Rs 75.00
Discount                         -Rs 5.00
Bag charge                        Rs 2.00
─────────────────────────────────────────
TOTAL                            Rs 72.00
```

### 5.3 Customer section (top of cart)

Optional customer selector:
```
[No customer selected ▼]
```
Click to open customer search modal:
- Search by name or phone
- Select existing customer
- "+ New Customer" quick-add (name + phone only)
- Clear selection

If customer selected with credit_balance > 0:
Show amber notice: "Customer has outstanding balance of Rs X"

### 5.4 Action buttons

```
[Hold Sale]         [Complete Sale →]
```

**Hold Sale:**
- Prompts for a label (optional, defaults to "Held at HH:MM")
- Saves current cart to DB as status='held' sale
- Clears cart to start fresh
- Adds to parked sales indicator

**Complete Sale:**
- Opens checkout modal (Section 6)

---

## 6. CHECKOUT MODAL

### 6.1 Cash sale

```
┌─────────────────────────────────────┐
│  Complete Sale                      │
│                                     │
│  Total:          Rs 72.00           │
│                                     │
│  Payment type:   ● Cash  ○ Credit   │
│                                     │
│  Amount received:  [_______]        │
│  Change:           Rs 0.00          │
│                                     │
│  Sale note: [optional...]           │
│                                     │
│  [Cancel]    [Complete & Print →]   │
└─────────────────────────────────────┘
```

Amount received field:
- Auto-fills with total amount
- If changed to higher value: change shown in green
- If lower than total: error shown, complete blocked

### 6.2 Credit sale

Credit option only shown if:
- A customer is selected on the cart
- Customer has credit_limit > 0
  OR customer has credit_limit = 0 (pharmacist can still proceed
  with a warning — owner/superadmin can set limit later)

```
Payment type:  ○ Cash  ● Credit (Udhaar)

Customer:      Ali Khan
Current balance:  Rs 200.00 (owes)
This sale:        Rs 72.00
New balance:      Rs 272.00 (will owe)

⚠️ This sale will be recorded to the customer ledger.
   Payment can be collected later.
```

### 6.3 On completion

1. Call `complete_sale()` RPC (atomic)
2. Show success screen:
   ```
   ✓ Sale Complete
   Receipt: SR-20260609-0042
   Total: Rs 72.00
   Change: Rs 3.00
   
   [Print Receipt]  [New Sale]
   ```
3. "New Sale" clears cart and returns to POS
4. "Print Receipt" triggers window.print() with receipt layout

---

## 7. PARKED SALES

Parked sales shown as tabs/buttons in the search panel:

```
Parked: [Customer A – Rs 55] [Customer B – Rs 120]
```

Maximum 5 parked sales (enforced client-side with error toast).

Clicking a parked sale:
- If current cart is empty: load parked sale into cart
- If current cart has items: prompt "Park current sale first?"
- On load: DELETE the held sale from DB, items go back into cart state

Parked sales stored in DB as `sales.status = 'held'`.
On page refresh: held sales for this cashier are re-loaded.

---

## 8. RECEIPT

Two layouts:

### 8.1 Thermal receipt (80mm)

```
================================
      PHARMACARE
      City Pharmacy Plus
      Tel: 0300-1234567
================================
Date: 08 Jun 2026  Time: 14:32
Receipt: SR-20260609-0042
Cashier: Ali Khan
--------------------------------
Panadol 500mg
  2 × Rs 15.00          Rs 30.00
Brufen 400mg
  1 × Rs 25.00          Rs 25.00
--------------------------------
Subtotal               Rs 55.00
Discount                -Rs 3.00
Bag charge              Rs 2.00
================================
TOTAL                  Rs 54.00
Cash received          Rs 60.00
Change                  Rs 6.00
================================
  Thank you for your visit.
================================
```

### 8.2 A4 receipt

Same information, wider format, pharmacy logo area.

Print triggered via `window.print()` with `@media print` CSS.
Two separate print stylesheets:
- `print-thermal.css` — 80mm width, mono font, no logos
- `print-a4.css` — standard A4, branded header

User selects receipt type in Settings (default: A4 for now).

---

## 9. SERVER ACTIONS

File: `app/actions/sales.ts`

```typescript
completeSale(input: CompleteSaleInput)
  // pharmacist, admin, superadmin
  // Calls complete_sale() RPC (atomic)
  // Returns { saleId, receiptNo, total, change }
  // logAction(CREATE_SALE)

holdSale(cartItems: CartItem[], holdLabel: string, customerId?, notes?)
  // pharmacist, admin, superadmin
  // Inserts sale with status='held', held_at=NOW()
  // Returns { saleId }
  // logAction(HOLD_SALE) -- add to audit.ts

resumeHeldSale(saleId: string)
  // pharmacist, admin, superadmin
  // Fetches held sale + items
  // Does NOT delete from DB yet (deleted when completed)
  // Returns { cart: Cart }

deleteHeldSale(saleId: string)
  // Called when held sale is resumed and then completed
  // Or when cashier explicitly discards a held sale
  // Soft-deletes the held sale record

voidSale(saleId: string, reason: string)
  // owner, superadmin only
  // Sets status='voided', voided_by, voided_at, void_reason
  // Restores stock_batches quantities (another RPC)
  // logAction(VOID_SALE)

getHeldSales(cashierId: string)
  // Returns all held sales for this cashier
  // Used on POS page load to restore parked sales indicator

searchMedicinesForPOS(query: string)
  // All 3 roles
  // Searches medicines + joins stock_batches for available stock
  // Returns medicines with batch info based on batch_selection_mode
  // FEFO: returns single best batch per medicine
  // manual/show_all: returns all batches per medicine
  // Filters: is_deleted=false, is_active=true, quantity > 0
  // Excludes expired batches (expiry_date > NOW())
```

---

## 10. COMPONENTS

```
components/pos/
  POSPage.tsx              ← main client orchestrator
  SearchPanel.tsx          ← left panel: search + results + parked
  MedicineSearchInput.tsx  ← the search/scan input field
  MedicineResultCard.tsx   ← single search result card
  BatchSelector.tsx        ← batch picker (manual/show_all modes)
  CartPanel.tsx            ← right panel: items + totals + actions
  CartItem.tsx             ← single cart item row
  CartTotals.tsx           ← subtotal, discount, bag charge, total
  CustomerSelector.tsx     ← customer search and selection
  ParkedSalesList.tsx      ← parked sale tabs/buttons
  CheckoutModal.tsx        ← cash/credit checkout flow
  ReceiptView.tsx          ← post-sale receipt display + print
  HoldSaleModal.tsx        ← label input when holding a sale
```

---

## 11. ROUTES

```
app/pharmacist/pos/page.tsx    ← replaces stub; server component
app/admin/pos/page.tsx         ← new; guards pos permission
app/superadmin/pos/page.tsx    ← new
```

Server components fetch:
- Settings: batch_selection_mode, bag_charge_enabled, 
  bag_charge_amount, pos_discount_max_pct, pos_receipt_footer
- Held sales for current cashier (via getHeldSales)
- Pharmacy name (for receipt header)
Pass all as props to POSPage client component.

---

## 12. KEYBOARD SHORTCUTS

```
/          → focus search input
Escape     → clear search / close modal
Enter      → select focused search result / confirm action
↑ ↓        → navigate search results
F2         → open customer selector
F4         → hold current sale
F5         → open checkout modal
```

Document shortcuts in a small help tooltip (? icon in topbar).

---

## 13. EXECUTION PLAN

### Phase 5A — Database + types + actions
1. Write migration 011 — show before running
2. I run manually in Supabase SQL editor
3. Update lib/db-types.ts (Sale, CartItem, etc.)
4. Create lib/pos-types.ts (CartItem, Cart, ParkedSale)
5. Create app/actions/sales.ts (7 actions)
6. Add new action types to lib/audit.ts 
   (HOLD_SALE, RESUME_SALE, VOID_SALE)
7. npx tsc --noEmit

### Phase 5B — Core POS UI
1. Build all 12 components in components/pos/
2. Wire routes: pharmacist/pos, admin/pos, superadmin/pos
3. Add POS links to admin sidebar (if permission)
4. npx tsc --noEmit + npx next build

### Phase 5C — Verification
1. Full browser test (Section 14 checklist)
2. Update route-access tests
3. Final build check

---

## 14. VERIFICATION CHECKLIST

BASIC SALE FLOW
[ ] POS page loads, search input auto-focused
[ ] Type medicine name → results appear < 200ms
[ ] Click result → item added to cart
[ ] Quantity adjust with [-]/[+] and direct input
[ ] Remove item from cart
[ ] Cart totals update correctly
[ ] Bag charge shown if enabled in settings

BATCH SELECTION
[ ] FEFO mode: single result per medicine (best batch auto-selected)
[ ] Manual mode: batch selector shown on medicine card
[ ] Show_all mode: each batch appears as separate result

CHECKOUT — CASH
[ ] Click Complete Sale → checkout modal opens
[ ] Amount received auto-filled
[ ] Enter amount > total → change calculated correctly
[ ] Enter amount < total → blocked with error
[ ] Complete → success screen with receipt number
[ ] Print Receipt → print dialog opens

CHECKOUT — CREDIT
[ ] Select a customer with credit limit > 0
[ ] Credit option appears in checkout
[ ] Complete credit sale → customer balance updated
[ ] Credit sale visible in sale history

HOLD/PARK SALE
[ ] Add items to cart
[ ] Click Hold Sale → label prompt → cart cleared
[ ] Parked sale appears in parked list
[ ] Click parked sale → items restore to cart
[ ] Maximum 5 parked sales enforced

PRESCRIPTION FLAG
[ ] Add a controlled medicine → flag shown
[ ] Add a prescription medicine → flag shown
[ ] Sale can still complete (full prescription in Phase 6)

KEYBOARD SHORTCUTS
[ ] / focuses search
[ ] Arrow keys navigate results  
[ ] Enter selects result
[ ] F4 holds sale
[ ] F5 opens checkout

---

## 15. RULES (add to CLAUDE.md)

```
## Phase 5 Rules — POS
- Sale completion MUST use complete_sale() RPC — never 
  separate client calls for sale + stock decrement
- Cart state lives in React state only (never localStorage)
- Held sales are saved to DB with status='held'
- Expired batches never appear in POS search results
- Out-of-stock batches (quantity=0) never appear in POS
- MRP enforcement is double-checked in complete_sale() RPC
  even if app layer already validates
- Barcode detection threshold: input arriving faster than 
  50ms per character is treated as scanner input
- Maximum parked sales: 5 (enforced client-side)
```

---

*End of PHARMACARE_PHASE_5_POS.md*