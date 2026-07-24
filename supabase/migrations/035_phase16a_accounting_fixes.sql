-- =============================================================================
-- PharmaCare — Migration 035: Accounting Bug Fixes from Phase 16A Tests
-- File: supabase/migrations/035_phase16a_accounting_fixes.sql
--
-- Fixes 3 confirmed bugs + 2 hardening items found by tests/accounting.test.ts
-- (Phase 16A, 2026-07-08). All 5 fixes verified against the LIVE function
-- bodies (pg_get_functiondef) on 2026-07-22, not the migration files, since
-- 032/033 could in principle have drifted from what's actually deployed —
-- they had not, but every function below is reproduced from the live read.
--
--   Fix 1  — sales.payment_type CHECK: widen to allow bank_transfer/cheque
--            (complete_sale()/process_return() already route these to 1001,
--            but the constraint rejected the value before either RPC could).
--   Fix 2  — complete_grn(): AP credit line (2000) now carries
--            party_type='supplier' + party_id, so GRNs appear in the
--            Supplier Ledger (get_party_ledger() filters on these columns).
--   Fix 2B — Backfill: existing GRN journal_lines (2000 credit, party_type
--            IS NULL) get party_type/party_id filled in from
--            goods_receipts.supplier_id. Requires a temporary, transaction-
--            scoped disable of journal_lines_immutable — safe here because
--            the whole migration runs in one transaction: if anything below
--            fails, the ALTER TABLE...DISABLE TRIGGER rolls back too (DDL is
--            transactional in Postgres) and the trigger is left enabled.
--   Fix 3  — process_return(): reverses the proportional slice of the
--            original 4900 Sales Discount for the specific items being
--            returned, and refunds cash/AR net of that same slice (a return
--            was previously refunding the customer the full gross price of
--            returned items even though they never paid gross for them).
--   Fix 4  — record_customer_payment(): added an overpayment guard at the
--            RPC layer (previously only the recordCustomerPayment() server
--            action checked this — calling the RPC directly bypassed it).
--   Fix 5  — Dropped the orphaned 4-arg complete_grn() overload from
--            migration 009 (superseded by the 5-arg version in 024/032;
--            never dropped, so PostgREST could not disambiguate a call that
--            omitted p_is_partial).
--
-- Explicitly NOT touched (per scope): chart of accounts, post_journal_entry(),
-- the journal_lines_immutable trigger definition itself (only disabled/
-- re-enabled for the Fix 2B backfill), settings, feature flags, complete_sale()
-- (Fix 1 only required a constraint change — complete_sale()'s bank_transfer/
-- cheque routing already existed correctly in migration 032).
-- =============================================================================

BEGIN;

-- =============================================================================
-- Fix 1 — sales.payment_type CHECK constraint
-- =============================================================================

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_payment_type_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_payment_type_check
  CHECK (payment_type IN ('cash', 'credit', 'bank_transfer', 'cheque'));


-- =============================================================================
-- Fix 5 — Drop the orphaned 4-arg complete_grn() overload (migration 009)
-- Exact signature confirmed live via pg_get_function_arguments():
--   p_po_id uuid, p_received_by uuid, p_notes text, p_items jsonb
-- The 5-arg version (with p_is_partial) recreated in Fix 2 below is kept.
-- =============================================================================

DROP FUNCTION IF EXISTS complete_grn(UUID, UUID, TEXT, JSONB);


-- =============================================================================
-- Fix 2 — complete_grn(): AP credit line (2000) now carries party_type/party_id
--
-- v_supplier is already resolved and NOT NULL by this point in the function
-- (validated earlier: "IF v_supplier IS NULL THEN RAISE EXCEPTION..."), so it
-- is always safe to attach to the 2000 line inside the existing
-- "IF v_total > 0" guard. Only the 2000 jsonb_build_object gained two keys;
-- everything else is byte-for-byte identical to the live 032 version.
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

  -- Post journal entry: Inventory in / AP out
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
          'party_type',   'supplier',                                -- [Fix 2]
          'party_id',     v_supplier::TEXT,                          -- [Fix 2]
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
-- Fix 2B — Backfill party_type/party_id onto existing GRN AP (2000) lines
--
-- Scoped tightly: only journal_lines rows where the parent entry is
-- reference_type='grn', the account is 2000, and party_type IS NULL (i.e.
-- rows that pre-date this fix — never touches any already-correct row, and
-- never touches any other reference_type or account).
--
-- journal_lines schema (confirmed live): entry_id, account_id — NOT
-- journal_entry_id / account_code — so the join goes through accounts.code.
-- goods_receipts.supplier_id is directly on that table (no need to go via
-- purchase_orders).
-- =============================================================================

ALTER TABLE journal_lines DISABLE TRIGGER journal_lines_immutable;

