# PharmaCare — Phase 5B: POS Discount Display, Batch Selection & Layout Variants

## Overview

Three combined deliverables implemented together because they share the same
cart item type and POS context shape:

1. **Discount display** — show MRP and per-line patient discount at POS
   (computed from existing data, zero schema change)
2. **Explicit batch selection** — pharmacist sees and chooses specific batch
   when multiple batches available (zero schema change)
3. **Three POS layout variants** — Card (current), Table, Mixed — full
   functionality in each, keyboard-driven, user-persisted

No migrations in this phase. No changes to complete_sale() RPC.
No changes to receipt template.

---

## Current POS Architecture (Read Before Touching Anything)

Before writing any code, the agent must read and show the current content of:

1. `lib/pos-context.tsx` — CartItem type, cart state, all actions
2. `components/pos/POSPage.tsx` (or equivalent top-level POS component)
3. `components/pos/CheckoutModal.tsx`
4. `components/pos/CartItem.tsx` or equivalent cart display component
5. The medicine search component used at POS
6. `app/superadmin/settings/page.tsx` — confirm service fee / freight
   label is already configurable (it should be from Phase 5)

Show all six files fully before writing a single line of new code.

---

## Part 1 — Cart Item Type Extension

### Current CartItem type (approximate)
```typescript
interface CartItem {
  medicineId: string
  medicineName: string
  quantity: number
  unitPrice: number      // = sale_price from batch
  // ... other fields
}
```

### New CartItem type (extend, do not break existing fields)
```typescript
interface CartItem {
  // Existing fields — keep all unchanged
  medicineId:     string
  medicineName:   string
  quantity:       number
  unitPrice:      number       // sale_price — what customer pays

  // NEW: batch fields
  batchId:        string       // stock_batches.id
  batchNo:        string       // stock_batches.batch_no
  expiryDate:     string | null // stock_batches.expiry_date

  // NEW: discount display fields
  mrp:            number       // stock_batches.mrp
  // patientDiscount is COMPUTED, not stored: mrp - unitPrice
  // discountPct is COMPUTED: ((mrp - unitPrice) / mrp) * 100

  // NEW: special discount (Phase 5B-2, set to 0 for now)
  specialDiscountPct: number   // 0 until Phase 5B-2 is built
}
```

All context actions (addItem, updateQuantity, removeItem, clearCart,
holdSale, etc.) must be updated to handle the new fields.
holdSale serialises CartItem[] to JSONB — the new fields must be included
in the held cart data so a held sale restores with batch info intact.

---

## Part 2 — Batch Picker

### When to show batch picker

When a medicine is added to the cart (any layout, any trigger):

```
Step 1: Fetch batches for this medicine (call getBatchesForMedicine())
Step 2: If only 1 batch with qty > 0 → auto-select, skip picker
Step 3: If 0 batches with qty > 0 → show "Borrow to Fulfill" (existing)
Step 4: If 2+ batches with qty > 0 → show batch picker overlay
```

### Batch picker UI

Small overlay/popover (not a full modal) anchored to the medicine card
or table row that triggered it.

```
┌─────────────────────────────────────────────────────────┐
│  Select Batch — Panadol 500mg                     [Esc] │
├──────────────┬────────────┬───────┬──────────┬──────────┤
│  Batch No    │ Expiry     │  Qty  │ Sale     │ Discount │
├──────────────┼────────────┼───────┼──────────┼──────────┤
│  BTH-2026-003│ Oct 2026   │  7    │ Rs 85    │ 15%      │
│  BTH-2026-002│ Nov 2026   │  10   │ Rs 85    │ 15%      │
│▶ BTH-2026-001│ Dec 2026   │  54   │ Rs 80    │ 20%      │
└──────────────┴────────────┴───────┴──────────┴──────────┘
  Arrow keys to navigate · Enter to select · Esc to cancel
```

- Default highlight: first row (FEFO — nearest expiry first)
- Discount column: computed as ((mrp - sale_price) / mrp * 100).toFixed(0) + '%'
- Expiry colour: red if < today, amber if within 90 days
- Rows with qty = 0: greyed out, not selectable
- Keyboard: ↑↓ navigate rows, Enter selects, Esc cancels
- Click also selects

