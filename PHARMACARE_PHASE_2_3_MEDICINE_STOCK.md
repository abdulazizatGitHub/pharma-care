# PHARMACARE — PHASE 2 & 3: MEDICINE MASTER + STOCK MANAGEMENT
> **Version:** 1.0  
> **Depends on:** PHARMACARE_RBAC_V2.md, PHARMACARE_PHASE_F_USER_MANAGEMENT.md  
> **Routes:** /superadmin/medicines, /admin/inventory, /pharmacist/inventory  
> **Read all referenced spec documents before writing any code.**

---

## 0. AGENT INSTRUCTIONS

This document covers two tightly linked modules:
- Phase 2: Medicine Master (the catalog — what medicines exist)
- Phase 3: Stock & Batch Management (how much stock, at what price)

Execute Phase 2 fully before starting Phase 3.
Phase 2 is the foundation — Phase 3 data references Phase 2 records.

Rules that apply throughout:
- Every query adds .eq('is_deleted', false) — RLS no longer filters this
- Every write inserts into audit_logs
- No hard deletes — soft delete only
- Medicine codes are unique and immutable once assigned
- All monetary values stored as NUMERIC(12,2) — never FLOAT

---

## 1. DATA MODEL

### 1.1 medicine_categories table

```sql
CREATE TABLE medicine_categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,  -- url-safe version of name
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  UUID REFERENCES profiles(id),
  is_deleted  BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at  TIMESTAMPTZ
);
```

### 1.2 medicine_subcategories table

```sql
CREATE TABLE medicine_subcategories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES medicine_categories(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  UUID REFERENCES profiles(id),
  is_deleted  BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at  TIMESTAMPTZ,
  UNIQUE(category_id, slug)
);
```

### 1.3 medicines table (replaces existing)

The existing medicines table from migration 001 needs new columns.
Add via migration 008:

```sql
ALTER TABLE medicines
  ADD COLUMN IF NOT EXISTS code              TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS generic_name      TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer      TEXT,
  ADD COLUMN IF NOT EXISTS drap_reg_no       TEXT,
  ADD COLUMN IF NOT EXISTS category_id       UUID REFERENCES medicine_categories(id),
  ADD COLUMN IF NOT EXISTS subcategory_id    UUID REFERENCES medicine_subcategories(id),
  ADD COLUMN IF NOT EXISTS schedule          TEXT NOT NULL DEFAULT 'OTC'
                           CHECK (schedule IN ('OTC','prescription','controlled')),
  ADD COLUMN IF NOT EXISTS pack_size         TEXT,  -- e.g. "10 tablets", "100ml"
  ADD COLUMN IF NOT EXISTS unit              TEXT DEFAULT 'strip',
  ADD COLUMN IF NOT EXISTS instructions      TEXT,
  ADD COLUMN IF NOT EXISTS precautions       TEXT,
  ADD COLUMN IF NOT EXISTS mrp               NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS reorder_level     INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS barcode           TEXT,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE;

-- Auto-increment code sequence
CREATE SEQUENCE IF NOT EXISTS medicine_code_seq START 1;

-- Function to generate next medicine code
CREATE OR REPLACE FUNCTION next_medicine_code()
RETURNS TEXT AS $$
  SELECT LPAD(nextval('medicine_code_seq')::TEXT, 3, '0')
$$ LANGUAGE sql;
```

**Medicine code rules:**
- Auto-generated as 001, 002, 003... (padded to 3 digits, grows beyond if needed)
- User can override at creation time (enter 200 manually)
- Once saved, code is immutable — no UPDATE on the code column
- Enforced by: no UPDATE policy on code field + app-layer block

### 1.4 stock_batches table (already exists — add columns)

```sql
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS purchase_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sale_price       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mrp              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS supplier_id      UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS grn_id           UUID REFERENCES goods_receipts(id),
  ADD COLUMN IF NOT EXISTS notes            TEXT;
```

**Price hierarchy per batch:**
```
purchase_price  — what we paid per unit to the supplier
sale_price      — what we charge the customer (our price)
mrp             — DRAP Maximum Retail Price (legal ceiling)

Rules:
  sale_price <= mrp (enforced by DB trigger — already exists)
  sale_price >= purchase_price (app-layer warning, not hard block)
  purchase_price is for internal use only — never shown to customers
```

### 1.5 settings additions (new keys)

