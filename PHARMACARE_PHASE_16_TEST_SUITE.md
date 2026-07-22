# PharmaCare — Phase 16: Comprehensive Test Suite

## Overview

Complete test coverage for business-critical logic that currently has
zero automated tests. The existing 231 tests (148 route-access + 54
RLS + 29 functional-flows) verify access control only — they do not
test whether sales produce correct journal entries, inventory deducts
correctly, returns reverse properly, or reports compute accurately.

This phase adds tests in 6 categories across 4 test files.
No code changes, no migrations, no UI changes — tests only.

---

## Test Infrastructure

### Framework
Jest (existing — do NOT switch to Vitest)

### Test files to create
```
tests/accounting.test.ts          — Tier 1 + 2: Journal entries, RPCs
tests/inventory.test.ts           — Tier 3: Stock batches, FEFO, deductions
tests/business-rules.test.ts      — Tier 4: POS rules, returns, procurement
tests/smoke.test.ts               — Tier 5: Critical path end-to-end flows
```

### Existing test files (keep unchanged)
```
tests/route-access.test.ts        — 148 tests (do not modify)
tests/rls-policies.test.ts        — 54 tests (do not modify)
tests/functional-flows.test.ts    — 29 tests (do not modify)
```

### Test database approach

All new tests call Supabase RPCs and server-side functions directly
against the development database. They do NOT test through the UI.
Each test file:

1. Uses a dedicated Supabase service-role client for setup/teardown
2. Creates test data at the start of each describe block
3. Cleans up test data after each describe block
4. Never modifies existing data — only creates and removes its own

```typescript
// tests/helpers/test-client.ts
import { createClient } from '@supabase/supabase-js'

export const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const TEST_PREFIX = '__test_16_'

// Helper: create a test medicine + batch for sale tests
export async function createTestMedicine(overrides?: Partial<Medicine>) { ... }

// Helper: create a test supplier
export async function createTestSupplier(overrides?: Partial<Supplier>) { ... }

// Helper: create a test customer with credit
export async function createTestCustomer(overrides?: Partial<Customer>) { ... }

// Helper: cleanup all test data created with TEST_PREFIX
export async function cleanupTestData() { ... }

// Helper: get journal lines for a reference
export async function getJournalLines(referenceType: string, referenceId: string) { ... }

// Helper: get account balance from journal_lines
export async function getAccountBalance(accountCode: string) { ... }
```

### Environment setup
```
# .env.test (create if not exists)
NEXT_PUBLIC_SUPABASE_URL=<dev project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev anon key>
SUPABASE_SERVICE_ROLE_KEY=<dev service role key>
```

The service role key is needed for test setup/teardown only
(creating test users, bypassing RLS for cleanup). Test assertions
use the anon client with proper auth where role matters.

---

## Test File 1: tests/accounting.test.ts

### Purpose
Verify every function that creates journal entries produces the
correct double-entry accounting output. This is the most critical
test file — if these fail, the books are wrong.

---

### 1.1 complete_sale() Journal Entries

```
describe('complete_sale() accounting', () => {

  describe('cash sale with no discount', () => {
    // Setup: create medicine with stock batch, create sale via RPC
    // Assert:
    it('creates a journal entry with reference_type = sale')
    it('debits 1000 Cash for the sale total')
    it('credits 4000 Revenue for the gross subtotal')
    it('credits 5000 COGS for the cost amount')
    it('debits 1200 Inventory for the cost amount')
    it('does NOT create a 4900 Sales Discount line')
    it('journal entry balances (total debits = total credits)')
    it('journal entry status is posted')
    it('journal entry reference_id matches the sale ID')
  })

  describe('cash sale with discount', () => {
    // Setup: create sale with p_discount_amt > 0
    // Assert:
    it('credits 4000 Revenue for the GROSS subtotal (not net)')
    it('debits 4900 Sales Discount for the discount amount')
    it('debits 1000 Cash for (subtotal - discount)')
    it('the net effect: 4000 - 4900 = net revenue')
    it('journal entry balances')
  })

  describe('bank transfer sale', () => {
    // Setup: create sale with payment_type = 'bank_transfer'
    // Assert:
    it('debits 1001 Bank Account (NOT 1000 Cash)')
    it('does NOT debit 1000 Cash')
    it('journal entry balances')
  })

  describe('cheque sale', () => {
    it('debits 1001 Bank Account (same as bank_transfer)')
    it('journal entry balances')
  })

  describe('credit sale', () => {
    // Setup: create sale with payment_type = 'credit'
    // Assert:
    it('debits 1100 Accounts Receivable (NOT 1000 Cash)')
    it('1100 line carries party_type = customer')
    it('1100 line carries party_id = customer UUID')
    it('does NOT debit 1000 Cash')
    it('journal entry balances')
  })

  describe('zero-amount sale', () => {
    // Edge case: 100% discount, total = 0
    it('still creates a journal entry')
    // OR: it('does NOT create a journal entry')
    // Determine which behaviour is correct and test for it
  })

  describe('sale with service fee', () => {
    // If service fee exists in the sale
    it('service fee is included in the total debited to cash/bank')
    it('journal entry balances')
  })

})
```

