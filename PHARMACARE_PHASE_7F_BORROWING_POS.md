# PHARMACARE — PHASE 7F: BORROWING POS INTEGRATION
> **Version:** 1.0  
> **Depends on:** Phase 5 (POS), Phase 7 (Ledger), Phase 11 (Shifts)  
> **Scope:** Borrow-to-fulfill at POS, lend-to-pharmacy, end-of-day  
> borrowing report, configurable settlement per pharmacy  
> **Read ALL previous specs before writing any code.**

---

## 0. AGENT INSTRUCTIONS

This module connects the borrowing ledger (Phase 7) directly into the 
POS sale flow. It must handle two concurrent concerns:
1. The customer sale (revenue, stock decrement, receipt)
2. The borrowing transaction (liability to neighbor pharmacy)

Both must happen atomically. A borrowed item sold to a customer creates 
TWO financial events in one operation.

---

## 1. BORROWING CONCEPTS

### 1.1 Borrow-to-fulfill (we borrow FROM another pharmacy)

Scenario: Customer wants Amoxil 500mg. We're out of stock. The neighbor 
pharmacy (City Pharma) has it. Our pharmacist walks over, gets the 
medicine, and sells it to the customer.

Financial reality:
- Customer pays US our sale price (e.g. Rs 85)
- We OWE City Pharma their cost price (e.g. Rs 70)
- Our margin: Rs 15

System records:
- Sale: normal sale at Rs 85 (revenue)
- Borrowing transaction: borrow_in Rs 70 from City Pharma
- Journal: DEBIT Inventory, CREDIT Borrowing Payable (2010)
- City Pharma's balance goes negative (we owe them)

### 1.2 Lend-to-pharmacy (another pharmacy borrows FROM us)

Scenario: City Pharma needs Panadol. They send someone to pick it up.
We give them 10 strips at Rs 15/strip (our cost or agreed price).

System records:
- NOT a sale (no customer, no revenue)
- Stock decremented from our inventory
- Borrowing transaction: borrow_out Rs 150 to City Pharma
- Journal: DEBIT Borrowing Receivable (1110), CREDIT Inventory (1200)
- City Pharma's balance goes positive (they owe us)

### 1.3 Settlement

At agreed intervals, pharmacies settle their balances:
- If we owe City Pharma Rs 500: we pay them cash
- If City Pharma owes us Rs 300: they pay us cash
- Net settlement: we pay Rs 200 (or vice versa)

---

## 2. DATABASE CHANGES — Migration 022

### 2.1 borrowing_pharmacies — add settlement fields

```sql
ALTER TABLE borrowing_pharmacies
  ADD COLUMN IF NOT EXISTS settlement_cadence TEXT DEFAULT 'daily'
    CHECK (settlement_cadence IN ('daily', 'weekly', 'monthly', 'custom')),
  ADD COLUMN IF NOT EXISTS settlement_day INT,
    -- For weekly: 0=Sun, 1=Mon...6=Sat
    -- For monthly: 1-28 (day of month)
    -- For daily/custom: NULL
  ADD COLUMN IF NOT EXISTS last_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_notes TEXT;
```

### 2.2 borrowing_transactions — add sale reference

```sql
ALTER TABLE borrowing_transactions
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id),
  ADD COLUMN IF NOT EXISTS sale_item_id UUID REFERENCES sale_items(id),
  ADD COLUMN IF NOT EXISTS is_pos_borrow BOOLEAN DEFAULT FALSE;
  -- TRUE = created automatically during a POS sale
  -- FALSE = created manually from ledger/borrowing page
```

### 2.3 sale_items — add borrowed flag

```sql
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS is_borrowed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS borrowed_from UUID REFERENCES borrowing_pharmacies(id),
  ADD COLUMN IF NOT EXISTS borrow_cost NUMERIC(10,2);
  -- The cost we owe the lending pharmacy for this item
```

### 2.4 Settings

