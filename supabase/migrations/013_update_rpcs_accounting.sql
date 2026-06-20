-- =============================================================================
-- PharmaCare — Migration 013: Integrate accounting into complete_sale() and
-- complete_grn() (Phase 7B)
-- File: supabase/migrations/013_update_rpcs_accounting.sql
-- Spec: PHARMACARE_PHASE_7_LEDGER.md §7.1, §7.2, §4.1
--
-- Changes:
--   complete_sale()  — after all core POS operations succeed, computes COGS
--                      from sale_items × stock_batches.purchase_price and
--                      calls post_journal_entry() to record the sale entry.
--   complete_grn()   — after the GRN header, items, stock upsert, and PO
--                      status update, calls post_journal_entry() to record
--                      the inventory / accounts-payable entry.
--
-- Journal entry placement rule (both functions):
--   Accounting happens LAST, after every business operation in the function.
--   If post_journal_entry() raises (unbalanced entry, unknown account, etc.),
--   the entire Postgres transaction rolls back — this is CORRECT behaviour.
--   Do NOT catch or suppress accounting exceptions.
--
-- Auto-posting map implemented here (Section 4.1):
--   Cash sale:
--     DEBIT  1000 Cash                     total_amount
--     CREDIT 4000 Sales Revenue            subtotal − discount_amount
--     CREDIT 4010 Other Revenue            bag_charge        (only if > 0)
--     DEBIT  5000 Cost of Goods Sold       v_cogs            (only if > 0)
--     CREDIT 1200 Inventory                v_cogs            (only if > 0)
--
--   Credit sale:
--     DEBIT  1100 Accounts Receivable      total_amount      [party: customer]
--     CREDIT 4000 Sales Revenue            subtotal − discount_amount
--     CREDIT 4010 Other Revenue            bag_charge        (only if > 0)
--     DEBIT  5000 Cost of Goods Sold       v_cogs            (only if > 0)
--     CREDIT 1200 Inventory                v_cogs            (only if > 0)
--
--   GRN received:
--     DEBIT  1200 Inventory                total GRN amount  [party: none]
--     CREDIT 2000 Accounts Payable         total GRN amount  [party: supplier]
--     (Only posted when v_total > 0 — zero-value GRNs generate no entry.)
--
-- COGS calculation (Section 4.2):
--   v_cogs = SUM(si.quantity × COALESCE(sb.purchase_price, 0))
--   for all sale_items of the current sale, joined to stock_batches.
--   COALESCE(purchase_price, 0): batches without a recorded purchase price
--   contribute zero COGS — no error, but the batch should be audited.
--   COGS lines are omitted when v_cogs = 0 (protects the amount > 0 constraint).
--
-- Signatures are IDENTICAL to the originals — no DROP needed.
-- =============================================================================


-- ===========================================================================
-- 1. complete_sale() — updated with journal entry posting
--
-- Original parameters (unchanged):
--   p_cashier_id   UUID
--   p_customer_id  UUID        nullable
--   p_payment_type TEXT        'cash' | 'credit'
--   p_items        JSONB       [{medicine_id, batch_id, quantity, unit_price, discount_pct}]
--   p_discount_amt NUMERIC     overall sale discount (Rs amount)
--   p_bag_charge   NUMERIC     per-sale service / bag charge → credited to 4010
--   p_amount_paid  NUMERIC     cash tendered by customer
--   p_notes        TEXT        optional
-- Returns: JSONB {sale_id, receipt_no, total, change}
-- ===========================================================================