```sql
INSERT INTO settings (key, value, label) VALUES
('batch_selection_mode', 'fefo', 'Batch Selection Mode at POS (fefo/manual/show_all)'),
('bag_charge_enabled', 'false', 'Enable Bag/Printing Charge per Sale'),
('bag_charge_amount', '2', 'Bag/Printing Charge Amount (PKR)'),
('medicine_code_prefix', '', 'Medicine Code Prefix (blank = numeric only)')
ON CONFLICT (key) DO NOTHING;
```

---

## 2. MEDICINE MASTER MODULE

### 2.1 Routes

```
/superadmin/medicines     → full CRUD, category management, bulk import
/admin/inventory          → full CRUD (inventory_manage permission required)
/pharmacist/inventory     → view only (inventory_view permission)
```

### 2.2 Medicine list page

**Page header:** "Medicines" / "Medicine catalog"  [+ Add Medicine] [↑ Import CSV]

**Filters row:**
- Search: name, generic name, code, manufacturer (typeahead)
- Category dropdown
- Sub-category dropdown (updates when category selected)
- Schedule filter (All / OTC / Prescription / Controlled)
- Status filter (Active / Inactive)

**Table columns:**
Code | Name | Generic | Manufacturer | Category | Schedule | MRP | Stock | Status | Actions

**Stock column:** shows total available stock across all active batches.
Clicking a medicine row opens the detail/edit drawer.

**Actions:** Edit | View Stock | Deactivate

### 2.3 Add/Edit Medicine drawer (slide-in from right)

**Section 1 — Identity**
- Medicine name (required)
- Generic/salt name (optional)
- Code (auto-generated, editable before save, immutable after)
- DRAP registration number (optional)
- Barcode (optional)

**Section 2 — Classification**
- Manufacturer / Company (required)
- Category (dropdown — from medicine_categories)
- Sub-category (dropdown — filters by selected category)
- Drug schedule: OTC / Prescription / Controlled (radio)

**Section 3 — Pack & Pricing**
- Pack size (e.g. "10 tablets", "100ml", "30 capsules")
- Unit (strip, bottle, vial, sachet, tube, injection, syrup, drops)
- MRP — Maximum Retail Price (required, numeric)
- Reorder level (default 10, numeric)

**Section 4 — Clinical Notes**
- Instructions (textarea, optional)
- Precautions (textarea, optional)

**Code immutability:** Once a medicine is saved, the code field becomes read-only.
Display it as plain text with a lock icon, not an input field.

### 2.4 Category management

Accessible from the Medicines page via a "Manage Categories" button.
Opens a modal with two columns: Categories | Sub-categories.

- Add category (name → auto-generates slug)
- Add sub-category under a selected category
- Rename category/sub-category
- Soft-delete (only if no medicines are assigned to it)

Pre-seeded categories and sub-categories per Section 3 of this document.

### 2.5 Bulk CSV import

Reuse existing Papaparse infrastructure from the prototype.

**CSV format:**
```
name, generic_name, manufacturer, code, drap_reg_no, 
category, subcategory, schedule, pack_size, unit, 
mrp, reorder_level, instructions, precautions
```

**Import rules:**
- If code is blank: auto-generate
- If code is provided: use it (fail row if duplicate)
- If category/subcategory don't exist: create them
- If medicine name + manufacturer already exists: skip with warning
- Show import summary: X imported, Y skipped, Z errors

### 2.6 View Stock panel

Clicking "View Stock" on a medicine row opens a panel showing all batches:

```
Panadol 500mg — Stock Batches

Batch No.  Expiry      Qty    Purchase   Sale    MRP    Supplier    Status
B001       2026-12-31  500    Rs 8       Rs 15   Rs 18  MedPlus     Active
B002       2027-06-30  300    Rs 9       Rs 16   Rs 18  PharmaDist  Active
B003       2025-01-01  50     Rs 7       Rs 14   Rs 18  MedPlus     Expired

[+ Add Stock Batch]
```

Expired batches shown in red, greyed out.
"Add Stock Batch" opens the stock entry form (Phase 3).

---

## 3. STOCK & BATCH MANAGEMENT MODULE

### 3.1 Stock entry (add new batch)

Triggered from:
- "Add Stock Batch" in View Stock panel
- Goods Receipt (GRN) flow in Phase 4 — auto-creates batches

