# PHARMACARE — PHASE 4: SUPPLIER & PROCUREMENT
> **Version:** 1.0  
> **Depends on:** PHARMACARE_RBAC_V2.md, PHARMACARE_PHASE_2_3_MEDICINE_STOCK.md  
> **Routes:** /superadmin/suppliers (view), /admin/suppliers, /admin/purchase-orders, /superadmin/purchase-orders (approvals)  
> **Read all referenced spec documents before writing any code.**

---

## 0. AGENT INSTRUCTIONS

This document covers two linked modules:
- Supplier Management (master records, contact, credit terms)
- Procurement (purchase orders, approval workflow, goods receipt)

Phase 4 also completes two placeholders from earlier phases:
- AddBatchForm supplier field: replace text input with supplier dropdown
- AlertsPanel "View" buttons: already navigate to inventory — no change needed

Execute in the phases defined in Section 7.
Show migration SQL before running. Run `npx tsc --noEmit` after each sub-phase.

Rules throughout:
- Every query adds .eq('is_deleted', false)
- Every write calls logAction() from lib/audit.ts
- No hard deletes — soft delete only
- All monetary values: NUMERIC(12,2)

---

## 1. SUPPLIER MANAGEMENT

### 1.1 Data model (suppliers table already exists from migration 001)

Add missing columns via migration 009:

```sql
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS ntn            TEXT,
  ADD COLUMN IF NOT EXISTS address        TEXT,
  ADD COLUMN IF NOT EXISTS credit_days    INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE NOT NULL;
```

Existing columns (from 001): id, name, contact_person, phone, email, 
created_at, updated_at, created_by, updated_by, is_deleted, deleted_at, deleted_by.

### 1.2 Supplier fields

| Field | Required | Notes |
|---|---|---|
| name | Yes | Company/distributor name |
| contact_person | No | Primary contact name |
| phone | No | Pakistani format preferred |
| email | No | For PO emails (future) |
| ntn | No | National Tax Number |
| address | No | Full address |
| credit_days | No | Default 30 days |
| credit_limit | No | PKR amount |
| notes | No | Internal notes |

### 1.3 Routes

```
/admin/suppliers          → full CRUD (admin + superadmin)
/superadmin/suppliers     → same page, superadmin access
```

Use the same component across both routes. Gate by role in layout (already handled).

---

## 2. PURCHASE ORDER MODULE

### 2.1 PO status workflow

```
draft → confirmed → received
          ↓
       cancelled (from draft or confirmed only)
```

**draft** — PO is being built. Line items can be added/removed. Not sent to supplier yet.

**confirmed** — PO is finalized. Two paths:
  - Total amount < approval_threshold setting → auto-confirmed (no approval needed)
  - Total amount >= approval_threshold → status = 'pending_approval', superadmin must approve
  - On approval: status changes to 'confirmed'
  - On rejection: status returns to 'draft' with a rejection note

**received** — GRN recorded. Stock batches created. PO is closed.

**cancelled** — Voided. No stock created. Soft record kept.

### 2.2 Settings addition

```sql
INSERT INTO settings (key, value, label) VALUES
  ('po_approval_threshold', '50000', 
   'PO Auto-Approval Threshold (PKR) — above this requires superadmin approval')
ON CONFLICT (key) DO NOTHING;
```

### 2.3 purchase_orders table (already exists — add columns)

```sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'confirmed', 'received', 'cancelled')),
  ADD COLUMN IF NOT EXISTS total_amount    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by   UUID REFERENCES profiles(id);
```

Existing columns (from 001): id, po_number, supplier_id, created_at, updated_at, 
created_by, updated_by, is_deleted, deleted_at.

**po_number generation:** auto-generate as `PO-YYYYMMDD-XXXX` where XXXX is a 
4-digit sequence per day. Use a DB function `next_po_number()`.

### 2.4 purchase_order_items table (already exists — verify columns)

```sql
-- Already exists from 001, verify these columns:
-- id, po_id, medicine_id, quantity, unit_price, total_price
-- Add if missing:
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;
```

### 2.5 goods_receipts table (already exists — verify columns)

```sql
-- Already exists from 001
-- Verify: id, grn_number, po_id, supplier_id, received_by, received_at, notes
-- Add if missing:
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
```

### 2.6 grn_items table (already exists — verify columns)

```sql
-- Already exists from 001
-- Verify: id, grn_id, medicine_id, batch_no, expiry_date, quantity, unit_price
-- These columns create stock_batches entries on GRN save
```

---

## 3. SERVER ACTIONS

### 3.1 app/actions/suppliers.ts (new file)

