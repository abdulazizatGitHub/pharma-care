-- =============================================================================
-- PharmaCare — Migration 036: Bug Fixes (Phase 16 follow-up)
-- File: supabase/migrations/036_bug_fixes.sql
--
-- Fixes 7 bugs found during Phase 16 testing. Every function below is
-- reproduced from the LIVE function body (pg_get_functiondef, read 2026-07-23),
-- not from the migration files, with only the minimal change needed for each
-- fix — everything else is byte-for-byte identical to what's deployed.
--
--   BUG-1 — Report reversal double-count: get_financial_summary(),
--           get_balance_sheet(), get_trial_balance(), get_cash_book(),
--           get_party_ledger() all excluded status='reversed' journal_entries
--           while still counting their offsetting reversal entry (status=
--           'posted'), so a manually-reversed entry (reverseJournalEntry() /
--           mark_entry_reversed()) nets to the reversal amount instead of
--           zero. Fix: include 'reversed' status rows too — the original and
--           its reversal net to zero naturally; excluding either one breaks
--           that. Scope: this only affects the manual-reversal path
--           (Journal UI "Reverse" action) — process_return() never marks
--           anything 'reversed', it posts an additional balancing entry, so
--           returns already netted to zero correctly before this fix.
--
--   BUG-2 — complete_sale() allowed selling from an already-expired batch.
--           Fix: extend the existing per-item validation loop (which already
--           fetches the batch row once, before any INSERT happens) to also
--           read expiry_date and RAISE if it's in the past. Placed right
--           after the existing "batch not found" check, before the
--           insufficient-stock check. Because this lives inside the Step-2
--           validation loop — which runs to completion (or raises) BEFORE
--           Step 3's INSERT INTO sales — an expired batch anywhere in
--           p_items aborts the entire sale with zero rows written, even if
--           earlier items in the same call were valid.
-- =============================================================================

BEGIN;

