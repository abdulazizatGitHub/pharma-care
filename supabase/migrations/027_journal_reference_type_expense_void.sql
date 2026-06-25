-- 027: Add 'expense_void' to journal_entries reference_type CHECK constraint

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'sale', 'sale_return', 'purchase_order', 'grn',
    'supplier_payment', 'customer_payment',
    'borrowing_out', 'borrowing_in',
    'borrowing_payment', 'expense', 'expense_void',
    'manual', 'opening_balance', 'adjustment'
  ));
