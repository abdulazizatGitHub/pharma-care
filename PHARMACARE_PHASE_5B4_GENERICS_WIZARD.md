# PharmaCare — Phase 5B-4: Generic Alternatives Comparison Wizard

## Overview

A full-screen comparison wizard accessible via F3 at POS or via
a standalone search. Shows alternative generic brands for medicines
in the cart (or searched). Supports manual per-row selection,
full-column selection, and automatic lowest-price selection.
On apply, updates the cart with the selected medicines.

---

## Part 1 — Database Migration 030

### New DB function: get_generic_alternatives

```sql
CREATE OR REPLACE FUNCTION get_generic_alternatives(
  p_medicine_ids UUID[]
)
RETURNS TABLE (
  generic_name_id   UUID,
  generic_name      TEXT,
  original_med_id   UUID,
  medicine_id       UUID,
  medicine_name     TEXT,
  manufacturer      TEXT,
  is_original       BOOLEAN,
  batch_id          UUID,
  batch_no          TEXT,
  expiry_date       DATE,
  available_qty     INTEGER,
  purchase_price    NUMERIC,
  sale_price        NUMERIC,
  mrp               NUMERIC,
  discount_pct      NUMERIC,
  option_index      INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input_medicines AS (
    SELECT
      m.id AS medicine_id,
      m.generic_name_id,
      gn.name AS generic_name
    FROM medicines m
    JOIN generic_names gn ON gn.id = m.generic_name_id
    WHERE m.id = ANY(p_medicine_ids)
      AND m.is_deleted = false
      AND m.generic_name_id IS NOT NULL
  ),
  all_alternatives AS (
    SELECT
      im.generic_name_id,
      im.generic_name,
      im.medicine_id AS original_med_id,
      m2.id AS alt_med_id,
      m2.name AS alt_med_name,
      m2.manufacturer,
      (m2.id = im.medicine_id) AS is_original,
      sb.id AS batch_id,
      sb.batch_no,
      sb.expiry_date,
      sb.quantity AS available_qty,
      sb.purchase_price,
      sb.sale_price,
      sb.mrp,
      CASE
        WHEN sb.mrp > 0 AND sb.sale_price IS NOT NULL
        THEN ROUND(((sb.mrp - sb.sale_price) / sb.mrp) * 100, 1)
        ELSE 0
      END AS discount_pct,
      ROW_NUMBER() OVER (
        PARTITION BY im.generic_name_id, m2.id
        ORDER BY sb.expiry_date ASC NULLS LAST
      ) AS batch_rank
    FROM input_medicines im
    JOIN medicines m2
      ON  m2.generic_name_id = im.generic_name_id
      AND m2.is_deleted = false
      AND m2.is_active = true
    JOIN stock_batches sb
      ON  sb.medicine_id = m2.id
      AND sb.is_deleted = false
      AND sb.quantity > 0
      AND sb.sale_price IS NOT NULL
      AND sb.mrp IS NOT NULL
  ),
  best_batch_per_medicine AS (
    SELECT * FROM all_alternatives WHERE batch_rank = 1
  ),
  ranked_options AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY generic_name_id
        ORDER BY is_original DESC, sale_price ASC
      ) AS option_index
    FROM best_batch_per_medicine
  )
  SELECT
    generic_name_id,
    generic_name,
    original_med_id,
    alt_med_id         AS medicine_id,
    alt_med_name       AS medicine_name,
    manufacturer,
    is_original,
    batch_id,
    batch_no,
    expiry_date,
    available_qty,
    purchase_price,
    sale_price,
    mrp,
    discount_pct,
    option_index::INTEGER
  FROM ranked_options
  ORDER BY generic_name_id, is_original DESC, sale_price ASC;
END;
$$;

REVOKE ALL    ON FUNCTION get_generic_alternatives(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_generic_alternatives(UUID[]) TO authenticated;
```

### Function behaviour

- Only returns medicines that have stock with sale_price AND mrp set
- Best batch per medicine = FEFO (nearest expiry first)
- option_index: 1 = original (always first), 2,3,4 = alternatives
  sorted by sale_price ASC (cheapest first)
- Medicines in p_medicine_ids without a generic_name_id are excluded
  (wizard handles this by marking them as "no generic available")
- Returns one row per medicine per generic group

---

## Part 2 — Server Action

### getGenericAlternatives in app/actions/pos.ts

```typescript
export interface GenericAlternative {
  genericNameId:  string
  genericName:    string
  originalMedId:  string
  medicineId:     string
  medicineName:   string
  manufacturer:   string | null
  isOriginal:     boolean
  batchId:        string
  batchNo:        string
  expiryDate:     string | null
  availableQty:   number
  purchasePrice:  number | null
  salePrice:      number
  mrp:            number
  discountPct:    number
  optionIndex:    number
}

export async function getGenericAlternatives(
  medicineIds: string[]
): Promise<{ data: GenericAlternative[] | null; error: string | null }>
```