---

### 1.2 complete_grn() Journal Entries

```
describe('complete_grn() accounting', () => {

  describe('full GRN (all items received)', () => {
    // Setup: create PO with 2 items, complete GRN for all
    // Assert:
    it('creates a journal entry with reference_type = grn')
    it('debits 1200 Inventory for the total GRN value')
    it('credits 2000 Accounts Payable for the total GRN value')
    it('2000 line carries party_type = supplier')
    it('2000 line carries party_id = supplier UUID')
    it('journal entry reference_id matches the GRN ID')
    it('journal entry balances')
    it('GRN value = SUM(qty_received × unit_price) across all items')
  })

  describe('partial GRN (some items received)', () => {
    // Setup: PO with 3 items, GRN receives only 2
    // Assert:
    it('creates a journal entry')
    it('GRN value includes ONLY received items, not pending items')
    it('debits 1200 for the partial amount')
    it('credits 2000 for the partial amount')
    it('journal entry balances')
  })

  describe('multiple GRNs on same PO', () => {
    // Setup: PO with 3 items, first GRN receives 1, second GRN receives 2
    // Assert:
    it('each GRN creates a separate journal entry')
    it('sum of all GRN journal values = total PO value')
    it('both journal entries balance independently')
  })

  describe('zero-value GRN', () => {
    // Edge case: items with unit_price = 0
    it('does NOT create a journal entry when v_total = 0')
  })

})
```

---

### 1.3 process_return() Journal Entries

```
describe('process_return() accounting', () => {

  describe('full return on cash sale', () => {
    // Setup: complete a cash sale, then return all items
    // Assert:
    it('creates a journal entry with reference_type = sale_return')
    it('debits 4000 Revenue (reverse the original credit)')
    it('credits 1000 Cash (money going back to customer)')
    it('debits 5000 COGS reversal (if applicable)')
    it('credits 1200 Inventory reversal (stock back in)')
    it('journal entry balances')
  })

  describe('full return on bank_transfer sale', () => {
    it('credits 1001 Bank Account (NOT 1000 Cash)')
    it('journal entry balances')
  })

  describe('full return on credit sale', () => {
    it('credits 1100 Accounts Receivable (reduce what customer owes)')
    it('does NOT credit 1000 Cash (no cash movement)')
    it('journal entry balances')
  })

  describe('partial return (some items)', () => {
    // Setup: sale with 3 items, return 1 item
    it('return journal value reflects only returned items')
    it('journal entry balances')
  })

  describe('exchange (return + new item, upgrade)', () => {
    // Setup: return cheaper item, take more expensive item
    // v_net < 0 means customer pays more
    it('cash sale exchange: debits 1000 Cash (customer pays difference)')
    it('credit sale exchange: debits 1100 AR (customer owes more)')
    it('journal entry balances')
  })

  describe('return on sale with discount', () => {
    // The original sale had a discount — does the return
    // correctly reverse the proportional discount?
    it('reverses the proportional discount amount')
    it('journal entry balances')
  })

})
```

---

### 1.4 post_journal_entry() RPC Validation

