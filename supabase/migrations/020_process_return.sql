-- =============================================================================
-- PharmaCare — Migration 020
-- Phase 6B: process_return() RPC + next_return_number() helper
--
-- next_return_number() — generates RET-YYYYMMDD-XXXX (same pattern as
--   next_po_number). Not transaction-safe for concurrent inserts —
--   acceptable for single-branch pharmacy.
--
-- process_return() — atomic RPC for initiating and approving returns/exchanges.
--
-- TWO MODES (controlled by p_return_id):
--   MODE A — p_return_id IS NULL  (new return request from pharmacist)
--     1. Validate items (controlled substance ban, double-return check)
--     2. Evaluate policy flags
--     3. Insert returns header + return_items + exchange_items (always)
--     4. If pending_approval: return early — no stock/ledger changes yet
--     5. If auto_approved: fall through to reversal execution
--
--   MODE B — p_return_id IS NOT NULL  (superadmin approving a pending return)
--     1. Load the existing pending return from DB
--     2. Mark returns.status = 'approved', set approved_by/approved_at
--     3. Fall through to reversal execution
--
-- REVERSAL EXECUTION (both modes reach here):
--     C1. Restore stock to original batch for each return_item
--     C2. Calculate v_cogs_refund from return_items × purchase_price
--     C3. If exchange: create exchange sale + sale_items, decrement stock,
--         calculate v_exchange_cogs
--     C4. Build journal entry lines (see balance proof below)
--     C5. Post journal entry via post_journal_entry()
--     C6. Mark return completed, set journal_entry_id
--     C7. Update original sale's return_status (full / partial) and
--         returned_amount
--
-- JOURNAL ENTRY — account codes and balance proof:
--
--   Pure return (no exchange):
--     DEBIT  4000  v_total_refund        (reverse original revenue)
--     CREDIT 1000  v_total_refund        (= v_net; cash paid out)
--     DEBIT  1200  v_cogs_refund  [>0]   (inventory restored)
--     CREDIT 5000  v_cogs_refund  [>0]   (COGS reversed)
--     Balance: (R + C) = (R + C) ✓
--
--   Exchange — customer gets refund (v_net > 0):
--     DEBIT  4000  v_total_refund
--     CREDIT 1000  v_net                 (R - CH; net cash out)
--     DEBIT  1200  v_cogs_refund  [>0]
--     CREDIT 5000  v_cogs_refund  [>0]
--     CREDIT 4000  v_total_charge        (new items revenue)
--     DEBIT  5000  v_exchange_cogs [>0]
--     CREDIT 1200  v_exchange_cogs [>0]
--     Balance: D = R + C + XC; K = (R-CH) + C + CH + XC = R + C + XC ✓
--
--   Exchange — customer pays extra (v_net < 0):
--     DEBIT  4000  v_total_refund
--     DEBIT  1000  ABS(v_net)            (CH - R; cash received)
--     DEBIT  1200  v_cogs_refund  [>0]
--     CREDIT 5000  v_cogs_refund  [>0]
--     CREDIT 4000  v_total_charge
--     DEBIT  5000  v_exchange_cogs [>0]
--     CREDIT 1200  v_exchange_cogs [>0]
--     Balance: D = R + (CH-R) + C + XC = CH + C + XC
--              K = C + CH + XC ✓
--
--   Exact exchange (v_net = 0): no cash line; still balances ✓
--
-- COGS lines are OMITTED when v_cogs_refund / v_exchange_cogs = 0
-- (protects journal_lines.amount > 0 constraint).
--
-- SECURITY DEFINER: bypasses RLS so the function can write to all tables
-- regardless of the calling user's role. Authorization is enforced at the
-- server action layer (Phase 6C) before this function is called.
-- =============================================================================


-- =============================================================================
-- 1. next_return_number()
-- =============================================================================

CREATE OR REPLACE FUNCTION next_return_number()
RETURNS TEXT AS $$
DECLARE
  v_date TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  v_seq  INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM returns
  WHERE return_no LIKE 'RET-' || v_date || '-%';
  RETURN 'RET-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION next_return_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_return_number() TO authenticated;


-- =============================================================================
-- 2. process_return()
-- =============================================================================

CREATE OR REPLACE FUNCTION process_return(
  p_original_sale_id  UUID     DEFAULT NULL,
  p_return_items      JSONB    DEFAULT NULL,
  -- [{sale_item_id: UUID, quantity_returned: INT}]
  p_exchange_items    JSONB    DEFAULT NULL,
  -- [{medicine_id: UUID, batch_id: UUID, quantity: INT, unit_price: NUMERIC}]
  -- NULL means pure return (no exchange)
  p_reason            TEXT     DEFAULT NULL,
  p_pack_opened       BOOLEAN  DEFAULT FALSE,
  p_requested_by      UUID     DEFAULT NULL,
  -- Mode A: pharmacist UUID  |  Mode B: approver (superadmin) UUID
  p_return_id         UUID     DEFAULT NULL
  -- Mode B only: UUID of the pending return to approve
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
  v_original_requester UUID;   -- pharmacist who created the original return

  -- Iteration
  v_item               JSONB;
  v_sale_item          RECORD;
  v_ri                 RECORD;  -- return_item row (from DB)
  v_ei                 RECORD;  -- exchange_item row (from DB)

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

    -- A3. Validate each return item: controlled ban, double-return, accumulate refund
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP

      -- Fetch sale_item joined to medicine for schedule check
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
  --   v_total_refund, v_total_charge    — financial totals (validated or from DB)
  --   v_net                             — refund_amount - charge_amount
  --   v_original_requester              — pharmacist who created the return
  -- =========================================================================

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
  --     (All lines are conditional on amount > 0 to satisfy journal_lines constraint)

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

  -- Cash movement line (direction depends on sign of v_net)
  IF v_net > 0 THEN
    -- Refund paid out to customer
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '1000',
        'direction',    'credit',
        'amount',       v_net::TEXT,
        'description',  'Cash refunded to customer: ' || v_return_no
      )
    );
  ELSIF v_net < 0 THEN
    -- Exchange upgrade: customer pays the difference
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '1000',
        'direction',    'debit',
        'amount',       ABS(v_net)::TEXT,
        'description',  'Cash received (exchange upgrade): ' || v_return_no
      )
    );
    -- v_net = 0: exact-value exchange — no cash line needed; entry still balances
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
-- END OF MIGRATION 020
-- =============================================================================
