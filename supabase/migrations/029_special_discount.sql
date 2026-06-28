-- Migration 029 — Special Discount Permission System (Phase 5B-2, Session A)
--
-- Adds the database foundation for a tier-based special discount feature:
--
-- profiles.special_discount_max_tier
--   Per-pharmacist grant. NULL = no permission. A numeric value (e.g. 10.00)
--   means the pharmacist may apply up to that tier at checkout. Superadmin
--   sets this per-user in User Management.
--
-- sales.special_discount_applied
--   Boolean flag set true when a pharmacist applies a special discount at
--   checkout. Enables quick filtering in reports.
--
-- sales.special_discount_type
--   Snapshot of the discount type at time of sale ('percentage' or 'fixed').
--   Stored separately so reports remain accurate if the setting changes later.
--
-- sales.special_discount_value
--   The tier value chosen (e.g. 10 for 10%, or 50 for Rs 50 fixed).
--
-- settings rows
--   special_discount_enabled — master on/off switch (default: false)
--   special_discount_type    — 'percentage' or 'fixed' (default: percentage)
--   special_discount_tiers   — comma-separated tier list (default: 5,10,15)

-- 1. New column on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS special_discount_max_tier
    NUMERIC(10,2) DEFAULT NULL;

-- 2. New columns on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS special_discount_applied
    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_discount_type
    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS special_discount_value
    NUMERIC(10,2) DEFAULT NULL;

-- 3. New settings rows
INSERT INTO settings (key, value) VALUES
  ('special_discount_enabled', 'false'),
  ('special_discount_type',    'percentage'),
  ('special_discount_tiers',   '5,10,15')
ON CONFLICT (key) DO NOTHING;