UPDATE journal_lines jl
SET
  party_type = 'supplier',
  party_id   = gr.supplier_id
FROM journal_entries je
JOIN goods_receipts gr ON gr.id = je.reference_id
WHERE jl.entry_id       = je.id
  AND je.reference_type = 'grn'
  AND jl.account_id     = (SELECT id FROM accounts WHERE code = '2000')
  AND jl.party_type IS NULL;

ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable;


-- =============================================================================
-- Fix 3 — process_return(): proportional reversal of the 4900 Sales Discount
--
-- Bug: returning items from a sale that had an order-level discount_amt
-- reversed gross 4000 revenue but never touched the original 4900 debit, and
-- refunded the customer the full gross item price even though they never
-- paid gross for those units (they paid net of the discount).
--
-- Fix (added, everything else in the function is byte-for-byte identical to
-- the live version read via pg_get_functiondef):
--   - Section C now also fetches sales.discount_amount and sales.subtotal
--     alongside payment_type.
--   - v_proportional_discount = ROUND(v_total_refund * (discount_amount /
--     subtotal), 2) — the same discount ratio the original sale applied,
--     scaled to the gross value of just the returned items. Zero when the
--     original sale had no discount (or subtotal was 0, guarding div-by-zero).
--   - v_net (Section A) is UNCHANGED — it still drives returns.refund_amount /
--     returns.net_amount and the C8 return value exactly as before, since
--     those are the "sticker" values already relied upon elsewhere (e.g. the
--     partial-return test asserts refund_amount against raw item price).
--   - A new v_cash_net = v_net - v_proportional_discount drives ONLY the
--     cash/bank/AR journal line (the actual money movement) and its branch
--     direction, replacing v_net in that one spot.
--   - A conditional CREDIT 4900 = v_proportional_discount line is added.
--
-- Balance proof (works for every combination of exchange/COGS present):
--   Debits:  4000(v_total_refund) + [cash |v_cash_net| if v_cash_net<0]
--          + [1200(cogs_refund)] + [5000(exchange_cogs) if exchange]
--   Credits: 4900(proportional_discount) + [cash v_cash_net if v_cash_net>0]
--          + [4000(v_total_charge) if exchange] + [5000(cogs_refund)]
--          + [1200(exchange_cogs) if exchange]
--   Substituting v_cash_net = v_total_refund - proportional_discount - v_total_charge
--   into either branch reduces both sides to v_total_refund (+ the two
--   self-balancing COGS pairs, unaffected by this change) — verified by hand
--   for v_cash_net > 0, < 0, and = 0, with and without an exchange.
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

  -- Payment routing
  v_original_payment_type TEXT;
  v_cash_account          TEXT;

  -- Discount reversal                                               [Fix 3]
  v_original_discount_amt NUMERIC(12,2) := 0;
  v_original_subtotal     NUMERIC(12,2) := 0;
  v_proportional_discount NUMERIC(12,2) := 0;
  v_cash_net              NUMERIC(12,2);

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

  -- Determine which cash/receivable account to use, and fetch the discount
  -- context for the proportional 4900 reversal.                    [Fix 3]
  -- v_original_sale_id is always set by this point (Mode A step A10 or Mode B SELECT).
  SELECT payment_type, discount_amount, subtotal
  INTO   v_original_payment_type, v_original_discount_amt, v_original_subtotal
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

  -- Proportional reversal of the original order-level Sales Discount for
  -- just the items being returned. Zero when the sale had no discount (or
  -- subtotal was 0, guarding the division).                        [Fix 3]
  IF v_original_discount_amt > 0 AND v_original_subtotal > 0 THEN
    v_proportional_discount := ROUND(
      v_total_refund * (v_original_discount_amt / v_original_subtotal), 2
    );
  END IF;

  -- The actual cash/AR movement is net of that discount slice — the customer
  -- never paid gross for the returned items, so refunding them gross would
  -- over-refund. v_net itself (and returns.refund_amount/net_amount, already
  -- set above) is left unchanged — it continues to represent the gross
  -- sticker value of the returned items, as already relied upon elsewhere.
  v_cash_net := v_net - v_proportional_discount;

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

  -- Base: reverse original revenue (always present, gross)
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', '4000',
      'direction',    'debit',
      'amount',       v_total_refund::TEXT,
      'description',  'Revenue reversal: ' || v_return_no
    )
  );

  -- Reverse the proportional slice of the original Sales Discount    [Fix 3]
  IF v_proportional_discount > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '4900',
        'direction',    'credit',
        'amount',       v_proportional_discount::TEXT,
        'description',  'Discount reversal: ' || v_return_no
      )
    );
  END IF;

  -- Cash / receivable movement line — now driven by v_cash_net (net of the
  -- proportional discount reversal above) instead of raw v_net.       [Fix 3]
  --
  -- v_cash_net > 0: customer receives a refund (or has their credit balance reduced).
  --   direction = 'credit' in all cases:
  --     cash/bank  → CREDIT 1000/1001: cash paid out (asset decreases)
  --     credit     → CREDIT 1100: receivable reduced (customer owes less)
  --
  -- v_cash_net < 0: customer pays the upgrade difference (exchange costs more than returned).
  --   direction = 'debit' in all cases:
  --     cash/bank  → DEBIT 1000/1001: cash received (asset increases)
  --     credit     → DEBIT 1100: receivable increased (customer owes more)
  --
  -- v_cash_net = 0: no cash/receivable line needed; entry still balances.
  IF v_cash_net > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', v_cash_account,
        'direction',    'credit',
        'amount',       v_cash_net::TEXT,
        'description',
          CASE WHEN v_original_payment_type = 'credit'
               THEN 'Receivable reduced: ' || v_return_no
               ELSE 'Cash refunded to customer: ' || v_return_no
          END
      )
    );
  ELSIF v_cash_net < 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', v_cash_account,
        'direction',    'debit',
        'amount',       ABS(v_cash_net)::TEXT,
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
-- Fix 4 — record_customer_payment(): overpayment guard
--
-- Previously only an EXISTS check (customer found / not deleted) — no
-- credit_balance was fetched at all. Now selects credit_balance directly
-- (NULL if the customer doesn't exist or is deleted, preserving the exact
-- same "not found" error) and rejects p_amount > credit_balance. This
-- matches recordCustomerPayment() (app/actions/ledger.ts), which already
-- blocks overpayment before calling this RPC — the RPC itself had no
-- defense-in-depth against a direct call bypassing that server action.
-- =============================================================================

