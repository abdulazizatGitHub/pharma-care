-- Phase 11: Shift Management
-- Rename shifts table columns to match Phase 11 spec.
-- No new columns required — all required columns already exist under different names.
--
-- Mapping:
--   opening_float  → opening_cash     (same semantics)
--   system_cash    → expected_cash    (system-calculated expected closing balance)
--   discrepancy    → cash_difference  (closing_cash − expected_cash)

ALTER TABLE shifts RENAME COLUMN opening_float  TO opening_cash;
ALTER TABLE shifts RENAME COLUMN system_cash    TO expected_cash;
ALTER TABLE shifts RENAME COLUMN discrepancy    TO cash_difference;
