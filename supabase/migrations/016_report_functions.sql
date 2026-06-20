-- =============================================================================
-- PharmaCare — Migration 016: Report & Analytics Functions (Phase 9A)
-- File: supabase/migrations/016_report_functions.sql
-- Spec: PHARMACARE_PHASE_9_REPORTS.md §4
--
-- All functions are:
--   STABLE        — read-only, no side effects
--   SECURITY DEFINER — bypasses RLS so they can serve all three roles
--                      without each role having direct SELECT grants on
--                      the underlying tables.
--   Restricted    — REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated
--
-- Functions created (11 total):
--   1.  get_sales_summary(p_from, p_to, p_cashier_id?)
--   2.  get_sales_by_day(p_from, p_to, p_cashier_id?)
--   3.  get_sales_by_pharmacist(p_from, p_to)
--   4.  get_item_sales(p_from, p_to, p_limit?)
--   5.  get_stock_valuation()
--   6.  get_pl_statement(p_from, p_to)
--   7.  get_cash_flow(p_from, p_to)
--   8.  get_supplier_analysis(p_from, p_to)
--   9.  get_expiry_report(p_days_ahead?)
--   10. get_dead_stock(p_days_inactive?)
--   11. get_monthly_balances(p_year)   ← extra function, not in spec
--
-- COGS source: journal_lines on account 5000 (debit), linked via
--   journal_entries.reference_type = 'sale'.  This is the authoritative
--   posted COGS figure — identical to what complete_sale() computed from
--   sale_items × stock_batches.purchase_price at the time of the sale.
--
-- Monetary precision: all outputs are NUMERIC(15,2) — two decimal places
--   formatted as PKR on the client.  Internal accumulation uses NUMERIC(15,4)
--   to avoid rounding errors before the final ROUND.
--
-- NULL purchase_price batches: COALESCE(purchase_price, 0) throughout —
--   they contribute zero to COGS and stock valuation, consistent with the
--   rule in PHARMACARE_PHASE_9_REPORTS.md §9.
-- =============================================================================


-- ===========================================================================
-- 1. get_sales_summary(p_from DATE, p_to DATE, p_cashier_id UUID DEFAULT NULL)
--
-- Returns a single aggregate row for the period.
-- Uses two queries:
--   a) Sales table   → count, revenue, discount, payment split
--   b) journal_lines → COGS (account 5000, reference_type='sale', posted)
-- If p_cashier_id is supplied the second query filters via EXISTS on
-- journal_entries.reference_id → sales.cashier_id.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_sales_summary(
  p_from        DATE,
  p_to          DATE,
  p_cashier_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  total_sales    BIGINT,
  total_revenue  NUMERIC(15,2),
  total_discount NUMERIC(15,2),
  total_cogs     NUMERIC(15,2),
  gross_profit   NUMERIC(15,2),
  cash_sales     BIGINT,
  credit_sales   BIGINT,
  avg_sale_value NUMERIC(15,2)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_count    BIGINT;
  v_revenue  NUMERIC(15,4);
  v_discount NUMERIC(15,4);
  v_cash     BIGINT;
  v_credit   BIGINT;
  v_cogs     NUMERIC(15,4);
BEGIN
  -- ── a) Aggregate from sales ───────────────────────────────────────────────
  SELECT
    COUNT(*),
    COALESCE(SUM(s.total_amount),    0),
    COALESCE(SUM(s.discount_amount), 0),
    COUNT(*) FILTER (WHERE s.payment_type = 'cash'),
    COUNT(*) FILTER (WHERE s.payment_type = 'credit')
  INTO v_count, v_revenue, v_discount, v_cash, v_credit
  FROM sales s
  WHERE s.status     = 'completed'
    AND s.is_deleted  = FALSE
    AND s.created_at::DATE BETWEEN p_from AND p_to
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id);

  -- ── b) COGS from posted journal lines on account 5000 ────────────────────
  SELECT COALESCE(SUM(jl.amount_pkr), 0)
  INTO v_cogs
  FROM journal_lines  jl
  JOIN accounts       a  ON a.id  = jl.account_id AND a.code = '5000'
  JOIN journal_entries je ON je.id = jl.entry_id
    AND je.reference_type = 'sale'
    AND je.entry_date BETWEEN p_from AND p_to
    AND je.status     = 'posted'
  WHERE jl.direction = 'debit'
    AND (
      p_cashier_id IS NULL
      OR EXISTS (
        SELECT 1 FROM sales s2
        WHERE s2.id         = je.reference_id
          AND s2.cashier_id = p_cashier_id
      )
    );

  RETURN QUERY SELECT
    v_count,
    ROUND(v_revenue,              2),
    ROUND(v_discount,             2),
    ROUND(v_cogs,                 2),
    ROUND(v_revenue - v_cogs,     2),
    v_cash,
    v_credit,
    CASE WHEN v_count > 0
      THEN ROUND(v_revenue / v_count, 2)
      ELSE 0::NUMERIC
    END;