CREATE OR REPLACE FUNCTION record_customer_payment(
  p_customer_id    UUID,
  p_amount         NUMERIC,
  p_payment_method TEXT,
  p_reference_no   TEXT,
  p_notes          TEXT,
  p_recorded_by    UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_payment_id      UUID;
  v_journal_id      UUID;
  v_debit_account   TEXT;
  v_lines           JSONB;
  v_credit_balance  NUMERIC;                                          -- [Fix 4]
BEGIN
  -- 1. Validate customer exists and is not deleted, and fetch credit_balance [Fix 4]
  SELECT credit_balance INTO v_credit_balance
  FROM customers
  WHERE id = p_customer_id AND is_deleted = FALSE;

  IF v_credit_balance IS NULL THEN
    RAISE EXCEPTION 'Customer not found or has been deleted (id: %)', p_customer_id;
  END IF;

  -- 1B. Reject payments exceeding the outstanding balance                [Fix 4]
  IF p_amount > v_credit_balance THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%)',
      p_amount, v_credit_balance;
  END IF;

  -- 2. Route payment to correct account per migration 032 rule
  v_debit_account := CASE
    WHEN p_payment_method IN ('bank_transfer', 'cheque') THEN '1001'
    ELSE '1000'
  END;

  -- 3. Insert payment record (journal_entry_id linked in step 5)
  INSERT INTO customer_payments (
    customer_id,   amount,   payment_method,
    reference_no,  notes,    created_by
  ) VALUES (
    p_customer_id, p_amount, p_payment_method,
    p_reference_no, p_notes, p_recorded_by
  )
  RETURNING id INTO v_payment_id;

  -- 4. Build balanced journal lines
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', v_debit_account,
      'direction',    'debit',
      'amount',       p_amount::TEXT,
      'description',  'Cash received from customer'
    ),
    jsonb_build_object(
      'account_code', '1100',
      'direction',    'credit',
      'amount',       p_amount::TEXT,
      'party_type',   'customer',
      'party_id',     p_customer_id::TEXT,
      'description',  'Accounts Receivable settled'
    )
  );

  -- 5. Post journal entry — uses payment id as reference_id (Gap 6 pattern)
  SELECT post_journal_entry(
    CURRENT_DATE,
    'Customer payment received',
    'customer_payment',
    v_payment_id,
    'PKR',
    1.0,
    v_lines,
    p_recorded_by
  ) INTO v_journal_id;

  -- 6. Link journal entry back to payment record
  UPDATE customer_payments
  SET journal_entry_id = v_journal_id
  WHERE id = v_payment_id;

  -- 7. Decrement customer credit balance
  UPDATE customers
  SET credit_balance = credit_balance - p_amount
  WHERE id = p_customer_id;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL    ON FUNCTION record_customer_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_customer_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;


COMMIT;

-- =============================================================================
-- END OF MIGRATION 035
-- =============================================================================
