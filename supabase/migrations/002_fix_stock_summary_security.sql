-- =============================================================================
-- PharmaCare — Fix stock_summary security
-- File: supabase/migrations/002_fix_stock_summary_security.sql
--
-- Problem: the stock_summary VIEW had no RLS protection (shown as UNRESTRICTED
-- in Supabase). Views bypass RLS on their underlying tables by default, so any
-- authenticated role (including cashier, procurement) could query it directly.
--
-- Fix: drop the view and replace with a SECURITY DEFINER function.
-- SECURITY DEFINER functions run as the function owner (postgres), not the
-- calling user, so the function body controls all access. We then revoke
-- public EXECUTE and grant only to the `authenticated` role.
-- =============================================================================

-- Drop the unprotected view from migration 001.
DROP VIEW IF EXISTS stock_summary;

-- Replacement: security-definer function. Only authenticated users with an
-- explicit EXECUTE grant can call it; the function body controls what data
-- is returned regardless of the caller's role.
CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS TABLE (
  medicine_id   UUID,
  medicine_name TEXT,
  total_quantity BIGINT,
  nearest_expiry DATE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(sb.quantity), 0) AS total_quantity,
    MIN(sb.expiry_date)           AS nearest_expiry
  FROM medicines m
  LEFT JOIN stock_batches sb
    ON  sb.medicine_id = m.id
    AND sb.is_deleted  = FALSE
    AND sb.expiry_date > NOW()
    AND sb.quantity    > 0
  WHERE m.is_deleted = FALSE
  GROUP BY m.id, m.name;
$$;

-- Lock down execution: remove the default PUBLIC grant, then grant only to
-- the `authenticated` role that Supabase assigns to logged-in users.
REVOKE ALL  ON FUNCTION get_stock_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stock_summary() TO authenticated;
