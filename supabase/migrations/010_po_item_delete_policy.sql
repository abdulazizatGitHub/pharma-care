-- Migration 010: RLS DELETE policy for purchase_order_items
-- Required for removePOItem() hard delete in app/actions/procurement.ts.
-- Migrations 001-009 had no DELETE policy on this table;
-- without this, DELETE silently affects 0 rows due to RLS.

CREATE POLICY "po_items_delete"
  ON purchase_order_items
  FOR DELETE
  USING (get_user_role() IN ('superadmin', 'admin'));
