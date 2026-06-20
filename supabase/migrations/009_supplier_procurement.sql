-- =============================================================================
-- PharmaCare — Migration 009: Supplier & Procurement
-- File: supabase/migrations/009_supplier_procurement.sql
-- Spec: PHARMACARE_PHASE_4_SUPPLIER_PROCUREMENT.md
--
-- Column investigation summary (read migrations 001–008 before running):
--
--   suppliers:
--     address, ntn, credit_days, credit_limit, notes already exist in 001.
--     ONLY is_active is genuinely new.
--
--   purchase_orders:
--     po_number (TEXT NOT NULL UNIQUE, no DEFAULT), status (wrong CHECK constraint),
--     total_amount (no DEFAULT), approved_by, approved_at, notes already exist in 001.
--     status CHECK must be replaced (old: draft/submitted/approved/rejected/received/invoiced
--                                    new: draft/pending_approval/confirmed/received/cancelled).
--     total_amount needs DEFAULT 0.
--     6 new columns: rejected_by/at, rejection_note, received_at, cancelled_at/by.
--
--   purchase_order_items:
--     All base columns exist. 2 genuinely new: received_quantity, notes.
--
--   goods_receipts:
--     All base columns exist. 1 genuinely new: total_amount.
--
--   grn_items:
--     All columns present (id, grn_id, medicine_id, batch_no, expiry_date,
--     quantity, unit_price, created_at). No changes needed.
--     stock_batches UNIQUE(medicine_id, batch_no) from 001 enables ON CONFLICT
--     in complete_grn().
--
-- Order:
--   1. ALTER suppliers        — add is_active
--   2. ALTER purchase_orders  — replace status CHECK, set total_amount default,
--                               add 6 workflow columns
--   3. ALTER purchase_order_items — add received_quantity, notes
--   4. ALTER goods_receipts   — add total_amount
--   5. grn_items              — no changes (documented above)
--   6. next_po_number()       — SECURITY DEFINER function + DEFAULT on po_number
--   7. complete_grn()         — atomic GRN + stock creation RPC (SECURITY DEFINER)
--   8. Settings seed          — po_approval_threshold + expiry_alert_days
--   9. RLS updates            — add pharmacist to suppliers/purchase_orders/po_items SELECT
-- =============================================================================


-- ===========================================================================
-- 1. ALTER suppliers
--    All spec-listed columns (ntn, address, credit_days, credit_limit, notes)
--    already exist from 001. Only is_active is genuinely new.
-- ===========================================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;


-- ===========================================================================
-- 2. ALTER purchase_orders
-- ===========================================================================

-- Drop the old status CHECK constraint (PostgreSQL auto-names it
-- purchase_orders_status_check for an inline column CHECK in CREATE TABLE).
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Migrate any existing rows with old status values to 'draft' before
-- the new constraint is added (safe no-op when no rows exist).
UPDATE purchase_orders
  SET status = 'draft'
  WHERE status IN ('submitted', 'approved', 'rejected', 'invoiced')
    AND is_deleted = FALSE;

-- Add new CHECK constraint with Phase 4 workflow status values.
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'pending_approval', 'confirmed', 'received', 'cancelled'));

-- Set DEFAULT 0 on total_amount (column existed in 001 without a default).
ALTER TABLE purchase_orders
  ALTER COLUMN total_amount SET DEFAULT 0;

-- Add 6 genuinely new workflow columns.
-- approved_by, approved_at, notes are NOT listed here — they already exist in 001.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS rejected_by    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by   UUID REFERENCES profiles(id);


-- ===========================================================================
-- 3. ALTER purchase_order_items — add 2 missing columns
-- ===========================================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             TEXT;


-- ===========================================================================
-- 4. ALTER goods_receipts — add total_amount
-- ===========================================================================

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);


-- ===========================================================================
-- 5. grn_items — no changes needed (documented in header above)
-- ===========================================================================


-- ===========================================================================
-- 6. next_po_number()
--    Generates PO-YYYYMMDD-XXXX.
--    SECURITY DEFINER so it can count purchase_orders rows regardless of the
--    caller's RLS context.
--    Not transaction-safe for concurrent inserts — acceptable for single-branch
--    pharmacy with low PO volume (see Phase 4 rules in CLAUDE.md).
-- ===========================================================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION next_po_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_po_number() TO authenticated;

-- Set DEFAULT so DB-level inserts (and the server action fallback) work correctly.
-- Server actions call next_po_number() via RPC and pass the result explicitly;
-- the DEFAULT is a safety net for direct SQL inserts.
ALTER TABLE purchase_orders
  ALTER COLUMN po_number SET DEFAULT next_po_number();