END;
$$;

REVOKE ALL    ON FUNCTION get_sales_summary(DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_sales_summary(DATE, DATE, UUID) TO authenticated;


-- ===========================================================================
-- 2. get_sales_by_day(p_from DATE, p_to DATE, p_cashier_id UUID DEFAULT NULL)
--
-- One row per day that has at least one completed sale.
-- Used for Revenue Trend line charts.
-- Days with no sales are omitted — client fills gaps as needed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_sales_by_day(
  p_from       DATE,
  p_to         DATE,
  p_cashier_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sale_date  DATE,
  sale_count BIGINT,
  revenue    NUMERIC(15,2),
  discount   NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    s.created_at::DATE                                   AS sale_date,
    COUNT(*)                                             AS sale_count,
    ROUND(COALESCE(SUM(s.total_amount),    0)::NUMERIC, 2) AS revenue,
    ROUND(COALESCE(SUM(s.discount_amount), 0)::NUMERIC, 2) AS discount
  FROM sales s
  WHERE s.status    = 'completed'
    AND s.is_deleted = FALSE
    AND s.created_at::DATE BETWEEN p_from AND p_to
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
  GROUP BY s.created_at::DATE
  ORDER BY s.created_at::DATE;
$$;

REVOKE ALL    ON FUNCTION get_sales_by_day(DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_sales_by_day(DATE, DATE, UUID) TO authenticated;


-- ===========================================================================
-- 3. get_sales_by_pharmacist(p_from DATE, p_to DATE)
--
-- Returns one row per pharmacist (role = 'pharmacist', is_active = TRUE).
-- Pharmacists with zero sales in the period are included with count = 0.
-- Access restricted to superadmin/admin by the server action layer.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_sales_by_pharmacist(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  cashier_id   UUID,
  cashier_name TEXT,
  sale_count   BIGINT,
  revenue      NUMERIC(15,2),
  avg_sale     NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id                                                           AS cashier_id,
    p.full_name                                                    AS cashier_name,
    COUNT(s.id)                                                    AS sale_count,
    ROUND(COALESCE(SUM(s.total_amount), 0)::NUMERIC,             2) AS revenue,
    ROUND(
      CASE WHEN COUNT(s.id) > 0
        THEN SUM(s.total_amount) / COUNT(s.id)
        ELSE 0
      END::NUMERIC, 2)                                             AS avg_sale
  FROM profiles p
  LEFT JOIN sales s
    ON  s.cashier_id    = p.id
    AND s.status        = 'completed'
    AND s.is_deleted    = FALSE
    AND s.created_at::DATE BETWEEN p_from AND p_to
  WHERE p.role       = 'pharmacist'
    AND p.is_deleted  = FALSE
    AND p.is_active   = TRUE
  GROUP BY p.id, p.full_name
  ORDER BY revenue DESC;
$$;

REVOKE ALL    ON FUNCTION get_sales_by_pharmacist(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_sales_by_pharmacist(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 4. get_item_sales(p_from DATE, p_to DATE, p_limit INT DEFAULT 20)
--
-- Top-N medicines by quantity sold in the period.
-- Used for "Best Sellers" table and "Slow Movers" (call with high limit,
-- sort ascending on client side).
-- medicine_code is nullable — batches can predate migration 008.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_item_sales(
  p_from  DATE,
  p_to    DATE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  medicine_id   UUID,
  medicine_name TEXT,
  medicine_code TEXT,
  total_qty     BIGINT,
  total_revenue NUMERIC(15,2),
  avg_price     NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    m.id                                                         AS medicine_id,
    m.name                                                       AS medicine_name,
    m.code                                                       AS medicine_code,
    SUM(si.quantity)::BIGINT                                     AS total_qty,
    ROUND(SUM(si.total_price)::NUMERIC, 2)                      AS total_revenue,
    ROUND(
      CASE WHEN SUM(si.quantity) > 0
        THEN SUM(si.total_price) / SUM(si.quantity)
        ELSE 0
      END::NUMERIC, 2)                                           AS avg_price
  FROM sale_items si
  JOIN medicines m ON m.id = si.medicine_id AND m.is_deleted = FALSE
  JOIN sales s      ON s.id = si.sale_id
    AND s.status    = 'completed'
    AND s.is_deleted = FALSE
    AND s.created_at::DATE BETWEEN p_from AND p_to
  GROUP BY m.id, m.name, m.code
  ORDER BY total_qty DESC
  LIMIT p_limit;
$$;

REVOKE ALL    ON FUNCTION get_item_sales(DATE, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_item_sales(DATE, DATE, INT) TO authenticated;


-- ===========================================================================
-- 5. get_stock_valuation()
--
-- Current on-hand inventory value — no date range (snapshot of now).
-- Only non-deleted, non-expired, non-zero batches are counted.
-- avg_cost  = weighted average purchase price across live batches.
-- total_value = total_qty × avg_cost  (cost basis)
-- sale_value  = total_qty × best available sale price:
--               batch.sale_price → batch.mrp → medicine.mrp → 0
-- Only medicines with at least 1 unit in stock are returned.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_stock_valuation()
RETURNS TABLE (
  medicine_id   UUID,
  medicine_name TEXT,
  medicine_code TEXT,
  total_qty     BIGINT,
  avg_cost      NUMERIC(15,4),
  total_value   NUMERIC(15,2),
  sale_value    NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    m.id                                                                    AS medicine_id,
    m.name                                                                  AS medicine_name,
    m.code                                                                  AS medicine_code,
    SUM(sb.quantity)::BIGINT                                                AS total_qty,
    ROUND(
      SUM(sb.quantity * COALESCE(sb.purchase_price, 0)) /
      NULLIF(SUM(sb.quantity), 0)
    , 4)                                                                    AS avg_cost,
    ROUND(SUM(sb.quantity * COALESCE(sb.purchase_price,              0))::NUMERIC, 2) AS total_value,
    ROUND(SUM(sb.quantity * COALESCE(sb.sale_price, sb.mrp, m.mrp,   0))::NUMERIC, 2) AS sale_value
  FROM medicines m
  JOIN stock_batches sb ON sb.medicine_id = m.id
    AND sb.is_deleted   = FALSE
    AND sb.quantity     > 0
    AND sb.expiry_date  > CURRENT_DATE
  WHERE m.is_deleted = FALSE
    AND m.is_active  = TRUE
  GROUP BY m.id, m.name, m.code
  ORDER BY total_value DESC;
$$;

REVOKE ALL    ON FUNCTION get_stock_valuation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stock_valuation() TO authenticated;


-- ===========================================================================
-- 6. get_pl_statement(p_from DATE, p_to DATE)
--
-- Profit & Loss: journal lines on revenue (4xxx), cogs (5xxx), and
-- expense (6xxx) accounts for the period, grouped by account.
-- Amount sign convention:
--   Revenue  (normal_balance='credit'): positive = net credits (income)
--   COGS     (normal_balance='debit') : positive = net debits  (cost)
--   Expense  (normal_balance='debit') : positive = net debits  (cost)
-- Accounts with a net zero balance are excluded.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_pl_statement(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_amount NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    a.code         AS account_code,
    a.name         AS account_name,
    a.account_type,
    ROUND(
      SUM(
        CASE
          WHEN jl.direction = a.normal_balance THEN  jl.amount_pkr
          ELSE                                       -jl.amount_pkr
        END
      )::NUMERIC, 2) AS total_amount
  FROM journal_lines  jl
  JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status     = 'posted'
    AND je.entry_date BETWEEN p_from AND p_to
  JOIN accounts a ON a.id = jl.account_id
    AND a.account_type IN ('revenue', 'cogs', 'expense')
  GROUP BY a.code, a.name, a.account_type, a.normal_balance
  HAVING SUM(
    CASE
      WHEN jl.direction = a.normal_balance THEN  jl.amount_pkr
      ELSE                                       -jl.amount_pkr
    END
  ) <> 0
  ORDER BY
    CASE a.account_type
      WHEN 'revenue'  THEN 1
      WHEN 'cogs'     THEN 2
      WHEN 'expense'  THEN 3
    END,
    a.code;
$$;

REVOKE ALL    ON FUNCTION get_pl_statement(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pl_statement(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 7. get_cash_flow(p_from DATE, p_to DATE)
--
-- Daily cash movements via journal lines on account 1000 (Cash).
-- Account 1000 is an asset (normal_balance = 'debit'):
--   DEBIT  1000 = cash received (cash_in)
--   CREDIT 1000 = cash paid out (cash_out)
-- net_flow = cash_in - cash_out (positive = net cash received that day).
-- Days with no cash journal entries are omitted.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_cash_flow(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  flow_date DATE,
  cash_in   NUMERIC(15,2),
  cash_out  NUMERIC(15,2),
  net_flow  NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    je.entry_date AS flow_date,
    ROUND(
      COALESCE(SUM(jl.amount_pkr) FILTER (WHERE jl.direction = 'debit'),  0)::NUMERIC, 2
    ) AS cash_in,
    ROUND(
      COALESCE(SUM(jl.amount_pkr) FILTER (WHERE jl.direction = 'credit'), 0)::NUMERIC, 2
    ) AS cash_out,
    ROUND(
      (
        COALESCE(SUM(jl.amount_pkr) FILTER (WHERE jl.direction = 'debit'),  0) -
        COALESCE(SUM(jl.amount_pkr) FILTER (WHERE jl.direction = 'credit'), 0)
      )::NUMERIC, 2
    ) AS net_flow
  FROM journal_lines  jl
  JOIN accounts       a  ON a.id  = jl.account_id AND a.code = '1000'
  JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status     = 'posted'
    AND je.entry_date BETWEEN p_from AND p_to
  GROUP BY je.entry_date
  ORDER BY je.entry_date;
$$;

REVOKE ALL    ON FUNCTION get_cash_flow(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_cash_flow(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 8. get_supplier_analysis(p_from DATE, p_to DATE)
--
-- Period-scoped: total_orders and total_purchased filter by goods_receipts
-- received in the period; total_paid filters supplier_payments in the period.
-- outstanding: ALL-TIME net AP balance for this supplier from journal_lines
-- on account 2000 with party_type='supplier' — gives current liability,
-- not limited to the selected period.
-- Only suppliers with any period activity OR a non-zero outstanding balance
-- are returned.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_supplier_analysis(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  supplier_id     UUID,
  supplier_name   TEXT,
  total_orders    BIGINT,
  total_purchased NUMERIC(15,2),
  total_paid      NUMERIC(15,2),
  outstanding     NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH grn_period AS (
    -- GRNs received in the selected period
    SELECT
      gr.supplier_id,
      COUNT(*)             AS order_count,
      SUM(gr.total_amount) AS purchased
    FROM goods_receipts gr
    WHERE gr.is_deleted         = FALSE
      AND gr.received_at::DATE BETWEEN p_from AND p_to
    GROUP BY gr.supplier_id
  ),
  paid_period AS (
    -- Supplier payments made in the selected period
    SELECT
      sp.supplier_id,
      SUM(sp.amount) AS paid
    FROM supplier_payments sp
    WHERE sp.payment_date BETWEEN p_from AND p_to
    GROUP BY sp.supplier_id
  ),
  ap_balance AS (
    -- All-time net AP balance per supplier (account 2000, party_type='supplier')
    -- Credit to 2000 = liability increases (we owe more)
    -- Debit  to 2000 = liability decreases (we paid)
    SELECT
      jl.party_id AS supplier_id,
      SUM(
        CASE
          WHEN jl.direction = 'credit' THEN  jl.amount_pkr
          WHEN jl.direction = 'debit'  THEN -jl.amount_pkr
        END
      ) AS balance
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id AND a.code = '2000'
    WHERE jl.party_type = 'supplier'
      AND jl.party_id IS NOT NULL
    GROUP BY jl.party_id
  )
  SELECT
    s.id                                                             AS supplier_id,
    s.name                                                           AS supplier_name,
    COALESCE(g.order_count, 0)                                       AS total_orders,
    ROUND(COALESCE(g.purchased, 0)::NUMERIC, 2)                     AS total_purchased,
    ROUND(COALESCE(p.paid,      0)::NUMERIC, 2)                     AS total_paid,
    ROUND(COALESCE(ab.balance,  0)::NUMERIC, 2)                     AS outstanding
  FROM suppliers s
  LEFT JOIN grn_period  g  ON g.supplier_id  = s.id
  LEFT JOIN paid_period p  ON p.supplier_id  = s.id
  LEFT JOIN ap_balance  ab ON ab.supplier_id = s.id
  WHERE s.is_deleted = FALSE
    AND (
      g.supplier_id  IS NOT NULL
      OR p.supplier_id  IS NOT NULL
      OR (ab.balance IS NOT NULL AND ab.balance <> 0)
    )
  ORDER BY COALESCE(g.purchased, 0) DESC;
$$;

REVOKE ALL    ON FUNCTION get_supplier_analysis(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_supplier_analysis(DATE, DATE) TO authenticated;


-- ===========================================================================
-- 9. get_expiry_report(p_days_ahead INT DEFAULT 90)
--
-- Non-deleted, non-zero batches expiring within the next N days.
-- Includes today's date (expiry_date >= CURRENT_DATE) so pharmacists can
-- see batches that expire today.
-- value = quantity × COALESCE(purchase_price, 0).
-- Ordered by expiry_date ASC (soonest-to-expire first).
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_expiry_report(
  p_days_ahead INT DEFAULT 90
)
RETURNS TABLE (
  medicine_id    UUID,
  medicine_name  TEXT,
  batch_no       TEXT,
  expiry_date    DATE,
  days_to_expiry INT,
  quantity       INTEGER,
  value          NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    m.id                                                                   AS medicine_id,
    m.name                                                                 AS medicine_name,
    sb.batch_no,
    sb.expiry_date,
    (sb.expiry_date - CURRENT_DATE)::INT                                   AS days_to_expiry,
    sb.quantity,
    ROUND((sb.quantity * COALESCE(sb.purchase_price, 0))::NUMERIC, 2)     AS value
  FROM stock_batches sb
  JOIN medicines m ON m.id = sb.medicine_id AND m.is_deleted = FALSE
  WHERE sb.is_deleted  = FALSE
    AND sb.quantity     > 0
    AND sb.expiry_date >= CURRENT_DATE
    AND sb.expiry_date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
  ORDER BY sb.expiry_date ASC;
$$;

REVOKE ALL    ON FUNCTION get_expiry_report(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_expiry_report(INT) TO authenticated;


-- ===========================================================================
-- 10. get_dead_stock(p_days_inactive INT DEFAULT 60)
--
-- Medicines with in-stock inventory but no completed sale for N+ days.
-- last_sale_date: most recent completed sale date (NULL = never sold).
-- days_inactive : CURRENT_DATE − last_sale_date (or medicine.created_at
--                 when never sold) — so a medicine added 90 days ago and
--                 never sold shows 90 days inactive.
-- current_qty   : total non-expired units currently in stock.
-- stock_value   : total_qty × avg purchase_price.
-- Only medicines with current stock > 0 are returned.
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_dead_stock(
  p_days_inactive INT DEFAULT 60
)
RETURNS TABLE (
  medicine_id    UUID,
  medicine_name  TEXT,
  last_sale_date DATE,
  days_inactive  INT,
  current_qty    INTEGER,
  stock_value    NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH last_sales AS (
    SELECT
      si.medicine_id,
      MAX(s.created_at::DATE) AS last_sale
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
      AND s.status    = 'completed'
      AND s.is_deleted = FALSE
    GROUP BY si.medicine_id
  ),
  stock_totals AS (
    SELECT
      sb.medicine_id,
      SUM(sb.quantity)::INTEGER                                              AS total_qty,
      ROUND(SUM(sb.quantity * COALESCE(sb.purchase_price, 0))::NUMERIC, 2)  AS total_value
    FROM stock_batches sb
    WHERE sb.is_deleted  = FALSE
      AND sb.quantity     > 0
      AND sb.expiry_date  > CURRENT_DATE
    GROUP BY sb.medicine_id
    HAVING SUM(sb.quantity) > 0
  )
  SELECT
    m.id                                                                          AS medicine_id,
    m.name                                                                        AS medicine_name,
    ls.last_sale                                                                  AS last_sale_date,
    (CURRENT_DATE - COALESCE(ls.last_sale, m.created_at::DATE))::INT             AS days_inactive,
    st.total_qty                                                                  AS current_qty,
    st.total_value                                                                AS stock_value
  FROM medicines m
  JOIN stock_totals st ON st.medicine_id = m.id
  LEFT JOIN last_sales ls ON ls.medicine_id = m.id
  WHERE m.is_deleted = FALSE
    AND (CURRENT_DATE - COALESCE(ls.last_sale, m.created_at::DATE))::INT >= p_days_inactive
  ORDER BY days_inactive DESC;
$$;

REVOKE ALL    ON FUNCTION get_dead_stock(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_dead_stock(INT) TO authenticated;


-- ===========================================================================
-- 11. get_monthly_balances(p_year INTEGER)
--
-- Returns one row per calendar month (1–12) for the given year.
-- Useful for yearly overview bar/line charts.
-- Months with no activity return zeros (generate_series ensures all 12 rows).
--
-- revenue      : net credits on revenue accounts (4xxx)
-- cogs         : net debits on cogs accounts (5xxx)
-- gross_profit : revenue − cogs
-- expenses     : net debits on expense accounts (6xxx)
-- net_profit   : gross_profit − expenses
--
-- month_name   : 'January' … 'December' (trimmed, no trailing spaces)
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_monthly_balances(
  p_year INTEGER
)
RETURNS TABLE (
  month_num    INTEGER,
  month_name   TEXT,
  revenue      NUMERIC(15,2),
  cogs         NUMERIC(15,2),
  gross_profit NUMERIC(15,2),
  expenses     NUMERIC(15,2),
  net_profit   NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH month_series AS (
    SELECT generate_series(1, 12) AS m
  ),
  rev_cogs AS (
    -- Revenue and COGS by month from journal_lines
    SELECT
      EXTRACT(MONTH FROM je.entry_date)::INTEGER AS mnum,
      SUM(CASE
        WHEN a.account_type = 'revenue' AND jl.direction = 'credit' THEN  jl.amount_pkr
        WHEN a.account_type = 'revenue' AND jl.direction = 'debit'  THEN -jl.amount_pkr
        ELSE 0
      END)  AS revenue,
      SUM(CASE
        WHEN a.account_type = 'cogs' AND jl.direction = 'debit'   THEN  jl.amount_pkr
        WHEN a.account_type = 'cogs' AND jl.direction = 'credit'  THEN -jl.amount_pkr
        ELSE 0
      END)  AS cogs
    FROM journal_lines  jl
    JOIN journal_entries je ON je.id = jl.entry_id
      AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.entry_date) = p_year
    JOIN accounts a ON a.id = jl.account_id
      AND a.account_type IN ('revenue', 'cogs')
    GROUP BY EXTRACT(MONTH FROM je.entry_date)::INTEGER
  ),
  exp_totals AS (
    -- Expenses by month
    SELECT
      EXTRACT(MONTH FROM je.entry_date)::INTEGER AS mnum,
      SUM(CASE
        WHEN jl.direction = 'debit'  THEN  jl.amount_pkr
        WHEN jl.direction = 'credit' THEN -jl.amount_pkr
        ELSE 0
      END)  AS expenses
    FROM journal_lines  jl
    JOIN journal_entries je ON je.id = jl.entry_id
      AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.entry_date) = p_year
    JOIN accounts a ON a.id = jl.account_id
      AND a.account_type = 'expense'
    GROUP BY EXTRACT(MONTH FROM je.entry_date)::INTEGER
  )
  SELECT
    ms.m                                                                       AS month_num,
    TRIM(TO_CHAR(TO_DATE(ms.m::TEXT, 'MM'), 'Month'))                          AS month_name,
    ROUND(COALESCE(rc.revenue,   0)::NUMERIC, 2)                               AS revenue,
    ROUND(COALESCE(rc.cogs,      0)::NUMERIC, 2)                               AS cogs,
    ROUND((COALESCE(rc.revenue, 0) - COALESCE(rc.cogs, 0))::NUMERIC, 2)       AS gross_profit,
    ROUND(COALESCE(et.expenses,  0)::NUMERIC, 2)                               AS expenses,
    ROUND(
      (COALESCE(rc.revenue, 0) - COALESCE(rc.cogs, 0) - COALESCE(et.expenses, 0))::NUMERIC, 2
    )                                                                           AS net_profit
  FROM month_series ms
  LEFT JOIN rev_cogs   rc ON rc.mnum = ms.m
  LEFT JOIN exp_totals et ON et.mnum = ms.m
  ORDER BY ms.m;
$$;

REVOKE ALL    ON FUNCTION get_monthly_balances(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_balances(INTEGER) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 016
-- =============================================================================
