# PharmaCare — Phase 9B: Reports Sidebar & Item Detail Report

## Overview

Two deliverables:

1. **Reports sidebar restructure** — flat Reports link becomes an expandable
   sidebar group with sub-entries. Existing tabbed reports page stays untouched.
   New entity-level report pages are added as separate sidebar entries.

2. **Item Detail Report** — full medicine-level drill-down page covering stock,
   batches, sales history, supplier history, discounts, returns, and price
   margin analysis. Accessible from both the sidebar and the Medicines master page.

---

## Part 1 — Sidebar Restructure

### 1.1 Current state
Single flat "Reports" link in the sidebar pointing to `/superadmin/reports`
(and `/admin/reports`). No sub-navigation.

### 1.2 Target structure

```
Reports ▼  (collapsible group)
  → Overview          /[role]/reports
  → Item Detail       /[role]/reports/item-detail
  → Supplier Report   (placeholder — future phase, show as "Coming Soon" greyed)
  → Batch Report      (placeholder — future phase, show as "Coming Soon" greyed)
```

### 1.3 Sidebar component changes

The sidebar component must support collapsible groups. A collapsible group has:
- A parent row with a label, icon, and chevron (rotates on expand/collapse)
- Child rows indented below when expanded, hidden when collapsed
- Persists expanded/collapsed state in localStorage so it survives page navigation
- Auto-expands when the current route matches any child route

**Agent instruction:** Find the existing sidebar component(s) for superadmin and
admin layouts. Show their current full content before modifying. The collapsible
behaviour must use React state (useState) + CSS transition — do NOT add a new
animation library. The existing design tokens and colors must be preserved exactly.

### 1.4 Role access

| Sidebar entry | superadmin | admin | pharmacist |
|---|---|---|---|
| Reports group | ✓ | ✓ | ✗ |
| Overview | ✓ | ✓ | ✗ |
| Item Detail | ✓ | ✓ | ✗ |
| Supplier Report | ✓ | ✓ | ✗ |
| Batch Report | ✓ | ✓ | ✗ |

Pharmacist role has no Reports access — no change from current.

### 1.5 Entry point from Medicines page

On the medicines list page, add a "Report" action link on each medicine row
alongside existing actions (Edit, Deactivate). Clicking navigates to:
`/[role]/reports/item-detail?medicine_id=[id]`

This is a navigation link only — no new component needed.

---

## Part 2 — Item Detail Report

### 2.1 Page location

```
app/superadmin/reports/item-detail/page.tsx
app/admin/reports/item-detail/page.tsx
```

Route accepts `?medicine_id=` query parameter. If no medicine_id is provided,
show a medicine search/selector so the user can pick one.