```
describe('post_journal_entry() enforcement', () => {

  it('rejects an entry where debits ≠ credits', async () => {
    // Pass mismatched lines: debit 1000 for 500, credit 4000 for 400
    // Expect: RAISE EXCEPTION
  })

  it('accepts an entry where debits = credits exactly', async () => {
    // Pass balanced lines
    // Expect: success, entry created with status = posted
  })

  it('creates journal_lines that are immutable', async () => {
    // Create a posted entry, then attempt UPDATE on journal_lines
    // Expect: trigger blocks the UPDATE
  })

  it('creates journal_lines that cannot be deleted', async () => {
    // Attempt DELETE on journal_lines
    // Expect: trigger blocks the DELETE
  })

  it('prevents mutation of posted journal entry fields', async () => {
    // Attempt UPDATE on entry_date or description of a posted entry
    // Expect: trigger blocks the UPDATE
  })

  it('allows status change from posted to reversed', async () => {
    // UPDATE status = 'reversed', reversed_by = user_id
    // Expect: success
  })

  it('assigns sequential entry numbers', async () => {
    // Create 3 entries, verify entry_number increments
  })

})
```

---

### 1.5 recordExpense() Accounting

```
describe('recordExpense() accounting', () => {

  describe('cash expense', () => {
    it('debits the selected 6xxx expense account')
    it('credits 1000 Cash')
    it('journal entry balances')
    it('journal entry reference_type = expense')
  })

  describe('bank_transfer expense', () => {
    it('credits 1001 Bank Account (NOT 1000 Cash)')
    it('journal entry balances')
  })

  describe('cheque expense', () => {
    it('credits 1001 Bank Account')
    it('journal entry balances')
  })

  describe('expense void', () => {
    // Void an existing expense
    it('creates a reversal journal entry')
    it('reversal debits 1000/1001 (opposite of original)')
    it('reversal credits 6xxx (opposite of original)')
    it('original entry status changed to reversed')
    it('reversal journal entry balances')
  })

})
```

---

### 1.6 recordSupplierPayment() Accounting

```
describe('recordSupplierPayment() accounting', () => {

  describe('cash payment to supplier', () => {
    it('debits 2000 Accounts Payable')
    it('credits 1000 Cash')
    it('2000 line carries party_type = supplier, party_id = supplier UUID')
    it('journal entry reference_type = supplier_payment')
    it('journal entry reference_id = payment row ID (Gap 6 fixed)')
    it('supplier_payments.journal_entry_id is set (Gap 6)')
    it('journal entry balances')
  })

  describe('bank_transfer payment to supplier', () => {
    it('credits 1001 Bank Account (NOT 1000 Cash)')
    it('journal entry balances')
  })

  describe('cheque payment to supplier', () => {
    it('credits 1001 Bank Account')
    it('journal entry balances')
  })

})
```

---

### 1.7 recordCustomerPayment() Accounting (Atomic RPC)

```
describe('recordCustomerPayment() accounting', () => {

  describe('cash payment from customer', () => {
    it('debits 1000 Cash')
    it('credits 1100 Accounts Receivable')
    it('1100 line carries party_type = customer, party_id = customer UUID')
    it('journal entry reference_type = customer_payment')
    it('journal entry reference_id = payment row ID (Gap 6)')
    it('customer credit_balance is reduced by payment amount')
    it('journal entry balances')
  })

  describe('bank_transfer payment from customer', () => {
    it('debits 1001 Bank Account (NOT 1000 Cash)')
    it('journal entry balances')
  })

  describe('atomicity (Gap 5)', () => {
    // This tests the record_customer_payment RPC
    it('journal entry AND credit_balance update happen together')
    it('if payment amount exceeds credit_balance, RPC rejects')
    // Or: it('allows overpayment and sets credit_balance negative')
    // Determine which is the actual behaviour and test for it
  })

})
```

---

### 1.8 Borrowing Accounting

```
describe('borrowing accounting', () => {

  describe('borrow_in (we receive stock from another pharmacy)', () => {
    it('debits 1200 Inventory')
    it('credits 2010 Borrowing Payable')
    it('journal entry reference_type = borrowing_in')
    it('journal entry balances')
  })

  describe('borrow_out (we lend stock to another pharmacy)', () => {
    it('debits 1110 Borrowing Receivable')
    it('credits 1200 Inventory')
    it('journal entry reference_type = borrowing_out')
    it('journal entry balances')
  })

})
```

---

## Test File 2: tests/inventory.test.ts

### Purpose
Verify stock batch creation, deduction, FEFO ordering, and
restoration on returns. These tests ensure the physical stock
records match what was sold, received, and returned.