**Form fields:**
- Medicine (pre-filled if coming from medicine view, searchable if standalone)
- Batch number (required, unique per medicine)
- Expiry date (required, must be future date)
- Quantity received (required, positive integer)
- Purchase price per unit (required)
- Sale price per unit (required, auto-suggests based on MRP)
- MRP (pre-filled from medicine master, editable per batch)
- Supplier (optional at this stage — required in GRN flow)
- Notes (optional)

**Price validation:**
- sale_price > purchase_price: show warning (not block) — "Sale price is below purchase price"
- sale_price > mrp: hard block — "Sale price cannot exceed MRP"
- MRP different from medicine master MRP: show warning — "This batch MRP differs from the medicine master MRP of Rs X"

### 3.2 Stock adjustment

For correcting stock counts (physical count differs from system).

**Form:**
- Select batch
- Current quantity (shown, read-only)
- Actual quantity (enter)
- Reason (dropdown: Physical count correction / Damaged / Theft / Other)
- Notes

Difference is calculated and shown: "+15 units" or "-3 units".
Writes to audit_logs with old_value and new_value.

### 3.3 Expiry write-off

For removing expired or near-expiry stock.

**Form:**
- Select batch (shows expiry date)
- Quantity to write off (default: full batch quantity)
- Reason: Expired / Near-expiry disposal / Damaged / Other
- Notes

Sets batch quantity to 0 (or reduces it).
Creates audit_log entry with action: STOCK_WRITEOFF.

### 3.4 Stock alerts

Two alert types — shown on dashboards and as a dedicated alerts panel:

**Low stock alert:**
```
Medicine stock < reorder_level (from medicine master)
Show: medicine name, current stock, reorder level, last supplier
Action button: "Create PO" (links to Phase 4 purchase order)
```

**Expiry alert:**
```
Any batch with expiry_date within the configured alert window
(30/60/90 days from settings)
Show: medicine name, batch number, expiry date, quantity, days remaining
Color coding: red (< 30 days), amber (30-60 days), yellow (60-90 days)
Action button: "Write Off" or "Return to Supplier"
```

### 3.5 Batch selection mode (POS behaviour — configured in settings)

Three modes, set by superadmin/admin in Settings:

**Mode 1: FEFO (First Expiry First Out) — default**
System auto-selects the batch with the nearest expiry date.
POS shows: medicine name + price from that batch.
Cashier cannot change the batch.

**Mode 2: Manual selection**
POS shows a dropdown/list of all available batches for the searched medicine.
Each entry shows: Batch No., Expiry, Sale Price, Quantity.
Cashier selects which batch to sell from.

**Mode 3: Show all with prices**
POS shows all available batches as separate line items in search results.
E.g. searching "Panadol" shows:
  "Panadol 500mg [B001] — Rs 15 (expires Dec 2026)"
  "Panadol 500mg [B002] — Rs 16 (expires Jun 2027)"
Customer/cashier selects the specific item.

---

## 4. DATABASE MIGRATION

### Migration 008: medicine_categories + subcategories + medicines columns + stock_batches columns + settings

File: `supabase/migrations/008_medicine_stock.sql`

Order:
1. Create `medicine_categories` table + RLS
2. Create `medicine_subcategories` table + RLS
3. Alter `medicines` table (add columns)
4. Create `medicine_code_seq` sequence + `next_medicine_code()` function
5. Alter `stock_batches` table (add columns)
6. Insert settings keys
7. Seed categories and sub-categories

**RLS for medicine_categories and medicine_subcategories:**
```sql
-- SELECT: all 3 roles
-- INSERT/UPDATE: admin + superadmin only (pharmacist cannot create categories)
-- No DELETE policy (soft-delete only)
```

**Category seed data (pre-seeded in migration):**
```sql
INSERT INTO medicine_categories (name, slug) VALUES
('Antibiotics', 'antibiotics'),
('Analgesics & Anti-inflammatory', 'analgesics'),
('Cardiovascular', 'cardiovascular'),
('Gastrointestinal', 'gastrointestinal'),
('Respiratory', 'respiratory'),
('Vitamins & Supplements', 'vitamins-supplements'),
('Dermatology', 'dermatology'),
('Endocrine & Metabolic', 'endocrine-metabolic'),
('Neurological & Psychiatric', 'neurological-psychiatric'),
('Ophthalmology & ENT', 'ophthalmology-ent'),
('Controlled Substances', 'controlled-substances'),
('Other', 'other');
```

Sub-categories seeded per category per the hierarchy in this document.

---