```typescript
createSupplier(input: CreateSupplierInput)
  // admin, superadmin
  // Zod validate, insert, logAction(CREATE_SUPPLIER)

updateSupplier(id, input: UpdateSupplierInput)  
  // admin, superadmin
  // Zod validate, update, logAction(UPDATE_SUPPLIER)

deactivateSupplier(id)
  // admin, superadmin
  // Check: no active POs reference this supplier
  // Set is_active = false, logAction(DEACTIVATE_SUPPLIER)

reactivateSupplier(id)
  // admin, superadmin
  // Set is_active = true, logAction(REACTIVATE_SUPPLIER)

getSuppliers()
  // all roles — needed for dropdowns (AddBatchForm, PO creation)
  // Returns active suppliers only for dropdowns
  // .eq('is_deleted', false).eq('is_active', true)
```

### 3.2 app/actions/procurement.ts (new file)

```typescript
createPO(supplierId, notes?)
  // admin, superadmin
  // Generate po_number via next_po_number() RPC
  // Insert purchase_orders with status='draft'
  // logAction(CREATE_PO)
  // Return { poId, poNumber }

addPOItem(poId, medicineId, quantity, unitPrice)
  // admin, superadmin  
  // Verify PO is in 'draft' status
  // Insert purchase_order_items
  // Update purchase_orders.total_amount = SUM of items
  // logAction(ADD_PO_ITEM)

updatePOItem(itemId, quantity, unitPrice)
  // admin, superadmin
  // Verify parent PO is in 'draft' status
  // Update item, recalculate PO total
  
removePOItem(itemId)
  // admin, superadmin
  // Verify parent PO is in 'draft' status
  // Delete item (hard delete — items have no independent audit need)
  // Recalculate PO total

confirmPO(poId)
  // admin, superadmin
  // Verify PO has at least 1 item
  // Fetch approval_threshold from settings
  // If total_amount < threshold: status = 'confirmed'
  // If total_amount >= threshold: status = 'pending_approval'
  // logAction(CONFIRM_PO)

approvePO(poId)
  // superadmin only
  // Verify PO is in 'pending_approval' status
  // Set status = 'confirmed', approved_by, approved_at
  // logAction(APPROVE_PO)

rejectPO(poId, rejectionNote)
  // superadmin only
  // Verify PO is in 'pending_approval' status
  // Set status = 'draft', rejected_by, rejected_at, rejection_note
  // logAction: REJECT_PO
  
cancelPO(poId, reason?)
  // admin, superadmin
  // Verify PO is in 'draft' or 'confirmed' status (not received)
  // Set status = 'cancelled', cancelled_at, cancelled_by
  // logAction(CANCEL_PO)

createGRN(poId, items: GRNItemInput[])
  // admin, superadmin, pharmacist (receives goods)
  // Verify PO is in 'confirmed' status
  // Each item: { medicineId, batchNo, expiryDate, quantity, unitPrice }
  // In a transaction (use Supabase RPC):
  //   1. Insert goods_receipts row
  //   2. Insert grn_items rows  
  //   3. For each item: INSERT or UPDATE stock_batches
  //      (if batch_no already exists for medicine: UPDATE quantity += received
  //       if new batch_no: INSERT new stock_batch)
  //   4. Update purchase_order_items.received_quantity
  //   5. Set purchase_orders.status = 'received', received_at = NOW()
  // logAction(CREATE_GRN)
```

**Critical note on createGRN:** The INSERT/UPDATE of stock_batches and 
status update of the PO must be atomic. Use a Supabase RPC function 
`complete_grn(grn_data JSONB, items JSONB)` similar to the 
`complete_sale()` stub. Write this as a Postgres function in migration 009.

---

## 4. UI COMPONENTS

### 4.1 Supplier management

```
components/suppliers/
  SuppliersPage.tsx          ← client orchestrator
  SupplierTable.tsx          ← searchable table
  SupplierDrawer.tsx         ← add/edit slide-in (right, 440px)
```

**SupplierTable columns:** Name | Contact | Phone | Credit Days | Status | Actions

**SupplierDrawer sections:**
- Company Details: name (required), contact person, phone, email
- Tax & Finance: NTN, credit days (default 30), credit limit (PKR)
- Address & Notes: address, internal notes

**Route pages:**
- `app/admin/suppliers/page.tsx` — replaces stub
- `app/superadmin/suppliers/page.tsx` — new (superadmin can manage suppliers too)

### 4.2 Purchase Orders

```
components/procurement/
  POListPage.tsx             ← client orchestrator (list view)
  POTable.tsx                ← filterable table
  PODetailPage.tsx           ← client orchestrator (single PO view)
  POLineItems.tsx            ← add/edit/remove line items (draft only)
  POStatusBadge.tsx          ← colored badge per status
  POApprovalBanner.tsx       ← shown on pending_approval POs
  GRNForm.tsx                ← goods receipt form (confirm PO → record batches)
```

**POTable columns:** PO Number | Supplier | Items | Total | Status | Date | Actions