---

### 2.1 Stock Batch Creation (GRN)

```
describe('GRN stock batch creation', () => {

  it('creates a stock_batch row for each received line item', async () => {
    // Complete a GRN, verify stock_batches table has new rows
  })

  it('sets batch_number from the GRN input')

  it('sets expiry_date from the GRN input')

  it('sets quantity to the received quantity')

  it('sets purchase_price from the PO unit_price')

  it('links stock_batch.medicine_id to the correct medicine')

  it('links stock_batch.supplier_id to the PO supplier')

  describe('partial GRN', () => {
    it('creates batches only for received items, not pending items')
    it('second GRN creates additional batches for remaining items')
  })

})
```

---

### 2.2 FEFO Stock Deduction (Sale)

```
describe('FEFO stock deduction on sale', () => {

  // Setup: medicine with 3 batches, different expiry dates
  // Batch A: expires 2026-08-01, qty 10
  // Batch B: expires 2026-09-01, qty 20
  // Batch C: expires 2026-10-01, qty 30

  it('deducts from the earliest-expiring batch first', async () => {
    // Sell 5 units
    // Assert: Batch A qty reduced from 10 to 5
    // Assert: Batch B and C unchanged
  })

  it('spans multiple batches when earliest is insufficient', async () => {
    // Sell 15 units (Batch A has only 10)
    // Assert: Batch A qty = 0
    // Assert: Batch B qty reduced from 20 to 15
    // Assert: Batch C unchanged
  })

  it('skips expired batches in FEFO ordering', async () => {
    // Batch A expiry in the past
    // Sell 5 units
    // Assert: Batch A untouched (expired)
    // Assert: Batch B qty reduced (first non-expired)
  })

  it('prevents sale when insufficient total stock', async () => {
    // Try to sell 100 units when total available is 60
    // Expect: error / rejection
  })

  it('records which batch each sale_item came from', async () => {
    // Verify sale_items.batch_id or equivalent FK is set
  })

  it('deducts correct quantity per sale_item', async () => {
    // Sale with 2 items of same medicine, different quantities
    // Verify total deduction = sum of quantities
  })

})
```

---

### 2.3 Stock Restoration on Return

```
describe('stock restoration on return', () => {

  it('restores quantity to the original batch', async () => {
    // Complete a sale (deducts stock), then return
    // Assert: batch quantity back to pre-sale level
  })

  it('restores to correct batch when sale spanned multiple batches', async () => {
    // Sale used 10 from Batch A + 5 from Batch B
    // Return all 15
    // Assert: Batch A += 10, Batch B += 5
  })

  it('partial return restores only the returned quantity', async () => {
    // Sale of 10, return 3
    // Assert: batch qty increases by 3, not 10
  })

  it('exchange return restores original items and deducts new items', async () => {
    // Return item A, take item B
    // Assert: A batch qty restored
    // Assert: B batch qty deducted
  })

})
```

---

### 2.4 Stock Adjustment

```
describe('stock adjustment', () => {

  it('increases batch quantity on positive adjustment')
  it('decreases batch quantity on negative adjustment')
  it('creates an audit log entry with reason')
  it('does not allow adjustment below zero')
  it('records the adjusting user')

})
```

---

### 2.5 Expiry Write-off

```
describe('expiry write-off', () => {

  it('sets batch quantity to zero')
  it('creates an audit log entry with reason')
  it('written-off batch no longer appears in POS search results')
  it('written-off batch still appears in stock history / reports')

})
```

---

## Test File 3: tests/business-rules.test.ts

### Purpose
Verify business rules that protect data integrity, enforce
compliance, and prevent invalid operations.

---

### 3.1 POS Business Rules

```
describe('POS business rules', () => {

  describe('MRP enforcement', () => {
    it('sale cannot complete if any item price exceeds MRP')
    // complete_sale() should reject or the UI should block
    // Test at the RPC level
  })

  describe('shift requirement', () => {
    it('sale cannot complete without an open shift')
    // complete_sale() should check for active shift
  })

  describe('discount limits', () => {
    it('pharmacist discount cannot exceed configured max %')
    it('special discount tiers are enforced per user tier')
    // profiles.special_discount_max_tier limits which tiers
    // a pharmacist can apply
  })

})
```

