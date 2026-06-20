-- =============================================================================
-- PharmaCare — Migration 014: Ledger read helper functions (Phase 7C)
-- File: supabase/migrations/014_ledger_read_functions.sql
--
-- These functions are called by the server actions in app/actions/ledger.ts
-- via supabase.rpc(). They enforce the "Never calculate balances in JavaScript"
-- rule by performing all SUM/window operations inside Postgres.
--
-- All functions are SECURITY DEFINER (bypass RLS) because the server actions
-- already enforce role-based access before calling them.
--
-- Functions:
--   get_account_balances()                         — balance per active account
--   get_party_ledger(party_type, party_id, ...)    — ledger lines + running balance
--   get_cash_book(date)                            — daily cash movements + opening bal
--   get_financial_summary(date_from, date_to)      — P&L by account_type
--   mark_entry_reversed(original_id, reversal_id)  — atomic reversal link (write)
--
-- Balance conventions (documented here, enforced by SQL):
--   debit-normal  (asset/cogs/expense):   balance = Σ debits  − Σ credits
--   credit-normal (liability/equity/rev): balance = Σ credits − Σ debits
--   Reversed entries are EXCLUDED from all calculations (je.status != 'reversed').
--   All amounts use amount_pkr (PKR-denominated pre-calculated column).
--
--   get_party_ledger running_balance sign convention:
--     positive = net debit position  (customer owes us; usual for AR)
--     negative = net credit position (we owe supplier; usual for AP)
--   The UI negates and labels appropriately per party_type.
-- =============================================================================


-- ===========================================================================
-- 1. get_account_balances()
--    Returns current balance for every active, non-deleted account.
--    Balance direction follows normal_balance:
--      debit-normal:  balance = Σ(debits) − Σ(credits)
--      credit-normal: balance = Σ(credits) − Σ(debits)
--    Accounts with no journal activity return balance = 0.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_account_balances()
RETURNS TABLE (
  account_id     UUID,
  code           TEXT,
  name           TEXT,
  account_type   TEXT,
  normal_balance TEXT,
  balance        NUMERIC(15,4)
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    a.id              AS account_id,
    a.code,
    a.name,
    a.account_type,
    a.normal_balance,
    CASE WHEN a.normal_balance = 'debit'
      THEN COALESCE(SUM(
        CASE WHEN jl.direction = 'debit'  THEN  jl.amount_pkr
             WHEN jl.direction = 'credit' THEN -jl.amount_pkr
        END
      ), 0)
      ELSE COALESCE(SUM(
        CASE WHEN jl.direction = 'credit' THEN  jl.amount_pkr
             WHEN jl.direction = 'debit'  THEN -jl.amount_pkr
        END
      ), 0)
    END AS balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = jl.entry_id AND je.status != 'reversed'
    )
  WHERE a.is_active  = TRUE
    AND a.is_deleted = FALSE
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  ORDER BY a.code;
$$;

REVOKE ALL    ON FUNCTION get_account_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_account_balances() TO authenticated;


-- ===========================================================================
-- 2. get_party_ledger(p_party_type, p_party_id, p_date_from, p_date_to)
--    Returns all journal lines tagged to a specific party (supplier, customer,
--    or borrowing pharmacy), ordered chronologically, with a running balance.
--
--    running_balance = SUM(debit − credit) OVER (...) — cumulative net debit:
--      positive → party owes us   (accounts receivable context)
--      negative → we owe party    (accounts payable context)
--
--    NULL date parameters mean "no date filter on that boundary".
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_party_ledger(
  p_party_type TEXT,
  p_party_id   UUID,
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL
)
RETURNS TABLE (
  entry_id        UUID,
  entry_date      DATE,
  entry_no        TEXT,
  description     TEXT,
  account_code    TEXT,
  account_name    TEXT,
  debit_amount    NUMERIC(15,4),
  credit_amount   NUMERIC(15,4),
  running_balance NUMERIC(15,4)
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
      AND je.status     != 'reversed'
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
$$;

REVOKE ALL    ON FUNCTION get_party_ledger(TEXT, UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_party_ledger(TEXT, UUID, DATE, DATE) TO authenticated;


-- ===========================================================================
-- 3. get_cash_book(p_date)
--    Returns all Cash (account 1000) movements for a given date, ordered by
--    creation timestamp, with:
--      opening_balance — sum of all Cash movements before p_date (constant per row)
--      running_balance — opening_balance + cumulative day movements up to each row
--
--    in_amount  = debit to Cash  (cash received)
--    out_amount = credit to Cash (cash paid out)
--
--    Returns no rows when there are no Cash movements on p_date.
--    The server action reads opening_balance from result[0] or falls back to 0.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_cash_book(p_date DATE)
RETURNS TABLE (
  entry_time      TIMESTAMPTZ,
  entry_id        UUID,
  entry_no        TEXT,
  description     TEXT,
  in_amount       NUMERIC(15,4),
  out_amount      NUMERIC(15,4),
  opening_balance NUMERIC(15,4),
  running_balance NUMERIC(15,4)
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
      AND je.status    != 'reversed'
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
      AND je.status    != 'reversed'
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
$$;

REVOKE ALL    ON FUNCTION get_cash_book(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_cash_book(DATE) TO authenticated;


-- ===========================================================================
-- 4. get_financial_summary(p_date_from, p_date_to)
--    Aggregates journal lines by account_type for revenue, cogs, and expense
--    categories within the given date range. Returns one row per account_type
--    with total_amount = net balance in that type's normal direction.
--
--    The server action computes:
--      gross_profit = revenue.total_amount - cogs.total_amount
--      net_profit   = gross_profit - expense.total_amount
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_financial_summary(
  p_date_from DATE,
  p_date_to   DATE
)
RETURNS TABLE (
  account_type TEXT,
  total_amount NUMERIC(15,4)
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
  WHERE je.status     != 'reversed'
    AND je.entry_date  >= p_date_from
    AND je.entry_date  <= p_date_to
    AND a.account_type IN ('revenue', 'cogs', 'expense')
  GROUP BY a.account_type
  ORDER BY a.account_type;
$$;

REVOKE ALL    ON FUNCTION get_financial_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_financial_summary(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 5. mark_entry_reversed(p_original_id, p_reversal_id)
--    Atomically links a posted entry to its reversal entry:
--      • Sets original entry status = 'reversed', reversed_by = p_reversal_id
--      • Sets reversal entry reversal_of = p_original_id
--    Raises if the original is not found or not in 'posted' status.
--
--    Called by reverseJournalEntry() server action immediately after
--    post_journal_entry() creates the reversal entry.
-- ===========================================================================

CREATE OR REPLACE FUNCTION mark_entry_reversed(
  p_original_id UUID,
  p_reversal_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Lock and verify original entry status
  UPDATE journal_entries
  SET status      = 'reversed',
      reversed_by = p_reversal_id
  WHERE id     = p_original_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Journal entry % not found or not in posted status — cannot reverse it',
      p_original_id;
  END IF;

  -- Back-link the new reversal entry to the original
  UPDATE journal_entries
  SET reversal_of = p_original_id
  WHERE id = p_reversal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL    ON FUNCTION mark_entry_reversed(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_entry_reversed(UUID, UUID) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 014
-- =============================================================================
