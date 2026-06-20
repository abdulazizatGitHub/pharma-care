-- =============================================================================
-- PharmaCare — Migration 008: Medicine Master + Stock Batch Columns
-- File: supabase/migrations/008_medicine_stock.sql
-- Spec: PHARMACARE_PHASE_2_3_MEDICINE_STOCK.md
--
-- Order:
--   1. medicine_categories   (table + RLS)
--   2. medicine_subcategories (table + RLS)
--   3. ALTER medicines        (new columns only — IF NOT EXISTS is a no-op for existing)
--   4. medicine_code_seq + next_medicine_code()
--   5. ALTER stock_batches    (new columns only)
--   6. Update check_sale_item_mrp() to use per-batch MRP with medicine fallback
--   7. Settings seed
--   8. Category seed
--   9. Subcategory seed
-- =============================================================================


-- ===========================================================================
-- 1. MEDICINE_CATEGORIES
-- ===========================================================================

CREATE TABLE IF NOT EXISTS medicine_categories (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID        REFERENCES profiles(id),
  is_deleted BOOLEAN     DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER set_medicine_categories_updated_at
  BEFORE UPDATE ON medicine_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE medicine_categories ENABLE ROW LEVEL SECURITY;

-- All 3 roles can read categories (needed for medicine form dropdowns)
CREATE POLICY "medicine_categories_select" ON medicine_categories FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

-- Only admin + superadmin may create or rename categories
CREATE POLICY "medicine_categories_insert" ON medicine_categories FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "medicine_categories_update" ON medicine_categories FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

-- No DELETE policy — soft-delete only


-- ===========================================================================
-- 2. MEDICINE_SUBCATEGORIES
-- ===========================================================================

CREATE TABLE IF NOT EXISTS medicine_subcategories (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID        NOT NULL REFERENCES medicine_categories(id),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  UUID        REFERENCES profiles(id),
  is_deleted  BOOLEAN     DEFAULT FALSE NOT NULL,
  deleted_at  TIMESTAMPTZ,
  UNIQUE (category_id, slug)
);

CREATE TRIGGER set_medicine_subcategories_updated_at
  BEFORE UPDATE ON medicine_subcategories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE medicine_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medicine_subcategories_select" ON medicine_subcategories FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "medicine_subcategories_insert" ON medicine_subcategories FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "medicine_subcategories_update" ON medicine_subcategories FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

-- No DELETE policy — soft-delete only


-- ===========================================================================
-- 3. ALTER MEDICINES — add new columns only
--
-- Already-existing columns (not listed — omitted entirely):
--   generic_name, manufacturer, drap_reg_no, schedule (has correct CHECK
--   constraint from 001), pack_size, unit, mrp (NOT NULL stays — medicine
--   master MRP is required), reorder_level, barcode, is_active
--
-- Genuinely new columns:
--   code, category_id, subcategory_id, instructions, precautions
-- ===========================================================================

ALTER TABLE medicines
  ADD COLUMN IF NOT EXISTS code           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS generic_name   TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer   TEXT,
  ADD COLUMN IF NOT EXISTS drap_reg_no    TEXT,
  ADD COLUMN IF NOT EXISTS category_id    UUID REFERENCES medicine_categories(id),
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES medicine_subcategories(id),
  ADD COLUMN IF NOT EXISTS pack_size      TEXT,
  ADD COLUMN IF NOT EXISTS unit           TEXT DEFAULT 'strip',
  ADD COLUMN IF NOT EXISTS instructions   TEXT,
  ADD COLUMN IF NOT EXISTS precautions    TEXT,
  ADD COLUMN IF NOT EXISTS mrp            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS reorder_level  INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS barcode        TEXT,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE;


-- ===========================================================================
-- 4. MEDICINE CODE SEQUENCE + GENERATOR FUNCTION
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS medicine_code_seq START 1;

CREATE OR REPLACE FUNCTION next_medicine_code()
RETURNS TEXT AS $$
  SELECT LPAD(nextval('medicine_code_seq')::TEXT, 3, '0')
$$ LANGUAGE sql;


-- ===========================================================================
-- 5. ALTER STOCK_BATCHES — add new columns only
--
-- Already-existing columns (no-ops via IF NOT EXISTS):
--   purchase_price, supplier_id, grn_id
--
-- Genuinely new columns:
--   sale_price, mrp, notes
-- ===========================================================================

ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sale_price     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mrp            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS supplier_id    UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS grn_id         UUID REFERENCES goods_receipts(id),
  ADD COLUMN IF NOT EXISTS notes          TEXT;


-- ===========================================================================
-- 6. UPDATE check_sale_item_mrp() — use per-batch MRP, fall back to medicine MRP
--
-- Rationale: each stock_batch now carries its own mrp (the DRAP legal ceiling
-- for that batch). A price revision mid-stock means old batches keep their MRP
-- while new batches get the new one. Fallback to medicine.mrp covers:
--   - Batches created before this migration (stock_batches.mrp IS NULL)
--   - Any batch inserted without a per-batch MRP
-- The trigger binding (enforce_mrp_on_sale_item) is unchanged — only the
-- function body is replaced.
-- ===========================================================================

CREATE OR REPLACE FUNCTION check_sale_item_mrp()
RETURNS TRIGGER AS $$
DECLARE
  v_mrp NUMERIC(10,2);
BEGIN
  SELECT mrp INTO v_mrp FROM stock_batches WHERE id = NEW.batch_id;
  IF v_mrp IS NULL THEN
    SELECT mrp INTO v_mrp FROM medicines WHERE id = NEW.medicine_id;
  END IF;
  IF NEW.unit_price > v_mrp THEN
    RAISE EXCEPTION 'unit_price (%) exceeds MRP (%) for batch %',
      NEW.unit_price, v_mrp, NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
-- 7. SETTINGS SEED
-- ===========================================================================

INSERT INTO settings (key, value, label) VALUES
  ('batch_selection_mode', 'fefo',  'Batch Selection Mode at POS (fefo/manual/show_all)'),
  ('bag_charge_enabled',   'false', 'Enable Bag/Printing Charge per Sale'),
  ('bag_charge_amount',    '2',     'Bag/Printing Charge Amount (PKR)'),
  ('medicine_code_prefix', '',      'Medicine Code Prefix (blank = numeric only)')
ON CONFLICT (key) DO NOTHING;


-- ===========================================================================
-- 8. SEED MEDICINE_CATEGORIES
-- ===========================================================================

INSERT INTO medicine_categories (name, slug) VALUES
  ('Antibiotics',                    'antibiotics'),
  ('Analgesics & Anti-inflammatory', 'analgesics'),
  ('Cardiovascular',                 'cardiovascular'),
  ('Gastrointestinal',               'gastrointestinal'),
  ('Respiratory',                    'respiratory'),
  ('Vitamins & Supplements',         'vitamins-supplements'),
  ('Dermatology',                    'dermatology'),
  ('Endocrine & Metabolic',          'endocrine-metabolic'),
  ('Neurological & Psychiatric',     'neurological-psychiatric'),
  ('Ophthalmology & ENT',            'ophthalmology-ent'),
  ('Controlled Substances',          'controlled-substances'),
  ('Other',                          'other')
ON CONFLICT (slug) DO NOTHING;


-- ===========================================================================
-- 9. SEED MEDICINE_SUBCATEGORIES
-- Uses a JOIN on slug — no hardcoded UUIDs, safe to re-run.
-- ===========================================================================

INSERT INTO medicine_subcategories (category_id, name, slug)
SELECT c.id, sub.name, sub.slug
FROM (VALUES
  -- Antibiotics
  ('antibiotics',              'Beta-Lactams',            'beta-lactams'),
  ('antibiotics',              'Macrolides',              'macrolides'),
  ('antibiotics',              'Fluoroquinolones',        'fluoroquinolones'),
  ('antibiotics',              'Sulfonamides',            'sulfonamides'),
  ('antibiotics',              'Aminoglycosides',         'aminoglycosides'),
  ('antibiotics',              'Tetracyclines',           'tetracyclines'),
  -- Analgesics & Anti-inflammatory
  ('analgesics',               'NSAIDs',                  'nsaids'),
  ('analgesics',               'Opioid Analgesics',       'opioid-analgesics'),
  ('analgesics',               'Paracetamol',             'paracetamol'),
  ('analgesics',               'Muscle Relaxants',        'muscle-relaxants'),
  ('analgesics',               'Topical Analgesics',      'topical-analgesics'),
  -- Cardiovascular
  ('cardiovascular',           'Antihypertensives',       'antihypertensives'),
  ('cardiovascular',           'Diuretics',               'diuretics'),
  ('cardiovascular',           'Anticoagulants',          'anticoagulants'),
  ('cardiovascular',           'Statins',                 'statins'),
  ('cardiovascular',           'Antiarrhythmics',         'antiarrhythmics'),
  ('cardiovascular',           'Nitrates',                'nitrates'),
  -- Gastrointestinal
  ('gastrointestinal',         'Antacids',                'antacids'),
  ('gastrointestinal',         'Proton Pump Inhibitors',  'ppis'),
  ('gastrointestinal',         'Antiemetics',             'antiemetics'),
  ('gastrointestinal',         'Laxatives',               'laxatives'),
  ('gastrointestinal',         'Antidiarrheals',          'antidiarrheals'),
  ('gastrointestinal',         'H2 Blockers',             'h2-blockers'),
  -- Respiratory
  ('respiratory',              'Bronchodilators',         'bronchodilators'),
  ('respiratory',              'Antihistamines',          'antihistamines'),
  ('respiratory',              'Expectorants',            'expectorants'),
  ('respiratory',              'Nasal Decongestants',     'nasal-decongestants'),
  ('respiratory',              'Cough Suppressants',      'cough-suppressants'),
  ('respiratory',              'Inhaled Corticosteroids', 'inhaled-corticosteroids'),
  -- Vitamins & Supplements
  ('vitamins-supplements',     'Multivitamins',           'multivitamins'),
  ('vitamins-supplements',     'Vitamin B Complex',       'vitamin-b-complex'),
  ('vitamins-supplements',     'Vitamin C & D',           'vitamin-cd'),
  ('vitamins-supplements',     'Iron Supplements',        'iron-supplements'),
  ('vitamins-supplements',     'Calcium Supplements',     'calcium-supplements'),
  ('vitamins-supplements',     'Omega-3 / Fish Oil',      'omega-3'),
  -- Dermatology
  ('dermatology',              'Topical Corticosteroids', 'topical-corticosteroids'),
  ('dermatology',              'Antifungals Topical',     'antifungals-topical'),
  ('dermatology',              'Antibiotics Topical',     'antibiotics-topical'),
  ('dermatology',              'Wound Care',              'wound-care'),
  ('dermatology',              'Sunscreen & Moisturizers','sunscreen'),
  -- Endocrine & Metabolic
  ('endocrine-metabolic',      'Oral Antidiabetics',      'oral-antidiabetics'),
  ('endocrine-metabolic',      'Insulin',                 'insulin'),
  ('endocrine-metabolic',      'Thyroid',                 'thyroid'),
  ('endocrine-metabolic',      'Osteoporosis',            'osteoporosis'),
  -- Neurological & Psychiatric
  ('neurological-psychiatric', 'Antidepressants',         'antidepressants'),
  ('neurological-psychiatric', 'Antipsychotics',          'antipsychotics'),
  ('neurological-psychiatric', 'Antiepileptics',          'antiepileptics'),
  ('neurological-psychiatric', 'Anxiolytics',             'anxiolytics'),
  ('neurological-psychiatric', 'Sedatives & Hypnotics',   'sedatives'),
  ('neurological-psychiatric', 'Antimigraines',           'antimigraines'),
  -- Ophthalmology & ENT
  ('ophthalmology-ent',        'Eye Drops',               'eye-drops'),
  ('ophthalmology-ent',        'Eye Ointments',           'eye-ointments'),
  ('ophthalmology-ent',        'Ear Drops',               'ear-drops'),
  ('ophthalmology-ent',        'Nasal Sprays',            'nasal-sprays'),
  -- Controlled Substances (Pakistan drug schedules)
  ('controlled-substances',    'Schedule B (Narcotics)',   'schedule-b'),
  ('controlled-substances',    'Schedule G (Prescription)','schedule-g'),
  ('controlled-substances',    'CNS Act Substances',       'cns-act'),
  -- Other
  ('other',                    'Miscellaneous',            'miscellaneous')
) AS sub(cat_slug, name, slug)
JOIN medicine_categories c ON c.slug = sub.cat_slug
ON CONFLICT (category_id, slug) DO NOTHING;


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
