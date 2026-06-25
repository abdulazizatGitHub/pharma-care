-- 026: Void expense support
-- Adds voided state columns to expenses table for the void/reversal workflow.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_journal_entry_id UUID REFERENCES journal_entries(id);