## 5. SERVER ACTIONS

File: `app/actions/medicines.ts`

```typescript
// createMedicine(input: CreateMedicineInput) — admin, superadmin
// updateMedicine(id, input: UpdateMedicineInput) — admin, superadmin
//   Note: code field cannot be updated — server action ignores code in update input
// deactivateMedicine(id) — admin, superadmin
// reactivateMedicine(id) — admin, superadmin
// importMedicinesCSV(rows: CSVRow[]) — admin, superadmin
//   Returns: { imported: number, skipped: number, errors: string[] }
// createCategory(name) — admin, superadmin
// createSubcategory(name, categoryId) — admin, superadmin
```

File: `app/actions/stock.ts`

```typescript
// addStockBatch(input: AddBatchInput) — admin, superadmin, pharmacist
// adjustStock(batchId, newQuantity, reason, notes) — admin, superadmin, pharmacist
// writeOffBatch(batchId, quantity, reason, notes) — admin, superadmin, pharmacist
// getStockSummary(medicineId) — all 3 roles
//   Returns: total quantity, batches list, nearest expiry
```

All actions:
- Verify session + role
- Zod validate
- Execute with .eq('is_deleted', false) on all queries
- Insert audit_log
- Return { data, error }

---

## 6. ROUTES & COMPONENTS

### Route structure

```
/superadmin/medicines        → MedicinesPage (full access)
/admin/inventory             → MedicinesPage (full access if inventory_manage)
/pharmacist/inventory        → MedicinesPage (view only, no add/edit/deactivate)
```

The same `MedicinesPage` component is used across all three routes.
It reads `permissions` from `useDashboardUser()` to gate write actions.

### Component structure

```
components/medicines/
  MedicinesPage.tsx          ← client orchestrator
  MedicineTable.tsx          ← filterable, searchable table
  MedicineDrawer.tsx         ← add/edit slide-in drawer
  MedicineStockPanel.tsx     ← view stock batches for a medicine
  CategoryManager.tsx        ← modal for managing categories
  AddBatchForm.tsx           ← add new stock batch form
  StockAdjustForm.tsx        ← stock adjustment form
  WriteOffForm.tsx           ← expiry write-off form
  AlertsPanel.tsx            ← low stock + expiry alerts combined
  BulkImportModal.tsx        ← CSV import with preview and results
```

---

## 7. EXECUTION PLAN

### Phase 2A — Database
1. Write migration 008 SQL — show before running
2. Confirm migration — I run it manually
3. Verify tables exist + RLS enabled

### Phase 2B — Types + Actions
1. Update lib/db-types.ts (Medicine, StockBatch, Category, Subcategory types)
2. Create app/actions/medicines.ts
3. Create app/actions/stock.ts
4. npx tsc --noEmit

### Phase 2C — Medicine list + drawer
1. Build MedicineTable.tsx
2. Build MedicineDrawer.tsx (add/edit)
3. Build CategoryManager.tsx
4. Build MedicinesPage.tsx (orchestrator)
5. Wire up routes for all 3 roles
6. npx tsc --noEmit + npx next build

### Phase 2D — Bulk import
1. Build BulkImportModal.tsx
2. Wire importMedicinesCSV action
3. Test with sample CSV

### Phase 3A — Stock management
1. Build MedicineStockPanel.tsx
2. Build AddBatchForm.tsx
3. Build StockAdjustForm.tsx
4. Build WriteOffForm.tsx
5. npx tsc --noEmit + npx next build

### Phase 3B — Alerts
1. Build AlertsPanel.tsx
2. Wire into superadmin, admin, pharmacist dashboards
3. Settings: configure alert windows and batch selection mode

### Phase 3C — Verification
1. npx next build (clean)
2. Manual browser verification checklist
3. Update route-access tests for new routes

---

## 8. MEDICINE MASTER RULES (add to CLAUDE.md)

```
## Medicine Master Rules
- Medicine codes are immutable once saved. Never allow UPDATE on medicines.code
- All medicine queries must add .eq('is_deleted', false)
- sale_price > mrp is a hard block (DB trigger enforces this)
- sale_price < purchase_price is a warning only (app layer)
- Batch selection mode (fefo/manual/show_all) comes from settings table
- Category and sub-category records are soft-deleted only
- The medicine_code_seq sequence must never be reset
```

---

*End of PHARMACARE_PHASE_2_3_MEDICINE_STOCK.md*