Calls: `supabase.rpc('get_generic_alternatives', {
  p_medicine_ids: medicineIds
})`

Role: pharmacist, admin, superadmin.

---

## Part 3 — Wizard UI

### 3.1 Trigger points

1. **F3 key** when POS is active:
   - If cart has items: opens wizard with cart medicine IDs
   - If cart is empty: opens wizard in search mode

2. **[Generics] button** in action buttons (all 3 layouts):
   Same behaviour as F3.

3. **Standalone search mode**:
   If cart is empty or user wants to compare without adding to
   cart first, wizard shows a search bar to find a medicine,
   then shows its alternatives. In this mode, selecting an
   option adds it to the cart.

### 3.2 Wizard layout

Full-screen overlay (fixed, z-index 1100, above BatchPicker).

```
┌────────────────────────────────────────────────────────────────────┐
│  Generic Alternatives Comparison                          [Esc ✕]  │
│  Compare generic options and select the best for your patient      │
├────────────────────────────────────────────────────────────────────┤
│  [Search medicine to add...]  ← only shown in search/empty mode   │
├──────────────────────┬──────────────────┬──────────────────────────┤
│                      │   ORIGINAL       │  OPTION 1  │  OPTION 2  │
│  ITEM                │   Panadol 500mg  │  Paracet.. │  Calpol    │
│                      │   (GSK)          │  (OBS)     │  (Pfizer)  │
├──────────────────────┼──────────────────┼────────────┼────────────┤
│  Paracetamol 500mg   │                  │            │            │
│  (generic group)     │                  │            │            │
│  ─ Panadol 500mg     │  ✓ In cart       │            │            │
│    Sale: Rs 18.50    │  Rs 18.50        │  Rs 14.00  │  Rs 15.00  │
│    MRP:  Rs 20.00    │  MRP Rs 20.00    │  MRP 16.00 │  MRP 17.00 │
│    Disc: 7.5%        │  Disc: 7.5%      │  Disc:12.5%│  Disc:11.8%│
│    Stock: 121        │  Stock: 121      │  Stock: 50 │  Stock: 50 │
│                      │  [○ Selected]    │  [○ Select]│  [○ Select]│
├──────────────────────┼──────────────────┼────────────┼────────────┤
│  Brufen 400mg        │                  │            │            │
│  ── No generic ──    │  Rs 45.00        │     ░░░░░░ │     ░░░░░░ │
│  (no generic linked) │  In cart         │  (no alt.) │  (no alt.) │
├──────────────────────┴──────────────────┴────────────┴────────────┤
│  SUMMARY             │   ORIGINAL       │  OPTION 1  │  OPTION 2  │
│  Gross (MRP):        │   Rs 70.00       │  Rs 67.00  │  Rs 69.00  │
│  Patient Discount:   │  -Rs  1.50       │ -Rs  2.00  │ -Rs  2.00  │
│  Net Total:          │   Rs 68.50       │  Rs 65.00  │  Rs 67.00  │
├──────────────────────┴──────────────────┴────────────┴────────────┤
│  [Select All Original] [Select All Option 1] [✦ Lowest Price]     │
│                                              [Cancel]  [Apply →]  │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 Column structure

**Row header column (leftmost, fixed):**
- Generic group name (e.g. "Paracetamol 500mg")
- Medicine name from cart (sub-label)
- "── No generic ──" for medicines with no generic_name_id

**Option columns (ORIGINAL + up to 3 alternatives):**
- ORIGINAL is always first (even if more expensive)
- Alternatives sorted by sale_price ASC (cheapest first)
- If only 1 medicine exists for a generic: show ORIGINAL column only, no alternatives
- Max 4 columns total (ORIGINAL + 3 alternatives)
- If more than 3 alternatives exist: show cheapest 3

**Greyed medicine rows (no generic):**
- Show medicine name and current cart price in ORIGINAL column
- Alternative columns show grey hatched pattern (░░░) with text "No alternative"
- Radio button not shown for greyed rows — they cannot be changed
- These items will always keep their original when Apply is clicked

### 3.4 Per-row selection

Each selectable medicine row has radio buttons per column.
Default selection: ORIGINAL column for all rows.

User can mix:
- Row 1 (Paracetamol): select Option 1
- Row 2 (Brufen): stays original (no alternatives, locked)

### 3.5 Bulk selection buttons

**[Select All Original]:**
Sets all selectable rows to ORIGINAL column.

**[Select All Option 1]** (or Option 2 etc — one button per
alternative column):
Sets all selectable rows to that column.
If a row has no alternative in that column: keeps ORIGINAL
for that row (does not error).

**[✦ Lowest Price]:**
For each selectable row independently:
  Find the column with the lowest sale_price for that generic.
  Set that row's selection to that column.
  If tie: prefer ORIGINAL (no unnecessary switch).
Example:
  Row 1 Paracetamol: Original=18.50, Option1=14.00, Option2=15.00
    → selects Option 1 (14.00)
  Row 2 Brufen: no alternatives → stays Original

### 3.6 Summary row

Below all medicine rows, a summary row shows column totals:
- Gross at MRP: sum of (mrp × qty) for selected items in that column
- Patient Discount: sum of ((mrp - salePrice) × qty)
- Net Total: sum of (salePrice × qty)

Quantities come from current cart quantities for cart-mode items,
or 1 for search-mode added items.

The currently selected column is highlighted (green border/header).

### 3.7 Apply button

On [Apply →]:
1. For each selectable row, take the selected column's medicine
2. For medicines that changed (not ORIGINAL selected):
   - Remove the original medicine from cart
   - Add the alternative medicine with its best batch
   - Keep the same quantity as the original
   - If alternative availableQty < cart qty: cap at availableQty
     and show a warning toast per item capped
3. For medicines that stayed ORIGINAL: no cart change
4. For greyed rows (no generic): no cart change
5. Close wizard
6. Show success toast: "Cart updated with X alternative(s)"

### 3.8 Cancel / Esc

Closes wizard with no cart changes.

---

## Part 4 — Wizard Component Structure

### Files to create

```
components/pos/generics/GenericComparisonWizard.tsx  (main)
components/pos/generics/GenericWizardRow.tsx          (one row)
components/pos/generics/GenericWizardSummary.tsx      (totals row)
components/pos/generics/GenericWizardSearch.tsx       (search mode)
```

### GenericComparisonWizard props

```typescript
interface GenericComparisonWizardProps {
  // Cart mode (F3 from active cart)
  cartItems?:      CartItem[]

