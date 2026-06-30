-- =============================================================================
-- PharmaCare — Migration 033: Financial Statements DB Functions (Phase 14A)
-- File: supabase/migrations/033_financial_statements.sql
--
-- Changes:
--   1. ALTER customer_payments — add reference_no TEXT (parity with supplier_payments)
--   2. get_trial_balance(p_from DATE, p_to DATE)
--      All accounts with debit/credit totals and net balance for a date range.
--      Used by accountants to verify books balance before financial statements.
--   3. get_balance_sheet(p_as_of_date DATE)
--      Assets / Liabilities / Equity as of a date, plus current-period net profit
--      as a synthetic equity row (account_code = 'NET').
--   4. record_customer_payment(p_customer_id, p_amount, p_payment_method,
--      p_reference_no, p_notes, p_recorded_by) RETURNS UUID
--      Atomic RPC: inserts customer_payments row + posts journal entry +
--      decrements customers.credit_balance in one transaction (Gap 5 fix).
--
-- Balance conventions (inherit from migration 014):
--   debit-normal  (asset/cogs/expense):   net = Σ debits  − Σ credits
--   credit-normal (liability/equity/rev): net = Σ credits − Σ debits
--   Only posted entries (status = 'posted') included — excludes reversed.
--
-- Payment account routing (migration 032 rule):
--   cash          → 1000 Cash
--   bank_transfer → 1001 Bank Account
--   cheque        → 1001 Bank Account
-- =============================================================================


-- ===========================================================================
-- 1. Add reference_no to customer_payments (parity with supplier_payments)
-- ===========================================================================

ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS reference_no TEXT;


-- ===========================================================================
-- 2. get_trial_balance(p_from DATE, p_to DATE)
--
--    Returns one row per active account. Accounts with no journal activity in
--    the date range appear with total_debits = 0, total_credits = 0,
--    net_balance = 0, has_activity = false.
--
--    net_balance sign convention:
--      debit-normal accounts:  net_balance = total_debits  − total_credits
--      credit-normal accounts: net_balance = total_credits − total_debits
--    A positive net_balance always means the account has a balance in its
--    normal direction (e.g. positive Cash = cash on hand; positive AP = we owe).
--
--    Verifying books balance: SUM(total_debits) should equal SUM(total_credits)
--    across all accounts for any valid date range.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_trial_balance(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  account_code   TEXT,
  account_name   TEXT,
  account_type   TEXT,
  normal_balance TEXT,
  total_debits   NUMERIC(15,4),
  total_credits  NUMERIC(15,4),
  net_balance    NUMERIC(15,4),
  has_activity   BOOLEAN
) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  WITH activity AS (
    -- Aggregate debit and credit totals per account for posted entries in range
    SELECT
      jl.account_id,
      SUM(CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END) AS total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.status     = 'posted'
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
$$;

REVOKE ALL    ON FUNCTION get_trial_balance(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_trial_balance(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 3. get_balance_sheet(p_as_of_date DATE)
--
--    Returns a balance sheet as of p_as_of_date using all-time balances
--    (journal entries from the beginning of time up to and including the date).
--
--    Sections returned:
--      'asset'     — accounts 1xxx with non-zero balance
--      'liability' — accounts 2xxx with non-zero balance
--      'equity'    — accounts 3xxx with non-zero balance
--      'equity'    — synthetic NET row (account_code = 'NET',
--                    display_order = 999, always present even if zero)
--
--    NET row calculation:
--      period_start = DATE_TRUNC('year', p_as_of_date) — start of fiscal year
--      revenue = net balance of credit-normal revenue accounts (4xxx) for period
--      cogs    = net balance of all cogs accounts (5xxx) for period
--      expense = net balance of all expense accounts (6xxx) for period
--      net_profit = revenue − cogs − expense
--      (account 4900 Sales Discount is debit-normal and is excluded from revenue
--       per spec — this is a known simplification for MVP)
--
--    display_order is ROW_NUMBER() ordered by account_code within each section,
--    so the natural code order (1000, 1001, 1100 …) maps to 1, 2, 3 …
--    The NET row always gets display_order = 999 (last in equity).
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_balance_sheet(p_as_of_date DATE)
RETURNS TABLE (
  section       TEXT,
  account_code  TEXT,
  account_name  TEXT,
  account_type  TEXT,
  balance       NUMERIC(15,4),
  display_order INTEGER
) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  WITH
  -- Step 1: All-time balance per account up to p_as_of_date
  historical_activity AS (
    SELECT
      jl.account_id,
      SUM(CASE WHEN jl.direction = 'debit'  THEN jl.amount_pkr ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount_pkr ELSE 0 END) AS total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.status     = 'posted'
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
    WHERE je.status     = 'posted'
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
$$;

REVOKE ALL    ON FUNCTION get_balance_sheet(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_balance_sheet(DATE) TO authenticated;


-- ===========================================================================
-- 4. record_customer_payment(...)
--
--    Atomic alternative to the two-step server-action pattern used before
--    Phase 14A. Performs all five operations in a single transaction:
--      1. Validate customer (exists + not soft-deleted)
--      2. Route payment to correct account (1000 cash | 1001 bank/cheque)
--      3. INSERT customer_payments (without journal_entry_id)
--      4. CALL post_journal_entry(): DEBIT payment account / CREDIT 1100 AR
--      5. UPDATE customer_payments.journal_entry_id
--      6. UPDATE customers.credit_balance -= p_amount
--    Any failure rolls back the entire transaction automatically.
--
--    Returns the new customer_payments.id (UUID) so the server action can
--    log the audit trail after the RPC returns successfully.
-- ===========================================================================

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
  v_payment_id    UUID;
  v_journal_id    UUID;
  v_debit_account TEXT;
  v_lines         JSONB;
BEGIN
  -- 1. Validate customer exists and is not deleted
  IF NOT EXISTS (
    SELECT 1 FROM customers
    WHERE id = p_customer_id AND is_deleted = FALSE
  ) THEN
    RAISE EXCEPTION 'Customer not found or has been deleted (id: %)', p_customer_id;
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


-- =============================================================================
-- END OF MIGRATION 033
-- =============================================================================
