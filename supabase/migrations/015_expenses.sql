-- =============================================================================
-- PharmaCare — Migration 015: Expenses Module (Phase 8)
-- File: supabase/migrations/015_expenses.sql
--
-- The expenses table already exists from migration 001 with columns:
--   id, amount, category (NOT NULL, limited CHECK), description, expense_date,
--   created_at, updated_at, created_by, updated_by,
--   is_deleted, deleted_at, deleted_by
--
-- The set_expenses_updated_at trigger already exists from migration 001.
-- RLS is already enabled; existing policies use old roles (owner/superuser)
-- and must be replaced with RBAC V2 roles (superadmin/admin).
--
-- This migration:
--   1. ADD new accounting columns (account_code, payment_method,
--      reference_no, recorded_by, journal_entry_id)
--   2. CREATE indexes (IF NOT EXISTS)
--   3. SKIP trigger creation — set_expenses_updated_at already exists
--   4. DROP old RLS policies (owner/superuser) and recreate for RBAC V2
--   5. Settings seed: expense_default_account
--
-- Backwards compatibility:
--   The existing 'category' column (TEXT NOT NULL, old CHECK constraint) is
--   kept as-is. New code uses 'account_code' as the accounting reference.
--   Both columns coexist; account_code is required for new expense records
--   (enforced at app layer, not DB layer, to avoid breaking existing rows).
-- =============================================================================


-- ===========================================================================
-- 1. ADD NEW COLUMNS
--    All nullable to avoid breaking any existing rows that pre-date Phase 8.
-- ===========================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS account_code     TEXT         REFERENCES accounts(code),
  ADD COLUMN IF NOT EXISTS payment_method   TEXT         DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  ADD COLUMN IF NOT EXISTS reference_no     TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by      UUID         REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID         REFERENCES journal_entries(id);


-- ===========================================================================
-- 2. INDEXES
--    expense_date index: may already exist from 001; IF NOT EXISTS is safe.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_expenses_date    ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_code);


-- ===========================================================================
-- 3. TRIGGER — SKIP
--    set_expenses_updated_at already exists from migration 001.
--    Verified by:
--      SELECT trigger_name FROM information_schema.triggers
--      WHERE event_object_table = 'expenses';
-- ===========================================================================


-- ===========================================================================
-- 4. RLS POLICIES
--    Drop old policies (used roles: owner, superuser from migration 001).
--    Recreate with RBAC V2 roles (superadmin, admin).
--    RLS is already enabled on this table — no ALTER needed.
-- ===========================================================================

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    AND is_deleted = FALSE
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING (get_user_role() IN ('superadmin', 'admin'));

-- No DELETE policy: hard-delete is blocked at DB layer for all roles.


-- ===========================================================================
-- 5. SETTINGS SEED
-- ===========================================================================

INSERT INTO settings (key, value, label) VALUES
  ('expense_default_account', '6000', 'Default expense account code')
ON CONFLICT (key) DO NOTHING;
