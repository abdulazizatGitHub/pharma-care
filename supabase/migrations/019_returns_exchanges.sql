-- =============================================================================
-- PharmaCare — Migration 019
-- Phase 6A: Returns & Exchanges
--   • returns table (new)
--   • return_items table (new)
--   • exchange_items table (new)
--   • sales table: return_status, returned_amount columns
--   • settings seed: 7 return/exchange policy keys
--   • RLS policies for all three new tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. returns table
-- ---------------------------------------------------------------------------

CREATE TABLE returns (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_no         TEXT NOT NULL UNIQUE,        -- RET-YYYYMMDD-XXXX
  original_sale_id  UUID NOT NULL REFERENCES sales(id),

  return_type       TEXT NOT NULL CHECK (return_type IN ('return', 'exchange')),

  -- Policy evaluation result
  status            TEXT NOT NULL DEFAULT 'pending_approval' CHECK (
                      status IN (
                        'auto_approved',
                        'pending_approval',
                        'approved',
                        'denied',
                        'completed'
                      )
                    ),
  policy_flags      JSONB,   -- e.g. ["window_expired","opened_pack","exceeds_limit"]

  -- Financial
  refund_amount     NUMERIC(12,2) DEFAULT 0,   -- cash refunded to customer
  charge_amount     NUMERIC(12,2) DEFAULT 0,   -- additional charge (exchange upgrade)
  net_amount        NUMERIC(12,2) NOT NULL,     -- refund_amount - charge_amount

  -- For exchanges: link to the new sale created
  exchange_sale_id  UUID REFERENCES sales(id),

  reason            TEXT NOT NULL,   -- why customer is returning
  pack_opened       BOOLEAN DEFAULT FALSE,  -- cashier self-declaration

  -- Approval trail
  requested_by      UUID REFERENCES profiles(id),
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  denial_reason     TEXT,

  -- Ledger reference (set after process_return() posts journal entry)
  journal_entry_id  UUID REFERENCES journal_entries(id),

  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at      TIMESTAMPTZ,
  is_deleted        BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_returns_sale   ON returns(original_sale_id);
CREATE INDEX idx_returns_status ON returns(status);

-- ---------------------------------------------------------------------------
-- 2. return_items table
-- ---------------------------------------------------------------------------

CREATE TABLE return_items (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id          UUID NOT NULL REFERENCES returns(id),

  -- Original sale item being returned
  sale_item_id       UUID NOT NULL REFERENCES sale_items(id),
  medicine_id        UUID NOT NULL REFERENCES medicines(id),
  batch_id           UUID NOT NULL REFERENCES stock_batches(id),

  quantity_returned  INTEGER NOT NULL CHECK (quantity_returned > 0),
  unit_price         NUMERIC(10,2) NOT NULL,   -- price at original sale
  line_refund        NUMERIC(12,2) NOT NULL,   -- quantity_returned × unit_price

  created_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. exchange_items table (new items given in an exchange)
-- ---------------------------------------------------------------------------

CREATE TABLE exchange_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id    UUID NOT NULL REFERENCES returns(id),

  medicine_id  UUID NOT NULL REFERENCES medicines(id),
  batch_id     UUID NOT NULL REFERENCES stock_batches(id),

  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,
  line_total   NUMERIC(12,2) NOT NULL,

  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. sales table — add return tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS return_status   TEXT DEFAULT 'none'
    CHECK (return_status IN ('none', 'partial', 'full')),
  ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(12,2) DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. Settings seed — 7 return/exchange policy keys
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value, label) VALUES
  ('return_window_days', '3',
   'Days after sale within which returns are auto-approved'),
  ('return_requires_receipt', 'true',
   'Require receipt number to process a return'),
  ('return_controlled_allowed', 'false',
   'Allow returns of controlled/Schedule B medicines (hardcoded override: always false)'),
  ('return_opened_pack_allowed', 'false',
   'Allow returns of opened packs without approval'),
  ('return_auto_approve_limit', '1000',
   'Returns above this value (PKR) always require approval'),
  ('exchange_window_days', '7',
   'Days after sale within which exchanges are allowed'),
  ('exchange_price_diff_payer', 'either',
   'Who can settle price difference in exchange: customer, pharmacy, either')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. RLS — returns
--    superadmin: full access
--    admin:      SELECT only (read-only oversight)
--    pharmacist: INSERT own requests + SELECT own requests
-- ---------------------------------------------------------------------------

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_select" ON returns FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    OR (get_user_role() = 'pharmacist' AND requested_by = auth.uid())
  );

CREATE POLICY "returns_insert" ON returns FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

-- superadmin may UPDATE for approval/denial and status transitions
CREATE POLICY "returns_update" ON returns FOR UPDATE
  USING  (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');

-- Soft-delete only (is_deleted flag) — no physical DELETE by anyone
-- (no DELETE policy means physical delete is denied for all roles)

-- ---------------------------------------------------------------------------
-- 7. RLS — return_items
--    superadmin: full access
--    admin:      SELECT only
--    pharmacist: INSERT + SELECT (scoped via their own returns)
-- ---------------------------------------------------------------------------

ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_items_select" ON return_items FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    OR (
      get_user_role() = 'pharmacist'
      AND EXISTS (
        SELECT 1 FROM returns r
        WHERE r.id = return_items.return_id
          AND r.requested_by = auth.uid()
      )
    )
  );

CREATE POLICY "return_items_insert" ON return_items FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

-- ---------------------------------------------------------------------------
-- 8. RLS — exchange_items (same pattern as return_items)
-- ---------------------------------------------------------------------------

ALTER TABLE exchange_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_items_select" ON exchange_items FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    OR (
      get_user_role() = 'pharmacist'
      AND EXISTS (
        SELECT 1 FROM returns r
        WHERE r.id = exchange_items.return_id
          AND r.requested_by = auth.uid()
      )
    )
  );

CREATE POLICY "exchange_items_insert" ON exchange_items FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));