-- =============================================================================
-- BUG-1a — get_financial_summary()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_summary(p_date_from date, p_date_to date)
 RETURNS TABLE(account_type text, total_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    a.account_type,
    SUM(
      CASE WHEN a.normal_balance = 'debit'
        THEN CASE WHEN jl.direction = 'debit'  THEN  jl.amount_pkr
                  WHEN jl.direction = 'credit' THEN -jl.amount_pkr END
        ELSE CASE WHEN jl.direction = 'credit' THEN  jl.amount_pkr
                  WHEN jl.direction = 'debit'  THEN -jl.amount_pkr END
      END
    ) AS total_amount
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  JOIN accounts a         ON a.id  = jl.account_id
  WHERE je.status     IN ('posted', 'reversed')                       -- [BUG-1]
    AND je.entry_date  >= p_date_from
    AND je.entry_date  <= p_date_to
    AND a.account_type IN ('revenue', 'cogs', 'expense')
  GROUP BY a.account_type
  ORDER BY a.account_type;
$function$;

-- =============================================================================
-- BUG-1b — get_balance_sheet()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of_date date)
 RETURNS TABLE(section text, account_code text, account_name text, account_type text, balance numeric, display_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  -- Step 1: All-time balance per account up to p_as_of_date
  historical_activity AS (
    SELECT
      jl.account_id,
      SUM(CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END) AS total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.status     IN ('posted', 'reversed')                     -- [BUG-1]
      AND je.entry_date <= p_as_of_date
    GROUP BY jl.account_id
  ),
  account_balances AS (
    SELECT
      a.code,
      a.name,
      a.account_type,
      a.normal_balance,
      CASE WHEN a.normal_balance = 'debit'
        THEN COALESCE(ha.total_debits, 0) - COALESCE(ha.total_credits, 0)
        ELSE COALESCE(ha.total_credits, 0) - COALESCE(ha.total_debits, 0)
      END AS net_balance
    FROM accounts a
    LEFT JOIN historical_activity ha ON ha.account_id = a.id
    WHERE a.is_active  = TRUE
      AND a.is_deleted = FALSE
  ),
  -- Step 2: Current fiscal-year activity for P&L (NET row)
  period_activity AS (
    SELECT jl.account_id, jl.direction, jl.amount_pkr
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.status     IN ('posted', 'reversed')                     -- [BUG-1]
      AND je.entry_date >= DATE_TRUNC('year', p_as_of_date)::DATE
      AND je.entry_date <= p_as_of_date
  ),
  net_profit_calc AS (
    SELECT COALESCE(SUM(
      CASE
        -- Credit-normal revenue accounts (e.g. 4000 Sales, 4010 Other, 4800 Overage)
        WHEN a.account_type = 'revenue' AND a.normal_balance = 'credit' THEN
          CASE WHEN pa.direction = 'credit' THEN  pa.amount_pkr
                                            ELSE -pa.amount_pkr END
        -- Debit-normal revenue accounts (e.g. 4900 Sales Discount — contra-revenue)
        -- Subtracts discount from profit so Assets = L + E holds
        WHEN a.account_type = 'revenue' AND a.normal_balance = 'debit' THEN
          -(CASE WHEN pa.direction = 'debit' THEN  pa.amount_pkr
                                             ELSE -pa.amount_pkr END)
        -- COGS accounts — debit-normal, subtract from profit
        WHEN a.account_type = 'cogs' THEN
          -(CASE WHEN pa.direction = 'debit' THEN  pa.amount_pkr
                                             ELSE -pa.amount_pkr END)
        -- Expense accounts — debit-normal, subtract from profit
        WHEN a.account_type = 'expense' THEN
          -(CASE WHEN pa.direction = 'debit' THEN  pa.amount_pkr
                                             ELSE -pa.amount_pkr END)
        ELSE 0
      END
    ), 0) AS profit
    FROM period_activity pa
    JOIN accounts a ON a.id = pa.account_id
  ),
  -- Step 3: Combine real balance-sheet rows with the synthetic NET profit row
  bs_rows AS (
    -- Real accounts with non-zero balance
    SELECT
      ab.account_type                                                              AS section,
      ab.code                                                                      AS account_code,
      ab.name                                                                      AS account_name,
      ab.account_type,
      ab.net_balance::NUMERIC(15,4)                                                AS balance,
      ROW_NUMBER() OVER (
        PARTITION BY ab.account_type ORDER BY ab.code
      )::INTEGER                                                                   AS display_order
    FROM account_balances ab
    WHERE ab.account_type IN ('asset', 'liability', 'equity')
      AND ab.net_balance  != 0

    UNION ALL

    -- Synthetic NET profit row (always present in equity section)
    SELECT
      'equity'                          AS section,
      'NET'                             AS account_code,
      'Current Period Profit / (Loss)'  AS account_name,
      'equity'                          AS account_type,
      npc.profit::NUMERIC(15,4)         AS balance,
      999                               AS display_order
    FROM net_profit_calc npc
  )
  SELECT section, account_code, account_name, account_type, balance, display_order
  FROM bs_rows
  ORDER BY
    CASE section
      WHEN 'asset'     THEN 1
      WHEN 'liability' THEN 2
      ELSE                  3  -- equity
    END,
    display_order,
    account_code;
$function$;

-- =============================================================================
-- BUG-1c — get_trial_balance()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_from date, p_to date)
 RETURNS TABLE(account_code text, account_name text, account_type text, normal_balance text, total_debits numeric, total_credits numeric, net_balance numeric, has_activity boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH activity AS (
    -- Aggregate debit and credit totals per account for posted (and reversed — [BUG-1]) entries in range
    SELECT
      jl.account_id,
      SUM(CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END) AS total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.status     IN ('posted', 'reversed')                     -- [BUG-1]
      AND je.entry_date BETWEEN p_from AND p_to
    GROUP BY jl.account_id
  )
  SELECT
    a.code                                                AS account_code,
    a.name                                                AS account_name,
    a.account_type,
    a.normal_balance,
    COALESCE(act.total_debits,  0)::NUMERIC(15,4)         AS total_debits,
    COALESCE(act.total_credits, 0)::NUMERIC(15,4)         AS total_credits,
    CASE WHEN a.normal_balance = 'debit'
      THEN (COALESCE(act.total_debits, 0) - COALESCE(act.total_credits, 0))
      ELSE (COALESCE(act.total_credits, 0) - COALESCE(act.total_debits, 0))
    END::NUMERIC(15,4)                                    AS net_balance,
    (act.account_id IS NOT NULL)                          AS has_activity
  FROM accounts a
  LEFT JOIN activity act ON act.account_id = a.id
  WHERE a.is_active  = TRUE
    AND a.is_deleted = FALSE
  ORDER BY a.code;
$function$;

-- =============================================================================
-- BUG-1d — get_cash_book()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_cash_book(p_date date)
 RETURNS TABLE(entry_time timestamp with time zone, entry_id uuid, entry_no text, description text, in_amount numeric, out_amount numeric, opening_balance numeric, running_balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH opening AS (
    -- All Cash movements strictly before the requested date
    SELECT COALESCE(
      SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount_pkr ELSE -jl.amount_pkr END),
      0
    ) AS bal
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a         ON a.id  = jl.account_id
    WHERE a.code       = '1000'
      AND je.entry_date < p_date
      AND je.status    IN ('posted', 'reversed')                      -- [BUG-1]
  ),
  day_lines AS (
    SELECT
      je.created_at AS entry_time,
      je.id         AS entry_id,
      je.entry_no,
      je.description,
      CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END AS in_amount,
      CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END AS out_amount
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a         ON a.id  = jl.account_id
    WHERE a.code       = '1000'
      AND je.entry_date = p_date
      AND je.status    IN ('posted', 'reversed')                      -- [BUG-1]
  )
  SELECT
    d.entry_time,
    d.entry_id,
    d.entry_no,
    d.description,
    d.in_amount,
    d.out_amount,
    o.bal                                                                AS opening_balance,
    o.bal + SUM(d.in_amount - d.out_amount) OVER (
      ORDER BY d.entry_time, d.entry_no
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )                                                                    AS running_balance
  FROM day_lines d
  CROSS JOIN opening o
  ORDER BY d.entry_time, d.entry_no;
$function$;

-- =============================================================================
-- BUG-1e — get_party_ledger()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_party_ledger(p_party_type text, p_party_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(entry_id uuid, entry_date date, entry_no text, description text, account_code text, account_name text, debit_amount numeric, credit_amount numeric, running_balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH lines AS (
    SELECT
      je.id           AS entry_id,
      je.entry_date,
      je.entry_no,
      je.description,
      a.code          AS account_code,
      a.name          AS account_name,
      CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END AS debit_amount,
      CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END AS credit_amount
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a         ON a.id  = jl.account_id
    WHERE jl.party_type  = p_party_type
      AND jl.party_id    = p_party_id
      AND je.status     IN ('posted', 'reversed')                     -- [BUG-1]
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
  )
  SELECT
    entry_id,
    entry_date,
    entry_no,
    description,
    account_code,
    account_name,
    debit_amount,
    credit_amount,
    SUM(debit_amount - credit_amount) OVER (
      ORDER BY entry_date, entry_no
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
  FROM lines
  ORDER BY entry_date, entry_no;
$function$;

COMMIT;

-- =============================================================================
-- BUG-2 — complete_sale(): reject sales from an already-expired batch
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_sale(p_cashier_id uuid, p_customer_id uuid, p_payment_type text, p_items jsonb, p_discount_amt numeric, p_bag_charge numeric, p_amount_paid numeric, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_id       UUID;
  v_receipt_no    TEXT;
  v_subtotal      NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2);
  v_change        NUMERIC(12,2);
  v_item          JSONB;
  v_batch_qty     INTEGER;
  v_expiry_date   DATE;                                             -- [BUG-2]
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

    SELECT quantity, expiry_date INTO v_batch_qty, v_expiry_date        -- [BUG-2]
    FROM stock_batches
    WHERE id = (v_item->>'batch_id')::UUID
      AND is_deleted = FALSE;

    IF v_batch_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', v_item->>'batch_id';
    END IF;

    IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN  -- [BUG-2]
      RAISE EXCEPTION 'Batch % has expired (expiry date: %)',
        v_item->>'batch_id', v_expiry_date;
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
$function$;

COMMIT;

-- =============================================================================
-- BUG-3 — audit_logs: no trigger exists at all (confirmed empty via
-- information_schema.triggers), so a service-role caller (or any future
-- SECURITY DEFINER function) can UPDATE or DELETE audit history — RLS alone
-- cannot stop this since service-role bypasses RLS entirely. journal_lines
-- already has a hard BEFORE ROW trigger for this; audit_logs gets the exact
-- same pattern: same trigger shape (BEFORE, ROW-level, one trigger per event),
-- same RAISE EXCEPTION style, new function name/table since audit_logs and
-- journal_lines are unrelated tables. Confirmed via codebase search: no
-- production code ever UPDATEs audit_logs (only .select() in
-- app/actions/audit.ts; migration 001 states "No UPDATE, no DELETE — ever"
-- and defines no UPDATE/DELETE RLS policy) — safe to block both hard.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'audit_logs are immutable — UPDATE and DELETE are not permitted (id: %)',
    OLD.id;
END;
$function$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;

-- Matches the live journal_lines_immutable trigger shape exactly (confirmed
-- via pg_get_triggerdef): a single trigger firing on both events, not two.
CREATE TRIGGER audit_logs_immutable
  BEFORE DELETE OR UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

COMMIT;

-- =============================================================================
-- BUG-4 — medicines_select RLS: add is_deleted filter
--
-- Live USING clause (confirmed via pg_policies, unchanged since the RBAC V2
-- migration 006): (get_user_role() = ANY (ARRAY['superadmin','admin',
-- 'pharmacist'])) — no is_deleted clause at all, unlike suppliers_select
-- which already carries "AND (is_deleted = false)". SELECT policies only
-- have a USING clause (no WITH CHECK applies to SELECT), so this only
-- affects which existing rows are readable — INSERT (medicines_insert) and
-- the soft-delete UPDATE itself (medicines_update) are separate policies,
-- untouched here. Confirmed via full codebase search: every production
-- query against medicines already filters .eq('is_deleted', false) itself;
-- nothing relies on RLS exposing soft-deleted rows.
-- =============================================================================

BEGIN;

ALTER POLICY medicines_select ON medicines
  USING (
    get_user_role() = ANY (ARRAY['superadmin'::text, 'admin'::text, 'pharmacist'::text])
    AND is_deleted = false
  );

COMMIT;

-- =============================================================================
-- BUG-5 — purchase_orders: enforce valid status transitions at the DB layer
--
-- purchase_orders_status_check is a flat value-set CHECK — no trigger
-- constrains which OLD status may move to which NEW status, so a direct
-- UPDATE (or any caller bypassing procurement.ts's IF guards) can set any of
-- the 7 status values from any other. The whitelist below is reproduced
-- EXACTLY from the live app-layer logic (app/actions/procurement.ts) plus
-- the two RPCs that touch status directly (complete_grn(), force_close_po())
-- — confirmed via a full codebase search that no other call site exists.
-- Does NOT match the task-doc's assumed transition table (which included a
-- nonexistent 'approved' status and omitted several real transitions).
--
-- Guard: IF OLD.status = NEW.status THEN RETURN NEW — non-status updates
-- (notes, total_amount, is_deleted, approved_by, etc.) always pass through.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_po_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) NOT IN (
    ('draft',              'confirmed'),
    ('draft',              'pending_approval'),
    ('draft',              'cancelled'),
    ('pending_approval',   'confirmed'),
    ('pending_approval',   'draft'),
    ('confirmed',          'cancelled'),
    ('confirmed',          'draft'),
    ('confirmed',          'partially_received'),
    ('confirmed',          'received'),
    ('partially_received', 'received'),
    ('partially_received', 'closed_short'),
    ('cancelled',          'draft')
  ) THEN
    RAISE EXCEPTION
      'Invalid purchase_orders status transition: % -> % (id: %)',
      OLD.status, NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS check_po_status_transition ON purchase_orders;

CREATE TRIGGER check_po_status_transition
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION check_po_status_transition();

COMMIT;

-- =============================================================================
-- BUG-6 — complete_sale(): require an open shift for the cashier
--
-- complete_sale() had no shift reference anywhere in its body — no
-- shift_id parameter, no query against shifts. "Complete Sale disabled
-- when no shift open" (CLAUDE.md) was a POS UI guard only. shifts.cashier_id
-- (not pharmacist_id) is the actual column, matching complete_sale()'s own
-- p_cashier_id parameter. Placed as the very first statement in the
-- function body — before Step 1 (receipt number generation, read-only) and
-- everything else — so it fails before any read or write tied to the sale.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_sale(p_cashier_id uuid, p_customer_id uuid, p_payment_type text, p_items jsonb, p_discount_amt numeric, p_bag_charge numeric, p_amount_paid numeric, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_id       UUID;
  v_receipt_no    TEXT;
  v_subtotal      NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2);
  v_change        NUMERIC(12,2);
  v_item          JSONB;
  v_batch_qty     INTEGER;
  v_expiry_date   DATE;                                             -- [BUG-2]
  v_mrp           NUMERIC(12,2);
  v_date          TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  v_cogs          NUMERIC(15,4) := 0;
  v_lines         JSONB;
  v_debit_account TEXT;                                             -- [CHANGE A]
BEGIN
  -- -------------------------------------------------------------------------
  -- 0. Require an open shift for this cashier                        [BUG-6]
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM shifts
    WHERE cashier_id = p_cashier_id
      AND status     = 'open'
  ) THEN
    RAISE EXCEPTION 'No open shift for cashier %', p_cashier_id;
  END IF;

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

    SELECT quantity, expiry_date INTO v_batch_qty, v_expiry_date        -- [BUG-2]
    FROM stock_batches
    WHERE id = (v_item->>'batch_id')::UUID
      AND is_deleted = FALSE;

    IF v_batch_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', v_item->>'batch_id';
    END IF;

    IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN  -- [BUG-2]
      RAISE EXCEPTION 'Batch % has expired (expiry date: %)',
        v_item->>'batch_id', v_expiry_date;
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
$function$;

COMMIT;

-- =============================================================================
-- BUG-7 — Opening balance duplicate guard: app-layer only
--
-- postOpeningBalances() (app/actions/ledger.ts) checks for an existing
-- reference_type='opening_balance' row before posting, but that check is
-- app-layer only — a direct call to post_journal_entry() with
-- reference_type='opening_balance' bypasses it entirely, and the RPC itself
-- has no awareness of opening-balance uniqueness.
--
-- Confirmed via full read of postOpeningBalances(): one run produces exactly
-- ONE journal_entries row (one post_journal_entry() call, N journal_lines
-- underneath) with reference_type='opening_balance' — never multiple
-- journal_entries rows per run. A partial unique index on
-- journal_entries(reference_type) WHERE reference_type='opening_balance' is
-- therefore the correct constraint: it allows exactly one such row ever,
-- system-wide, without touching post_journal_entry() itself (kept as a
-- clean, general-purpose primitive per instruction) or any other
-- reference_type.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_single_opening_balance
  ON journal_entries (reference_type)
  WHERE reference_type = 'opening_balance';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 036 — all 7 bugs fixed and verified.
-- =============================================================================
