-- =============================================================================
-- PharmaCare — RBAC V2 Migration
-- File: supabase/migrations/006_rbac_v2.sql
-- Spec: PHARMACARE_RBAC_V2.md
--
-- WHAT THIS DOES:
--   1. Renames role values in profiles (superuser/owner → superadmin,
--      procurement → admin, cashier → pharmacist)
--   2. Replaces the profiles CHECK constraint with new role set
--   3. Creates user_permissions table for per-user overrides
--   4. Rebuilds every RLS policy on every table with new role names
--
-- ROLE MAPPING:
--   superuser  → superadmin
--   owner      → superadmin
--   procurement → admin
--   cashier    → pharmacist
--   pharmacist  stays pharmacist
--   pending     stays pending
--
-- PER-TABLE ACCESS (new):
--   superadmin only (write): settings, user_permissions DELETE
--   admin + superadmin:      suppliers, purchase_orders, purchase_order_items,
--                            expenses
--   all 3 roles:             medicines, doctors, customers, goods_receipts,
--                            grn_items, stock_batches, prescriptions,
--                            controlled_drug_register, shifts (INSERT/UPDATE)
--   sales SELECT:            superadmin+admin see all; pharmacist sees own
--   audit_logs:              INSERT for all 3; SELECT for superadmin+admin
--   profiles:                self read/update for all; all-read for admin+superadmin
-- =============================================================================


-- ============================================================================
-- STEP 1: Drop old CHECK constraint (so updates below are not blocked)
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ============================================================================
-- STEP 2: Update role values (no constraint active — all values are allowed)
-- ============================================================================

UPDATE profiles SET role = 'superadmin' WHERE role IN ('superuser', 'owner');
UPDATE profiles SET role = 'admin'      WHERE role = 'procurement';
UPDATE profiles SET role = 'pharmacist' WHERE role = 'cashier';
-- pharmacist and pending rows are unchanged

-- ============================================================================
-- STEP 3: Add new CHECK constraint (all rows now carry valid new role names)
-- ============================================================================

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'admin', 'pharmacist', 'pending'));


-- ============================================================================
-- STEP 3: Create user_permissions table
-- Stores OVERRIDES only — grants above base set OR restrictions below base set.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission  TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('grant', 'restrict')),
  granted_by  UUID        NOT NULL REFERENCES profiles(id),
  granted_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Any role can read their own overrides; superadmin can read anyone's
CREATE POLICY "permissions_select" ON user_permissions FOR SELECT
  USING (
    get_user_role() = 'superadmin'
    OR user_id = auth.uid()
  );

-- Only superadmin may grant or restrict permissions
CREATE POLICY "permissions_insert" ON user_permissions FOR INSERT
  WITH CHECK (get_user_role() = 'superadmin');

-- Only superadmin may remove permissions
CREATE POLICY "permissions_delete" ON user_permissions FOR DELETE
  USING (get_user_role() = 'superadmin');

-- No UPDATE policy: delete and re-insert to change an override


-- ============================================================================
-- STEP 4: Rebuild all RLS policies with new role names
--
-- Pattern: DROP IF EXISTS old policy, CREATE with new role values.
-- Only policies that reference old role names (or that the spec changes) are
-- touched; policies unchanged by the role rename are left in place.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert"       ON profiles;

-- superadmin + admin can read all profiles (for user management screens)
CREATE POLICY "profiles_admin_select" ON profiles FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));

-- superadmin + admin can update any profile (role assignment, deactivation)
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

-- Only superadmin may directly insert profiles (trigger handles auto-creation
-- via SECURITY DEFINER; this policy covers any direct INSERT)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (get_user_role() = 'superadmin');

-- profiles_self_select and profiles_self_update are unchanged (id = auth.uid())


-- ----------------------------------------------------------------------------
-- MEDICINES
-- (005 last set SELECT to role-list; 004 last set UPDATE to role-list)
-- New: all 3 roles read and write medicines (inventory management)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "medicines_select" ON medicines;
DROP POLICY IF EXISTS "medicines_insert" ON medicines;
DROP POLICY IF EXISTS "medicines_update" ON medicines;

CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "medicines_insert" ON medicines FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "medicines_update" ON medicines FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- SUPPLIERS
-- (005 set SELECT to auth.uid() IS NOT NULL — too permissive for new model)
-- New: admin + superadmin only (procurement-tier resource)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));


-- ----------------------------------------------------------------------------
-- DOCTORS
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: all 3 roles (pharmacists enter prescriptions referencing doctors)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "doctors_select" ON doctors;
DROP POLICY IF EXISTS "doctors_insert" ON doctors;
DROP POLICY IF EXISTS "doctors_update" ON doctors;

CREATE POLICY "doctors_select" ON doctors FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "doctors_insert" ON doctors FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "doctors_update" ON doctors FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- CUSTOMERS
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: all 3 roles (counter staff + admin manage customers)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;

CREATE POLICY "customers_select" ON customers FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "customers_insert" ON customers FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- PURCHASE_ORDERS
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: admin + superadmin only (procurement-tier resource)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;

CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));


-- ----------------------------------------------------------------------------
-- PURCHASE_ORDER_ITEMS
-- (001 set SELECT to auth.uid() IS NOT NULL — unchanged through migrations)
-- New: admin + superadmin only (linked to purchase_orders)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "po_items_select" ON purchase_order_items;
DROP POLICY IF EXISTS "po_items_insert" ON purchase_order_items;
DROP POLICY IF EXISTS "po_items_update" ON purchase_order_items;

