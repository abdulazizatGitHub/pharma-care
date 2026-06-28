-- =============================================================================
-- PharmaCare — Migration 031: Phase 12A Shift Management, Cash Accountability
--              & Daily Reconciliation (schema foundation only)
-- File: supabase/migrations/031_phase12_shift_management.sql
--
-- Phase 12A adds the DB foundation only. All features are opt-in and disabled
-- by default via feature flags in settings. No UI or server-action changes
-- are included in this migration. The existing Phase 11 shift open/close
-- behaviour is completely unchanged when all Phase 12 flags remain 'false'.
--
-- Changes in dependency order:
--   1. Feature flag settings (9 new keys)
--   2. shifts table     — 10 new columns
--   3. expenses table   — 2 new columns
--   4. profiles table   — 1 new column (can_perform_daily_close)
--   5. accounts         — 2 new rows (4800 Cash Overage Income, 6800 Cash Shortage)
--   6. daily_reconciliations — new table + RLS
--   7. journal_entries reference_type CHECK — add 'daily_reconciliation'
-- =============================================================================


-- ===========================================================================
-- 1. FEATURE FLAG SETTINGS
--    All default to 'false'. Superadmin enables per pharmacy via settings UI.
--    ON CONFLICT DO NOTHING: safe to re-run; existing values are not touched.
-- ===========================================================================

INSERT INTO settings (key, value) VALUES
  ('phase12_shift_policies_enabled',        'false'),
  ('phase12_cash_out_enabled',              'false'),
  ('phase12_daily_reconciliation_enabled',  'false'),
  ('phase12_mandatory_shift_close',         'false'),
  ('phase12_shift_transfer_enabled',        'false'),
  ('shift_policy_type',                     'custom'),
  ('shift_duration_hours',                  '12'),
  ('shift_start_times',                     '00:00,12:00'),
  ('cash_out_categories',                   '[{"key":"meal","label":"Staff meal / tea","limit":1000},{"key":"hospitality","label":"Hospitality (VIP)","limit":2000},{"key":"errand","label":"Errand / purchase","limit":500},{"key":"advance","label":"Advance to staff","limit":null},{"key":"utility","label":"Utility / small repair","limit":null},{"key":"other","label":"Other","limit":null}]')
ON CONFLICT (key) DO NOTHING;


-- ===========================================================================
-- 2. SHIFTS TABLE — 10 NEW COLUMNS
--
-- Shift policy columns (Part 1 — shift policy engine):
--   policy_type      : 'custom' | 'fixed' — mirrors shift_policy_type setting
--   scheduled_start  : policy-derived start time (NULL when policy disabled)
--   scheduled_end    : policy-derived end time   (NULL when policy disabled)
--
-- Reconciliation columns (Part 4 — daily reconciliation):
--   reconciled       : set TRUE by daily close workflow after shift is counted
--   reconciled_at    : timestamp when reconciliation was performed
--   reconciled_by    : who performed the reconciliation
--
-- Transfer columns (Part 1.4 — shift transfer / reassignment):
--   original_pharmacist_id : records the original opener when a shift is
--                            transferred to a replacement pharmacist
--   transferred_at         : timestamp of the transfer
--   transferred_by         : admin/superadmin who performed the transfer
--   transfer_reason        : free-text note (e.g. "Covering sick colleague")
--
-- All columns use ADD COLUMN IF NOT EXISTS — safe to re-run.
-- reconciled is NOT NULL DEFAULT FALSE (matches boolean flag convention in codebase).
-- ===========================================================================

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS policy_type            TEXT        DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS scheduled_start        TIME,
  ADD COLUMN IF NOT EXISTS scheduled_end          TIME,
  ADD COLUMN IF NOT EXISTS reconciled             BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by          UUID        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS original_pharmacist_id UUID        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transferred_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_by         UUID        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transfer_reason        TEXT;


-- ===========================================================================
-- 3. EXPENSES TABLE — 2 NEW COLUMNS
--
-- shift_id        : links a cash-out expense to the open shift it was
--                   recorded during (Part 3.5)
-- cash_out_reason : category key from cash_out_categories setting
--                   (e.g. 'meal', 'errand') — populated only for cash-out
--                   expenses; NULL for regular expense records
-- ===========================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS shift_id        UUID REFERENCES shifts(id),
  ADD COLUMN IF NOT EXISTS cash_out_reason TEXT;