CREATE OR REPLACE FUNCTION complete_sale(
  p_cashier_id    UUID,
  p_customer_id   UUID,
  p_payment_type  TEXT,
  p_items         JSONB,
  p_discount_amt  NUMERIC,
  p_bag_charge    NUMERIC,
  p_amount_paid   NUMERIC,
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
  -- Accounting additions
  v_cogs        NUMERIC(15,4) := 0;
  v_lines       JSONB;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Generate receipt number: SR-YYYYMMDD-XXXX (daily reset)
  -- -------------------------------------------------------------------------
  SELECT 'SR-' || v_date || '-' ||
    LPAD(
      (SELECT COUNT(*) + 1 FROM sales
       WHERE receipt_no LIKE 'SR-' || v_date || '-%')::TEXT,
      4, '0'
    )
  INTO v_receipt_no;

  -- -------------------------------------------------------------------------
  -- 2. Validate items, enforce MRP ceiling, calculate subtotal
  -- -------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

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

    SELECT COALESCE(sb.mrp, m.mrp) INTO v_mrp
    FROM stock_batches sb
    JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.id = (v_item->>'batch_id')::UUID;

    IF (v_item->>'unit_price')::NUMERIC > v_mrp THEN
      RAISE EXCEPTION 'unit_price (%) exceeds MRP (%) for batch %',
        (v_item->>'unit_price')::NUMERIC, v_mrp, v_item->>'batch_id';
    END IF;

    v_subtotal := v_subtotal + (
      (v_item->>'quantity')::INTEGER    *
      (v_item->>'unit_price')::NUMERIC  *
      (1 - COALESCE((v_item->>'discount_pct')::NUMERIC, 0) / 100)
    );
  END LOOP;

  v_total  := v_subtotal - p_discount_amt + p_bag_charge;
  v_change := CASE WHEN p_payment_type = 'cash'
                   THEN p_amount_paid - v_total
                   ELSE 0
              END;

  -- -------------------------------------------------------------------------
  -- 3. Insert sale header
  -- -------------------------------------------------------------------------
  INSERT INTO sales (
    receipt_no,    cashier_id,      customer_id,     payment_type,
    subtotal,      discount_amount, bag_charge,      total_amount,
    amount_paid,   change_amount,   notes,           status
  ) VALUES (
    v_receipt_no,  p_cashier_id,    p_customer_id,   p_payment_type,
    v_subtotal,    p_discount_amt,  p_bag_charge,    v_total,
    p_amount_paid, v_change,        p_notes,         'completed'
  ) RETURNING id INTO v_sale_id;

  -- -------------------------------------------------------------------------
  -- 4. Insert sale_items + decrement stock
  -- -------------------------------------------------------------------------
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
      (v_item->>'quantity')::INTEGER    *
        (v_item->>'unit_price')::NUMERIC  *
        (1 - COALESCE((v_item->>'discount_pct')::NUMERIC, 0) / 100)
    FROM stock_batches sb
    JOIN medicines m ON m.id = sb.medicine_id
    WHERE sb.id = (v_item->>'batch_id')::UUID;

    UPDATE stock_batches
    SET quantity   = quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'batch_id')::UUID;

  END LOOP;

  -- -------------------------------------------------------------------------
  -- 5. Credit sale: add to customer's outstanding balance
  -- -------------------------------------------------------------------------
  IF p_payment_type = 'credit' AND p_customer_id IS NOT NULL THEN
    UPDATE customers
    SET credit_balance = credit_balance + v_total,
        updated_at     = NOW()
    WHERE id = p_customer_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. Compute COGS from the sale_items just inserted
  --    COALESCE(purchase_price, 0): batches without a recorded purchase price
  --    contribute 0 to COGS. Batches should have purchase_price set via GRN.
  -- -------------------------------------------------------------------------
  SELECT COALESCE(
    SUM(si.quantity * COALESCE(sb.purchase_price, 0)),
    0
  ) INTO v_cogs
  FROM sale_items   si
  JOIN stock_batches sb ON sb.id = si.batch_id
  WHERE si.sale_id = v_sale_id;

  -- -------------------------------------------------------------------------
  -- 7. Build and post the journal entry
  --
  --    Revenue side:
  --      DEBIT  1000/1100  v_total                         (cash or receivable)
  --      CREDIT 4000       subtotal − discount             (medicine revenue)
  --      CREDIT 4010       bag_charge                      (service fee, if > 0)
  --
  --    COGS side (only when v_cogs > 0 — protects amount > 0 constraint):
  --      DEBIT  5000       v_cogs
  --      CREDIT 1200       v_cogs
  --
  --    Balance check:
  --      ∑ debits  = v_total + v_cogs
  --                = (subtotal − discount + bag_charge) + v_cogs
  --      ∑ credits = (subtotal − discount) + bag_charge + v_cogs
  --                = same ✓
  -- -------------------------------------------------------------------------

  -- Base lines: debit cash/receivable + credit medicine revenue
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', CASE WHEN p_payment_type = 'cash' THEN '1000' ELSE '1100' END,
      'direction',    'debit',
      'amount',       v_total::TEXT,
      'party_type',   CASE WHEN p_payment_type = 'credit' THEN 'customer' ELSE NULL END,
      'party_id',     CASE WHEN p_payment_type = 'credit' AND p_customer_id IS NOT NULL
                           THEN p_customer_id::TEXT ELSE NULL END,
      'description',  'Receipt: ' || v_receipt_no
    ),
    jsonb_build_object(
      'account_code', '4000',
      'direction',    'credit',
      'amount',       (v_subtotal - p_discount_amt)::TEXT,
      'description',  'Medicine sales: ' || v_receipt_no
    )
  );

  -- Append service fee line only when bag_charge > 0
  IF p_bag_charge > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '4010',
        'direction',    'credit',
        'amount',       p_bag_charge::TEXT,
        'description',  'Service fee: ' || v_receipt_no
      )
    );
  END IF;

  -- Append COGS lines only when purchase prices were recorded (v_cogs > 0)
  IF v_cogs > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '5000',
        'direction',    'debit',
        'amount',       v_cogs::TEXT,
        'description',  'COGS: ' || v_receipt_no
      ),
      jsonb_build_object(
        'account_code', '1200',
        'direction',    'credit',
        'amount',       v_cogs::TEXT,
        'description',  'Inventory reduction: ' || v_receipt_no
      )
    );
  END IF;

  PERFORM post_journal_entry(
    CURRENT_DATE,                                              -- entry_date
    'Sale ' || v_receipt_no,                                   -- description
    'sale',                                                    -- reference_type
    v_sale_id,                                                 -- reference_id
    'PKR',                                                     -- currency
    1.000000,                                                  -- exchange_rate
    v_lines,                                                   -- lines
    p_cashier_id                                               -- created_by
  );

  -- -------------------------------------------------------------------------
  -- 8. Return result to caller
  -- -------------------------------------------------------------------------
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