### 2.2 Page layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Reports                                                      │
│                                                                 │
│  [Medicine Search Dropdown]          [Date Range: From] [To]   │
│  Panadol 500mg (001)                 Apply    This Month  YTD  │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 1: Overview Cards (4)                                  │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 2: Stock & Batches                                     │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 3: Sales History                                       │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 4: Supplier History                                    │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 5: Discount & Returns Analysis                         │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 6: Price & Margin Analysis                             │
└─────────────────────────────────────────────────────────────────┘
```

**Medicine selector:** Searchable dropdown at the top. Same component pattern as
the POS medicine search — debounced, searches by name or code. When a medicine
is selected, updates the URL `?medicine_id=` param (router.push, not router.replace
so back button works) and loads all sections.

**Date range:** Applies to Sections 3, 4, and 5 (time-sensitive data).
Sections 1 and 2 (stock state) always show current data regardless of date range.

**Date shortcuts:**
- This Month: first of current month → today
- YTD: 1 Jan current year → today
- Apply: custom range from the two date inputs

---

### 2.3 Section 1 — Overview Cards

Four KPI cards, always current (not date-range filtered):

| Card | Value | Source |
|---|---|---|
| Total Stock | Current units in hand (all batches) | Existing: query stock_batches |
| Active Batches | Count of batches with quantity > 0 | Existing: query stock_batches |
| Expiring Soon | Batches expiring within settings.expiry_alert_days | Existing: get_expiry_report filtered |
| Avg Sale Price | Average sale_price across active batches | Existing: query stock_batches |

---

### 2.4 Section 2 — Stock & Batches

**Table: Current batch breakdown**

| Column | Source |
|---|---|
| Batch No | stock_batches.batch_no |
| Expiry Date | stock_batches.expiry_date — colour-coded: red if expired, amber if within alert days |
| Quantity | stock_batches.quantity |
| Purchase Price | stock_batches.purchase_price |
| Sale Price | stock_batches.sale_price |
| MRP | stock_batches.mrp |
| Margin % | ((sale_price - purchase_price) / purchase_price) * 100 — computed in JS |
| Supplier | stock_batches.supplier_id → suppliers.name |
| Status | Derived: "Expired" / "Expiring Soon" / "Active" / "Out of Stock" (qty=0) |

Sort default: expiry_date ASC (nearest expiry first — FEFO visibility).

**Summary below table:**
- Total units across all batches
- Total stock value at purchase price (sum of qty × purchase_price per batch)
- Total stock value at MRP (sum of qty × mrp per batch)

**New DB function required: `get_item_batch_detail(p_medicine_id UUID)`**

```sql
CREATE OR REPLACE FUNCTION get_item_batch_detail(
  p_medicine_id UUID
)
RETURNS TABLE (
  batch_id        UUID,
  batch_no        TEXT,
  expiry_date     DATE,
  quantity        INTEGER,
  purchase_price  NUMERIC,
  sale_price      NUMERIC,
  mrp             NUMERIC,
  supplier_id     UUID,
  supplier_name   TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    sb.id,
    sb.batch_no,
    sb.expiry_date,
    sb.quantity,
    sb.purchase_price,
    sb.sale_price,
    sb.mrp,
    sb.supplier_id,
    s.name AS supplier_name,
    sb.created_at
  FROM stock_batches sb
  LEFT JOIN suppliers s ON s.id = sb.supplier_id AND s.is_deleted = false
  WHERE sb.medicine_id = p_medicine_id
    AND sb.is_deleted = false
  ORDER BY sb.expiry_date ASC NULLS LAST;
$$;
```

---

### 2.5 Section 3 — Sales History

**Reuse existing:** Check if `get_item_sales(p_date_from, p_date_to)` accepts a
`p_medicine_id` filter. Agent must show the current function signature from the DB
before deciding.

- If it accepts medicine_id: call it with the filter applied.
- If it does not: create `get_item_sales_detail` (see below) — do NOT modify the
  existing function as it powers the existing reports tab.

**New DB function: `get_item_sales_detail`**

```sql
CREATE OR REPLACE FUNCTION get_item_sales_detail(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  sale_date         DATE,
  sale_number       TEXT,
  quantity_sold     INTEGER,
  unit_price        NUMERIC,
  discount_amount   NUMERIC,
  line_total        NUMERIC,
  payment_type      TEXT,
  customer_name     TEXT,
  pharmacist_name   TEXT,
  batch_no          TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    DATE(s.created_at) AS sale_date,
    s.sale_number,
    si.quantity        AS quantity_sold,
    si.unit_price,
    si.discount_amount,
    (si.quantity * si.unit_price - COALESCE(si.discount_amount, 0)) AS line_total,
    s.payment_type,
    c.name             AS customer_name,
    p.full_name        AS pharmacist_name,
    sb.batch_no
  FROM sale_items si
  JOIN sales s       ON s.id = si.sale_id
  JOIN stock_batches sb ON sb.id = si.stock_batch_id
  LEFT JOIN customers c  ON c.id = s.customer_id
  LEFT JOIN profiles p   ON p.id = s.cashier_id
  WHERE si.medicine_id = p_medicine_id
    AND DATE(s.created_at) BETWEEN p_date_from AND p_date_to
    AND s.status = 'completed'
    AND s.is_deleted = false
  ORDER BY s.created_at DESC;
$$;
```

**UI for Section 3:**

Summary row above the table (date-range totals):
- Units Sold | Total Revenue | Total Discount Given | Net Revenue | Transactions

Table: one row per sale line item. Paginate at 50 rows.

Chart: daily units sold as a bar chart (Recharts BarChart, reuse existing chart
pattern from Phase 9). X-axis = date, Y-axis = units sold.

---

### 2.6 Section 4 — Supplier History

Shows every GRN line for this medicine — when it was purchased, from whom,
at what price, in what quantity.

**New DB function: `get_item_supplier_history`**

```sql
CREATE OR REPLACE FUNCTION get_item_supplier_history(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  grn_date        DATE,
  grn_number      TEXT,
  po_number       TEXT,
  supplier_name   TEXT,
  batch_no        TEXT,
  quantity_received INTEGER,
  unit_price      NUMERIC,
  line_total      NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    DATE(g.received_at) AS grn_date,
    g.grn_number,
    po.po_number,
    s.name             AS supplier_name,
    gi.batch_no,
    gi.quantity_received,
    gi.unit_price,
    (gi.quantity_received * gi.unit_price) AS line_total
  FROM grn_items gi
  JOIN goods_receipts g  ON g.id = gi.grn_id
  JOIN purchase_orders po ON po.id = g.po_id
  JOIN suppliers s        ON s.id = po.supplier_id
  WHERE gi.medicine_id = p_medicine_id
    AND DATE(g.received_at) BETWEEN p_date_from AND p_date_to
    AND g.is_deleted = false
  ORDER BY g.received_at DESC;
$$;
```

> **Agent note:** Verify actual column names on grn_items and goods_receipts
> before writing this function. Show \d grn_items and \d goods_receipts output
> first. Adjust column names to match reality.

**UI for Section 4:**

Summary: Total Units Purchased | Total Amount Paid | Number of Suppliers |
Number of GRNs

Table: one row per GRN line. Show supplier name, GRN number (link to PO detail),
date, batch, qty, unit price, total.

Supplier breakdown sub-table: group by supplier_name showing total units and
total spend per supplier across the date range.

---

### 2.7 Section 5 — Discount & Returns Analysis

**Discount data:** Derived from `get_item_sales_detail` — sum of
`discount_amount` per transaction. No new DB function needed.

**Returns data:**

**New DB function: `get_item_return_history`**

```sql
CREATE OR REPLACE FUNCTION get_item_return_history(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  return_date     DATE,
  return_number   TEXT,
  original_sale   TEXT,
  quantity_returned INTEGER,
  refund_amount   NUMERIC,
  reason          TEXT,
  status          TEXT,
  batch_no        TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    DATE(r.created_at) AS return_date,
    r.return_number,
    s.sale_number      AS original_sale,
    ri.quantity        AS quantity_returned,
    ri.refund_amount,
    r.reason,
    r.status,
    sb.batch_no
  FROM return_items ri
  JOIN returns r      ON r.id = ri.return_id
  JOIN sales s        ON s.id = r.original_sale_id
  JOIN stock_batches sb ON sb.id = ri.stock_batch_id
  WHERE ri.medicine_id = p_medicine_id
    AND DATE(r.created_at) BETWEEN p_date_from AND p_date_to
    AND r.is_deleted = false
  ORDER BY r.created_at DESC;
$$;
```

> **Agent note:** Verify actual column names on return_items and returns tables
> before writing. Show \d return_items and \d returns first.

**UI for Section 5:**

Two sub-sections side by side:

Left — Discount Analysis:
- Total discount given in range
- Average discount per transaction
- Transactions with discount vs without (count)

Right — Return Analysis:
- Units returned in range
- Total refund value
- Return rate % = (units returned / units sold) × 100
- Table of return transactions

---

### 2.8 Section 6 — Price & Margin Analysis

No date range filter — shows all-time pricing history across batches.
Uses data already fetched in Section 2 (`get_item_batch_detail`).

**UI: Three sub-sections**

**Current pricing (from active batches):**
- Lowest purchase price across active batches
- Highest purchase price across active batches
- Current sale price (mode across active batches)
- Current MRP
- Margin on sale price: ((sale_price - purchase_price) / purchase_price) × 100
- Margin on MRP: ((mrp - purchase_price) / purchase_price) × 100

**Price history chart:**
Line chart (Recharts LineChart) showing purchase_price over time across all
batches (created_at on X-axis). Shows price trend — useful for identifying
inflation or supplier price changes.

**Batch margin table:**
All batches (including zero-qty, for history), sorted by created_at DESC:
Batch No | Purchase Price | Sale Price | MRP | Margin % | Supplier | Date Added

---

## Part 3 — Database Migration 028

Single migration file. All functions are new — none modify existing functions.

```sql
-- 028: Item Detail Report DB functions
-- New functions: get_item_batch_detail, get_item_sales_detail,
--                get_item_supplier_history, get_item_return_history

-- Agent writes full function bodies based on verified column names
-- (see \d checks in Steps A-D below)
-- All functions: SECURITY DEFINER, GRANT EXECUTE TO authenticated
```

---

## Part 4 — Implementation Phases

### Session A — DB only
1. Agent runs \d on: stock_batches, goods_receipts, grn_items, sale_items,
   return_items, returns — shows all outputs before writing any SQL
2. Checks existing `get_item_sales` signature — show current function body
3. Writes migration 028 with all four new functions based on verified columns
4. User runs migration manually
5. Verification SQL (see below)
6. tsc --noEmit (no UI changes yet)

### Session B — UI only (after migration verified)
1. Sidebar collapsible group component
2. "Report" link on medicines page rows
3. Item Detail Report page — all 6 sections
4. Full test suite run
5. tsc + next build

---

## Part 5 — Verification SQL (run after Session A)

```sql
-- Confirm all 4 functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'get_item_batch_detail',
  'get_item_sales_detail',
  'get_item_supplier_history',
  'get_item_return_history'
)
ORDER BY routine_name;
-- Expected: 4 rows

-- Smoke test get_item_batch_detail with a known medicine_id
SELECT * FROM get_item_batch_detail(
  (SELECT id FROM medicines LIMIT 1)
);
-- Expected: rows matching stock_batches for that medicine

-- Smoke test get_item_sales_detail
SELECT * FROM get_item_sales_detail(
  (SELECT id FROM medicines LIMIT 1),
  '2026-01-01'::DATE,
  CURRENT_DATE
);
-- Expected: rows or empty — no error
```

---

## Part 6 — What is NOT in scope for this phase

- Supplier Detail Report — separate future phase
- Batch Detail Report — separate future phase
- Existing reports tab page changes — untouched
- Export (CSV/PDF) for Item Detail — add in a future pass once data is confirmed correct
- Route access tests for new pages — add to test suite in Session B

---

## Spec Version
Created: 2026-06-25
Migration: 028 (follows 027 — journal reference type extension)
Depends on: Phase 9 (existing report functions), Phase 3 (stock_batches schema)