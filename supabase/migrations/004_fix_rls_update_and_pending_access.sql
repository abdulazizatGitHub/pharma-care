-- =============================================================================
-- PharmaCare — Fix RLS UPDATE policies and pending-role access
-- File: supabase/migrations/004_fix_rls_update_and_pending_access.sql
--
-- FIX 1: Soft-delete blocker
-- All UPDATE policies that omit an explicit WITH CHECK inherit the USING
-- expression. The SELECT USING expressions contain `is_deleted = FALSE`,
-- which causes PostgreSQL to reject any UPDATE that sets is_deleted = TRUE
-- (because the modified row would become invisible to the caller post-update).
--
-- Fix: add an explicit WITH CHECK that only checks the role, so
-- soft-deletes (setting is_deleted = TRUE) are permitted for the right roles.
--
-- Pattern applied to every affected table:
--   DROP the old policy (which had no WITH CHECK)
--   CREATE with both USING (pre-update row filter) and WITH CHECK (new row check)
--   Neither clause references is_deleted, so soft-deletes are allowed.
--
-- FIX 2: Pending-role access restriction
-- medicines_select allows any auth.uid() IS NOT NULL, including pending users.
-- audit_insert  allows any auth.uid() IS NOT NULL, including pending users.
-- Replace both with role-scoped versions.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_self_update"  ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;

CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
  USING  (get_user_role() IN ('owner','superuser'))
  WITH CHECK (get_user_role() IN ('owner','superuser'));


-- ---------------------------------------------------------------------------
-- MEDICINES
-- FIX 2 also applied here: replace medicines_select to exclude pending role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "medicines_select" ON medicines;
DROP POLICY IF EXISTS "medicines_update" ON medicines;

-- Pending users (role = 'pending') are now excluded from medicines reads.
CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (
    get_user_role() IN ('superuser','owner','pharmacist','cashier','procurement')
    AND is_deleted = FALSE
  );

CREATE POLICY "medicines_update" ON medicines FOR UPDATE
  USING  (get_user_role() IN ('pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- SUPPLIERS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;

CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
  USING  (get_user_role() IN ('procurement','owner','superuser'))
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));


-- ---------------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "doctors_update" ON doctors;

CREATE POLICY "doctors_update" ON doctors FOR UPDATE
  USING  (get_user_role() IN ('pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "customers_update" ON customers;

CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING  (get_user_role() IN ('cashier','pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- PURCHASE_ORDERS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING  (get_user_role() IN ('procurement','owner','superuser'))
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));


-- ---------------------------------------------------------------------------
-- PURCHASE_ORDER_ITEMS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "po_items_update" ON purchase_order_items;

CREATE POLICY "po_items_update" ON purchase_order_items FOR UPDATE
  USING  (get_user_role() IN ('procurement','owner','superuser'))
  WITH CHECK (get_user_role() IN ('procurement','owner','superuser'));


-- ---------------------------------------------------------------------------
-- GOODS_RECEIPTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "goods_receipts_update" ON goods_receipts;

CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING  (get_user_role() IN ('pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- GRN_ITEMS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "grn_items_update" ON grn_items;

CREATE POLICY "grn_items_update" ON grn_items FOR UPDATE
  USING  (get_user_role() IN ('pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- STOCK_BATCHES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_batches_update" ON stock_batches;

CREATE POLICY "stock_batches_update" ON stock_batches FOR UPDATE
  USING  (get_user_role() IN ('pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- SHIFTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "shifts_update" ON shifts;

CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING  (get_user_role() IN ('cashier','owner','superuser'))
  WITH CHECK (get_user_role() IN ('cashier','owner','superuser'));


-- ---------------------------------------------------------------------------
-- SALES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_update" ON sales;

CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING  (get_user_role() IN ('cashier','pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- SALE_ITEMS
-- sale_items has no is_deleted column, but we add explicit WITH CHECK for
-- consistency so future schema changes do not reintroduce the problem.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sale_items_update" ON sale_items;

CREATE POLICY "sale_items_update" ON sale_items FOR UPDATE
  USING  (get_user_role() IN ('cashier','pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "prescriptions_update" ON prescriptions;

CREATE POLICY "prescriptions_update" ON prescriptions FOR UPDATE
  USING  (get_user_role() IN ('cashier','pharmacist','owner','superuser'))
  WITH CHECK (get_user_role() IN ('cashier','pharmacist','owner','superuser'));


-- ---------------------------------------------------------------------------
-- EXPENSES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "expenses_update" ON expenses;

CREATE POLICY "expenses_update" ON expenses FOR UPDATE
  USING  (get_user_role() IN ('owner','superuser'))
  WITH CHECK (get_user_role() IN ('owner','superuser'));


-- ---------------------------------------------------------------------------
-- SETTINGS — no is_deleted column; fix for consistency.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "settings_update" ON settings;

CREATE POLICY "settings_update" ON settings FOR UPDATE
  USING  (get_user_role() IN ('owner','superuser'))
  WITH CHECK (get_user_role() IN ('owner','superuser'));


-- ---------------------------------------------------------------------------
-- AUDIT_LOGS — FIX 2: restrict INSERT to real roles only (exclude pending).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;

CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  WITH CHECK (
    get_user_role() IN ('superuser','owner','pharmacist','cashier','procurement')
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
