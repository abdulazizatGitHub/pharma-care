-- =============================================================================
-- PharmaCare — Migration 028: Item Detail Report DB Functions (Phase 9B)
-- File: supabase/migrations/028_item_detail_report_functions.sql
--
-- New functions (4 total — no existing functions modified):
--   1. get_item_batch_detail(p_medicine_id UUID)
--      All stock batches for a medicine with supplier name joined in.
--      Includes zero-quantity batches (price history visibility).
--
--   2. get_item_sales_detail(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--      Per-transaction sale line items for a single medicine in a date range.
--      sale_reference = sales.receipt_no
--      discount_amount computed from sale_items.discount_pct (no stored column)
--      pharmacist_name from profiles.full_name via sales.cashier_id
--
--   3. get_item_supplier_history(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--      All GRN receipt lines for a medicine across all suppliers in a date range.
--      quantity_received = grn_items.quantity (column name in DB)
--      po_number nullable (direct GRNs with no PO return NULL)
--      supplier_name from goods_receipts.supplier_id (always present, NOT NULL)
--
--   4. get_item_return_history(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--      All return line items for a medicine in a date range.
--      return_number = returns.return_no (column name in DB)
--      original_sale_reference = sales.receipt_no (column name in DB)
--      refund_amount = return_items.line_refund (column name in DB)
--      batch_no joined from stock_batches via return_items.batch_id
--
-- All functions: SECURITY DEFINER, SET search_path = public,
--   REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated.
-- Follows pattern of migrations 016 and 017.
-- =============================================================================


-- ===========================================================================
-- 1. get_item_batch_detail(p_medicine_id UUID)
--
-- Returns all batches for the given medicine, including zero-quantity batches
-- so callers can display full price history. Supplier name is LEFT JOINed —
-- batches created before a supplier was linked return NULL for supplier_name.
-- Ordered by expiry_date ASC NULLS LAST (FEFO order: soonest-expiry first,
-- batches with no expiry date listed last).
-- ===========================================================================

DROP FUNCTION IF EXISTS get_item_batch_detail(UUID);

CREATE OR REPLACE FUNCTION get_item_batch_detail(
  p_medicine_id UUID
)
RETURNS TABLE (
  batch_id        UUID,
  batch_no        TEXT,
  expiry_date     DATE,
  quantity        INTEGER,
  purchase_price  NUMERIC,
  sale_price      NUMERIC,
  mrp             NUMERIC,
  supplier_id     UUID,
  supplier_name   TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sb.id             AS batch_id,
    sb.batch_no,
    sb.expiry_date,
    sb.quantity,
    sb.purchase_price,
    sb.sale_price,
    sb.mrp,
    sb.supplier_id,
    s.name            AS supplier_name,
    sb.created_at
  FROM stock_batches sb
  LEFT JOIN suppliers s
    ON  s.id         = sb.supplier_id
    AND s.is_deleted = false
  WHERE sb.medicine_id = p_medicine_id
    AND sb.is_deleted  = false
  ORDER BY sb.expiry_date ASC NULLS LAST;
$$;

REVOKE ALL    ON FUNCTION get_item_batch_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_item_batch_detail(UUID) TO authenticated;


-- ===========================================================================
-- 2. get_item_sales_detail(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--
-- Per-transaction sale line items for a single medicine in a date range.
--
-- Column mapping notes (spec vs actual DB):
--   sale_reference  = sales.receipt_no        (no sale_number column exists)
--   quantity_sold   = sale_items.quantity      (no quantity_sold column exists)
--   discount_amount = computed:                (no discount_amount on sale_items;
--                     qty x unit_price x (discount_pct / 100.0)  only discount_pct exists)
--   line_total      = sale_items.total_price   (already stored by complete_sale())
--   batch_no        = sale_items.batch_no      (stored directly; no stock_batches join needed)
--   pharmacist_name = profiles.full_name       (joined via sales.cashier_id)
--
-- Filter: status = 'completed', is_deleted = false, date within range.
-- Ordered by sale timestamp DESC (most recent first).
-- ===========================================================================

DROP FUNCTION IF EXISTS get_item_sales_detail(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_item_sales_detail(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  sale_date       DATE,
  sale_reference  TEXT,
  quantity_sold   INTEGER,
  unit_price      NUMERIC,
  discount_amount NUMERIC,
  line_total      NUMERIC,
  payment_type    TEXT,
  customer_name   TEXT,
  pharmacist_name TEXT,
  batch_no        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.created_at::DATE                                                         AS sale_date,
    s.receipt_no                                                               AS sale_reference,
    si.quantity                                                                AS quantity_sold,
    si.unit_price,
    ROUND(
      si.quantity::NUMERIC * si.unit_price * (COALESCE(si.discount_pct, 0) / 100.0)
    , 4)                                                                       AS discount_amount,
    si.total_price                                                             AS line_total,
    s.payment_type,
    c.name                                                                     AS customer_name,
    p.full_name                                                                AS pharmacist_name,
    si.batch_no
  FROM sale_items si
  JOIN sales s
    ON  s.id              = si.sale_id
    AND s.status          = 'completed'
    AND s.is_deleted      = false
    AND s.created_at::DATE BETWEEN p_date_from AND p_date_to
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN profiles  p ON p.id = s.cashier_id
  WHERE si.medicine_id = p_medicine_id
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL    ON FUNCTION get_item_sales_detail(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_item_sales_detail(UUID, DATE, DATE) TO authenticated;


-- ===========================================================================
-- 3. get_item_supplier_history(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--
-- All GRN receipt lines for a medicine across all suppliers in a date range.
--
-- Column mapping notes (spec vs actual DB):
--   quantity_received = grn_items.quantity         (no quantity_received column)
--   batch_no          = grn_items.batch_no         (stored directly on grn_items)
--   supplier_name     = via goods_receipts.supplier_id -> suppliers.name
--                       (goods_receipts.supplier_id is NOT NULL — always present)
--   po_number         = purchase_orders.po_number  (LEFT JOIN — po_id nullable;
--                       returns NULL for direct GRNs that have no linked PO)
--   line_total        = gi.quantity x gi.unit_price (computed, COALESCE guards
--                       against NULL unit_price)
--
-- Filter: goods_receipts.is_deleted = false, received_at within date range.
-- Ordered by received_at DESC (most recent receipt first).
-- ===========================================================================

DROP FUNCTION IF EXISTS get_item_supplier_history(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_item_supplier_history(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  grn_date          DATE,
  grn_number        TEXT,
  po_number         TEXT,
  supplier_name     TEXT,
  batch_no          TEXT,
  quantity_received INTEGER,
  unit_price        NUMERIC,
  line_total        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.received_at::DATE                                                        AS grn_date,
    g.grn_number,
    po.po_number,
    s.name                                                                     AS supplier_name,
    gi.batch_no,
    gi.quantity                                                                AS quantity_received,
    gi.unit_price,
    ROUND((gi.quantity * COALESCE(gi.unit_price, 0))::NUMERIC, 4)             AS line_total
  FROM grn_items gi
  JOIN goods_receipts g
    ON  g.id               = gi.grn_id
    AND g.is_deleted       = false
    AND g.received_at::DATE BETWEEN p_date_from AND p_date_to
  LEFT JOIN purchase_orders po
    ON  po.id = g.po_id
  LEFT JOIN suppliers s
    ON  s.id         = g.supplier_id
    AND s.is_deleted = false
  WHERE gi.medicine_id = p_medicine_id
  ORDER BY g.received_at DESC;
$$;

REVOKE ALL    ON FUNCTION get_item_supplier_history(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_item_supplier_history(UUID, DATE, DATE) TO authenticated;


-- ===========================================================================
-- 4. get_item_return_history(p_medicine_id UUID, p_date_from DATE, p_date_to DATE)
--
-- All return line items for a medicine in a date range.
--
-- Column mapping notes (spec vs actual DB):
--   return_number           = returns.return_no         (column is return_no)
--   original_sale_reference = sales.receipt_no          (column is receipt_no)
--   refund_amount           = return_items.line_refund  (per-item column is line_refund)
--   batch_no                = stock_batches.batch_no    (joined via return_items.batch_id;
--                             return_items has no batch_no stored directly)
--   quantity_returned       = return_items.quantity_returned  (correct as-is)
--
-- Filter: returns.is_deleted = false, returns.created_at within date range.
-- Note: returns table has no deleted_at or deleted_by columns — only is_deleted.
-- Ordered by returns.created_at DESC (most recent return first).
-- ===========================================================================

DROP FUNCTION IF EXISTS get_item_return_history(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_item_return_history(
  p_medicine_id UUID,
  p_date_from   DATE,
  p_date_to     DATE
)
RETURNS TABLE (
  return_date              DATE,
  return_number            TEXT,
  original_sale_reference  TEXT,
  quantity_returned        INTEGER,
  refund_amount            NUMERIC,
  reason                   TEXT,
  status                   TEXT,
  batch_no                 TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.created_at::DATE   AS return_date,
    r.return_no          AS return_number,
    s.receipt_no         AS original_sale_reference,
    ri.quantity_returned,
    ri.line_refund       AS refund_amount,
    r.reason,
    r.status,
    sb.batch_no
  FROM return_items ri
  JOIN returns r
    ON  r.id               = ri.return_id
    AND r.is_deleted       = false
    AND r.created_at::DATE  BETWEEN p_date_from AND p_date_to
  JOIN sales s
    ON  s.id = r.original_sale_id
  JOIN stock_batches sb
    ON  sb.id = ri.batch_id
  WHERE ri.medicine_id = p_medicine_id
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL    ON FUNCTION get_item_return_history(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_item_return_history(UUID, DATE, DATE) TO authenticated;


-- =============================================================================
-- END OF MIGRATION 028
-- =============================================================================