-- ===========================================================================
-- 2. complete_grn() — updated with journal entry posting
--
-- Original parameters (unchanged):
--   p_po_id       UUID   — PO that this GRN fulfils (must be in 'confirmed' status)
--   p_received_by UUID   — profile ID of the staff member receiving the stock
--   p_notes       TEXT   — optional GRN notes
--   p_items       JSONB  — [{medicine_id, batch_no, expiry_date, quantity, unit_price}]
-- Returns: UUID (grn_id)
--
-- Journal entry (Section 7.2):
--   DEBIT  1200 Inventory        v_total  — stock value increases
--   CREDIT 2000 Accounts Payable v_total  — we now owe the supplier  [party: supplier]
--
--   Entry is skipped when v_total = 0 (all items had unit_price = 0)
--   to protect the amount > 0 constraint on journal_lines.
-- ===========================================================================

CREATE OR REPLACE FUNCTION complete_grn(
  p_po_id       UUID,
  p_received_by UUID,
  p_notes       TEXT,
  p_items       JSONB
)
RETURNS UUID AS $$
DECLARE
  v_grn_id   UUID;
  v_grn_num  TEXT;
  v_supplier UUID;
  v_item     JSONB;
  v_total    NUMERIC(12,2) := 0;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Verify PO exists and is in 'confirmed' status
  -- -------------------------------------------------------------------------
  SELECT supplier_id INTO v_supplier
  FROM purchase_orders
  WHERE id        = p_po_id
    AND status    = 'confirmed'
    AND is_deleted = FALSE;

  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'PO % not found or not in confirmed status', p_po_id;
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'complete_grn: items array must not be empty';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Generate GRN number: GRN-YYYYMMDD-XXXX
  -- -------------------------------------------------------------------------
  SELECT 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(
      (SELECT COUNT(*) + 1 FROM goods_receipts
       WHERE grn_number LIKE 'GRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%')::TEXT,
      4, '0'
    )
  INTO v_grn_num;

  -- -------------------------------------------------------------------------
  -- 3. Insert GRN header
  -- -------------------------------------------------------------------------
  INSERT INTO goods_receipts (grn_number, po_id, supplier_id, received_by, notes)
  VALUES (v_grn_num, p_po_id, v_supplier, p_received_by, p_notes)
  RETURNING id INTO v_grn_id;

  -- -------------------------------------------------------------------------
  -- 4. Process each item: insert GRN line, accumulate total, upsert stock batch
  -- -------------------------------------------------------------------------
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

    -- Upsert stock batch — increment quantity if batch already exists.
    -- mrp and sale_price are intentionally omitted (set via AddBatchForm or POS).
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

  -- -------------------------------------------------------------------------
  -- 5. Stamp GRN total, close PO
  -- -------------------------------------------------------------------------
  UPDATE goods_receipts
  SET total_amount = v_total
  WHERE id = v_grn_id;

  UPDATE purchase_orders
  SET status = 'received', received_at = NOW()
  WHERE id = p_po_id;

  -- -------------------------------------------------------------------------
  -- 6. Post journal entry for inventory receipt
  --
  --    DEBIT  1200 Inventory        v_total  (stock value increases)
  --    CREDIT 2000 Accounts Payable v_total  (liability to supplier increases)
  --
  --    Skipped when v_total = 0 (protects amount > 0 constraint on journal_lines).
  --    A zero-value GRN is unusual but must not crash; the stock batch is still
  --    created correctly above.
  --
  --    COGS is NOT recorded here. Inventory flows in at purchase cost.
  --    COGS is recorded in complete_sale() when items are sold.
  -- -------------------------------------------------------------------------
  IF v_total > 0 THEN
    PERFORM post_journal_entry(
      CURRENT_DATE,                                            -- entry_date
      'GRN ' || v_grn_num,                                    -- description
      'grn',                                                   -- reference_type
      v_grn_id,                                               -- reference_id
      'PKR',                                                   -- currency
      1.000000,                                                -- exchange_rate
      jsonb_build_array(
        jsonb_build_object(
          'account_code', '1200',
          'direction',    'debit',
          'amount',       v_total::TEXT,
          'description',  'Stock received: ' || v_grn_num
        ),
        jsonb_build_object(
          'account_code', '2000',
          'direction',    'credit',
          'amount',       v_total::TEXT,
          'party_type',   'supplier',
          'party_id',     v_supplier::TEXT,
          'description',  'Payable to supplier: ' || v_grn_num
        )
      ),
      p_received_by                                            -- created_by
    );
  END IF;

  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 013
-- =============================================================================
