-- ================================================================
-- Migration 017: Extended Report Functions
-- Phase 9D+ Enterprise Reporting Upgrade
-- ================================================================

-- ── 1. get_sales_by_hour ─────────────────────────────────────────
-- Returns all 24 hours via generate_series so chart always has
-- a full 24-bar set even when some hours have zero sales.

CREATE OR REPLACE FUNCTION get_sales_by_hour(
  p_from        DATE,
  p_to          DATE,
  p_cashier_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  hour_of_day  INTEGER,
  sale_count   BIGINT,
  revenue      NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    h.hour_of_day,
    COALESCE(COUNT(s.id),         0)::BIGINT           AS sale_count,
    COALESCE(SUM(s.total_amount), 0)::NUMERIC(15,2)    AS revenue
  FROM generate_series(0, 23) AS h(hour_of_day)
  LEFT JOIN sales s
    ON  EXTRACT(HOUR FROM s.created_at)::INTEGER = h.hour_of_day
    AND DATE(s.created_at) BETWEEN p_from AND p_to
    AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    AND s.status     = 'completed'
    AND s.is_deleted = FALSE
  GROUP BY h.hour_of_day
  ORDER BY h.hour_of_day
$$;

REVOKE EXECUTE ON FUNCTION get_sales_by_hour(DATE, DATE, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_sales_by_hour(DATE, DATE, UUID) TO   authenticated;


-- ── 2. get_sales_comparison ───────────────────────────────────────
-- Per-medicine comparison of current period vs previous period.
-- Only medicines with sales in the CURRENT period are returned.
-- prev data is LEFT JOINed so change_pct is NULL for new items.
-- Used for Top Selling trend arrows + Slow Movers table.

CREATE OR REPLACE FUNCTION get_sales_comparison(
  p_from        DATE,
  p_to          DATE,
  p_prev_from   DATE,
  p_prev_to     DATE,
  p_cashier_id  UUID DEFAULT NULL,
  p_limit       INT  DEFAULT 20
)
RETURNS TABLE (
  medicine_id      UUID,
  medicine_name    TEXT,
  medicine_code    TEXT,
  current_qty      BIGINT,
  current_revenue  NUMERIC(15,2),
  prev_qty         BIGINT,
  prev_revenue     NUMERIC(15,2),
  change_pct       NUMERIC(10,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH cur AS (
    SELECT
      si.medicine_id,
      SUM(si.quantity)::BIGINT                        AS qty,
      SUM(si.quantity * si.unit_price)::NUMERIC(15,2) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE DATE(s.created_at) BETWEEN p_from AND p_to
      AND s.status     = 'completed'
      AND s.is_deleted = FALSE
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    GROUP BY si.medicine_id
  ),
  prv AS (
    SELECT
      si.medicine_id,
      SUM(si.quantity)::BIGINT                        AS qty,
      SUM(si.quantity * si.unit_price)::NUMERIC(15,2) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE DATE(s.created_at) BETWEEN p_prev_from AND p_prev_to
      AND s.status     = 'completed'
      AND s.is_deleted = FALSE
      AND (p_cashier_id IS NULL OR s.cashier_id = p_cashier_id)
    GROUP BY si.medicine_id
  )
  SELECT
    m.id   AS medicine_id,
    m.name AS medicine_name,
    m.code AS medicine_code,
    c.qty                  AS current_qty,
    c.revenue              AS current_revenue,
    COALESCE(p.qty,     0) AS prev_qty,
    COALESCE(p.revenue, 0) AS prev_revenue,
    CASE
      WHEN COALESCE(p.qty, 0) = 0 THEN NULL
      ELSE ROUND(
        (c.qty::NUMERIC - p.qty::NUMERIC) / p.qty::NUMERIC * 100
      , 2)
    END AS change_pct
  FROM medicines m
  JOIN  cur c ON c.medicine_id = m.id
  LEFT JOIN prv p ON p.medicine_id = m.id
  WHERE m.is_deleted = FALSE
  ORDER BY c.revenue DESC
  LIMIT p_limit
$$;

REVOKE EXECUTE ON FUNCTION
  get_sales_comparison(DATE, DATE, DATE, DATE, UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION
  get_sales_comparison(DATE, DATE, DATE, DATE, UUID, INT) TO   authenticated;


-- ── 3. get_stock_by_category ──────────────────────────────────────
-- Groups live stock (non-zero batches) by medicine category.
-- p_category_id = NULL returns all categories.

CREATE OR REPLACE FUNCTION get_stock_by_category(
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  category_id    UUID,
  category_name  TEXT,
  medicine_count BIGINT,
  total_qty      BIGINT,
  total_value    NUMERIC(15,2),
  sale_value     NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    mc.id                                                          AS category_id,
    mc.name                                                        AS category_name,
    COUNT(DISTINCT m.id)::BIGINT                                   AS medicine_count,
    COALESCE(SUM(b.quantity), 0)::BIGINT                           AS total_qty,
    COALESCE(SUM(b.quantity * COALESCE(b.purchase_price, 0)), 0)
      ::NUMERIC(15,2)                                              AS total_value,
    COALESCE(SUM(b.quantity * m.mrp), 0)::NUMERIC(15,2)            AS sale_value
  FROM medicine_categories mc
  JOIN medicines m
    ON  m.category_id = mc.id
    AND m.is_deleted  = FALSE
    AND (p_category_id IS NULL OR mc.id = p_category_id)
  LEFT JOIN stock_batches b
    ON  b.medicine_id = m.id
    AND b.quantity    > 0
    AND b.is_deleted  = FALSE
  GROUP BY mc.id, mc.name
  ORDER BY total_value DESC
$$;

REVOKE EXECUTE ON FUNCTION get_stock_by_category(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_stock_by_category(UUID) TO   authenticated;


-- ── 4. get_udhaar_aging ───────────────────────────────────────────
-- Buckets customers-with-balance by age of their most recent
-- credit sale. Falls back to customer.created_at when no credit
-- sale exists (balance entered as opening balance, etc.).

CREATE OR REPLACE FUNCTION get_udhaar_aging()
RETURNS TABLE (
  bucket          TEXT,
  customer_count  BIGINT,
  total_amount    NUMERIC(15,2)
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH latest_credit AS (
    SELECT
      c.id,
      c.credit_balance,
      COALESCE(MAX(s.created_at), c.created_at) AS last_credit_at
    FROM customers c
    LEFT JOIN sales s
      ON  s.customer_id  = c.id
      AND s.payment_type = 'credit'
      AND s.status       = 'completed'
      AND s.is_deleted   = FALSE
    WHERE c.credit_balance > 0
      AND c.is_deleted     = FALSE
    GROUP BY c.id, c.credit_balance, c.created_at
  ),
  bucketed AS (
    SELECT
      credit_balance,
      CASE
        WHEN NOW() - last_credit_at <= INTERVAL '7 days'  THEN '0-7 days'
        WHEN NOW() - last_credit_at <= INTERVAL '30 days' THEN '8-30 days'
        WHEN NOW() - last_credit_at <= INTERVAL '60 days' THEN '31-60 days'
        ELSE '60+ days'
      END AS bucket,
      CASE
        WHEN NOW() - last_credit_at <= INTERVAL '7 days'  THEN 1
        WHEN NOW() - last_credit_at <= INTERVAL '30 days' THEN 2
        WHEN NOW() - last_credit_at <= INTERVAL '60 days' THEN 3
        ELSE 4
      END AS sort_order
    FROM latest_credit
  )
  SELECT
    bucket,
    COUNT(*)::BIGINT                   AS customer_count,
    SUM(credit_balance)::NUMERIC(15,2) AS total_amount
  FROM bucketed
  GROUP BY bucket, sort_order
  ORDER BY sort_order
$$;

REVOKE EXECUTE ON FUNCTION get_udhaar_aging() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_udhaar_aging() TO   authenticated;


-- ── 5. get_pharmacist_stats ───────────────────────────────────────
-- Enhanced per-pharmacist summary: adds top_medicine + best_day_of_week.
-- Replaces get_sales_by_pharmacist for the Pharmacist tab.

CREATE OR REPLACE FUNCTION get_pharmacist_stats(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  cashier_id       UUID,
  cashier_name     TEXT,
  sale_count       BIGINT,
  revenue          NUMERIC(15,2),
  avg_sale         NUMERIC(15,2),
  top_medicine     TEXT,
  best_day_of_week TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH sd AS (
    SELECT s.id, s.cashier_id, p.full_name AS cashier_name,
           s.total_amount, s.created_at
    FROM sales s
    JOIN profiles p ON p.id = s.cashier_id
    WHERE DATE(s.created_at) BETWEEN p_from AND p_to
      AND s.status     = 'completed'
      AND s.is_deleted = FALSE
  ),
  totals AS (
    SELECT cashier_id, cashier_name,
           COUNT(id)::BIGINT               AS sale_count,
           SUM(total_amount)::NUMERIC(15,2) AS revenue,
           AVG(total_amount)::NUMERIC(15,2) AS avg_sale
    FROM sd
    GROUP BY cashier_id, cashier_name
  ),
  item_agg AS (
    SELECT sd.cashier_id, si.medicine_id,
           SUM(si.quantity) AS total_qty
    FROM sd
    JOIN sale_items si ON si.sale_id = sd.id
    GROUP BY sd.cashier_id, si.medicine_id
  ),
  top_meds AS (
    SELECT DISTINCT ON (ia.cashier_id)
      ia.cashier_id,
      m.name AS top_medicine
    FROM item_agg ia
    JOIN medicines m ON m.id = ia.medicine_id
    ORDER BY ia.cashier_id, ia.total_qty DESC
  ),
  day_agg AS (
    SELECT cashier_id,
           DATE_TRUNC('day', created_at) AS sale_day,
           SUM(total_amount)             AS day_rev
    FROM sd
    GROUP BY cashier_id, DATE_TRUNC('day', created_at)
  ),
  best_days AS (
    SELECT DISTINCT ON (cashier_id)
      cashier_id,
      TRIM(TO_CHAR(sale_day, 'Day')) AS best_day_of_week
    FROM day_agg
    ORDER BY cashier_id, day_rev DESC
  )
  SELECT
    t.cashier_id, t.cashier_name,
    t.sale_count, t.revenue, t.avg_sale,
    tm.top_medicine,
    bd.best_day_of_week
  FROM totals t
  LEFT JOIN top_meds  tm ON tm.cashier_id = t.cashier_id
  LEFT JOIN best_days bd ON bd.cashier_id = t.cashier_id
  ORDER BY t.revenue DESC
$$;

REVOKE EXECUTE ON FUNCTION get_pharmacist_stats(DATE, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_pharmacist_stats(DATE, DATE) TO   authenticated;


-- ── 6. get_pharmacist_daily ───────────────────────────────────────
-- Full pharmacist × day-of-week grid for the heatmap.
-- Returns all 7 days for every active pharmacist (cross join),
-- with 0 revenue/count for days with no sales in the period.
-- day_of_week: 0=Sunday … 6=Saturday (PostgreSQL EXTRACT(DOW)).

CREATE OR REPLACE FUNCTION get_pharmacist_daily(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  cashier_id   UUID,
  cashier_name TEXT,
  day_of_week  INTEGER,
  day_name     TEXT,
  revenue      NUMERIC(15,2),
  sale_count   BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH pharmacists AS (
    SELECT id, full_name
    FROM profiles
    WHERE role       = 'pharmacist'
      AND is_active  = TRUE
      AND is_deleted = FALSE
  ),
  days AS (
    SELECT generate_series(0, 6) AS dow
  ),
  grid AS (
    SELECT p.id AS cashier_id, p.full_name, d.dow
    FROM pharmacists p CROSS JOIN days d
  ),
  actuals AS (
    SELECT
      s.cashier_id,
      EXTRACT(DOW FROM s.created_at)::INTEGER AS dow,
      SUM(s.total_amount)::NUMERIC(15,2)       AS revenue,
      COUNT(*)::BIGINT                          AS sale_count
    FROM sales s
    WHERE DATE(s.created_at) BETWEEN p_from AND p_to
      AND s.status     = 'completed'
      AND s.is_deleted = FALSE
    GROUP BY s.cashier_id, EXTRACT(DOW FROM s.created_at)::INTEGER
  )
  SELECT
    g.cashier_id,
    g.full_name                                  AS cashier_name,
    g.dow                                        AS day_of_week,
    CASE g.dow
      WHEN 0 THEN 'Sun'
      WHEN 1 THEN 'Mon'
      WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed'
      WHEN 4 THEN 'Thu'
      WHEN 5 THEN 'Fri'
      WHEN 6 THEN 'Sat'
    END                                              AS day_name,
    COALESCE(a.revenue,    0)                    AS revenue,
    COALESCE(a.sale_count, 0)                    AS sale_count
  FROM grid g
  LEFT JOIN actuals a
    ON  a.cashier_id = g.cashier_id
    AND a.dow        = g.dow
  ORDER BY g.full_name, g.dow
$$;

REVOKE EXECUTE ON FUNCTION get_pharmacist_daily(DATE, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_pharmacist_daily(DATE, DATE) TO   authenticated;