On selection: add item to cart with full batch data populated.

### Batch info on receipt

Batch No and Expiry Date are NEVER printed on the receipt.
Existing receipt template is unchanged.
Batch data is stored in sale_items.batch_id and sale_items.batch_no
for inventory tracking — this already works via complete_sale().

---

## Part 3 — Discount Display at POS

### Per-line discount display in cart (all layouts)

For each cart item, show:
```
Panadol 500mg                         Qty: 2
MRP: Rs 100.00  Sale: Rs 85.00  Discount: Rs 15.00 (15%)
                                Line Total: Rs 170.00
```

Discount is always computed — never stored separately:
```typescript
const patientDiscount = item.mrp - item.unitPrice
const discountPct = ((patientDiscount / item.mrp) * 100).toFixed(0)
const lineDiscount = patientDiscount * item.quantity
```

If mrp === unitPrice: show no discount line (patient pays full MRP).

### Calculation panel totals

```
Gross Value (at MRP):    sum(item.mrp × item.quantity)
Patient Discount:        sum((item.mrp - item.unitPrice) × item.quantity)
─────────────────────────────────────────────────────
Net Value:               sum(item.unitPrice × item.quantity)
Freight:                 [service fee from settings]
Adv. Tax:                Rs 0.00  (display only, always zero)
─────────────────────────────────────────────────────
Total:                   Net Value + Freight
Received:                [input field]
Balance:                 Received - Total
```

Gross Value label: "Gross Value (at MRP)"
This makes clear to pharmacist that gross = if full MRP were charged.

---

## Part 4 — Three POS Layout Variants

### Layout selection and persistence

Layout selector: three toggle buttons in POS header
  [Card] [Table] [Mixed]

Persisted in localStorage: key = `pos_layout_${userId}`
Default if not set: 'card' (current behaviour)

All three layouts share:
- Same cart state (pos-context)
- Same batch picker overlay
- Same checkout flow and CheckoutModal
- Same keyboard shortcuts map
- Same held sales (F4/F5)
- Same return flow (F6)
- Same borrow-to-fulfill flow
- Same shift enforcement

---

### Layout A — Card (current, extract into named component)

Extract current POS medicine grid into `CardLayout.tsx`.
No functional changes. Just extracts it so it can be swapped.

Medicine grid: 4 columns, search bar above.
Cart: right sidebar.
Keyboard: existing shortcuts unchanged.

---

### Layout B — Table Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [F2 Search medicine...                                    ] [Card][Table][Mix]│
├──────┬─────────────────────────┬──────────┬──────┬─────────┬────────┬───────┤
│  #   │ Product Name            │ Price    │ Qty  │ Gross   │ Net    │ Supp. │
├──────┼─────────────────────────┼──────────┼──────┼─────────┼────────┼───────┤
│  1   │ Panadol 500mg           │ Rs 85    │ [2]  │ Rs 200  │ Rs 170 │ GSK   │
│      │ BTH-2026-001 · Dec 2026 │ MRP: 100 │      │ MRP     │ -15%   │       │
│  2   │ Brufen 400mg            │ Rs 45    │ [1]  │ Rs 50   │ Rs 45  │ AGP   │
│      │ BTH-2026-003 · Nov 2026 │ MRP: 50  │      │ MRP     │ -10%   │       │
├──────┴─────────────────────────┴──────────┴──────┴─────────┴────────┴───────┤
│ [+ Add Medicine]                                                              │
└───────────────────────────────────────────────┬───────────────────────────────┘
                                                │ Gross Value (MRP):  Rs 250.00 │
                                                │ Patient Discount:  -Rs  30.00 │
                                                │ Net Value:          Rs 220.00 │
                                                │ Freight:            Rs   1.50 │
                                                │ Adv. Tax:           Rs   0.00 │
                                                │ ─────────────────────────────│
                                                │ Total:              Rs 221.50 │
                                                │ Received:          [         ]│
                                                │ Balance:            Rs   0.00 │
                                                │                               │
                                                │ [F9 Complete Sale]            │
                                                │ [F4 Hold] [F6 Return] [F3 Alt]│
                                                └───────────────────────────────┘
