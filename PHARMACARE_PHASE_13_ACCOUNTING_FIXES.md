# PharmaCare — Phase 13: Accounting Audit Fixes

## Audit Summary

Full double-entry accounting audit completed 2026-06-28.
Verified: complete_sale, complete_grn, process_return,
post_journal_entry, recordExpense, recordSupplierPayment,
recordCustomerPayment, all borrowing flows, all report functions.

---

## Findings

### 🔴 Bug 1 — CRITICAL: complete_grn() posts no journal entry

Migration 024 (partial GRN) rewrote complete_grn() and
silently dropped the journal entry posting that existed
in migration 013.

Every GRN since migration 024 is missing:
  DEBIT  1200 Inventory         (goods received into stock)
  CREDIT 2000 Accounts Payable  (liability to supplier)

Historical impact: ALL GRNs after migration 024 are
unrecorded in the ledger. Inventory and payables are
understated by the total value of all post-024 GRNs.

Fix: Add post_journal_entry() call back to complete_grn().

---

### 🔴 Bug 2 — CRITICAL: Bank transfer always routes to Cash (1000)

Affected functions:
  complete_sale()         — payment debit
  recordExpense()         — payment credit
  recordSupplierPayment() — payment credit
  recordCustomerPayment() — payment debit

All four hardcode account 1000 (Cash) regardless of
payment_method / payment_type.

Historical impact: NONE — all 27 sales and 2 expenses
are cash. No bank transfers exist. Fix is clean.

Fix: Route payment accounts by method:
  cash          → 1000 Cash
  bank_transfer → 1001 (rename to "Bank Account")
  cheque        → 1001 (same bank account)
  credit sale   → 1100 Accounts Receivable (unchanged)

Also rename account 1001 from "Cash in Hand" to
"Bank Account" for clarity.

---

### 🟡 Bug 3 — SIGNIFICANT: Discount netted against revenue

complete_sale() currently:
  CREDIT 4000  (subtotal - discount)

Client confirmed: need to see discount separately in
reports (daily/monthly/yearly discount totals).

Fix: Add contra-revenue account 4900 "Sales Discount":
  CREDIT 4000  subtotal         (gross revenue)
  DEBIT  4900  discount_amount  (only if > 0)

Net profit unchanged. Gross revenue will show higher
in P&L with a new Discount line below it.

Historical impact: Past journal entries are immutable
(trigger blocks UPDATE/DELETE on journal_lines).
Historical revenue figures in ledger will differ from
new entries. This is acceptable — prior period is prior
period. The change only affects new entries.

---

### 🟡 Bug 4 — SIGNIFICANT: process_return() always refunds to Cash

process_return() always credits 1000 (Cash) for refund
regardless of original sale payment type.

If original sale was bank_transfer, refund should go
to 1001 (Bank Account), not 1000 (Cash).

Historical impact: NONE — all sales are cash. Fix is clean.

Fix: Look up original sale payment_type and route:
  cash          → CREDIT 1000
  bank_transfer → CREDIT 1001
  credit        → DEBIT 1100 (reduce receivable, no cash out)

---

### 🟠 Gap 5 — MODERATE: customer_payment credit_balance non-atomic

recordCustomerPayment() in ledger.ts:
  1. Posts journal entry (post_journal_entry RPC)
  2. Updates customers.credit_balance -= amount (separate query)

If step 2 fails after step 1: journal entry posted but
credit_balance not reduced. Ledger and customer balance
diverge silently.

Fix: Move credit_balance update into an RPC so both
happen in the same transaction, OR add a compensating
check that detects and corrects divergence.

Recommended fix: Create update_customer_payment() RPC
that does both atomically:
  INSERT customer_payments
  UPDATE customers.credit_balance
  CALL post_journal_entry()
  All in one SECURITY DEFINER plpgsql function.

---

### 🟠 Gap 6 — MODERATE: Payment journal entries have reference_id = null

All payment journal entries (supplier_payment,
customer_payment, borrowing_payment) pass
p_reference_id: null to post_journal_entry().

The journal entry has no FK back to the payment record.
This breaks audit trail — you cannot directly navigate
from a journal entry to the payment that caused it.

Fix: Pass the payment row ID as p_reference_id after
insert, OR do a post-insert UPDATE on the journal entry.
Simplest: insert payment first (get its ID), then call
post_journal_entry with that ID as reference_id.

---

### 🟠 Gap 7 — MODERATE: No opening balances mechanism

No UI or server action exists to post opening balances
when setting up the system or migrating from manual records.

reference_type 'opening_balance' exists in the CHECK
constraint but is never used.

Fix: New page /superadmin/opening-balances with a form
to post a balanced journal entry of type 'opening_balance'.
Typically done once at system setup. Allow re-entry with
a reversal + re-post mechanism.

---

### ✅ Verified Working Correctly

- post_journal_entry() — balance check, debit/credit enforcement
- complete_sale() — core sale accounting (cash path)
- process_return() — reversal logic (cash path)
- get_financial_summary() — correctly excludes reversed
- get_pl_statement() — correctly filters posted, excludes zeros
- get_cash_book() — correct running balance computation
- get_account_balances() — correct normal_balance direction
- journal_lines immutability trigger
- Expense void reversal
- Borrowing accounting:
    borrow_in:  DEBIT 1200 / CREDIT 2010 ✓
    borrow_out: DEBIT 1110 / CREDIT 1200 ✓

