-- =============================================================================
-- PharmaCare — Fix soft-delete blocked by SELECT USING visibility check
-- File: supabase/migrations/005_fix_soft_delete_select_policy.sql
--
-- ROOT CAUSE:
-- PostgreSQL RLS for UPDATE checks whether the post-update row would be
-- visible under any applicable SELECT USING policy. If the SELECT USING
-- includes `is_deleted = FALSE`, then any UPDATE that sets is_deleted = TRUE
-- fails with "new row violates row-level security policy for table X" even
-- though the UPDATE's own WITH CHECK (role check only) would pass.
--
-- Migration 004 added explicit WITH CHECK to all UPDATE policies (role-only,
-- no is_deleted check) but did NOT remove is_deleted = FALSE from SELECT
-- policies. PostgreSQL still blocks the soft-delete because the post-update
-- row with is_deleted = TRUE is invisible to the SELECT policy.
--
-- FIX:
-- Remove `is_deleted = FALSE` from all SELECT USING expressions on every
-- table that has an is_deleted column. Role-based access control is
-- preserved unchanged. Soft-delete visibility filtering (showing only active
-- records) moves to the application layer — every query that wants active
-- records adds .eq('is_deleted', false) explicitly. RLS enforces WHO can
-- read a table; is_deleted filtering is an application concern.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- MEDICINES
-- (004 updated this to add role-scoped access but kept is_deleted = FALSE.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "medicines_select" ON medicines;
CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (get_user_role() IN ('superuser','owner','pharmacist','cashier','procurement'));


-- ---------------------------------------------------------------------------
-- SUPPLIERS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- DOCTORS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "doctors_select" ON doctors;
CREATE POLICY "doctors_select" ON doctors FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- PURCHASE_ORDERS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- GOODS_RECEIPTS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "goods_receipts_select" ON goods_receipts;
CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- STOCK_BATCHES
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_batches_select" ON stock_batches;
CREATE POLICY "stock_batches_select" ON stock_batches FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS
-- Original: auth.uid() IS NOT NULL AND is_deleted = FALSE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "prescriptions_select" ON prescriptions;
CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------------
-- EXPENSES
-- Original: is_deleted = FALSE AND get_user_role() IN ('owner','superuser')
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses FOR SELECT
  USING (get_user_role() IN ('owner','superuser'));


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
