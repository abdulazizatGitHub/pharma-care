-- =============================================================================
-- PharmaCare — Migration 032: Accounting Fixes (Phase 13A)
-- File: supabase/migrations/032_accounting_fixes.sql
-- Spec: PHARMACARE_PHASE_13_ACCOUNTING_FIXES.md
-- Session: 13A — DB and RPC changes only
--
-- Fixes:
--   Bug 1 — complete_grn() missing journal entry (regression in migration 024)
--   Bug 2 — bank_transfer/cheque routed to 1000 Cash; fix in complete_sale()
--            and process_return() (server actions fixed in Session 13B)
--   Bug 3 — Discount netted against 4000 revenue; separated into 4900
--   Bug 4 — process_return() always refunds to 1000 Cash regardless of payment type
--
-- Sections:
--   1. INSERT account 4900 Sales Discount (contra-revenue)
--   2. RENAME account 1001 Cash in Hand → Bank Account
--   3. Recreate complete_grn()   — add post_journal_entry() call (Bug 1)
--   4. Recreate complete_sale()  — payment routing + discount separation (Bugs 2, 3)
--   5. Recreate process_return() — payment routing for refunds (Bug 4)
-- =============================================================================


-- =============================================================================
-- SECTION 1 — New account 4900: Sales Discount (contra-revenue)
--
-- account_type = 'revenue', normal_balance = 'debit'.
-- This is a contra-revenue account — standard accounting practice.
-- The DB CHECK constraint validates account_type values only; it does not
-- enforce that normal_balance must agree with account_type. This is intentional.
-- =============================================================================

INSERT INTO accounts (
  code, name, account_type, normal_balance,
  is_system, is_active, is_deleted, currency
) VALUES (
  '4900', 'Sales Discount', 'revenue', 'debit',
  true, true, false, 'PKR'
) ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- SECTION 2 — Rename account 1001: Cash in Hand → Bank Account
-- =============================================================================

UPDATE accounts
SET name = 'Bank Account'
WHERE code = '1001' AND is_deleted = false;


-- =============================================================================
-- SECTION 3 — Fix complete_grn(): add journal entry posting
--
-- Source: supabase/migrations/024_partial_grn.sql
-- Bug: Migration 024 silently dropped the post_journal_entry() call that
--      existed in migration 013. All GRNs since 024 are missing:
--        DEBIT  1200 Inventory        v_total
--        CREDIT 2000 Accounts Payable v_total
--
-- Change: Add IF v_total > 0 / PERFORM post_journal_entry() block AFTER the
--         PO status UPDATE and BEFORE RETURN v_grn_id. All other logic is
--         identical to 024.
--
-- Variable names (exact, from 024 body):
--   v_grn_num, v_grn_id, v_total, v_supplier, p_received_by
--
-- Both full and partial GRNs post a journal entry for their own received value.
-- Multiple partial GRNs on the same PO each post independently — correct.
-- =============================================================================

CREATE OR REPLACE FUNCTION complete_grn(
  p_po_id       UUID,
  p_received_by UUID,
  p_notes       TEXT,
  p_items       JSONB,
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

  -- Post journal entry: Inventory in / AP out                      [NEW — Bug 1 fix]
  -- Guard: skip if v_total = 0 (zero-value GRN; stock still created, no money owed).
  -- If post_journal_entry() raises (unbalanced, missing account), the entire
  -- transaction rolls back — this is correct, same as complete_sale().
  IF v_total > 0 THEN
    PERFORM post_journal_entry(
      CURRENT_DATE,
      'GRN ' || v_grn_num,
      'grn',
      v_grn_id,
      'PKR',
      1.000000,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', '1200',
          'direction',    'debit',
          'amount',       v_total::TEXT,
          'description',  'Inventory received: ' || v_grn_num
        ),
        jsonb_build_object(
          'account_code', '2000',
          'direction',    'credit',
          'amount',       v_total::TEXT,
          'description',  'Accounts payable: ' || v_grn_num
        )
      ),
      p_received_by
    );
  END IF;

  RETURN v_grn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_grn(UUID, UUID, TEXT, JSONB, BOOLEAN) TO authenticated;


