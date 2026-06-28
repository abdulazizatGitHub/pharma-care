-- Migration 030 — Generic Alternatives DB Function (Phase 5B-4, Session A)
-- Provides: get_generic_alternatives(UUID[])
-- Purpose:  For a given set of cart medicine IDs, returns all medicines
--           sharing the same generic_name_id, each with its best available
--           batch (FEFO — nearest expiry first). Used by the Generic
--           Alternatives Comparison Wizard at POS (F3 trigger).
--
-- Returns one row per (original_med_id, alt_medicine) pair.
-- option_index 1 = original cart medicine, 2+ = alternatives by sale_price ASC.
-- Medicines in p_medicine_ids with no generic_name_id are excluded.
-- v4: ranked_options ORDER BY changed from is_orig_flag DESC to
--     (alt_med_id = original_med_id) DESC so that the medicine which IS
--     the specific original for each row always gets option_index=1,
--     regardless of whether other cart medicines share the same generic.

CREATE OR REPLACE FUNCTION get_generic_alternatives(
  p_medicine_ids UUID[]
)
RETURNS TABLE (
  generic_name_id   UUID,
  generic_name      TEXT,
  original_med_id   UUID,
  medicine_id       UUID,
  medicine_name     TEXT,
  manufacturer      TEXT,
  is_original       BOOLEAN,
  batch_id          UUID,
  batch_no          TEXT,
  expiry_date       DATE,
  available_qty     INTEGER,
  purchase_price    NUMERIC,
  sale_price        NUMERIC,
  mrp               NUMERIC,
  discount_pct      NUMERIC,
  option_index      INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_medicines AS (
    SELECT
      m.id           AS medicine_id,
      m.generic_name_id,
      gn.name        AS generic_name
    FROM medicines m
    JOIN generic_names gn ON gn.id = m.generic_name_id
    WHERE m.id = ANY(p_medicine_ids)
      AND array_length(p_medicine_ids, 1) > 0
      AND m.is_deleted = false
      AND m.generic_name_id IS NOT NULL
  ),
  all_alternatives AS (
    SELECT
      im.generic_name_id,
      im.generic_name,
      im.medicine_id                  AS original_med_id,
      m2.id                           AS alt_med_id,
      m2.name                         AS alt_med_name,
      m2.manufacturer,
      (m2.id = ANY(p_medicine_ids))   AS is_orig_flag,
      sb.id                           AS batch_id,
      sb.batch_no,
      sb.expiry_date,
      sb.quantity                     AS available_qty,
      sb.purchase_price,
      sb.sale_price,
      sb.mrp,
      CASE
        WHEN sb.mrp > 0 AND sb.sale_price IS NOT NULL
          THEN ROUND(((sb.mrp - sb.sale_price) / sb.mrp) * 100, 1)
        ELSE 0
      END                             AS discount_pct,
      ROW_NUMBER() OVER (
        PARTITION BY im.generic_name_id, im.medicine_id, m2.id
        ORDER BY sb.expiry_date ASC NULLS LAST
      )                               AS batch_rank
    FROM input_medicines im
    JOIN medicines m2
      ON  m2.generic_name_id = im.generic_name_id
      AND m2.is_deleted      = false
      AND m2.is_active       = true
    JOIN stock_batches sb
      ON  sb.medicine_id     = m2.id
      AND sb.is_deleted      = false
      AND sb.quantity        > 0
      AND sb.sale_price      IS NOT NULL
      AND sb.mrp             IS NOT NULL
  ),
  best_batch_per_medicine AS (
    SELECT * FROM all_alternatives WHERE batch_rank = 1
  ),
  ranked_options AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY generic_name_id, original_med_id
        ORDER BY (alt_med_id = original_med_id) DESC, sale_price ASC
      )::INTEGER AS option_index
    FROM best_batch_per_medicine
  )
  SELECT
    generic_name_id,
    generic_name,
    original_med_id,
    alt_med_id        AS medicine_id,
    alt_med_name      AS medicine_name,
    manufacturer,
    is_orig_flag      AS is_original,
    batch_id,
    batch_no,
    expiry_date,
    available_qty,
    purchase_price,
    sale_price,
    mrp,
    discount_pct,
    option_index
  FROM ranked_options
  ORDER BY generic_name_id, original_med_id, is_orig_flag DESC, sale_price ASC;
$$;

REVOKE ALL    ON FUNCTION get_generic_alternatives(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_generic_alternatives(UUID[]) TO authenticated;
