-- =============================================================================
-- PharmaCare — Migration 011
-- Phase 5A: POS database changes
--   • sales: held_at, hold_label, bag_charge, payment_type, held_cart_data columns
--   • sales: status CHECK extended to include 'held'
--   • customers: credit_balance / credit_limit (IF NOT EXISTS — already present)
--   • settings: POS seed rows
--   • complete_sale(): replace Phase 3 stub with full implementation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1  SALES — add POS columns
-- receipt_no already exists (NOT NULL UNIQUE) from migration 001.
-- The IF NOT EXISTS guard on that line is a safe no-op.
-- held_cart_data: JSONB snapshot of CartItem[] for parked sales.
--   Held sales do NOT insert sale_items rows — the cart is stored here and
--   reconstructed on resume. complete_sale() inserts fresh sale_items at
--   checkout, so no orphaned sale_items accumulate from parked sales.
-- ---------------------------------------------------------------------------

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS held_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_label      TEXT,
  ADD COLUMN IF NOT EXISTS bag_charge      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type    TEXT DEFAULT 'cash'
    CHECK (payment_type IN ('cash', 'credit')),
  ADD COLUMN IF NOT EXISTS held_cart_data  JSONB;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS receipt_no TEXT UNIQUE;

-- Extend status CHECK to allow 'held' (parked sales).
-- PostgreSQL auto-names the inline column CHECK as sales_status_check.
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('completed', 'voided', 'pending_approval', 'held'));

-- ---------------------------------------------------------------------------
-- 2.2  CUSTOMERS — credit columns
-- Both columns already exist as NUMERIC(10,2) from migration 001.
-- IF NOT EXISTS makes these lines no-ops — existing definitions are kept.
-- ---------------------------------------------------------------------------

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(12,2) DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2.3  SETTINGS — POS seed data
-- Spec requires pos_discount_max_pct and pos_receipt_footer.
-- Also seeding the three settings fetched by the POS server component
-- (Section 11): batch_selection_mode, bag_charge_enabled, bag_charge_amount.
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value, label) VALUES
  ('pos_discount_max_pct',  '10',
   'Maximum discount % a pharmacist can apply at POS'),
  ('pos_receipt_footer',    'Thank you for your visit.',
   'Text printed at the bottom of every receipt'),
  ('batch_selection_mode',  'fefo',
   'POS batch selection mode: fefo | manual | show_all'),
  ('bag_charge_enabled',    'false',
   'Enable per-sale bag / printing charge'),
  ('bag_charge_amount',     '2',
   'Bag charge per sale (PKR)')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2.4  complete_sale() RPC — replace Phase 3 stub
--
-- The stub signature was: complete_sale(sale_data JSONB, items JSONB) → UUID
-- The new signature has completely different parameter types and return type.
-- CREATE OR REPLACE cannot change a function's return type, and would create
-- a separate overload rather than replacing the stub.
-- Drop the old signature explicitly before creating the new function.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS complete_sale(JSONB, JSONB);

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
  -- Generate receipt number: SR-YYYYMMDD-XXXX (4-digit sequence, daily reset)
  SELECT 'SR-' || v_date || '-' ||
    LPAD(
      (SELECT COUNT(*) + 1 FROM sales
       WHERE receipt_no LIKE 'SR-' || v_date || '-%')::TEXT,
      4, '0'
    )
  INTO v_receipt_no;

  -- Validate items and calculate subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    -- Verify batch exists and has sufficient stock
    SELECT quantity INTO v_batch_qty
    FROM stock_batches
    WHERE id = (v_item->>'batch_id')::UUID
      AND is_deleted = FALSE;

    IF v_batch_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', v_item->>'batch_id';
    END IF;

    IF v_batch_qty < (v_item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Insufficient stock for batch %: have %, need %',
        v_item->>'batch_id', v_batch_qty, (v_item->>'quantity')::INTEGER;
    END IF;

    -- Resolve effective MRP (batch-level mrp with fallback to medicine mrp)
    SELECT COALESCE(sb.mrp, m.mrp) INTO v_mrp
    FROM stock_batches sb
    JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.id = (v_item->>'batch_id')::UUID;

    -- Enforce MRP ceiling
    IF (v_item->>'unit_price')::NUMERIC > v_mrp THEN
      RAISE EXCEPTION 'unit_price (%) exceeds MRP (%) for batch %',
        (v_item->>'unit_price')::NUMERIC, v_mrp, v_item->>'batch_id';
    END IF;

    v_subtotal := v_subtotal + (
      (v_item->>'quantity')::INTEGER *
      (v_item->>'unit_price')::NUMERIC *
      (1 - COALESCE((v_item->>'discount_pct')::NUMERIC, 0) / 100)
    );
  END LOOP;

  v_total  := v_subtotal - p_discount_amt + p_bag_charge;
  v_change := CASE WHEN p_payment_type = 'cash'
                   THEN p_amount_paid - v_total
                   ELSE 0
              END;

  -- Insert sale header
  INSERT INTO sales (
    receipt_no,    cashier_id,      customer_id,     payment_type,
    subtotal,      discount_amount, bag_charge,      total_amount,
    amount_paid,   change_amount,   notes,           status
  ) VALUES (
    v_receipt_no,  p_cashier_id,    p_customer_id,   p_payment_type,
    v_subtotal,    p_discount_amt,  p_bag_charge,    v_total,
    p_amount_paid, v_change,        p_notes,         'completed'
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items and decrement stock (second pass — after header committed)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    INSERT INTO sale_items (
      sale_id,     medicine_id,   batch_id,    batch_no,
      quantity,    unit_price,    mrp,         discount_pct,   total_price
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

    -- Decrement batch quantity atomically
    UPDATE stock_batches
    SET quantity   = quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'batch_id')::UUID;

  END LOOP;

  -- Credit sale: post amount to customer ledger
  IF p_payment_type = 'credit' AND p_customer_id IS NOT NULL THEN
    UPDATE customers
    SET credit_balance = credit_balance + v_total,
        updated_at     = NOW()
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

-- =============================================================================
-- Phase 5 UX: get_top_medicines helper
-- Returns top N medicines by all-time sale frequency.
-- Used by POS page load to pre-populate popular medicine cards.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_top_medicines(p_limit INTEGER DEFAULT 15)
RETURNS TABLE(medicine_id UUID, sale_count BIGINT) AS $$
  SELECT medicine_id, COUNT(*) AS sale_count
  FROM sale_items
  GROUP BY medicine_id
  ORDER BY sale_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL    ON FUNCTION get_top_medicines(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_top_medicines(INTEGER) TO authenticated;

-- =============================================================================
-- END OF MIGRATION 011
-- =============================================================================