-- =============================================================================
-- SECTION 4 — Fix complete_sale(): payment routing + discount separation
--
-- Source: supabase/migrations/013_update_rpcs_accounting.sql
--
-- Changes (4 total):
--   A. DECLARE: add v_debit_account TEXT
--   B. Set v_debit_account before journal build (routes cash/bank/receivable)
--   C. Debit line account_code: was hardcoded CASE '1000'/'1100', now v_debit_account
--   D. 4000 credit amount: was (subtotal - discount), now subtotal (gross)
--      New 4900 debit line appended when p_discount_amt > 0
--
-- Balance proof:
--   Debits:  v_debit_account(v_total) + 4900(p_discount_amt) + 5000(v_cogs)
--          = (subtotal − discount + bag_charge) + discount + cogs
--          = subtotal + bag_charge + cogs
--   Credits: 4000(v_subtotal) + 4010(p_bag_charge) + 1200(v_cogs)
--          = subtotal + bag_charge + cogs  ✓
--
-- All other logic is identical to 013.
-- =============================================================================

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
  v_sale_id       UUID;
  v_receipt_no    TEXT;
  v_subtotal      NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2);
  v_change        NUMERIC(12,2);
  v_item          JSONB;
  v_batch_qty     INTEGER;
  v_mrp           NUMERIC(12,2);
  v_date          TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  v_cogs          NUMERIC(15,4) := 0;
  v_lines         JSONB;
  v_debit_account TEXT;                                             -- [CHANGE A]
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
  -- -------------------------------------------------------------------------
  SELECT COALESCE(
    SUM(si.quantity * COALESCE(sb.purchase_price, 0)),
    0
  ) INTO v_cogs
  FROM sale_items   si
  JOIN stock_batches sb ON sb.id = si.batch_id
  WHERE si.sale_id = v_sale_id;

  -- -------------------------------------------------------------------------
  -- 7. Route payment account                                        [CHANGE B]
  --
  --   cash          → 1000 Cash
  --   bank_transfer → 1001 Bank Account
  --   cheque        → 1001 Bank Account (cheques clear via bank)
  --   credit        → 1100 Accounts Receivable
  --   (any other)   → 1000 Cash (safe default)
  -- -------------------------------------------------------------------------
  v_debit_account := CASE
    WHEN p_payment_type = 'cash'          THEN '1000'
    WHEN p_payment_type = 'bank_transfer' THEN '1001'
    WHEN p_payment_type = 'cheque'        THEN '1001'
    WHEN p_payment_type = 'credit'        THEN '1100'
    ELSE '1000'
  END;

  -- -------------------------------------------------------------------------
  -- 8. Build and post the journal entry
  --
  --    Revenue side:
  --      DEBIT  v_debit_account  v_total          (cash / bank / receivable)
  --      CREDIT 4000             v_subtotal        (gross medicine revenue)
  --      DEBIT  4900             p_discount_amt    (contra-revenue, only if > 0)
  --      CREDIT 4010             p_bag_charge      (service fee, only if > 0)
  --
  --    COGS side (only when v_cogs > 0):
  --      DEBIT  5000             v_cogs
  --      CREDIT 1200             v_cogs
  -- -------------------------------------------------------------------------

  -- Base lines: debit payment account + credit medicine revenue (gross)
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', v_debit_account,                              -- [CHANGE C]
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
      'amount',       v_subtotal::TEXT,                             -- [CHANGE D] full gross
      'description',  'Medicine sales: ' || v_receipt_no
    )
  );

  -- Append discount line only when p_discount_amt > 0              [CHANGE D]
  IF p_discount_amt > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '4900',
        'direction',    'debit',
        'amount',       p_discount_amt::TEXT,
        'description',  'Sales discount: ' || v_receipt_no
      )
    );
  END IF;

  -- Append service fee line only when p_bag_charge > 0
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
    'Sale ' || v_receipt_no,                                  -- description
    'sale',                                                   -- reference_type
    v_sale_id,                                                -- reference_id
    'PKR',                                                    -- currency
    1.000000,                                                 -- exchange_rate
    v_lines,                                                  -- lines
    p_cashier_id                                              -- created_by
  );

  -- -------------------------------------------------------------------------
  -- 9. Return result to caller
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