**PO list filters:** Status (All/Draft/Pending/Confirmed/Received/Cancelled) | 
Supplier | Date range

**PO detail page layout:**
```
Header: PO-20260608-0001 | Supplier: MedPlus | Status: [Badge] | [Action buttons]

If pending_approval (superadmin only):
  [Approve] [Reject with reason]

If draft:
  [Confirm PO] [Cancel PO]

If confirmed:
  [Record GRN] [Cancel PO]

If received or cancelled:
  Read-only view

Line Items table:
  Medicine | Quantity | Unit Price | Total | [Remove] (draft only)
  [+ Add Item] button (draft only) → medicine search + qty + price

GRN Form (opens when "Record GRN" clicked):
  For each line item:
    Batch Number (required)
    Expiry Date (required)
    Received Quantity (defaults to ordered qty)
    Unit Price (defaults to PO unit price)
  [Complete GRN] button
```

**Route pages:**
- `app/admin/purchase-orders/page.tsx` — replaces stub (list view)
- `app/admin/purchase-orders/[id]/page.tsx` — new (detail view)
- `app/superadmin/purchase-orders/page.tsx` — new (shows pending approvals prominently)
- `app/superadmin/purchase-orders/[id]/page.tsx` — new (detail with approve/reject)

### 4.3 AddBatchForm supplier field update

In `components/medicines/AddBatchForm.tsx`:
- Replace the plain text supplier input with a `<select>` dropdown
- Options: fetched from `getSuppliers()` (active suppliers only)
- "No suppliers yet — add one in Suppliers" if empty
- The selected supplier_id is passed to `addStockBatch` action
- Update `addStockBatch` in `app/actions/stock.ts` to accept 
  `supplierId?: string` (UUID) instead of the current text field

---

## 5. DASHBOARD UPDATES

### 5.1 Admin dashboard

The admin dashboard has placeholder StatCards. Wire two of them with real data:

- **Open Purchase Orders** → count of POs with status IN ('draft', 'confirmed', 'pending_approval')
- **Active Suppliers** → count of suppliers where is_active = true AND is_deleted = false

Fetch both in the `app/admin/dashboard/page.tsx` server component alongside `getAlertSummary()`.

### 5.2 Superadmin dashboard

Add a **Pending Approvals** alert section to the superadmin dashboard AlertsPanel.
If any POs are in `pending_approval` status, show them with an [Approve] quick-action link.

---

## 6. DATABASE MIGRATION

### Migration 009: supplier_columns + po_columns + po_number_function + complete_grn + settings

File: `supabase/migrations/009_supplier_procurement.sql`

Order:
1. ALTER suppliers — add missing columns
2. ALTER purchase_orders — add status + workflow columns  
3. ALTER purchase_order_items — add received_quantity, notes
4. ALTER goods_receipts — add total_amount
5. ALTER grn_items — verify columns (no changes likely needed)
6. Create `next_po_number()` function
7. Create `complete_grn()` RPC function (atomic GRN + stock creation)
8. Insert po_approval_threshold settings key
9. Update RLS on suppliers and purchase_orders to reflect is_active column

**next_po_number() function:**
```sql
CREATE OR REPLACE FUNCTION next_po_number()
RETURNS TEXT AS $$
DECLARE
  v_date TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  v_seq  INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM purchase_orders
  WHERE po_number LIKE 'PO-' || v_date || '-%';
  RETURN 'PO-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
```