```

**Table layout columns:**
| Column | Content |
|---|---|
| # | Row number |
| Product Name | Medicine name (bold) + batch info line below (smaller, grey) |
| Price | sale_price · "MRP: X" below |
| Qty | Always-visible number input, min 1 |
| Gross | qty × mrp (at full MRP price) |
| Net | qty × sale_price (actual charge) |
| Supplier | supplier_name from batch (if available) |
| Actions | Trash icon (Delete key also works) |

**Batch info line** (below medicine name in same cell):
`BTH-2026-001 · Dec 2026`
This is visible to pharmacist only — same data, never on receipt.

**Table layout keyboard map:**
```
F2          Focus search bar (add medicine)
Enter       In search: add top result to table; in qty field: move to next row
Tab         Move between qty fields down the table
Shift+Tab   Move between qty fields up the table
↑↓          Navigate rows
Delete      Remove selected row (with focus)
F3          Open generic alternatives comparison wizard
F4          Hold sale
F5          Retrieve held sale
F6          Process return
F9          Complete sale (open checkout modal)
Esc         Cancel / close any open overlay
Backspace   In qty field: normal; in search: clear
```

**Adding medicine in table layout:**
- F2 focuses search bar at top of table
- Typing searches medicines (debounced 200ms, same as card layout)
- Results appear as dropdown below search bar
- Arrow keys navigate dropdown, Enter selects
- Batch picker appears if multiple batches
- After batch selected: new row appended to table, qty field focused

**Inline qty editing:**
- Qty cell shows `<input type="number" min="1">` always
- Changing qty: updates cart immediately (no save button)
- If qty exceeds batch stock: show inline warning "Only X available"
  and cap at available qty

---

### Layout C — Mixed Layout

Left panel (60% width): Card grid for medicine selection (same as Layout A).
Right panel (40% width): Split vertically:
  - Top half: Cart as compact table (same columns as Layout B, smaller)
  - Bottom half: Calculation panel (same as Layout B)

```
┌──────────────────────────────┬─────────────────────────────────────┐
│ [Search...              ]    │ # │ Name          │ Qty │ Net        │
│                              ├───┼───────────────┼─────┼────────────┤
│ [Panadol]  [Brufen]          │ 1 │ Panadol 500mg │ [2] │ Rs 170     │
│ [Augmentin][Metformin]       │ 2 │ Brufen 400mg  │ [1] │ Rs  45     │
│ [Atorv.]   [Omeprazole]      ├───┴───────────────┴─────┴────────────┤
│ [Ceftriax.][Amlodipine]      │ Gross (MRP):        Rs 250.00        │
│                              │ Discount:          -Rs  30.00        │
│                              │ Net:                Rs 220.00        │
│                              │ Freight:            Rs   1.50        │
│                              │ Adv. Tax:           Rs   0.00        │
│                              │ ─────────────────────────────────── │
│                              │ Total:              Rs 221.50        │
│                              │ Received:          [              ]  │
│                              │ Balance:            Rs   0.00        │
│                              │ [F9 Complete] [F4 Hold] [F3 Alt]    │
└──────────────────────────────┴─────────────────────────────────────┘
```

Keyboard in mixed layout:
- Same as Card layout for medicine selection (typing searches)
- Tab moves focus to cart table for qty editing
- F9 completes sale
- All other F-key shortcuts identical

---

## Part 5 — Calculation Panel (Shared Component)

Create `components/pos/CalculationPanel.tsx` — used by all three layouts.

Props:
```typescript
interface CalculationPanelProps {
  items: CartItem[]
  freightAmount: number          // from settings
  freightEnabled: boolean        // from settings
  freightLabel: string           // from settings (may be "Freight")
  onCompleteCheckout: () => void // opens checkout modal
  onHold: () => void
  onReturn: () => void
  onCompareGenerics: () => void  // Phase 5B-4, wire up in Phase 5B-3
  layout: 'card' | 'table' | 'mixed'
}
```

Computed values (all in component, not stored):
```typescript
const grossAtMRP = items.reduce((sum, i) => sum + i.mrp * i.quantity, 0)
const totalDiscount = items.reduce(
  (sum, i) => sum + (i.mrp - i.unitPrice) * i.quantity, 0
)
const netValue = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
const freight = freightEnabled ? freightAmount : 0
const advTax = 0  // always zero until FBR module
const total = netValue + freight + advTax
```

Display format: all monetary values as `Rs X,XXX.00` with comma separator.

Action buttons in calculation panel:
- [F9 Complete Sale] — primary, green, calls onCompleteCheckout
- [F4 Hold] — secondary
- [F6 Return] — secondary  
- [F3 Generics] — secondary, opens comparison (stub for now)

---

## Part 6 — Keyboard Shortcut Map (All Layouts)

Define in `lib/pos-shortcuts.ts`:

```typescript
export const POS_SHORTCUTS = {
  COMPLETE_SALE:    'F9',
  HOLD_SALE:        'F4',
  RETRIEVE_HELD:    'F5',
  PROCESS_RETURN:   'F6',
  BORROW_FULFILL:   'F7',
  COMPARE_GENERICS: 'F3',
  SHOW_HELP:        '?',
  FOCUS_SEARCH:     'F2',
  CANCEL_CLOSE:     'Escape',
} as const
```

Update existing keyboard shortcut hints display (the ? overlay) to include
F2, F3, F7, F9 in addition to existing shortcuts.

The existing shortcuts (F4, F5, F6, Esc, ?) must continue to work in all
three layouts. Do not break existing shortcut handling.

---

## Part 7 — Settings Read for Freight

The freight/service fee values are already read from settings at POS load.
Verify the existing settings read pattern in POSPage and ensure:
- `service_fee_amount` → freightAmount
- `service_fee_enabled` → freightEnabled
- `service_fee_label` → freightLabel (client may rename to "Freight"
  in their settings — the label from settings is used verbatim)

No changes needed to settings read logic — just confirm it passes
through to CalculationPanel.

---

## Implementation Phases for Agent

### Session A — Context + Batch Picker (no UI layout changes)
1. Read all 6 current files (mandatory)
2. Extend CartItem type in pos-context.tsx
3. Update all context actions to handle new fields
4. Implement batch picker overlay component
5. Wire batch picker into medicine add flow (card layout only for now)
6. tsc --noEmit — must be clean

### Session B — Discount Display + Calculation Panel
1. Add MRP + discount display to cart items (card layout)
2. Build CalculationPanel component (shared)
3. Wire freight from settings into panel
4. tsc + jest tests

### Session C — Layout B (Table) + Layout C (Mixed)
1. Extract current card layout into CardLayout.tsx
2. Build TableLayout.tsx
3. Build MixedLayout.tsx
4. Layout switcher in POS header
5. localStorage persistence
6. Keyboard map for table layout
7. Full test suite

---

## What Does NOT Change

These must be explicitly preserved and tested after every session:
- complete_sale() RPC — no parameter changes
- Receipt template — no changes, batch info never printed
- Held sales (F4/F5) — held_cart_data now includes batch fields
- Return flow (F6) — unchanged
- Borrow-to-fulfill — unchanged
- Shift enforcement (no open shift = no complete sale) — unchanged
- Session timeout — unchanged
- All 145 route-access tests must still pass
- All 83 rls-policies tests must still pass

---

## Files Changed

### New files
- `components/pos/BatchPicker.tsx`
- `components/pos/CalculationPanel.tsx`
- `components/pos/layouts/CardLayout.tsx`
- `components/pos/layouts/TableLayout.tsx`
- `components/pos/layouts/MixedLayout.tsx`
- `lib/pos-shortcuts.ts`

### Modified files
- `lib/pos-context.tsx` — CartItem type extended
- `components/pos/POSPage.tsx` — layout switcher, layout rendering
- `components/pos/CheckoutModal.tsx` — uses updated CartItem type
- Existing cart display component — MRP + discount display

### Unchanged files (explicitly do not touch)
- Receipt template / print component
- complete_sale() RPC
- All settings actions
- All ledger/accounting components
- All report components

---

## Spec Version
Created: 2026-06-26
Phase: 5B (follows Phase 5 POS, Phase 6 Returns)
Migration: None
Next phases: 5B-2 (special discount permission), 5B-4 (generic alternatives)