---

## Migration 032 — Accounting Fixes

### New account needed

```sql
INSERT INTO accounts (
  code, name, account_type, normal_balance,
  is_system, is_active, is_deleted, currency
) VALUES (
  '4900', 'Sales Discount', 'revenue', 'debit',
  true, true, false, 'PKR'
)
ON CONFLICT (code) DO NOTHING;
```

Note: account_type = 'revenue' for 4900 even though
normal_balance = 'debit'. This is a contra-revenue
account — it reduces revenue. The existing CHECK
constraint only validates account_type values, not
the debit/credit direction for that type. This is
acceptable and standard accounting practice.

### Rename account 1001

```sql
UPDATE accounts
SET name = 'Bank Account'
WHERE code = '1001' AND is_deleted = false;
```

### Fix complete_grn() — add journal entry posting

The complete_grn() RPC must be recreated with
post_journal_entry() added at the end.

Journal lines to post:
  DEBIT  1200 Inventory      v_total (sum of qty × unit_price)
  CREDIT 2000 Accounts Payable v_total

v_total is already computed in the existing function.
p_reference_type: 'grn'
p_reference_id: v_grn_id (already available)

IMPORTANT: The function must also accept 'grn' as a
valid p_is_partial workflow — the journal entry posts
for BOTH full and partial GRNs. Each GRN posts for
the value of items actually received in that GRN.
Multiple GRNs on a partially received PO will post
multiple journal entries — this is correct.

### Fix complete_sale() — payment routing + discount

Change debit line from hardcoded 1000 to:
```sql
v_debit_account := CASE
  WHEN p_payment_type = 'cash'          THEN '1000'
  WHEN p_payment_type = 'bank_transfer' THEN '1001'
  WHEN p_payment_type = 'cheque'        THEN '1001'
  WHEN p_payment_type = 'credit'        THEN '1100'
  ELSE '1000'
END;
```

Change discount handling:
```sql
-- BEFORE (nets discount against revenue):
CREDIT 4000  (subtotal - p_discount_amt)

-- AFTER (separate discount account):
CREDIT 4000  subtotal
DEBIT  4900  p_discount_amt  (only if p_discount_amt > 0)
```

### Fix recordExpense() — payment routing

In app/actions/expenses.ts, change the credit line:
```typescript
// BEFORE:
{ account_code: '1000', direction: 'credit', ... }

// AFTER:
const creditAccount =
  payment_method === 'bank_transfer' ? '1001' :
  payment_method === 'cheque'        ? '1001' : '1000'
{ account_code: creditAccount, direction: 'credit', ... }
```

### Fix recordSupplierPayment() — payment routing

Same pattern as recordExpense():
```typescript
const creditAccount =
  payment_method === 'bank_transfer' ? '1001' :
  payment_method === 'cheque'        ? '1001' : '1000'
```

### Fix recordCustomerPayment() — payment routing + atomicity

Payment routing:
```typescript
const debitAccount =
  payment_method === 'bank_transfer' ? '1001' :
  payment_method === 'cheque'        ? '1001' : '1000'
```

Atomicity: Wrap journal entry + credit_balance update
in a Postgres RPC (record_customer_payment) so both
succeed or fail together. Server action calls the RPC
instead of doing two separate operations.

### Fix process_return() — payment routing

Look up original sale payment_type:
```sql
SELECT payment_type INTO v_original_payment_type
FROM sales WHERE id = p_original_sale_id;
```

Then route the cash/bank credit:
```sql
v_cash_account := CASE
  WHEN v_original_payment_type = 'bank_transfer' THEN '1001'
  WHEN v_original_payment_type = 'cheque'        THEN '1001'
  ELSE '1000'
END;
```

For credit sales returns: no cash out — instead reduce
the receivable:
```sql
WHEN v_original_payment_type = 'credit':
  DEBIT 1100 Accounts Receivable (reduce what customer owes)
  -- no cash movement
```

---

## Implementation Sessions

### Session A — Migration 032 (DB changes only)
1. Add account 4900 Sales Discount
2. Rename account 1001 to Bank Account
3. Recreate complete_grn() with journal entry
4. Recreate complete_sale() with payment routing + discount
5. Recreate process_return() with payment routing
6. Verification SQL

### Session B — Server action fixes (no migrations)
1. recordExpense() — payment routing
2. recordSupplierPayment() — payment routing
3. recordCustomerPayment() — payment routing + RPC atomicity
4. Full test suite

### Session C — Opening balances UI (no migration)
1. /superadmin/opening-balances page
2. Server action: postOpeningBalances()
3. Uses existing 'opening_balance' reference_type

---

## What Does NOT Change

- journal_lines immutability trigger (keep)
- Historical journal entries (immutable by design)
- get_financial_summary, get_pl_statement, get_cash_book,
  get_account_balances, get_cash_flow (all correct)
- post_journal_entry() RPC (correct, no changes)
- Borrowing accounting (verified correct)
- Expense void flow (correct)

---

## Spec Version
Created: 2026-06-28
Migration: 032 (follows 031 Phase 12A)
Sessions: 13A (migration) → 13B (server actions) → 13C (UI)