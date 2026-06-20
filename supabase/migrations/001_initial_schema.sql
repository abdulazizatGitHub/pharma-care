-- =============================================================================
-- PharmaCare — Initial Database Schema Migration
-- File: supabase/migrations/001_initial_schema.sql
-- Version: 1.0
-- =============================================================================
--
-- PREREQUISITES (configure in Supabase Dashboard BEFORE running this SQL):
--   1. Auth → Settings → Disable "Enable email signups" for public.
--      Users are created ONLY by owner/superuser through the app.
--   2. After running, create the superuser via Supabase Auth dashboard:
--        Email: superuser@pharmacare.dev  Password: SuperAdmin@123
--      Then run:
--        UPDATE profiles SET role = 'superuser'
--        WHERE email = 'superuser@pharmacare.dev';
--
-- TABLE CREATION ORDER (dependency-safe, fixes stock_batches → goods_receipts FK):
--   1.  profiles                          9.  shifts
--   2.  medicines                        10.  sales + sale_items
--   3.  suppliers                        11.  prescriptions
--   4.  doctors                          12.  controlled_drug_register
--   5.  customers                        13.  expenses
--   6.  purchase_orders                  14.  audit_logs
--       + purchase_order_items           15.  settings + seed data
--   7.  goods_receipts + grn_items
--   8.  stock_batches
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION: set_updated_at
-- Applied to every table that has an updated_at column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
-- 1. PROFILES
-- Extends auth.users. Every new Auth signup gets role = 'pending' via trigger.
-- Owner/superuser must set the real role before the account is usable.
-- ===========================================================================

-- 'pending' role = account created but not yet assigned a real role by owner/superuser.
-- A user with role = 'pending' has no RLS access to any table.
-- Owner/superuser must UPDATE profiles SET role = '<real_role>' after creation.
CREATE TABLE profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN (
                  'superuser','owner','pharmacist','cashier','procurement','pending'
                )),  -- 'pending': new accounts until admin assigns a real role
  is_active     BOOLEAN DEFAULT TRUE NOT NULL,
  phone         TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  is_deleted    BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at    TIMESTAMPTZ
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a profiles row when a new auth.users row is inserted.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'pending',
    TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ===========================================================================