-- ===========================================================================
-- 7. complete_grn()
--    Atomic GRN header + items + stock_batch upsert + PO status update.
--    SECURITY DEFINER so all writes succeed regardless of the caller's role.
--    A Postgres function body executes within a single implicit transaction.
--    The ON CONFLICT on stock_batches uses UNIQUE(medicine_id, batch_no)
--    created in migration 001.
-- ===========================================================================

CREATE OR REPLACE FUNCTION complete_grn(
  p_po_id       UUID,
  p_received_by UUID,
  p_notes       TEXT,
  p_items       JSONB  -- [{medicine_id, batch_no, expiry_date, quantity, unit_price}, ...]
)
RETURNS UUID AS $$
DECLARE
  v_grn_id   UUID;
  v_grn_num  TEXT;
  v_supplier UUID;
  v_item     JSONB;
  v_total    NUMERIC(12,2) := 0;
BEGIN
  -- Verify PO exists and is in 'confirmed' status
  SELECT supplier_id INTO v_supplier
  FROM purchase_orders
  WHERE id = p_po_id
    AND status = 'confirmed'
    AND is_deleted = FALSE;

  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'PO % not found or not in confirmed status', p_po_id;
  END IF;

  -- Verify at least one item was supplied
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'complete_grn: items array must not be empty';
  END IF;

  -- Generate GRN number: GRN-YYYYMMDD-XXXX
  SELECT 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(
      (SELECT COUNT(*) + 1 FROM goods_receipts
       WHERE grn_number LIKE 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%')::TEXT,
      4, '0'
    )
  INTO v_grn_num;

  -- Insert GRN header (received_at uses column DEFAULT = NOW())
  INSERT INTO goods_receipts (grn_number, po_id, supplier_id, received_by, notes)
  VALUES (v_grn_num, p_po_id, v_supplier, p_received_by, p_notes)
  RETURNING id INTO v_grn_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Insert GRN item row
    INSERT INTO grn_items (grn_id, medicine_id, batch_no, expiry_date, quantity, unit_price)
    VALUES (
      v_grn_id,
      (v_item->>'medicine_id')::UUID,
       v_item->>'batch_no',
      (v_item->>'expiry_date')::DATE,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC
    );

    v_total := v_total + (
      (v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::NUMERIC
    );

    -- Upsert stock_batch: increment quantity if batch already exists, otherwise insert.
    -- mrp and sale_price are intentionally omitted (set later via AddBatchForm or POS).
    -- mrp NULL is safe: check_sale_item_mrp() falls back to medicines.mrp per migration 008.
    INSERT INTO stock_batches (
      medicine_id, batch_no, expiry_date, quantity,
      purchase_price, supplier_id, grn_id
    ) VALUES (
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
      quantity   = stock_batches.quantity + EXCLUDED.quantity,
      updated_at = NOW();
  END LOOP;

  -- Write GRN total
  UPDATE goods_receipts
  SET total_amount = v_total
  WHERE id = v_grn_id;

  -- Close PO
  UPDATE purchase_orders
  SET status = 'received', received_at = NOW()
  WHERE id = p_po_id;

  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB) TO authenticated;


-- ===========================================================================
-- 8. SETTINGS SEED
--    po_approval_threshold: new Phase 4 key (differs from po_auto_approve_threshold
--      seeded in 001 — both coexist; Phase 4 actions read po_approval_threshold).
--    expiry_alert_days: used by getAlertSummary() self-healing seed in Phase 3;
--      pre-seeding here so that code path becomes a no-op.
-- ===========================================================================

INSERT INTO settings (key, value, label) VALUES
  ('po_approval_threshold', '50000',
   'PO Approval Threshold (PKR) — at or above this requires superadmin approval'),
  ('expiry_alert_days',     '90',
   'Expiry Alert Window (days) — batches expiring within this window are flagged')
ON CONFLICT (key) DO NOTHING;


-- ===========================================================================
-- 9. RLS POLICY UPDATES
--
--    suppliers SELECT: add pharmacist so getSuppliers() works in AddBatchForm
--      dropdown (all roles need to see active suppliers).
--
--    purchase_orders SELECT: add pharmacist so createGRN() app-level status
--      check can read the PO before calling complete_grn() RPC.
--      is_deleted = FALSE guard added (was missing from the 006 policy).
--
--    purchase_order_items SELECT: add pharmacist so GRN form can display
--      ordered quantities per line item.
-- ===========================================================================

-- suppliers
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist')
         AND is_deleted = FALSE);

-- purchase_orders
DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist')
         AND is_deleted = FALSE);

-- purchase_order_items
DROP POLICY IF EXISTS "po_items_select" ON purchase_order_items;
CREATE POLICY "po_items_select" ON purchase_order_items FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