**complete_grn() function (atomic):**
```sql
CREATE OR REPLACE FUNCTION complete_grn(
  p_po_id      UUID,
  p_received_by UUID,
  p_notes      TEXT,
  p_items      JSONB  -- array of {medicine_id, batch_no, expiry_date, quantity, unit_price}
)
RETURNS UUID AS $$
DECLARE
  v_grn_id    UUID;
  v_grn_num   TEXT;
  v_supplier  UUID;
  v_item      JSONB;
  v_total     NUMERIC(12,2) := 0;
BEGIN
  -- Get supplier from PO
  SELECT supplier_id INTO v_supplier 
  FROM purchase_orders WHERE id = p_po_id;
  
  -- Generate GRN number
  v_grn_num := 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM goods_receipts 
          WHERE grn_number LIKE 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%')::TEXT, 4, '0');
  
  -- Insert GRN header
  INSERT INTO goods_receipts (grn_number, po_id, supplier_id, received_by, notes)
  VALUES (v_grn_num, p_po_id, v_supplier, p_received_by, p_notes)
  RETURNING id INTO v_grn_id;
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Insert GRN item
    INSERT INTO grn_items (grn_id, medicine_id, batch_no, expiry_date, quantity, unit_price)
    VALUES (
      v_grn_id,
      (v_item->>'medicine_id')::UUID,
      v_item->>'batch_no',
      (v_item->>'expiry_date')::DATE,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC
    );
    
    v_total := v_total + ((v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::NUMERIC);
    
    -- Upsert stock_batch
    INSERT INTO stock_batches (medicine_id, batch_no, expiry_date, quantity, 
                                purchase_price, supplier_id, grn_id)
    VALUES (
      (v_item->>'medicine_id')::UUID,
      v_item->>'batch_no',
      (v_item->>'expiry_date')::DATE,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      v_supplier,
      v_grn_id
    )
    ON CONFLICT (medicine_id, batch_no)
    DO UPDATE SET
      quantity = stock_batches.quantity + EXCLUDED.quantity,
      updated_at = NOW();
  END LOOP;
  
  -- Update GRN total
  UPDATE goods_receipts SET total_amount = v_total WHERE id = v_grn_id;
  
  -- Mark PO as received
  UPDATE purchase_orders 
  SET status = 'received', received_at = NOW() 
  WHERE id = p_po_id;
  
  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 7. EXECUTION PLAN

### Phase 4A — Database migration
1. Read existing purchase_orders, purchase_order_items, goods_receipts, 
   grn_items, suppliers column lists from earlier migrations
2. Write migration 009 — show SQL before running
3. I run it manually in Supabase SQL editor
4. Verify tables, functions, settings

### Phase 4B — Types + Actions
1. Update lib/db-types.ts:
   - Supplier interface (add new fields)
   - PurchaseOrder interface (add status + workflow fields)
   - PurchaseOrderItem interface (add received_quantity)
   - GoodsReceipt interface
   - GRNItem interface
2. Create app/actions/suppliers.ts (5 actions)
3. Create app/actions/procurement.ts (9 actions)
4. Update app/actions/stock.ts — addStockBatch accepts supplierId UUID
5. npx tsc --noEmit

### Phase 4C — Supplier UI
1. Build components/suppliers/ (3 components)
2. Replace stubs: app/admin/suppliers/page.tsx + 
   app/superadmin/suppliers/page.tsx
3. Update AddBatchForm supplier field → real dropdown
4. npx tsc --noEmit + npx next build

### Phase 4D — PO UI
1. Build components/procurement/ (7 components)
2. Replace stubs and add new pages:
   - app/admin/purchase-orders/page.tsx
   - app/admin/purchase-orders/[id]/page.tsx
   - app/superadmin/purchase-orders/page.tsx
   - app/superadmin/purchase-orders/[id]/page.tsx
3. npx tsc --noEmit + npx next build

### Phase 4E — Dashboard wiring + verification
1. Wire admin dashboard stat cards (Open POs, Active Suppliers)
2. Wire superadmin dashboard pending approvals alert
3. npx next build (clean)
4. Manual browser verification checklist

---

## 8. VERIFICATION CHECKLIST

SUPPLIER MANAGEMENT
- [ ] Create supplier → appears in table
- [ ] Edit supplier → changes saved
- [ ] Deactivate supplier → moves to inactive
- [ ] Supplier appears in AddBatchForm dropdown

PURCHASE ORDERS — BELOW THRESHOLD
- [ ] Create PO → status: draft
- [ ] Add line items (medicines + qty + price)
- [ ] Total shown correctly
- [ ] Confirm PO (below 50,000) → status: confirmed (no approval needed)
- [ ] Record GRN → enter batch details per line item
- [ ] GRN saved → PO status: received
- [ ] Stock batches created in medicine stock panel

PURCHASE ORDERS — ABOVE THRESHOLD
- [ ] Create PO with total > 50,000 (from settings)
- [ ] Confirm PO → status: pending_approval
- [ ] Log in as superadmin → pending approval visible on dashboard
- [ ] Superadmin approves → status: confirmed
- [ ] Record GRN → stock created

PURCHASE ORDER — REJECTION
- [ ] Confirm large PO → pending_approval
- [ ] Superadmin rejects with note
- [ ] PO returns to draft with rejection note visible

PURCHASE ORDER — CANCELLATION
- [ ] Cancel a draft PO → status: cancelled
- [ ] Cannot cancel a received PO

---

## 9. RULES (add to CLAUDE.md)

```
## Phase 4 Rules — Supplier & Procurement
- GRN creation must use complete_grn() RPC for atomicity
  Do NOT create GRN + stock_batches in separate client calls
- PO status transitions are one-way except rejection (pending → draft)
- Cancelled and received POs are read-only — no edits
- next_po_number() is not transaction-safe for concurrent inserts
  (acceptable for single-branch pharmacy with low PO volume)
- AddBatchForm supplier field is now a UUID FK to suppliers
  not a plain text field
- getSuppliers() only returns is_active = true suppliers for dropdowns
```

---

*End of PHARMACARE_PHASE_4_SUPPLIER_PROCUREMENT.md*