---

### 3.2 Purchase Order Workflow

```
describe('PO status transitions', () => {

  it('draft → confirmed/approved is allowed')
  it('confirmed → partially_received is allowed (via GRN)')
  it('partially_received → received is allowed (via complete GRN)')
  it('confirmed → cancelled is allowed')
  it('received → draft is NOT allowed (read-only)')
  it('cancelled → any status is NOT allowed (read-only)')

  describe('PO approval threshold', () => {
    it('PO below threshold auto-approves')
    it('PO above threshold requires manual approval')
    // Check the po_approval_threshold setting
  })

})
```

---

### 3.3 Return Policy Rules

```
describe('return policy rules', () => {

  it('controlled medicine returns are blocked')
  it('return window enforced (configurable days)')
  it('return requires matching original sale')
  it('cannot return more qty than originally sold')
  it('cannot return already-returned items (no double return)')

  describe('return approval workflow', () => {
    it('initiation creates return with status pending')
    it('approval changes status and processes the return')
    it('denial changes status without processing')
  })

})
```

---

### 3.4 Soft Delete Rules

```
describe('soft delete enforcement', () => {

  it('deleting a medicine sets is_deleted=true, not hard delete')
  it('deleted medicine does not appear in POS search')
  it('deleted medicine still appears in historical sales')
  it('deleted supplier does not appear in PO creation dropdown')

})
```

---

### 3.5 Audit Log Integrity

```
describe('audit log integrity', () => {

  it('audit_logs cannot be updated (RLS blocks UPDATE)')
  it('audit_logs cannot be deleted (RLS blocks DELETE)')
  it('sale creation produces an audit log entry')
  it('stock adjustment produces an audit log entry')
  it('user creation produces an audit log entry')
  it('permission change produces an audit log entry')

})
```

---

### 3.6 Journal Entry Immutability

```
describe('journal entry immutability', () => {

  it('journal_lines UPDATE is blocked by trigger')
  it('journal_lines DELETE is blocked by trigger')
  it('posted journal_entry fields cannot be changed')
  it('only status → reversed is allowed on posted entries')
  it('reversed entries cannot be re-posted')

})
```

---

### 3.7 Opening Balances

```
describe('opening balances', () => {

  it('postOpeningBalances creates a balanced journal entry')
  it('reference_type is opening_balance')
  it('duplicate opening balance is rejected')
  // The Phase 13C spec says there's a duplicate guard
  it('only superadmin can post opening balances')

})
```

---

## Test File 4: tests/smoke.test.ts

### Purpose
End-to-end critical path tests that verify the most important
user workflows produce correct results across all layers
(database, server actions, business rules). These are the
"if ANYTHING works, these must work" tests.

---

### 4.1 Complete Sale → Journal → Stock

```
describe('SMOKE: Complete sale flow', () => {

  it('creates sale + sale_items + journal_entry + deducts stock', async () => {
    // 1. Create test medicine with stock (batch qty = 100)
    // 2. Call complete_sale() for 5 units at Rs 50
    // 3. Assert: sale row created
    // 4. Assert: sale_items row created with correct qty
    // 5. Assert: journal_entry created with status posted
    // 6. Assert: journal_lines: DEBIT 1000 = 250, CREDIT 4000 = 250
    // 7. Assert: journal_lines: DEBIT 5xxx COGS, CREDIT 1200 Inventory
    // 8. Assert: stock_batch qty = 95
    // 9. Assert: SUM(debits) = SUM(credits)
  })

})
```

---

### 4.2 GRN → Journal → Stock

```
describe('SMOKE: GRN flow', () => {

  it('creates GRN + stock_batches + journal_entry', async () => {
    // 1. Create test supplier + PO with 2 items
    // 2. Approve PO
    // 3. Call complete_grn() for all items
    // 4. Assert: grn row created
    // 5. Assert: stock_batches created (one per item)
    // 6. Assert: journal_entry created
    // 7. Assert: DEBIT 1200 = total GRN value
    // 8. Assert: CREDIT 2000 = total GRN value
    // 9. Assert: 2000 line has party_type = supplier
  })

})
```

---

### 4.3 Return → Journal → Stock Restore