-- =============================================================================
-- SECTION 5 — Fix process_return(): payment routing for refunds
--
-- Source: supabase/migrations/020_process_return.sql
--
-- Changes (4 total):
--   A. DECLARE: add v_original_payment_type TEXT, v_cash_account TEXT
--   B. Start of Section C: SELECT original sale payment_type, compute
--      v_cash_account (1000/1001/1100 per payment method)
--   C. Replace hardcoded '1000' in both C4 cash lines with v_cash_account
--   D. v_net > 0 line: direction is always 'credit' (pays cash out OR reduces
--      receivable — both decrease the asset). Description varies by payment type.
--      v_net < 0 line: direction is always 'debit' (receives cash OR increases
--      receivable — customer owes more on an upgrade). No change needed here.
--
-- NOTE on spec direction for credit returns (v_net > 0):
--   Spec said direction: 'debit' for 1100, comment "reduce receivable".
--   This is inverted — DEBIT 1100 increases AR (customer owes MORE).
--   CREDIT 1100 decreases AR (customer owes LESS) — correct for a refund.
--   Implemented as 'credit'. Using 'debit' would also fail the balance check
--   in post_journal_entry() and raise an exception at runtime.
--
-- Balance proof (credit return, v_net > 0, with COGS):
--   Debits:  4000(v_total_refund) + 1200(v_cogs_refund)
--   Credits: 1100(v_net=v_total_refund) + 5000(v_cogs_refund)  ✓
--
-- All other logic is identical to 020.
-- =============================================================================