  // Callbacks
  onApply:         (replacements: MedicineReplacement[]) => void
  onClose:         () => void
}

interface MedicineReplacement {
  originalCartItemId: string     // CartItem.id to remove
  newMedicineId:      string
  newMedicineName:    string
  newBatchId:         string
  newBatchNo:         string
  newExpiryDate:      string | null
  newSalePrice:       number
  newMrp:             number
  quantity:           number     // capped at availableQty
}
```

### POSPage integration

POSPage manages wizard open state:
```typescript
const [wizardOpen, setWizardOpen] = useState(false)
```

F3 key handler (in all layout keyboard handlers):
```typescript
if (e.key === 'F3') {
  e.preventDefault()
  setWizardOpen(true)
}
```

GenericComparisonWizard rendered at POSPage level (above layouts):
```typescript
{wizardOpen && (
  <GenericComparisonWizard
    cartItems={items}
    onApply={handleGenericApply}
    onClose={() => setWizardOpen(false)}
  />
)}
```

handleGenericApply in POSPage:
```typescript
function handleGenericApply(replacements: MedicineReplacement[]) {
  replacements.forEach(r => {
    removeItem(r.originalCartItemId)
    addItem({
      medicineId:         r.newMedicineId,
      medicineName:       r.newMedicineName,
      batchId:            r.newBatchId,
      batchNo:            r.newBatchNo,
      expiryDate:         r.newExpiryDate,
      unitPrice:          r.newSalePrice,
      mrp:                r.newMrp,
      quantity:           r.quantity,
      specialDiscountPct: 0,
      // isControlled, isPrescription: look up from medicine data
      // or default false for generic alternatives
    })
  })
  setWizardOpen(false)
}
```

---

## Part 5 — Migration File

supabase/migrations/030_generic_alternatives_function.sql

---

## Implementation Sessions

### Session A — DB function + server action
1. Verify \d medicines, \d stock_batches, \d generic_names first
2. Migration 030 SQL
3. getGenericAlternatives server action in app/actions/pos.ts
4. Verification SQL smoke tests
5. tsc

### Session B — Wizard UI
1. GenericComparisonWizard main component
2. GenericWizardRow per-row component
3. GenericWizardSummary totals
4. POSPage integration (state, F3 handler, onApply)
5. Wire [Generics] button in all 3 layouts to setWizardOpen(true)
6. tsc + build + jest

---

## Spec Version
Created: 2026-06-26
Migration: 030 (follows 029 special discount)
Depends on: Phase 5B (CartItem type, batch fields, layout variants)
            Migration 023 (generic_names table)