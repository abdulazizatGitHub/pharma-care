-- ============================================================
-- Migration 022: Phase 7F-A — Borrowing POS Integration Schema
-- ============================================================

-- ------------------------------------------------------------
-- 2.1  borrowing_pharmacies — settlement cadence fields
-- ------------------------------------------------------------
ALTER TABLE borrowing_pharmacies
  ADD COLUMN IF NOT EXISTS settlement_cadence TEXT DEFAULT 'daily'
    CHECK (settlement_cadence IN ('daily', 'weekly', 'monthly', 'custom')),
  ADD COLUMN IF NOT EXISTS settlement_day     INT,
    -- weekly:  0=Sun … 6=Sat
    -- monthly: 1–28 (day of month)
    -- daily/custom: NULL
  ADD COLUMN IF NOT EXISTS last_settled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_notes  TEXT;


-- ------------------------------------------------------------
-- 2.2  borrowing_transactions — POS sale back-reference
-- ------------------------------------------------------------
ALTER TABLE borrowing_transactions
  ADD COLUMN IF NOT EXISTS sale_id       UUID REFERENCES sales(id),
  ADD COLUMN IF NOT EXISTS sale_item_id  UUID REFERENCES sale_items(id),
  ADD COLUMN IF NOT EXISTS is_pos_borrow BOOLEAN DEFAULT FALSE;
  -- TRUE  = auto-created during a POS checkout
  -- FALSE = manually recorded from ledger / borrowing page


-- ------------------------------------------------------------
-- 2.3  sale_items — borrowed item flags
-- ------------------------------------------------------------
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS is_borrowed   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS borrowed_from UUID REFERENCES borrowing_pharmacies(id),
  ADD COLUMN IF NOT EXISTS borrow_cost   NUMERIC(10,2);
  -- borrow_cost: amount we owe the lending pharmacy per unit


-- ------------------------------------------------------------
-- 2.4  stock_batches — borrowed batch flag
-- ------------------------------------------------------------
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS is_borrowed BOOLEAN DEFAULT FALSE;
  -- TRUE = temporary batch created during a borrow-to-fulfill POS sale
  -- Batch no starts with 'BRW-'; net stock change = 0 (created then sold)


-- ------------------------------------------------------------
-- 2.5  Settings seed
-- ------------------------------------------------------------
INSERT INTO settings (key, value, label) VALUES
  ('borrowing_default_margin_pct', '20',
   'Default markup percentage on borrowed items'),
  ('borrowing_require_approval',   'false',
   'Require superadmin approval for borrowing at POS')
ON CONFLICT (key) DO NOTHING;