-- 2. MEDICINES
-- ===========================================================================
CREATE TABLE medicines (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  generic_name  TEXT,
  manufacturer  TEXT,
  drap_reg_no   TEXT,
  schedule      TEXT NOT NULL DEFAULT 'OTC'
                CHECK (schedule IN ('OTC','prescription','controlled')),
  mrp           NUMERIC(10,2) NOT NULL,
  pack_size     TEXT,
  unit          TEXT DEFAULT 'strip',
  reorder_level INTEGER DEFAULT 10,
  barcode       TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  updated_by    UUID REFERENCES profiles(id),
  is_deleted    BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_medicines_updated_at
  BEFORE UPDATE ON medicines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 3. SUPPLIERS
-- ===========================================================================
CREATE TABLE suppliers (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  ntn            TEXT,
  credit_days    INTEGER DEFAULT 30,
  credit_limit   NUMERIC(12,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  updated_by     UUID REFERENCES profiles(id),
  is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at     TIMESTAMPTZ,
  deleted_by     UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 4. DOCTORS
-- ===========================================================================
CREATE TABLE doctors (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  pmdc_reg_no    TEXT,
  specialization TEXT,
  phone          TEXT,
  hospital       TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  updated_by     UUID REFERENCES profiles(id),
  is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at     TIMESTAMPTZ
);

CREATE TRIGGER set_doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 5. CUSTOMERS
-- ===========================================================================
CREATE TABLE customers (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT,
  cnic           TEXT,
  credit_limit   NUMERIC(10,2) DEFAULT 0,
  credit_balance NUMERIC(10,2) DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  updated_by     UUID REFERENCES profiles(id),
  is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at     TIMESTAMPTZ,
  deleted_by     UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 6. PURCHASE_ORDERS + PURCHASE_ORDER_ITEMS
-- ===========================================================================
CREATE TABLE purchase_orders (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number    TEXT NOT NULL UNIQUE,
  supplier_id  UUID NOT NULL REFERENCES suppliers(id),
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','submitted','approved','rejected','received','invoiced')),
  total_amount NUMERIC(12,2),
  approved_by  UUID REFERENCES profiles(id),
  approved_at  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by   UUID REFERENCES profiles(id),
  updated_by   UUID REFERENCES profiles(id),
  is_deleted   BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_order_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ===========================================================================
-- 7. GOODS_RECEIPTS (GRN) + GRN_ITEMS
-- ===========================================================================
CREATE TABLE goods_receipts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_number  TEXT NOT NULL UNIQUE,
  po_id       UUID REFERENCES purchase_orders(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  received_by UUID NOT NULL REFERENCES profiles(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  UUID REFERENCES profiles(id),
  is_deleted  BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_goods_receipts_updated_at
  BEFORE UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE grn_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id      UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id),
  batch_no    TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ===========================================================================
-- 8. STOCK_BATCHES
-- Created after goods_receipts so the grn_id FK resolves without deferral.
-- ===========================================================================
CREATE TABLE stock_batches (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medicine_id    UUID NOT NULL REFERENCES medicines(id),
  batch_no       TEXT NOT NULL,
  expiry_date    DATE NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  purchase_price NUMERIC(10,2),
  supplier_id    UUID REFERENCES suppliers(id),
  grn_id         UUID REFERENCES goods_receipts(id),
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  updated_by     UUID REFERENCES profiles(id),
  is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at     TIMESTAMPTZ,
  deleted_by     UUID REFERENCES profiles(id),
  UNIQUE(medicine_id, batch_no)
);

CREATE TRIGGER set_stock_batches_updated_at
  BEFORE UPDATE ON stock_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Stock summary: security-definer function instead of a bare VIEW.
-- A plain VIEW bypasses RLS on its underlying tables (shown as UNRESTRICTED
-- in Supabase). A SECURITY DEFINER function with a restricted EXECUTE grant
-- controls access correctly.
CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS TABLE (
  medicine_id    UUID,
  medicine_name  TEXT,
  total_quantity BIGINT,
  nearest_expiry DATE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(sb.quantity), 0) AS total_quantity,
    MIN(sb.expiry_date)           AS nearest_expiry
  FROM medicines m
  LEFT JOIN stock_batches sb
    ON  sb.medicine_id = m.id
    AND sb.is_deleted  = FALSE
    AND sb.expiry_date > NOW()
    AND sb.quantity    > 0
  WHERE m.is_deleted = FALSE
  GROUP BY m.id, m.name;
$$;

REVOKE ALL    ON FUNCTION get_stock_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stock_summary() TO authenticated;


-- ===========================================================================
-- 9. SHIFTS
-- ===========================================================================
CREATE TABLE shifts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cashier_id    UUID NOT NULL REFERENCES profiles(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  opening_float NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_cash  NUMERIC(10,2),
  system_cash   NUMERIC(10,2),
  discrepancy   NUMERIC(10,2),
  status        TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by    UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 10. SALES + SALE_ITEMS
-- ===========================================================================
CREATE TABLE sales (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_no      TEXT NOT NULL UNIQUE,
  cashier_id      UUID NOT NULL REFERENCES profiles(id),
  pharmacist_id   UUID REFERENCES profiles(id),
  customer_id     UUID REFERENCES customers(id),
  shift_id        UUID REFERENCES shifts(id),
  sale_type       TEXT DEFAULT 'cash'
                  CHECK (sale_type IN ('cash','credit','return')),
  status          TEXT DEFAULT 'completed'
                  CHECK (status IN ('completed','voided','pending_approval')),
  subtotal        NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_pct    NUMERIC(5,2)  DEFAULT 0,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL,
  amount_paid     NUMERIC(12,2),
  change_amount   NUMERIC(12,2),
  notes           TEXT,
  voided_by       UUID REFERENCES profiles(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by      UUID REFERENCES profiles(id),
  updated_by      UUID REFERENCES profiles(id),
  is_deleted      BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sale_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id      UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id  UUID NOT NULL REFERENCES medicines(id),
  batch_id     UUID NOT NULL REFERENCES stock_batches(id),
  batch_no     TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,
  mrp          NUMERIC(10,2) NOT NULL,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  total_price  NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- MRP enforcement: unit_price must not exceed medicines.mrp at insert time.
CREATE OR REPLACE FUNCTION check_sale_item_mrp()
RETURNS TRIGGER AS $$
DECLARE
  v_mrp NUMERIC(10,2);
BEGIN
  SELECT mrp INTO v_mrp FROM medicines WHERE id = NEW.medicine_id;
  IF NEW.unit_price > v_mrp THEN
    RAISE EXCEPTION 'unit_price (%) exceeds MRP (%) for medicine %',
      NEW.unit_price, v_mrp, NEW.medicine_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_mrp_on_sale_item
  BEFORE INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION check_sale_item_mrp();


-- ===========================================================================
-- 11. PRESCRIPTIONS
-- ===========================================================================
CREATE TABLE prescriptions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id          UUID REFERENCES sales(id),
  patient_id       UUID REFERENCES customers(id),
  doctor_id        UUID REFERENCES doctors(id),
  doctor_name      TEXT,
  prescription_ref TEXT,
  notes            TEXT,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  approved_by      UUID REFERENCES profiles(id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by       UUID REFERENCES profiles(id),
  updated_by       UUID REFERENCES profiles(id),
  is_deleted       BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at       TIMESTAMPTZ,
  deleted_by       UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_prescriptions_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 12. CONTROLLED_DRUG_REGISTER (Rule 20 — Punjab Drugs Rules 2007)
-- APPEND-ONLY. No UPDATE, no DELETE — enforced by RLS.
--
-- IMPORTANT: serial_no uses SERIAL (backed by a PostgreSQL sequence).
-- PostgreSQL sequences are non-transactional: a rolled-back INSERT still
-- advances the sequence counter. serial_no values may therefore have gaps.
-- This is acceptable under Rule 20 — the legal requirement is that entries
-- are append-only and immutable, not that they are gapless.
-- Do NOT attempt to fill gaps.
-- ===========================================================================
CREATE TABLE controlled_drug_register (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_no                 SERIAL,
  sale_date                 DATE NOT NULL,
  doctor_name               TEXT NOT NULL,
  doctor_reg_no             TEXT,
  patient_name              TEXT NOT NULL,
  medicine_id               UUID NOT NULL REFERENCES medicines(id),
  medicine_name             TEXT NOT NULL,
  manufacturer              TEXT NOT NULL,
  batch_no                  TEXT NOT NULL,
  quantity_sold             INTEGER NOT NULL,
  quantity_purchased        INTEGER,
  balance                   INTEGER,
  supervising_pharmacist_id UUID REFERENCES profiles(id),
  sale_id                   UUID REFERENCES sales(id),
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by                UUID NOT NULL REFERENCES profiles(id)
);


-- ===========================================================================
-- 13. EXPENSES
-- ===========================================================================
CREATE TABLE expenses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category     TEXT NOT NULL CHECK (
                 category IN ('rent','electricity','salaries','maintenance','supplier_payment','other')
               ),
  description  TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by   UUID REFERENCES profiles(id),
  updated_by   UUID REFERENCES profiles(id),
  is_deleted   BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===========================================================================
-- 14. AUDIT_LOGS
-- INSERT for all authenticated users. SELECT for owner/superuser only.
-- No UPDATE, no DELETE — ever.
-- ===========================================================================
CREATE TABLE audit_logs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id),
  user_role  TEXT,
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  UUID,
  old_value  JSONB,
  new_value  JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ===========================================================================
-- 15. SETTINGS + SEED DATA
-- ===========================================================================
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

INSERT INTO settings (key, value, label) VALUES
  ('pharmacy_name',               'PharmaCare', 'Pharmacy Name'),
  ('pharmacy_address',            '',            'Address'),
  ('licence_number',              '',            'Drug Licence Number'),
  ('pharmacist_name',             '',            'Qualified Pharmacist Name'),
  ('low_stock_default_threshold', '10',          'Default Low Stock Level'),
  ('expiry_alert_days_1',         '30',          'Expiry Alert Window 1 (days)'),
  ('expiry_alert_days_2',         '60',          'Expiry Alert Window 2 (days)'),
  ('expiry_alert_days_3',         '90',          'Expiry Alert Window 3 (days)'),
  ('cashier_discount_limit_pct',  '10',          'Max Cashier Discount (%)'),
  ('po_auto_approve_threshold',   '50000',       'PO Auto-Approve Below (PKR)'),
  ('tax_rate_pct',                '1',           'Sales Tax Rate (%) - default 1% for registered medicines'),
  ('currency',                    'PKR',         'Currency');


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- get_user_role(): read role from profiles for the currently authenticated user.
-- Used in all RLS policies. SECURITY DEFINER so it can read profiles even when
-- the calling policy has not yet granted SELECT on profiles.
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles
  WHERE id = auth.uid()
    AND is_active  = TRUE
    AND is_deleted = FALSE;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- complete_sale(): Phase 3 placeholder. Atomic sale insertion stub.
CREATE OR REPLACE FUNCTION complete_sale(sale_data JSONB, items JSONB)
RETURNS UUID AS $$
BEGIN
  -- !! PHASE 3 INSTRUCTION !!
  -- Do NOT create a new function. Use CREATE OR REPLACE FUNCTION
  -- complete_sale(sale_data JSONB, items JSONB) to replace this body.
  -- The function signature must remain identical.
  -- See PHARMACARE_AGENT_CONTEXT.md Section 9 Phase 3 Task 3.5.
  RAISE EXCEPTION 'complete_sale() not yet implemented — fill in Phase 3';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================
-- Pattern: no policy = no access (RLS default deny).
-- Never use hard DELETE — no DELETE policies on any table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_select"  ON profiles FOR SELECT
  USING (id = auth.uid());
CREATE POLICY "profiles_admin_select" ON profiles FOR SELECT
  USING (get_user_role() IN ('owner','superuser'));
CREATE POLICY "profiles_self_update"  ON profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
  USING (get_user_role() IN ('owner','superuser'));
CREATE POLICY "profiles_insert"       ON profiles FOR INSERT
  WITH CHECK (get_user_role() IN ('owner','superuser'));

-- ---------------------------------------------------------------------------
-- MEDICINES
-- ---------------------------------------------------------------------------
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "medicines_insert" ON medicines FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "medicines_update" ON medicines FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- SUPPLIERS
-- ---------------------------------------------------------------------------
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
  USING (get_user_role() IN ('procurement','owner','superuser'));

-- ---------------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------------
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctors_select" ON doctors FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "doctors_insert" ON doctors FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "doctors_update" ON doctors FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));
-- No DELETE policy — no hard deletes.

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON customers FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "customers_insert" ON customers FOR INSERT
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));
CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING (get_user_role() IN ('cashier','pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- PURCHASE_ORDERS
-- ---------------------------------------------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));
CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING (get_user_role() IN ('procurement','owner','superuser'));

-- ---------------------------------------------------------------------------
-- PURCHASE_ORDER_ITEMS
-- ---------------------------------------------------------------------------
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_items_select" ON purchase_order_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "po_items_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));
CREATE POLICY "po_items_update" ON purchase_order_items FOR UPDATE
  USING (get_user_role() IN ('procurement','owner','superuser'));

-- ---------------------------------------------------------------------------
-- GOODS_RECEIPTS
-- ---------------------------------------------------------------------------
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "goods_receipts_insert" ON goods_receipts FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- GRN_ITEMS
-- ---------------------------------------------------------------------------
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grn_items_select" ON grn_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "grn_items_insert" ON grn_items FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "grn_items_update" ON grn_items FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- STOCK_BATCHES
-- ---------------------------------------------------------------------------
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_batches_select" ON stock_batches FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "stock_batches_insert" ON stock_batches FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "stock_batches_update" ON stock_batches FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- SHIFTS
-- Cashiers see only their own shift rows. Owner/superuser see all.
-- ---------------------------------------------------------------------------
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (
    get_user_role() IN ('owner','superuser')
    OR (get_user_role() = 'cashier' AND cashier_id = auth.uid())
  );
CREATE POLICY "shifts_insert" ON shifts FOR INSERT
  WITH CHECK (get_user_role() IN ('cashier','owner','superuser'));
CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING (get_user_role() IN ('cashier','owner','superuser'));

-- ---------------------------------------------------------------------------
-- SALES
-- Cashiers can only SELECT their own sales rows via RLS.
-- Owner/pharmacist/superuser see all sales.
-- Procurement role has no sales access.
-- ---------------------------------------------------------------------------
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (
    get_user_role() IN ('owner','pharmacist','superuser')
    OR (get_user_role() = 'cashier' AND cashier_id = auth.uid())
    OR (get_user_role() = 'procurement' AND FALSE)
  );
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (get_user_role() IN ('cashier','pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- SALE_ITEMS
-- ---------------------------------------------------------------------------
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_items_select" ON sale_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "sale_items_insert" ON sale_items FOR INSERT
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));
CREATE POLICY "sale_items_update" ON sale_items FOR UPDATE
  USING (get_user_role() IN ('cashier','pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS
-- ---------------------------------------------------------------------------
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);
CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));
CREATE POLICY "prescriptions_update" ON prescriptions FOR UPDATE
  USING (get_user_role() IN ('cashier','pharmacist','owner','superuser'));

-- ---------------------------------------------------------------------------
-- CONTROLLED_DRUG_REGISTER — APPEND-ONLY
-- No UPDATE policy. No DELETE policy.
-- ---------------------------------------------------------------------------
ALTER TABLE controlled_drug_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdr_select" ON controlled_drug_register FOR SELECT
  USING (get_user_role() IN ('pharmacist','owner','superuser'));
CREATE POLICY "cdr_insert" ON controlled_drug_register FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','superuser'));
-- No UPDATE policy. No DELETE policy.

-- ---------------------------------------------------------------------------
-- EXPENSES
-- ---------------------------------------------------------------------------
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select" ON expenses FOR SELECT
  USING (
    is_deleted = FALSE
    AND get_user_role() IN ('owner','superuser')
  );
CREATE POLICY "expenses_insert" ON expenses FOR INSERT
  WITH CHECK (get_user_role() IN ('owner','superuser'));
CREATE POLICY "expenses_update" ON expenses FOR UPDATE
  USING (get_user_role() IN ('owner','superuser'));

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS — INSERT for all authenticated; SELECT for owner/superuser only.
-- No UPDATE. No DELETE.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  USING (get_user_role() IN ('owner','superuser'));
-- No UPDATE policy. No DELETE policy.

-- ---------------------------------------------------------------------------
-- SETTINGS — SELECT for all authenticated; UPDATE for owner/superuser only.
-- No INSERT or DELETE via RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select" ON settings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_update" ON settings FOR UPDATE
  USING (get_user_role() IN ('owner','superuser'));
-- No INSERT or DELETE policy.

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
