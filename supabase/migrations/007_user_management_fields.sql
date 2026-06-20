-- ============================================
-- 007_user_management_fields.sql
-- Adds demographic and account-management fields
-- to profiles for Phase F user management.
--
-- phone: already exists since 001_initial_schema.sql
--        ADD COLUMN IF NOT EXISTS is a deliberate no-op.
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone                 TEXT,
  ADD COLUMN IF NOT EXISTS cnic                  TEXT,
  ADD COLUMN IF NOT EXISTS joined_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS username              TEXT UNIQUE;

-- Partial unique index on username (non-null values only).
-- The column-level UNIQUE above enforces the constraint at the DB level.
-- This partial index is the efficient lookup path for the username
-- uniqueness check in generateUsername() — scans only non-null rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles(username) WHERE username IS NOT NULL;

-- Partial unique index on cnic.
-- cnic has no column-level UNIQUE (it is optional), so this index
-- is the sole uniqueness enforcer for non-null CNICs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cnic
  ON profiles(cnic) WHERE cnic IS NOT NULL;
