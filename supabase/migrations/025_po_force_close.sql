-- ─── 025_po_force_close.sql ──────────────────────────────────────────────────
--
-- Adds 'closed_short' status, three new columns on purchase_orders,
-- and the force_close_po() SECURITY DEFINER RPC.
--
-- Schema pre-conditions (verified from migrations 001–024):
--   ✓ is_deleted BOOLEAN DEFAULT FALSE NOT NULL  — EXISTS from 001, NOT re-added
--   ✓ deleted_at TIMESTAMPTZ                     — EXISTS from 001, IF NOT EXISTS skips
--   ✓ deleted_by UUID FK profiles                — EXISTS from 001, IF NOT EXISTS skips
--   ✓ status CHECK from 024 includes: draft, pending_approval, confirmed,
--     partially_received, received, cancelled
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. Extend status CHECK to include 'closed_short'
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'confirmed',
    'partially_received', 'received',
    'cancelled', 'closed_short'
  ));


-- 2. New columns (genuinely new)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS shortage_notes  TEXT,
  ADD COLUMN IF NOT EXISTS closed_short_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_short_by UUID REFERENCES profiles(id);

-- These two already exist from migration 001 — IF NOT EXISTS silently skips them:
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);


-- 3. force_close_po() RPC
--    Atomically transitions a partially_received PO to closed_short.
--    SECURITY DEFINER bypasses RLS for the row lock + update.
--    Caller must be authenticated; app layer enforces superadmin-only.
CREATE OR REPLACE FUNCTION force_close_po(
  p_po_id     UUID,
  p_closed_by UUID,
  p_notes     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- Lock the row before reading to prevent race with concurrent GRN recording
  SELECT status INTO v_current_status
  FROM purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found', p_po_id;
  END IF;

  IF v_current_status <> 'partially_received' THEN
    RAISE EXCEPTION
      'Only partially_received POs can be force closed. Current status: %',
      v_current_status;
  END IF;

  UPDATE purchase_orders
  SET
    status          = 'closed_short',
    shortage_notes  = p_notes,
    closed_short_at = NOW(),
    closed_short_by = p_closed_by,
    updated_at      = NOW()
  WHERE id = p_po_id;
END;
$$;

REVOKE ALL    ON FUNCTION force_close_po(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION force_close_po(UUID, UUID, TEXT) TO authenticated;