```
describe('SMOKE: Return flow', () => {

  it('returns items, reverses journal, restores stock', async () => {
    // 1. Complete a cash sale (5 units, stock goes from 100 to 95)
    // 2. Initiate return for 3 units
    // 3. Approve return
    // 4. Assert: return row created
    // 5. Assert: reversal journal entry created
    // 6. Assert: stock_batch qty = 98 (95 + 3 returned)
    // 7. Assert: reversal journal balances
  })

})
```

---

### 4.4 Supplier Payment → Journal → Ledger

```
describe('SMOKE: Supplier payment flow', () => {

  it('records payment, creates journal, appears in ledger', async () => {
    // 1. Create supplier + GRN (creates AP balance)
    // 2. Record supplier payment
    // 3. Assert: supplier_payments row created
    // 4. Assert: journal entry: DEBIT 2000 AP, CREDIT 1000 Cash
    // 5. Assert: supplier ledger shows both GRN and payment
    // 6. Assert: net balance = GRN value - payment amount
  })

})
```

---

### 4.5 Customer Credit → Sale → Payment → Ledger

```
describe('SMOKE: Customer credit flow', () => {

  it('credit sale + payment correctly tracks udhaar', async () => {
    // 1. Create test customer with credit
    // 2. Complete credit sale (debits 1100 AR)
    // 3. Assert: customer credit_balance increased
    // 4. Record customer payment
    // 5. Assert: customer credit_balance decreased
    // 6. Assert: journal entries for both sale and payment
    // 7. Assert: customer ledger shows both transactions
    // 8. Assert: net balance = sale amount - payment amount
  })

})
```

---

### 4.6 Expense → Void → Journal

```
describe('SMOKE: Expense void flow', () => {

  it('records expense, voids it, both journal entries correct', async () => {
    // 1. Record a cash expense of Rs 500
    // 2. Assert: journal entry DEBIT 6xxx, CREDIT 1000
    // 3. Void the expense
    // 4. Assert: reversal journal entry DEBIT 1000, CREDIT 6xxx
    // 5. Assert: original entry status = reversed
    // 6. Assert: net effect on 1000 Cash = zero
  })

})
```

---

## Test File 5: tests/reports.test.ts

### Purpose
Verify that report functions compute correct aggregates from
journal entries and return accurate financial data.

---

### 5.1 Financial Summary

```
describe('get_financial_summary()', () => {

  it('excludes reversed journal entries from totals')
  it('correctly calculates revenue from 4000 account')
  it('correctly calculates COGS from 5000 account')
  it('correctly calculates expenses from 6xxx accounts')
  it('gross profit = revenue - COGS')
  it('net profit = gross profit - expenses')

})
```

---

### 5.2 Balance Sheet

```
describe('get_balance_sheet()', () => {

  it('Assets = Liabilities + Equity (accounting equation)')
  it('NET profit row = revenue - COGS - expenses for fiscal YTD')
  it('excludes reversed entries')
  it('only includes accounts with non-zero balances')
  it('as_of_date parameter correctly limits entries')

})
```

---

### 5.3 Trial Balance

```
describe('get_trial_balance()', () => {

  it('total debits = total credits (must always balance)')
  it('includes all 27 accounts (zero-activity shown as zeros)')
  it('date range filters entries correctly')
  it('has_activity flag correctly identifies active accounts')

})
```

---

### 5.4 Cash Book

```
describe('get_cash_book()', () => {

  it('running balance is computed correctly (opening + ins - outs)')
  it('opening balance is correct for the queried date')
  it('includes all cash account (1000) movements')
  it('sales show as inflows, expenses as outflows')

})
```

---

### 5.5 Party Ledger (Supplier + Customer)

```
describe('get_party_ledger()', () => {

  it('returns transactions for the specified party only')
  it('date range filter works correctly')
  it('GRNs appear as credits for supplier')
  it('payments appear as debits for supplier')
  it('running balance computes correctly')

  describe('customer party ledger', () => {
    it('credit sales appear as debits (customer owes)')
    it('payments appear as credits (customer paid)')
  })

})
```

---

## Implementation Notes

### Test Data Isolation

Every test creates its own data and cleans it up. Use unique
identifiers with the TEST_PREFIX to avoid collisions with
existing data. Example:

```typescript
const testMedicine = await createTestMedicine({
  name: `${TEST_PREFIX}Panadol_${Date.now()}`,
  generic_name: `${TEST_PREFIX}Paracetamol`,
})
```