CREATE POLICY "po_items_select" ON purchase_order_items FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "po_items_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "po_items_update" ON purchase_order_items FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));


-- ----------------------------------------------------------------------------
-- GOODS_RECEIPTS
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: all 3 roles (inventory management involves receiving stock)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "goods_receipts_select" ON goods_receipts;
DROP POLICY IF EXISTS "goods_receipts_insert" ON goods_receipts;
DROP POLICY IF EXISTS "goods_receipts_update" ON goods_receipts;

CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "goods_receipts_insert" ON goods_receipts FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- GRN_ITEMS
-- (001 set SELECT to auth.uid() IS NOT NULL — unchanged through migrations)
-- New: all 3 roles (inventory management)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "grn_items_select" ON grn_items;
DROP POLICY IF EXISTS "grn_items_insert" ON grn_items;
DROP POLICY IF EXISTS "grn_items_update" ON grn_items;

CREATE POLICY "grn_items_select" ON grn_items FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "grn_items_insert" ON grn_items FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "grn_items_update" ON grn_items FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- STOCK_BATCHES
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: all 3 roles (inventory management)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "stock_batches_select" ON stock_batches;
DROP POLICY IF EXISTS "stock_batches_insert" ON stock_batches;
DROP POLICY IF EXISTS "stock_batches_update" ON stock_batches;

CREATE POLICY "stock_batches_select" ON stock_batches FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "stock_batches_insert" ON stock_batches FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "stock_batches_update" ON stock_batches FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- SHIFTS
-- Old cashier role → pharmacist. Admin replaces owner/superuser for oversight.
-- SELECT: admin+superadmin see all; pharmacist sees own shift rows only.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "shifts_select" ON shifts;
DROP POLICY IF EXISTS "shifts_insert" ON shifts;
DROP POLICY IF EXISTS "shifts_update" ON shifts;

CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    OR (get_user_role() = 'pharmacist' AND cashier_id = auth.uid())
  );

CREATE POLICY "shifts_insert" ON shifts FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- SALES
-- Old: pharmacist saw all; cashier saw own; procurement was blocked.
-- New: superadmin+admin see all; pharmacist sees own cashier_id rows.
-- Pharmacist with sales_history_all permission is handled at app layer
-- (Phase B will add a has_permission() RLS helper for full enforcement).
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;

CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin')
    OR (get_user_role() = 'pharmacist' AND cashier_id = auth.uid())
  );

CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- SALE_ITEMS
-- (001 set SELECT to auth.uid() IS NOT NULL — unchanged through migrations)
-- New: all 3 roles (aligned with sales access)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "sale_items_select" ON sale_items;
DROP POLICY IF EXISTS "sale_items_insert" ON sale_items;
DROP POLICY IF EXISTS "sale_items_update" ON sale_items;

CREATE POLICY "sale_items_select" ON sale_items FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "sale_items_insert" ON sale_items FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "sale_items_update" ON sale_items FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- PRESCRIPTIONS
-- (005 set SELECT to auth.uid() IS NOT NULL)
-- New: all 3 roles (pharmacists create prescriptions; admin/superadmin oversee)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "prescriptions_select" ON prescriptions;
DROP POLICY IF EXISTS "prescriptions_insert" ON prescriptions;
DROP POLICY IF EXISTS "prescriptions_update" ON prescriptions;

CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "prescriptions_update" ON prescriptions FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));


-- ----------------------------------------------------------------------------
-- CONTROLLED_DRUG_REGISTER — APPEND-ONLY (no UPDATE, no DELETE policies)
-- Old INSERT: pharmacist + superuser only (owner excluded — likely an oversight)
-- New: all 3 roles per spec; no UPDATE/DELETE policies added
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "cdr_select" ON controlled_drug_register;
DROP POLICY IF EXISTS "cdr_insert" ON controlled_drug_register;

CREATE POLICY "cdr_select" ON controlled_drug_register FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "cdr_insert" ON controlled_drug_register FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

-- No UPDATE policy. No DELETE policy. This table is append-only.


-- ----------------------------------------------------------------------------
-- EXPENSES
-- New: admin + superadmin only (financial — not counter-staff visible)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;

CREATE POLICY "expenses_select" ON expenses FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "expenses_insert" ON expenses FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "expenses_update" ON expenses FOR UPDATE
  USING  (get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin'));


-- ----------------------------------------------------------------------------
-- AUDIT_LOGS
-- INSERT: all 3 real roles (every write must log)
-- SELECT: superadmin + admin only (audit trail management)
-- No UPDATE, no DELETE.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
DROP POLICY IF EXISTS "audit_select" ON audit_logs;

CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  USING (get_user_role() IN ('superadmin', 'admin'));


-- ----------------------------------------------------------------------------
-- SETTINGS
-- SELECT: all authenticated users (pharmacists need to read discount limits etc.)
-- UPDATE: superadmin only (system configuration is owner-tier)
-- No INSERT, no DELETE policy.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "settings_update" ON settings;

CREATE POLICY "settings_update" ON settings FOR UPDATE
  USING  (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');

-- settings_select (auth.uid() IS NOT NULL) is left unchanged.


-- ============================================================================
-- STEP 5: Verify get_user_role() — no change required.
-- The function reads profiles.role directly. After STEP 1 updated the role
-- values, it will return 'superadmin', 'admin', 'pharmacist', or 'pending'
-- correctly. No modification to the function body is needed.
-- ============================================================================

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