-- ===========================================================================
-- 4. PROFILES TABLE — 1 NEW COLUMN
--
-- can_perform_daily_close:
--   FALSE by default for all users.
--   superadmin/admin always have access (enforced at app layer and RLS).
--   Superadmin can grant this flag to specific pharmacists to allow them
--   to perform the end-of-day cash reconciliation (senior pharmacist use case).
-- ===========================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_perform_daily_close BOOLEAN NOT NULL DEFAULT FALSE;


-- ===========================================================================
-- 5. NEW CHART OF ACCOUNTS
--
-- 4800 Cash Overage Income:
--   CREDIT side of the reconciliation journal when actual > expected.
--   account_type = 'revenue' (4xxx revenue range; 'income' is not a valid type).
--   normal_balance = 'credit' (revenue accounts are credit-normal).
--
-- 6800 Cash Shortage Expense:
--   DEBIT side of the reconciliation journal when actual < expected.
--   account_type = 'expense' (6xxx expense range).
--   normal_balance = 'debit' (expense accounts are debit-normal).
--
-- Columns provided explicitly; nullable columns (description, parent_code,
-- created_by, deleted_at, updated_at) pick up their table defaults.
-- ON CONFLICT (code) DO NOTHING: idempotent.
-- ===========================================================================

INSERT INTO accounts (
  code,   name,                    account_type, normal_balance,
  is_system, is_active, is_deleted, currency
) VALUES
  ('4800', 'Cash Overage Income',   'revenue', 'credit', true, true, false, 'PKR'),
  ('6800', 'Cash Shortage Expense', 'expense', 'debit',  true, true, false, 'PKR')
ON CONFLICT (code) DO NOTHING;


-- ===========================================================================
-- 6. DAILY_RECONCILIATIONS TABLE
--
-- One row per calendar date (UNIQUE on reconciliation_date).
-- Records the end-of-day cash count and difference vs. system-expected cash.
-- A journal entry is posted only when difference ≠ 0:
--   Overage  (actual > expected): DEBIT 1000 Cash / CREDIT 4800 Cash Overage
--   Shortage (actual < expected): DEBIT 6800 Cash Shortage / CREDIT 1000 Cash
-- journal_entry_id is NULL when difference = 0 (balanced — no posting needed).
--
-- RLS:
--   SELECT — superadmin, admin, or any profile with can_perform_daily_close=true
--   INSERT — same access rule
--   No UPDATE policy (reconciliation records are write-once)
--   No DELETE policy (financial records; soft-delete not applicable here)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE        NOT NULL UNIQUE,
  total_cash_sales    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_outs     NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash       NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cash         NUMERIC(12,2) NOT NULL,
  difference          NUMERIC(12,2) NOT NULL DEFAULT 0,
  journal_entry_id    UUID        REFERENCES journal_entries(id),
  notes               TEXT,
  performed_by        UUID        NOT NULL REFERENCES profiles(id),
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reconciliations_select"
  ON daily_reconciliations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'admin')
        AND is_active = true
        AND is_deleted = false
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND can_perform_daily_close = true
        AND is_active = true
        AND is_deleted = false
    )
  );

CREATE POLICY "daily_reconciliations_insert"
  ON daily_reconciliations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'admin')
        AND is_active = true
        AND is_deleted = false
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND can_perform_daily_close = true
        AND is_active = true
        AND is_deleted = false
    )
  );


-- ===========================================================================
-- 7. EXTEND journal_entries REFERENCE_TYPE CHECK
--
-- Adds 'daily_reconciliation' to the existing constraint.
-- Pattern: DROP IF EXISTS then ADD — same approach as migration 027.
-- All 14 existing values are preserved exactly as they appear in migration 027.
-- New value: 'daily_reconciliation' (total: 15 values).
-- ===========================================================================

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'sale', 'sale_return', 'purchase_order', 'grn',
    'supplier_payment', 'customer_payment',
    'borrowing_out', 'borrowing_in',
    'borrowing_payment', 'expense', 'expense_void',
    'manual', 'opening_balance', 'adjustment',
    'daily_reconciliation'
  ));


-- =============================================================================
-- END OF MIGRATION 031
-- =============================================================================