```sql
INSERT INTO settings (key, value, label) VALUES
  ('borrowing_default_margin_pct', '20',
   'Default markup percentage on borrowed items'),
  ('borrowing_require_approval', 'false',
   'Require superadmin approval for borrowing at POS')
ON CONFLICT (key) DO NOTHING;
```

---

## 3. POS INTEGRATION — BORROW TO FULFILL

### 3.1 Search results for out-of-stock medicines

Currently, out-of-stock medicines don't appear in POS search results 
(searchMedicinesForPOS filters quantity > 0).

Change: Show out-of-stock medicines in search results, but with a 
different appearance:

```
┌──────────────────────────────────┐
│ Amoxil 500mg           OUT OF    │
│ Rs 85.00               STOCK    │
│ 0 units                         │
│            [Borrow to Fulfill]  │
└──────────────────────────────────┘
```

- Out-of-stock card: grayed out background, red "OUT OF STOCK" badge
- "Borrow to Fulfill" button (amber) appears instead of the normal 
  click-to-add behavior
- Clicking the card body does nothing (can't add zero-stock item)
- Only the "Borrow to Fulfill" button is interactive

### 3.2 Borrow-to-fulfill modal

When pharmacist clicks "Borrow to Fulfill":

```
┌─────────────────────────────────────┐
│  Borrow to Fulfill                  │
│                                      │
│  Medicine: Amoxil 500mg             │
│  Our sale price: Rs 85.00           │
│                                      │
│  Borrow from:                       │
│  [Select pharmacy ▼]               │
│  (dropdown of active borrowing      │
│   pharmacies)                       │
│                                      │
│  Their cost to us: [Rs 70.00]      │
│  (what we'll owe them)             │
│                                      │
│  Our margin: Rs 15.00 (17.6%)      │
│                                      │
│  Quantity: [1]                      │
│                                      │
│  [Cancel] [Add to Cart as Borrowed] │
└─────────────────────────────────────┘
```

On "Add to Cart as Borrowed":
- Item added to cart with a "Borrowed" tag/badge
- Cart shows: "Amoxil 500mg [Borrowed from City Pharma]"
- The borrow_cost is stored on the cart item
- The borrowed_from pharmacy ID is stored on the cart item

### 3.3 Cart display for borrowed items

Borrowed items in the cart look slightly different:

```
Amoxil 500mg                    [Trash]
Borrowed from City Pharma
Qty: [-] 1 [+]  × Rs 85.00  = Rs 85.00
Cost to us: Rs 70.00 | Margin: Rs 15.00
```

The "Cost to us" line is visible only to inform the pharmacist.
It does NOT appear on the customer receipt.

### 3.4 Checkout with borrowed items

When complete_sale() processes a cart containing borrowed items:

For each borrowed item:
1. Normal sale recorded (customer pays our price)
2. Borrowing transaction auto-created:
   - transaction_type: 'borrow_in'
   - pharmacy_id: borrowed_from
   - medicine_id, quantity, unit_price = borrow_cost
   - total_amount = quantity × borrow_cost
   - sale_id = this sale's ID
   - is_pos_borrow = TRUE
3. Borrowing pharmacy balance updated:
   - current_balance -= total_amount (we owe them more)
4. Journal entry posted:
   - Already handled by complete_sale() for the sale side
   - Additional entry for borrowing:
     DEBIT  1200 (Inventory)          borrow_cost
     CREDIT 2010 (Borrowing Payable)  borrow_cost
     party_type = 'pharmacy', party_id = pharmacy_id

### 3.5 Stock handling for borrowed items

Key question: borrowed items are NOT in our stock_batches.
The pharmacist physically has the medicine but our system has 
quantity = 0 for that batch.

Solution: When a borrowed item is added to cart, the system creates 
a TEMPORARY stock entry:

1. On complete_sale(), for each borrowed item:
   - Create a new stock_batch row:
     medicine_id, batch_no = 'BRW-' + pharmacy_id[:8],
     quantity = borrow_qty, purchase_price = borrow_cost,
     supplier_id = NULL, is_borrowed = TRUE (new column needed)
   - The sale_item references this new batch_id
   - complete_sale() decrements this batch to 0

This way the double-entry is clean: inventory goes up (borrow in) 
then immediately down (sold to customer). Net stock change = 0.

---

## 4. LEND TO PHARMACY (from POS or separate page)

### 4.1 POS quick action

Add a "Lend to Pharmacy" button in the POS sidebar or as a 
secondary action (not in the main sale flow — lending is not a sale).

Clicking opens a modal:

```
┌─────────────────────────────────────┐
│  Lend to Pharmacy                   │
│                                      │
│  Pharmacy: [Select pharmacy ▼]      │
│                                      │
│  Medicine: [Search...]              │
│  (search our inventory)             │
│                                      │
│  Quantity: [10]                     │
│  Available: 50 units                │
│                                      │
│  Our price to them: [Rs 15.00]     │
│  (default: purchase_price from batch)│
│                                      │
│  Total: Rs 150.00                   │
│                                      │
│  [Cancel] [Record Lending]          │
└─────────────────────────────────────┘
```

On "Record Lending":
1. Stock decremented from our batch
2. Borrowing transaction created:
   - transaction_type: 'borrow_out'
   - total_amount = qty × price
3. Pharmacy balance updated:
   - current_balance += total_amount (they owe us more)
4. Journal entry:
   DEBIT  1110 (Borrowing Receivable)  total
   CREDIT 1200 (Inventory)             total
   party_type = 'pharmacy'
5. Audit log: LEND_TO_PHARMACY

### 4.2 Also accessible from /superadmin/ledger/borrowing

The existing borrowing transaction modal already handles borrow_out.
Ensure it also decrements stock when a medicine and batch are selected.

---

## 5. END-OF-DAY BORROWING REPORT

### 5.1 Report content

Printable summary of all borrowing activity for a given date:

```
BORROWING REPORT — 20 Jun 2026
PharmaCare

BORROWED FROM OTHERS (we owe):
  City Pharma:
    Amoxil 500mg    ×1   Rs 70.00    (Sale: SR-20260620-0005)
    Flagyl 400mg    ×2   Rs 60.00    (Sale: SR-20260620-0008)
  Subtotal: Rs 130.00

  MedPlus:
    Brufen 400mg    ×1   Rs 20.00    (Sale: SR-20260620-0012)
  Subtotal: Rs 20.00

TOTAL WE OWE TODAY: Rs 150.00

LENT TO OTHERS (they owe us):
  City Pharma:
    Panadol 500mg   ×10  Rs 150.00
  Subtotal: Rs 150.00

TOTAL THEY OWE TODAY: Rs 150.00

NET TODAY: Rs 0.00 (balanced)

RUNNING BALANCES:
  City Pharma:    We owe Rs 500 (cumulative)
  MedPlus:        They owe us Rs 200 (cumulative)
```

### 5.2 Access

- `/pharmacist/shifts` — "Print Borrowing Report" button 
  (for today, during/after shift)
- `/superadmin/ledger/borrowing` — date picker + print for any date
- Auto-included in shift close summary

---

## 6. SETTLEMENT MANAGEMENT

### 6.1 Settlement cadence per pharmacy

Each borrowing_pharmacies row has:
- settlement_cadence: 'daily', 'weekly', 'monthly', 'custom'
- settlement_day: day of week (weekly) or day of month (monthly)
- last_settled_at: when the last settlement happened

### 6.2 Settlement reminder

On the superadmin dashboard, show a reminder when a pharmacy's 
settlement is due:

"City Pharma settlement due today (daily cadence, balance: Rs 500)"
[Settle Now] button → opens settlement modal

### 6.3 Settlement modal

```
Settle with City Pharma

Current balance: Rs -500.00 (we owe them)

Settlement type:
  ● Full settlement (Rs 500.00)
  ○ Partial settlement: [Rs ___]

Payment method: [Cash ▼]
Reference: [optional]
Notes: [optional]

[Process Settlement]
```

On settlement:
1. Creates borrowing_transaction: payment_out Rs 500
2. Updates pharmacy balance
3. Posts journal entry:
   DEBIT  2010 (Borrowing Payable)  500
   CREDIT 1000 (Cash)               500
4. Updates last_settled_at
5. Audit log: BORROWING_SETTLEMENT

---

## 7. SERVER ACTIONS

### New actions in app/actions/borrowing.ts (new file):

```typescript
borrowToFulfill(input)
  // pharmacist, admin, superadmin
  // Input: medicineId, pharmacyId, quantity, borrowCost
  // Creates temporary stock batch
  // Returns cart item data with borrowed flags
  // Does NOT create borrowing transaction yet —
  // that happens in complete_sale()

lendToPharmacy(input)
  // pharmacist, admin, superadmin
  // Input: pharmacyId, medicineId, batchId, quantity, price
  // Decrements stock, creates borrowing transaction,
  // posts journal entry, updates pharmacy balance

getDailyBorrowingReport(date)
  // all roles
  // Returns grouped transactions for the date

getSettlementDuePharmacies()
  // superadmin
  // Returns pharmacies where settlement is due

processSettlement(pharmacyId, amount, method, notes)
  // superadmin only
  // Creates payment transaction, posts journal,
  // updates balance and last_settled_at

updatePharmacySettlement(pharmacyId, cadence, day)
  // superadmin only
  // Updates settlement_cadence and settlement_day
```

### Modified actions:

```typescript
// app/actions/sales.ts — completeSale()
// Must detect borrowed items in the cart and:
// 1. Create temporary stock batch (if not already created)
// 2. After complete_sale() RPC succeeds:
//    Create borrowing_transactions for each borrowed item
//    Post borrowing journal entries
//    Update pharmacy balances
// All in a server action wrapper, not inside the RPC
// (the RPC handles sale + accounting, borrowing is layered on top)
```

---

## 8. EXECUTION PLAN

### Phase 7F-A — Database migration 022
- ALTER borrowing_pharmacies: settlement columns
- ALTER borrowing_transactions: sale references
- ALTER sale_items: borrowed flags
- ALTER stock_batches: is_borrowed flag
- Settings seed
- Show SQL, run manually, verify

### Phase 7F-B — Server actions
- Create app/actions/borrowing.ts
- Modify completeSale in app/actions/sales.ts
- Add audit types: BORROW_TO_FULFILL, LEND_TO_PHARMACY,
  BORROWING_SETTLEMENT
- npx tsc --noEmit

### Phase 7F-C — POS integration UI
- Modify searchMedicinesForPOS: include out-of-stock
- Modify MedicineResultCard: out-of-stock appearance
- Create BorrowToFulfillModal
- Modify CartItem: borrowed badge
- Modify CheckoutModal: handle borrowed items post-sale
- Create LendToPharmacyModal
- Add Lend button to POS

### Phase 7F-D — Reports + Settlement UI
- Daily borrowing report component
- Settlement management on borrowing detail page
- Settlement reminders on superadmin dashboard
- Print borrowing report

### Phase 7F-E — Verification + tests
- Full browser test
- Route tests
- Full suite

---

## 9. RULES (add to CLAUDE.md)

```
## Phase 7F Rules — Borrowing POS Integration
- Borrowed items create TEMPORARY stock batches 
  (batch_no starts with 'BRW-')
- The temporary batch is created and decremented 
  in the same transaction — net stock change = 0
- Borrowing transactions are created AFTER 
  complete_sale() succeeds — never before
- Settlement is superadmin-only
- Daily borrowing report auto-prints with shift close
- Borrowed items show on POS cart but NOT on 
  customer receipt (borrow cost is internal info)
- Customer pays our sale price, not the borrow cost
```

---

*End of PHARMACARE_PHASE_7F_BORROWING_POS.md*