-- Migration 023: Generic Names table
-- Adds a managed generic_names lookup table and links it to medicines.

CREATE TABLE IF NOT EXISTS generic_names (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  is_active  BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE
);

ALTER TABLE generic_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generic_names_select" ON generic_names
  FOR SELECT USING (
    get_user_role() IN ('superadmin', 'admin', 'pharmacist')
    AND is_deleted = FALSE
  );

CREATE POLICY "generic_names_insert" ON generic_names
  FOR INSERT WITH CHECK (
    get_user_role() IN ('superadmin', 'admin')
  );

CREATE POLICY "generic_names_update" ON generic_names
  FOR UPDATE USING (
    get_user_role() IN ('superadmin', 'admin')
  );

ALTER TABLE medicines
  ADD COLUMN IF NOT EXISTS generic_name_id UUID
    REFERENCES generic_names(id);

-- Seed existing generic names from free-text column
INSERT INTO generic_names (name)
SELECT DISTINCT generic_name FROM medicines
WHERE generic_name IS NOT NULL
  AND generic_name != ''
ON CONFLICT (name) DO NOTHING;

-- Backfill FK on existing medicine rows
UPDATE medicines m
SET generic_name_id = g.id
FROM generic_names g
WHERE m.generic_name = g.name
  AND m.generic_name_id IS NULL;
