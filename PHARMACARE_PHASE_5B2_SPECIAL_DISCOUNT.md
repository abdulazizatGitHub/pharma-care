# PharmaCare — Phase 5B-2: Special Discount Permission System

## Overview

Superadmin defines discount tiers and grants per-pharmacist access
up to a maximum tier. At checkout, eligible pharmacists see a
dropdown to apply a special discount to the total sale. Recorded
on the sale with an audit trail.

No changes to complete_sale() RPC parameter list — p_discount_amt
already exists and will carry the computed discount amount.

---

## Part 1 — Database Migration 029

### 1.1 New settings keys

Add to the settings table (upsert on key):

```sql
-- Discount type: 'percentage' or 'fixed'
INSERT INTO settings (key, value) VALUES
  ('special_discount_type', 'percentage'),
  ('special_discount_tiers', '5,10,15'),
  ('special_discount_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
```

`special_discount_tiers`: comma-separated list of values.
  If type=percentage: values are percentages (5 = 5%)
  If type=fixed: values are rupee amounts (50 = Rs 50)

### 1.2 New column on profiles

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS special_discount_max_tier
    NUMERIC(10,2) DEFAULT NULL;
```

NULL means no special discount permission granted.
A value (e.g. 10.00) means pharmacist can apply up to that tier.

### 1.3 New columns on sales

```sql
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS special_discount_applied
    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_discount_type
    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS special_discount_value
    NUMERIC(10,2) DEFAULT NULL;
```

`special_discount_type`: 'percentage' or 'fixed' — recorded at
  time of sale (settings may change later)
`special_discount_value`: the tier chosen (e.g. 10 for 10%)
`special_discount_applied`: flag for reporting

---

## Part 2 — Settings UI

### 2.1 New section in /superadmin/settings

Section title: "Special Discount"
Subsection of: POS & Fees (add below service fee section)

Controls:
1. Enable Special Discount toggle
   key: special_discount_enabled, value: 'true'/'false'

2. Discount Type radio buttons
   key: special_discount_type
   Options: "Percentage (%)" | "Fixed Amount (Rs)"

3. Discount Tiers input
   key: special_discount_tiers
   UI: tag/chip input — user types a value and presses Enter
   to add a tier chip. Each chip has an X to remove.
   Stored as comma-separated string: "5,10,15"
   Validation:
     percentage: each value 1–100
     fixed: each value > 0
   Display: "5%" or "Rs 50" depending on type
   Max 6 tiers.

4. Read-only note below tiers:
   "Pharmacists are granted access up to a maximum tier in
   User Management → Edit Pharmacist."

### 2.2 Server action: updateSpecialDiscountSettings

In app/actions/settings.ts (or equivalent):
  Updates all three settings keys atomically.
  Superadmin only.
  Validates tier values against type.
  logAction(ACTION_TYPES.SETTINGS_UPDATED)

---

## Part 3 — User Management UI

### 3.1 Special discount grant per pharmacist

In the pharmacist edit form (admin/superadmin user management):

Add a new section: "Special Discount Permission"

Show only when:
  - The edited user has role = 'pharmacist'
  - special_discount_enabled = 'true' in settings

Controls:
  Toggle: "Grant special discount permission"
    When off: special_discount_max_tier = NULL
    When on: shows tier selector below

  Tier selector (shown when toggle is on):
    Label: "Maximum allowed tier"
    Dropdown: shows all configured tiers from
      special_discount_tiers setting
    Selected value → special_discount_max_tier on profiles

Example:
  Tiers configured: 5%, 10%, 15%
  Pharmacist A → max tier: 10% → sees [5%, 10%] at checkout
  Pharmacist B → max tier: 5% → sees [5%] at checkout
  Pharmacist C → no grant → no special discount at checkout

### 3.2 Server action: updateUserSpecialDiscount

In app/actions/users.ts:
  superadmin only
  Updates profiles.special_discount_max_tier
  Validates value is one of the configured tiers or NULL
  logAction(ACTION_TYPES.USER_UPDATED)

---

## Part 4 — Checkout Modal UI

### 4.1 Special discount field

In CheckoutModal.tsx, add a Special Discount section between
the cart summary and the payment received field.

Show only when ALL of these are true:
  - special_discount_enabled = 'true'
  - Current pharmacist has special_discount_max_tier IS NOT NULL
  - Cart is not empty

UI:
  Label: "Special Discount"
  Small note: "For personal/family customers"
  Dropdown: tiers up to and including pharmacist's max tier
    First option: "— No special discount —" (default)
    Then each eligible tier: "5%" or "Rs 50.00"
  
  When a tier is selected, show computed discount amount:
    percentage: (netValue × tier / 100) formatted as Rs X.00
    fixed: the fixed amount formatted as Rs X.00
  
  Final total updates live as tier is selected.

### 4.2 Updated totals display in checkout

When special discount is selected:
  Net Value:              Rs 1,000.00
  Special Discount (5%): -Rs    50.00
  ──────────────────────────────────
  TOTAL:                  Rs   950.00

### 4.3 Passing to complete_sale()

The existing p_discount_amt parameter carries the computed
special discount amount.

Before calling complete_sale(), also record:
  special_discount_applied: true
  special_discount_type: current setting type
  special_discount_value: selected tier value

These are written to the sales row via an UPDATE after
complete_sale() returns the sale ID, OR pass as additional
fields if complete_sale() is extended.

Simplest approach: after complete_sale() returns sale_id,
run a separate UPDATE:
  UPDATE sales SET
    special_discount_applied = true,
    special_discount_type = p_type,
    special_discount_value = p_value,
    discount_amount = computed_amount
  WHERE id = sale_id

This avoids RPC signature change.

### 4.4 Passing pharmacist discount data to CheckoutModal

CheckoutModal needs:
  pharmacistMaxTier: number | null  (from profiles)
  discountTiers: number[]           (from settings)
  discountType: 'percentage'|'fixed' (from settings)
  discountEnabled: boolean          (from settings)

These are fetched server-side in app/pharmacist/pos/page.tsx
alongside the other settings already fetched there.
Pass down as props through POSPage → CheckoutModal.

---

## Part 5 — Receipt Update

When special discount was applied, add to receipt totals:
  Special Discount (5%):  -Rs  50.00

Between Net Value and Freight lines. Same conditional display
pattern as Patient Discount — only show when applied.

---

## Part 6 — Audit Log

Add to ACTION_TYPES if not present:
  SPECIAL_DISCOUNT_GRANTED = 'SPECIAL_DISCOUNT_GRANTED'

Log when superadmin grants/revokes special discount permission
on a pharmacist profile.

---

## Migration File

supabase/migrations/029_special_discount.sql

---

## Implementation Sessions

### Session A — Migration + settings + user management
1. Migration 029 SQL
2. Settings UI section for special discount
3. User management: grant field on pharmacist edit form
4. Server actions for both
5. tsc + jest

### Session B — Checkout modal + receipt
1. Fetch discount settings in pos/page.tsx
2. CheckoutModal special discount section
3. Post-sale UPDATE for special_discount columns
4. Receipt update
5. tsc + build + jest