Cleanup in afterAll:
```typescript
afterAll(async () => {
  // Delete test journal_entries (cascade deletes journal_lines)
  // Delete test sales, sale_items
  // Delete test stock_batches
  // Delete test medicines
  // Delete test suppliers, customers
  // Use service role client to bypass RLS
})
```

### What to do when a test reveals a bug

STOP. Do not proceed to the next test group. Document the bug:
- What the test expected
- What actually happened
- Which function/RPC is wrong
- Whether it affects existing data

Report the bug before fixing it. Some bugs may require a
migration (e.g. if an RPC is computing wrong values). Others
may be server action logic errors fixable without a migration.

### Test execution order

Run in this order. Each depends on the prior group passing:

```bash
# 1. Existing tests (sanity check — should still be 231/231)
npx jest tests/route-access.test.ts
npx jest tests/rls-policies.test.ts
npx jest tests/functional-flows.test.ts

# 2. New accounting tests (most critical)
npx jest tests/accounting.test.ts

# 3. Inventory tests
npx jest tests/inventory.test.ts

# 4. Business rules
npx jest tests/business-rules.test.ts

# 5. Report function tests
npx jest tests/reports.test.ts

# 6. Smoke tests (integration — runs after unit tests pass)
npx jest tests/smoke.test.ts

# Full suite
npx jest
```

---

## Expected Test Count After Phase 16

```
tests/route-access.test.ts       — 148 (unchanged)
tests/rls-policies.test.ts       —  54 (unchanged)
tests/functional-flows.test.ts   —  29 (unchanged)
tests/accounting.test.ts         — ~65 tests
tests/inventory.test.ts          — ~25 tests
tests/business-rules.test.ts     — ~30 tests
tests/reports.test.ts            — ~20 tests
tests/smoke.test.ts              — ~12 tests

Total: ~383 tests
```

The exact count will depend on edge cases discovered during
implementation. The numbers above are minimums — more tests
are better. But every test listed in this spec MUST exist.

---

## Definition of Done

- [ ] All existing 231 tests still pass (no regressions)
- [ ] tests/accounting.test.ts: all pass
- [ ] tests/inventory.test.ts: all pass
- [ ] tests/business-rules.test.ts: all pass
- [ ] tests/reports.test.ts: all pass
- [ ] tests/smoke.test.ts: all pass
- [ ] Any bugs discovered during testing are documented
- [ ] Bug list reviewed and prioritized before fixing
- [ ] CLAUDE.md updated with new test counts and commands
- [ ] Test helper (tests/helpers/test-client.ts) documented

---

## What This Phase Does NOT Do

- Does not fix bugs (documents them for separate fix sessions)
- Does not change any application code
- Does not add new features
- Does not modify the database or run migrations
- Does not test UI rendering or visual output
- Does not test print output (Phase 15D covers that visually)

---

## Session Structure

### Session 16A — Test Infrastructure + Accounting (Critical)
1. Create tests/helpers/test-client.ts
2. Create tests/accounting.test.ts
3. Implement all complete_sale() tests
4. Implement all complete_grn() tests
5. Implement all process_return() tests
6. Implement post_journal_entry() validation tests
7. Run and report results (pass count + any bugs found)

### Session 16B — Accounting Continued + Inventory
1. Implement recordExpense() tests
2. Implement recordSupplierPayment() tests
3. Implement recordCustomerPayment() tests
4. Implement borrowing accounting tests
5. Create tests/inventory.test.ts
6. Implement all stock batch tests
7. Run and report results

### Session 16C — Business Rules + Reports
1. Create tests/business-rules.test.ts
2. Implement all POS, PO, return, soft-delete, audit tests
3. Create tests/reports.test.ts
4. Implement all report function tests
5. Run and report results

### Session 16D — Smoke Tests + Documentation
1. Create tests/smoke.test.ts
2. Implement all end-to-end flow tests
3. Run full suite (all 8 test files)
4. Document all discovered bugs
5. Update CLAUDE.md with final test counts
6. Final report: total tests, pass rate, bugs found

---

## Spec Version
Created: 2026-07-08
Migration: none (tests only)
Sessions: 16A → 16B → 16C → 16D
Depends on: all existing phases (tests verify their output)