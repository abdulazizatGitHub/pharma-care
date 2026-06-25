-- ─── 024_partial_grn.sql ──────────────────────────────────────────────────────

-- 1. Extend status CHECK to include partially_received
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'confirmed',
    'partially_received', 'received', 'cancelled'
  ));

-- 2. Replace complete_grn() — accepts both confirmed + partially_received POs,
--    sets status to partially_received or received based on p_is_partial flag.
CREATE OR REPLACE FUNCTION complete_grn(
  p_po_id       UUID,
  p_received_by UUID,
  p_notes       TEXT,
  p_items       JSONB,   -- [{medicine_id, batch_no, expiry_date, quantity, unit_price}, ...]
  p_is_partial  BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_grn_id   UUID;
  v_grn_num  TEXT;
  v_supplier UUID;
  v_item     JSONB;
  v_total    NUMERIC(12,2) := 0;
BEGIN
  -- Verify PO exists and is in a receivable status
  SELECT supplier_id INTO v_supplier
  FROM purchase_orders
  WHERE id = p_po_id
    AND status IN ('confirmed', 'partially_received')
    AND is_deleted = FALSE;

  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'PO % not found or not in a receivable status (confirmed/partially_received)', p_po_id;
  END IF;

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

  -- Insert GRN header
  INSERT INTO goods_receipts (grn_number, po_id, supplier_id, received_by, notes)
  VALUES (v_grn_num, p_po_id, v_supplier, p_received_by, p_notes)
  RETURNING id INTO v_grn_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
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

  -- Update PO status: partial leaves it open for more GRNs; final closes it
  UPDATE purchase_orders
  SET
    status      = CASE WHEN p_is_partial THEN 'partially_received' ELSE 'received' END,
    received_at = CASE WHEN p_is_partial THEN received_at ELSE NOW() END
  WHERE id = p_po_id;

  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB, BOOLEAN) TO authenticated;

-- Revoke the old 4-argument signature so callers are forced to update
REVOKE ALL    ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