CREATE OR REPLACE FUNCTION process_return(
  p_original_sale_id  UUID     DEFAULT NULL,
  p_return_items      JSONB    DEFAULT NULL,
  p_exchange_items    JSONB    DEFAULT NULL,
  p_reason            TEXT     DEFAULT NULL,
  p_pack_opened       BOOLEAN  DEFAULT FALSE,
  p_requested_by      UUID     DEFAULT NULL,
  p_return_id         UUID     DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  -- Mode
  v_mode               TEXT;

  -- Return record fields (set in both modes before reversal)
  v_return_id          UUID;
  v_return_no          TEXT;
  v_original_sale_id   UUID;
  v_total_refund       NUMERIC(12,2) := 0;
  v_total_charge       NUMERIC(12,2) := 0;
  v_net                NUMERIC(12,2);
  v_original_requester UUID;

  -- Iteration
  v_item               JSONB;
  v_sale_item          RECORD;
  v_ri                 RECORD;
  v_ei                 RECORD;

  -- Policy
  v_status             TEXT;
  v_policy_flags       JSONB    := '[]'::JSONB;
  v_sale_date          DATE;
  v_window_days        INT;
  v_auto_limit         NUMERIC;
  v_opened_allowed     BOOLEAN;

  -- Double-return prevention
  v_already_returned   INTEGER;

  -- COGS
  v_cogs_refund        NUMERIC(15,4) := 0;
  v_exchange_cogs      NUMERIC(15,4) := 0;

  -- Totals for full/partial determination
  v_total_sold         INTEGER;
  v_total_returned_all INTEGER;

  -- Exchange sale
  v_has_exchange       BOOLEAN := FALSE;
  v_exchange_sale_id   UUID;
  v_exc_receipt_no     TEXT;

  -- Journal
  v_je_id              UUID;
  v_lines              JSONB;

  -- Payment routing                                                 [CHANGE A]
  v_original_payment_type TEXT;
  v_cash_account          TEXT;

BEGIN

  -- =========================================================================
  -- 0. MODE DETECTION AND BASIC GUARDS
  -- =========================================================================
  IF p_requested_by IS NULL THEN
    RAISE EXCEPTION 'process_return: p_requested_by is required';
  END IF;

  IF p_return_id IS NOT NULL THEN
    v_mode := 'approve';
  ELSE
    v_mode := 'new';
    IF p_original_sale_id IS NULL THEN
      RAISE EXCEPTION 'process_return: p_original_sale_id is required for new returns';
    END IF;
    IF p_return_items IS NULL OR jsonb_array_length(p_return_items) = 0 THEN
      RAISE EXCEPTION 'process_return: p_return_items must be non-empty for new returns';
    END IF;
  END IF;


  -- =========================================================================
  -- SECTION A: MODE A — Validate, evaluate policy, persist header + items
  -- =========================================================================
  IF v_mode = 'new' THEN

    -- A1. Fetch original sale date (also validates the sale exists)
    SELECT created_at::DATE INTO v_sale_date
    FROM sales
    WHERE id = p_original_sale_id AND is_deleted = FALSE;

    IF v_sale_date IS NULL THEN
      RAISE EXCEPTION 'Sale % not found or deleted', p_original_sale_id;
    END IF;

    -- A2. Read policy settings
    SELECT value::INT     INTO v_window_days    FROM settings WHERE key = 'return_window_days';
    SELECT value::NUMERIC INTO v_auto_limit     FROM settings WHERE key = 'return_auto_approve_limit';
    SELECT value::BOOLEAN INTO v_opened_allowed FROM settings WHERE key = 'return_opened_pack_allowed';

    -- A3. Validate each return item: controlled ban, double-return check, accumulate refund
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP

      SELECT
        si.id, si.medicine_id, si.batch_id, si.quantity, si.unit_price,
        m.schedule
      INTO v_sale_item
      FROM sale_items si
      JOIN medicines m ON m.id = si.medicine_id
      WHERE si.id = (v_item->>'sale_item_id')::UUID;

      IF v_sale_item.id IS NULL THEN
        RAISE EXCEPTION 'sale_item % not found', v_item->>'sale_item_id';
      END IF;

      -- HARDCODED controlled substance ban — not configurable via settings
      IF v_sale_item.schedule = 'controlled' THEN
        RAISE EXCEPTION
          'Controlled medicines cannot be returned (sale_item: %, medicine: %)',
          v_sale_item.id, v_sale_item.medicine_id;
      END IF;

      -- Validate quantity_returned > 0
      IF (v_item->>'quantity_returned')::INT <= 0 THEN
        RAISE EXCEPTION 'quantity_returned must be > 0 for sale_item %', v_sale_item.id;
      END IF;

      -- Double-return check: count all non-denied existing returns for this sale_item
      SELECT COALESCE(SUM(ri.quantity_returned), 0)
      INTO v_already_returned
      FROM return_items ri
      JOIN returns r ON r.id = ri.return_id
      WHERE ri.sale_item_id = v_sale_item.id
        AND r.status NOT IN ('denied');

      IF v_already_returned + (v_item->>'quantity_returned')::INT > v_sale_item.quantity THEN
        RAISE EXCEPTION
          'Cannot return % units for sale_item % — %/% already returned or pending',
          (v_item->>'quantity_returned')::INT,
          v_sale_item.id,
          v_already_returned,
          v_sale_item.quantity;
      END IF;

      -- Accumulate refund
      v_total_refund := v_total_refund
        + ((v_item->>'quantity_returned')::INT * v_sale_item.unit_price);

    END LOOP;

    -- A4. Tally exchange charge (if any exchange items provided)
    IF p_exchange_items IS NOT NULL AND jsonb_array_length(p_exchange_items) > 0 THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_exchange_items) LOOP
        IF (v_item->>'quantity')::INT <= 0 THEN
          RAISE EXCEPTION 'exchange item quantity must be > 0';
        END IF;
        v_total_charge := v_total_charge
          + ((v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC);
      END LOOP;
    END IF;

    v_net := v_total_refund - v_total_charge;

    -- A5. Policy evaluation
    IF (CURRENT_DATE - v_sale_date) > v_window_days THEN
      v_policy_flags := v_policy_flags || '["window_expired"]'::JSONB;
    END IF;

    IF p_pack_opened AND NOT v_opened_allowed THEN
      v_policy_flags := v_policy_flags || '["opened_pack"]'::JSONB;
    END IF;

    IF v_total_refund > v_auto_limit THEN
      v_policy_flags := v_policy_flags || '["exceeds_limit"]'::JSONB;
    END IF;

    v_status := CASE
      WHEN jsonb_array_length(v_policy_flags) = 0 THEN 'auto_approved'
      ELSE 'pending_approval'
    END;

    -- A6. Generate return number and insert header
    v_return_no := next_return_number();

    INSERT INTO returns (
      return_no,        original_sale_id,
      return_type,      status,           policy_flags,
      refund_amount,    charge_amount,    net_amount,
      reason,           pack_opened,      requested_by
    ) VALUES (
      v_return_no,      p_original_sale_id,
      CASE WHEN p_exchange_items IS NOT NULL
                AND jsonb_array_length(p_exchange_items) > 0
           THEN 'exchange' ELSE 'return' END,
      v_status,         v_policy_flags,
      v_total_refund,   v_total_charge,   v_net,
      p_reason,         p_pack_opened,    p_requested_by
    ) RETURNING id INTO v_return_id;

    -- A7. Insert return_items (always — approver must see what will be reversed)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP

      SELECT si.id, si.medicine_id, si.batch_id, si.unit_price
      INTO v_sale_item
      FROM sale_items si
      WHERE si.id = (v_item->>'sale_item_id')::UUID;

      INSERT INTO return_items (
        return_id,    sale_item_id,     medicine_id,
        batch_id,     quantity_returned, unit_price,    line_refund
      ) VALUES (
        v_return_id,
        v_sale_item.id,
        v_sale_item.medicine_id,
        v_sale_item.batch_id,
        (v_item->>'quantity_returned')::INT,
        v_sale_item.unit_price,
        (v_item->>'quantity_returned')::INT * v_sale_item.unit_price
      );

    END LOOP;

    -- A8. Insert exchange_items (always — approver must see the full picture)
    IF p_exchange_items IS NOT NULL AND jsonb_array_length(p_exchange_items) > 0 THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_exchange_items) LOOP
        INSERT INTO exchange_items (
          return_id,   medicine_id,
          batch_id,    quantity,
          unit_price,  line_total
        ) VALUES (
          v_return_id,
          (v_item->>'medicine_id')::UUID,
          (v_item->>'batch_id')::UUID,
          (v_item->>'quantity')::INT,
          (v_item->>'unit_price')::NUMERIC,
          (v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC
        );
      END LOOP;
    END IF;

    -- A9. If pending: STOP — no stock/ledger changes until approved
    IF v_status = 'pending_approval' THEN
      RETURN jsonb_build_object(
        'return_id',    v_return_id,
        'return_no',    v_return_no,
        'status',       v_status,
        'policy_flags', v_policy_flags,
        'refund_amount', v_total_refund,
        'net_amount',   v_net
      );
    END IF;

    -- A10. Auto-approved: set shared variables and fall through to reversal
    v_original_sale_id   := p_original_sale_id;
    v_original_requester := p_requested_by;

  END IF; -- end MODE A


  -- =========================================================================
  -- SECTION B: MODE B — Load pending return, mark approved, fall through
  -- =========================================================================
  IF v_mode = 'approve' THEN

    SELECT
      r.id, r.return_no, r.original_sale_id,
      r.refund_amount, r.charge_amount, r.net_amount,
      r.status, r.requested_by
    INTO
      v_return_id, v_return_no, v_original_sale_id,
      v_total_refund, v_total_charge, v_net,
      v_status, v_original_requester
    FROM returns r
    WHERE r.id = p_return_id AND r.is_deleted = FALSE;

    IF v_return_id IS NULL THEN
      RAISE EXCEPTION 'Return % not found', p_return_id;
    END IF;

    IF v_status != 'pending_approval' THEN
      RAISE EXCEPTION
        'Return % cannot be approved — current status is ''%'' (must be ''pending_approval'')',
        p_return_id, v_status;
    END IF;

    -- Mark approved before executing reversal
    UPDATE returns
    SET status      = 'approved',
        approved_by = p_requested_by,
        approved_at = NOW()
    WHERE id = v_return_id;

  END IF; -- end MODE B


  -- =========================================================================
  -- SECTION C: EXECUTE REVERSAL
  --
  -- Both auto_approved (Mode A) and approved (Mode B) reach here.
  -- Guaranteed at entry:
  --   v_return_id, v_return_no          — the return being completed
  --   v_original_sale_id                — original sale
  --   v_total_refund, v_total_charge    — financial totals
  --   v_net                             — refund_amount - charge_amount
  --   v_original_requester              — pharmacist who created the return
  -- =========================================================================

  -- Determine which cash/receivable account to use              [CHANGE B]
  -- v_original_sale_id is always set by this point (Mode A step A10 or Mode B SELECT).
  SELECT payment_type INTO v_original_payment_type
  FROM sales WHERE id = v_original_sale_id;

  v_cash_account := CASE
    WHEN v_original_payment_type = 'bank_transfer' THEN '1001'
    WHEN v_original_payment_type = 'cheque'        THEN '1001'
    ELSE '1000'
  END;

  -- For credit sales: no cash movement; route to Accounts Receivable instead
  IF v_original_payment_type = 'credit' THEN
    v_cash_account := '1100';
  END IF;

  -- C1. Restore stock quantities to original batches
  --     (return goes back to the EXACT batch it was sold from)
  FOR v_ri IN
    SELECT ri.batch_id, ri.quantity_returned
    FROM   return_items ri
    WHERE  ri.return_id = v_return_id
  LOOP
    UPDATE stock_batches
    SET quantity   = quantity + v_ri.quantity_returned,
        updated_at = NOW()
    WHERE id = v_ri.batch_id;
  END LOOP;

  -- C2. Calculate COGS being reversed
  --     purchase_price is fixed at GRN time — does not change when stock is restored
  SELECT COALESCE(SUM(ri.quantity_returned * COALESCE(sb.purchase_price, 0)), 0)
  INTO   v_cogs_refund
  FROM   return_items ri
  JOIN   stock_batches sb ON sb.id = ri.batch_id
  WHERE  ri.return_id = v_return_id;

  -- C3. Exchange items: create exchange sale, insert sale_items, decrement stock
  SELECT EXISTS (SELECT 1 FROM exchange_items WHERE return_id = v_return_id)
  INTO v_has_exchange;

  IF v_has_exchange THEN

    v_exc_receipt_no := 'EXC-' || v_return_no;

    -- Create the exchange sale header
    INSERT INTO sales (
      receipt_no,       cashier_id,         payment_type,
      subtotal,         discount_amount,     total_amount,
      status,           notes,               return_status
    ) VALUES (
      v_exc_receipt_no, v_original_requester, 'cash',
      v_total_charge,   0,                   v_total_charge,
      'completed',      'Exchange for ' || v_return_no, 'none'
    ) RETURNING id INTO v_exchange_sale_id;

    -- Insert sale_items and decrement stock for each exchange item
    FOR v_ei IN
      SELECT
        ei.medicine_id, ei.batch_id, ei.quantity,
        ei.unit_price,  ei.line_total,
        sb.batch_no,
        sb.quantity AS stock_qty,
        COALESCE(sb.mrp, m.mrp)                  AS mrp,
        COALESCE(sb.purchase_price, 0)::NUMERIC   AS purchase_price
      FROM  exchange_items ei
      JOIN  stock_batches  sb ON sb.id = ei.batch_id
      JOIN  medicines      m  ON m.id  = ei.medicine_id
      WHERE ei.return_id = v_return_id
    LOOP

      -- Stock sufficiency check for exchange items
      IF v_ei.stock_qty < v_ei.quantity THEN
        RAISE EXCEPTION
          'Insufficient stock for exchange batch % — have %, need %',
          v_ei.batch_id, v_ei.stock_qty, v_ei.quantity;
      END IF;

      INSERT INTO sale_items (
        sale_id,          medicine_id,     batch_id,
        batch_no,         quantity,        unit_price,
        mrp,              discount_pct,    total_price
      ) VALUES (
        v_exchange_sale_id,
        v_ei.medicine_id, v_ei.batch_id,
        v_ei.batch_no,    v_ei.quantity,   v_ei.unit_price,
        v_ei.mrp,         0,               v_ei.line_total
      );

      UPDATE stock_batches
      SET quantity   = quantity - v_ei.quantity,
          updated_at = NOW()
      WHERE id = v_ei.batch_id;

      v_exchange_cogs := v_exchange_cogs + (v_ei.quantity * v_ei.purchase_price);

    END LOOP;

    -- Link exchange sale to the return record
    UPDATE returns
    SET exchange_sale_id = v_exchange_sale_id
    WHERE id = v_return_id;

  END IF; -- end exchange section

  -- C4. Build journal entry lines
  --     (All amounts conditional on > 0 to satisfy journal_lines.amount > 0 constraint)

  IF v_total_refund <= 0 THEN
    RAISE EXCEPTION
      'process_return: v_total_refund is zero or negative (%) — cannot post journal entry',
      v_total_refund;
  END IF;

  -- Base: reverse original revenue (always present)
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', '4000',
      'direction',    'debit',
      'amount',       v_total_refund::TEXT,
      'description',  'Revenue reversal: ' || v_return_no
    )
  );

  -- Cash / receivable movement line                              [CHANGES C, D]
  --
  -- v_net > 0: customer receives a refund (or has their credit balance reduced).
  --   direction = 'credit' in all cases:
  --     cash/bank  → CREDIT 1000/1001: cash paid out (asset decreases)
  --     credit     → CREDIT 1100: receivable reduced (customer owes less)
  --
  -- v_net < 0: customer pays the upgrade difference (exchange costs more than returned).
  --   direction = 'debit' in all cases:
  --     cash/bank  → DEBIT 1000/1001: cash received (asset increases)
  --     credit     → DEBIT 1100: receivable increased (customer owes more)
  --
  -- v_net = 0: exact-value exchange — no cash/receivable line needed; entry still balances.
  IF v_net > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', v_cash_account,                             -- [CHANGE C]
        'direction',    'credit',
        'amount',       v_net::TEXT,
        'description',
          CASE WHEN v_original_payment_type = 'credit'
               THEN 'Receivable reduced: ' || v_return_no
               ELSE 'Cash refunded to customer: ' || v_return_no
          END
      )
    );
  ELSIF v_net < 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', v_cash_account,                             -- [CHANGE C]
        'direction',    'debit',
        'amount',       ABS(v_net)::TEXT,
        'description',  'Cash received (exchange upgrade): ' || v_return_no
      )
    );
  END IF;

  -- COGS reversal: returned items restore inventory at purchase cost
  IF v_cogs_refund > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '1200',
        'direction',    'debit',
        'amount',       v_cogs_refund::TEXT,
        'description',  'Inventory restored: ' || v_return_no
      ),
      jsonb_build_object(
        'account_code', '5000',
        'direction',    'credit',
        'amount',       v_cogs_refund::TEXT,
        'description',  'COGS reversed: ' || v_return_no
      )
    );
  END IF;

  -- Exchange side: new revenue + new COGS (only when exchange sale was created)
  IF v_has_exchange THEN

    IF v_total_charge > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', '4000',
          'direction',    'credit',
          'amount',       v_total_charge::TEXT,
          'description',  'Exchange revenue: ' || v_return_no
        )
      );
    END IF;

    IF v_exchange_cogs > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', '5000',
          'direction',    'debit',
          'amount',       v_exchange_cogs::TEXT,
          'description',  'Exchange COGS: ' || v_return_no
        ),
        jsonb_build_object(
          'account_code', '1200',
          'direction',    'credit',
          'amount',       v_exchange_cogs::TEXT,
          'description',  'Exchange inventory reduction: ' || v_return_no
        )
      );
    END IF;

  END IF;

  -- C5. Post the balanced journal entry
  --     post_journal_entry() is SECURITY DEFINER and will RAISE if entry
  --     does not balance — do not suppress this exception.
  v_je_id := post_journal_entry(
    CURRENT_DATE,
    'Return ' || v_return_no,
    'sale_return',
    v_return_id,
    'PKR',
    1.000000,
    v_lines,
    v_original_requester
  );

  -- C6. Mark return completed and link journal entry
  UPDATE returns
  SET status           = 'completed',
      completed_at     = NOW(),
      journal_entry_id = v_je_id
  WHERE id = v_return_id;

  -- C7. Update original sale: returned_amount and return_status (full / partial)
  --     returned_amount accumulates across multiple partial returns.
  UPDATE sales
  SET returned_amount = returned_amount + v_total_refund
  WHERE id = v_original_sale_id;

  -- Count all item units originally sold on this sale
  SELECT COALESCE(SUM(si.quantity), 0)
  INTO   v_total_sold
  FROM   sale_items si
  WHERE  si.sale_id = v_original_sale_id;

  -- Count all units returned across ALL completed returns for this sale
  -- (current return is already 'completed' from the UPDATE above)
  SELECT COALESCE(SUM(ri.quantity_returned), 0)
  INTO   v_total_returned_all
  FROM   return_items ri
  JOIN   returns r      ON r.id  = ri.return_id
  WHERE  r.original_sale_id = v_original_sale_id
    AND  r.status            = 'completed';

  UPDATE sales
  SET return_status = CASE
    WHEN v_total_returned_all >= v_total_sold THEN 'full'
    ELSE 'partial'
  END
  WHERE id = v_original_sale_id;

  -- C8. Return result to caller
  RETURN jsonb_build_object(
    'return_id',        v_return_id,
    'return_no',        v_return_no,
    'status',           'completed',
    'refund_amount',    v_total_refund,
    'charge_amount',    v_total_charge,
    'net_amount',       v_net,
    'exchange_sale_id', v_exchange_sale_id,
    'journal_entry_id', v_je_id
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION process_return(UUID,JSONB,JSONB,TEXT,BOOLEAN,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_return(UUID,JSONB,JSONB,TEXT,BOOLEAN,UUID,UUID) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 032
-- =============================================================================
