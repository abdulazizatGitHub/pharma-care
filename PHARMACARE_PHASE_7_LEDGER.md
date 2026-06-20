# PHARMACARE — PHASE 7: LEDGER & ACCOUNTING MODULE
> **Version:** 1.0  
> **Architecture:** Double-entry accounting, auto-posting with manual override  
> **Currency:** PKR default, multi-currency ready  
> **Extractable:** Designed as a standalone accounting module, connected via reference IDs  
> **Read ALL previous spec documents before writing any code.**

---

## 0. AGENT INSTRUCTIONS — READ CAREFULLY

This module handles money. There are ZERO acceptable errors in accounting logic.

**Before writing any code:**
1. Read this entire document
2. Understand double-entry accounting principles (Section 1)
3. Review the chart of accounts (Section 2)
4. Understand journal entry auto-posting rules (Section 4)

**Non-negotiable rules for this module:**
- Every journal entry MUST balance: SUM(debits) = SUM(credits)
- Journal entries are IMMUTABLE — no UPDATE or DELETE on journal_lines ever
- Reversals are done by creating a new opposite entry, never editing existing ones
- All monetary amounts stored as NUMERIC(15,4) — four decimal places for currency precision
- Every auto-posted entry includes reference_id and reference_type for traceability
- DB-level constraints enforce the double-entry rule (see migration)
- All accounting operations use Postgres functions for atomicity

---

## 1. DOUBLE-ENTRY ACCOUNTING PRIMER

Every financial transaction affects TWO accounts.
The fundamental equation: **Assets = Liabilities + Equity**

**Account types and their normal balances:**
```
DEBIT-normal accounts (increase with debit):
  Assets        — Cash, Inventory, Accounts Receivable
  Expenses      — Cost of goods, Operating expenses

CREDIT-normal accounts (increase with credit):
  Liabilities   — Accounts Payable, Customer Deposits
  Equity        — Owner's Equity, Retained Earnings
  Revenue       — Sales Revenue
```

**Rules:**
- Debit = left side of the T-account
- Credit = right side of the T-account
- Every transaction: total debits MUST equal total credits
- A "debit" is not inherently good or bad — it depends on the account type

**Pharmacy examples:**
```
Cash sale of Rs 100:
  DEBIT  Cash (Asset ↑)              Rs 100
  CREDIT Sales Revenue (Revenue ↑)   Rs 100

Credit sale of Rs 100 (udhaar):
  DEBIT  Accounts Receivable (Asset ↑) Rs 100
  CREDIT Sales Revenue (Revenue ↑)     Rs 100

Customer pays Rs 100 udhaar:
  DEBIT  Cash (Asset ↑)                Rs 100
  CREDIT Accounts Receivable (Asset ↓) Rs 100

Receive stock from supplier (GRN), owe Rs 500:
  DEBIT  Inventory (Asset ↑)           Rs 500
  CREDIT Accounts Payable (Liability ↑) Rs 500

Pay supplier Rs 500:
  DEBIT  Accounts Payable (Liability ↓) Rs 500
  CREDIT Cash (Asset ↓)                 Rs 500

Record expense Rs 200:
  DEBIT  Operating Expense (Expense ↑) Rs 200
  CREDIT Cash (Asset ↓)                Rs 200
```

---

## 2. CHART OF ACCOUNTS

The chart of accounts is the backbone of the ledger.
Account numbers follow a standard numbering convention:

```
1xxx — Assets
2xxx — Liabilities  
3xxx — Equity
4xxx — Revenue
5xxx — Cost of Goods Sold
6xxx — Operating Expenses
```

### Pre-seeded accounts (migration 012):

```sql
-- ASSETS (1xxx)
1000  Cash                          -- Physical cash in pharmacy
1001  Cash in Hand                  -- Petty cash / till
1100  Accounts Receivable           -- What customers owe us (udhaar)
1110  Borrowing Receivable          -- What other pharmacies owe us
1200  Inventory                     -- Medicine stock value
1300  Prepaid Expenses              -- Advance payments

-- LIABILITIES (2xxx)  
2000  Accounts Payable              -- What we owe suppliers
2010  Borrowing Payable             -- What we owe other pharmacies
2100  Customer Deposits             -- Advance from customers

-- EQUITY (3xxx)
3000  Owner Equity                  -- Capital invested
3100  Retained Earnings             -- Accumulated profit

-- REVENUE (4xxx)
4000  Sales Revenue                 -- Medicine sales
4010  Other Revenue                 -- Miscellaneous income

-- COST OF GOODS SOLD (5xxx)
5000  Cost of Goods Sold            -- Purchase cost of sold medicines

-- OPERATING EXPENSES (6xxx)
6000  Operating Expenses            -- General operating costs
6001  Electricity                   -- Utility expenses
6002  Rent                          -- Premises rent
6003  Salaries                      -- Staff salaries
6004  Fuel & Transport              -- Vehicle/delivery costs
6005  Maintenance & Repairs         -- Equipment/premises repairs
6006  Internet & Communication      -- Phone/internet bills
6007  Printing & Stationery         -- Office supplies
6008  Other Expenses                -- Catch-all
```

### Account structure:

```sql
CREATE TABLE accounts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,     -- '1000', '4000' etc.
  name         TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'asset', 'liability', 'equity', 'revenue', 
      'cogs', 'expense'
    )
  ),
  normal_balance TEXT NOT NULL CHECK (
    normal_balance IN ('debit', 'credit')
  ),
  -- asset/cogs/expense = debit normal
  -- liability/equity/revenue = credit normal
  parent_code  TEXT REFERENCES accounts(code), -- for hierarchy
  is_system    BOOLEAN DEFAULT FALSE,  -- system accounts cannot be deleted
  is_active    BOOLEAN DEFAULT TRUE,
  description  TEXT,
  currency     TEXT DEFAULT 'PKR',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   UUID REFERENCES profiles(id),
  is_deleted   BOOLEAN DEFAULT FALSE,
  deleted_at   TIMESTAMPTZ
);
```

---

## 3. JOURNAL ENTRIES (THE IMMUTABLE LEDGER)

### 3.1 journal_entries table

```sql
CREATE TABLE journal_entries (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_no       TEXT NOT NULL UNIQUE,   -- JE-YYYYMMDD-XXXX
  entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description    TEXT NOT NULL,
  
  -- Source reference (what business event caused this)
  reference_type TEXT CHECK (reference_type IN (
    'sale', 'sale_return', 'purchase_order', 'grn',
    'supplier_payment', 'customer_payment',
    'borrowing_out', 'borrowing_in', 
    'borrowing_payment', 'expense', 
    'manual', 'opening_balance', 'adjustment'
  )),
  reference_id   UUID,    -- FK to the source record (sale_id, grn_id, etc.)
  
  -- Status
  status         TEXT NOT NULL DEFAULT 'posted' CHECK (
    status IN ('draft', 'posted', 'reversed')
  ),
  reversed_by    UUID REFERENCES journal_entries(id),
  reversal_of    UUID REFERENCES journal_entries(id),
  
  -- Currency
  currency       TEXT NOT NULL DEFAULT 'PKR',
  exchange_rate  NUMERIC(15,6) DEFAULT 1.000000,
  -- exchange_rate: how many PKR = 1 unit of currency
  -- PKR transactions always have exchange_rate = 1
  
  -- Audit
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  
  -- NO updated_at — entries are immutable
  -- NO is_deleted — entries cannot be deleted
  CONSTRAINT no_self_reversal CHECK (
    reversed_by IS DISTINCT FROM id
  )
);

CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
```

### 3.2 journal_lines table

```sql
CREATE TABLE journal_lines (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id     UUID NOT NULL REFERENCES journal_entries(id),
  account_id   UUID NOT NULL REFERENCES accounts(id),
  
  -- Amount in transaction currency
  amount       NUMERIC(15,4) NOT NULL CHECK (amount > 0),
  direction    TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  
  -- Amount in PKR (for reporting)
  amount_pkr   NUMERIC(15,4) NOT NULL CHECK (amount_pkr > 0),
  
  -- Optional: link to a specific party
  party_type   TEXT CHECK (party_type IN (
    'supplier', 'customer', 'pharmacy', NULL
  )),
  party_id     UUID,  -- supplier_id, customer_id, or borrowing_pharmacy_id
  
  description  TEXT,  -- line-level description
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
  -- NO updates, NO deletes — immutable
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_journal_lines_party ON journal_lines(party_type, party_id);
```

### 3.3 The balance constraint (enforced in Postgres)

```sql
-- Function to verify a journal entry balances
CREATE OR REPLACE FUNCTION verify_journal_balance(p_entry_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_debit_total  NUMERIC(15,4);
  v_credit_total NUMERIC(15,4);
BEGIN
  SELECT 
    SUM(CASE WHEN direction = 'debit' THEN amount_pkr ELSE 0 END),
    SUM(CASE WHEN direction = 'credit' THEN amount_pkr ELSE 0 END)
  INTO v_debit_total, v_credit_total
  FROM journal_lines
  WHERE entry_id = p_entry_id;
  
  -- Allow tiny floating point variance (< 0.0001)
  RETURN ABS(COALESCE(v_debit_total, 0) - COALESCE(v_credit_total, 0)) < 0.0001;
END;
$$ LANGUAGE plpgsql;

-- Trigger: verify balance after any journal_lines insert
CREATE OR REPLACE FUNCTION check_entry_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Only verify if the entry is being marked as posted
  IF (SELECT status FROM journal_entries WHERE id = NEW.entry_id) = 'posted' THEN
    -- Defer check until end of transaction 
    -- (all lines must be inserted before checking)
    -- This is handled by post_journal_entry() RPC below
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. AUTO-POSTING RULES

When business events occur, the system automatically creates journal entries.
These are called "auto-posted" entries — they happen inside Postgres RPC functions.

### 4.1 Auto-posting map

| Business Event | Debit | Credit | Reference |
|---|---|---|---|
| Cash sale completed | Cash (1000) | Sales Revenue (4000) | sale_id |
| Cash sale — COGS | Cost of Goods Sold (5000) | Inventory (1200) | sale_id |
| Credit sale completed | Accounts Receivable (1100) | Sales Revenue (4000) | sale_id |
| Credit sale — COGS | Cost of Goods Sold (5000) | Inventory (1200) | sale_id |
| Customer pays udhaar | Cash (1000) | Accounts Receivable (1100) | payment_id |
| GRN received from supplier | Inventory (1200) | Accounts Payable (2000) | grn_id |
| Supplier payment made | Accounts Payable (2000) | Cash (1000) | payment_id |
| Expense recorded | Expense Account (6xxx) | Cash (1000) | expense_id |
| Borrow medicine out | Borrowing Receivable (1110) | Inventory (1200) | borrow_id |
| Borrow medicine in | Inventory (1200) | Borrowing Payable (2010) | borrow_id |
| Settle borrowing out (receive payment) | Cash (1000) | Borrowing Receivable (1110) | settlement_id |
| Settle borrowing in (make payment) | Borrowing Payable (2010) | Cash (1000) | settlement_id |

### 4.2 COGS calculation

When a sale is completed, we need to record the cost of goods sold.
The COGS amount = SUM(quantity × purchase_price) for all sale items.

This comes from `stock_batches.purchase_price` for each sold batch.

### 4.3 Post journal entry RPC

All journal entry creation goes through one atomic Postgres function:

```sql
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_entry_date     DATE,
  p_description    TEXT,
  p_reference_type TEXT,
  p_reference_id   UUID,
  p_currency       TEXT,
  p_exchange_rate  NUMERIC,
  p_lines          JSONB,
  -- [{account_code, direction, amount, party_type, party_id, description}]
  p_created_by     UUID
)
RETURNS UUID AS $$
DECLARE
  v_entry_id   UUID;
  v_entry_no   TEXT;
  v_line       JSONB;
  v_account_id UUID;
  v_debit_sum  NUMERIC(15,4) := 0;
  v_credit_sum NUMERIC(15,4) := 0;
  v_amount_pkr NUMERIC(15,4);
BEGIN
  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries
          WHERE entry_no LIKE 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-%')::TEXT, 4, '0')
  INTO v_entry_no;

  -- Insert journal entry header
  INSERT INTO journal_entries (
    entry_no, entry_date, description,
    reference_type, reference_id,
    currency, exchange_rate, status, created_by
  ) VALUES (
    v_entry_no, p_entry_date, p_description,
    p_reference_type, p_reference_id,
    p_currency, p_exchange_rate, 'posted', p_created_by
  ) RETURNING id INTO v_entry_id;

  -- Insert journal lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    -- Resolve account_id from code
    SELECT id INTO v_account_id
    FROM accounts
    WHERE code = v_line->>'account_code' AND is_active = TRUE;
    
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Account not found: %', v_line->>'account_code';
    END IF;
    
    v_amount_pkr := (v_line->>'amount')::NUMERIC * p_exchange_rate;
    
    INSERT INTO journal_lines (
      entry_id, account_id, amount, direction,
      amount_pkr, party_type, party_id, description
    ) VALUES (
      v_entry_id,
      v_account_id,
      (v_line->>'amount')::NUMERIC,
      v_line->>'direction',
      v_amount_pkr,
      v_line->>'party_type',
      (v_line->>'party_id')::UUID,
      v_line->>'description'
    );
    
    IF v_line->>'direction' = 'debit' THEN
      v_debit_sum := v_debit_sum + v_amount_pkr;
    ELSE
      v_credit_sum := v_credit_sum + v_amount_pkr;
    END IF;
  END LOOP;

  -- CRITICAL: Verify balance before committing
  IF ABS(v_debit_sum - v_credit_sum) >= 0.0001 THEN
    RAISE EXCEPTION 'Journal entry does not balance. Debits: %, Credits: %',
      v_debit_sum, v_credit_sum;
  END IF;

  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. BORROWING PHARMACY MODULE

Unique to Pakistani pharmacies — neighboring pharmacies borrow medicines from each other.

### 5.1 borrowing_pharmacies table (new)

```sql
CREATE TABLE borrowing_pharmacies (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  address        TEXT,
  notes          TEXT,
  current_balance NUMERIC(15,4) DEFAULT 0,
  -- positive = they owe us, negative = we owe them
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID REFERENCES profiles(id),
  is_active      BOOLEAN DEFAULT TRUE,
  is_deleted     BOOLEAN DEFAULT FALSE,
  deleted_at     TIMESTAMPTZ
);
```

### 5.2 borrowing_transactions table (new)

```sql
CREATE TABLE borrowing_transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id     UUID NOT NULL REFERENCES borrowing_pharmacies(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'borrow_out',    -- we gave medicine to them
    'borrow_in',     -- we received medicine from them
    'payment_out',   -- we paid them (settling our debt)
    'payment_in'     -- they paid us (settling their debt)
  )),
  
  -- For medicine transactions
  medicine_id     UUID REFERENCES medicines(id),
  medicine_name   TEXT,              -- denormalized for history
  quantity        INTEGER,
  unit_price      NUMERIC(15,4),     -- price per unit agreed
  total_amount    NUMERIC(15,4) NOT NULL,
  
  -- For payment transactions
  payment_amount  NUMERIC(15,4),
  payment_notes   TEXT,
  
  -- Journal entry reference
  journal_entry_id UUID REFERENCES journal_entries(id),
  
  notes           TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id),
  is_deleted      BOOLEAN DEFAULT FALSE
);
```

---

## 6. PAYMENT RECORDING

### 6.1 supplier_payments table (new)

```sql
CREATE TABLE supplier_payments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  amount          NUMERIC(15,4) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT DEFAULT 'cash' CHECK (
    payment_method IN ('cash', 'bank_transfer', 'cheque')
  ),
  reference_no    TEXT,   -- cheque no, transfer ref etc.
  notes           TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id)
  -- No soft delete — payments are permanent records
);
```

### 6.2 customer_payments table (new)

```sql
CREATE TABLE customer_payments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  amount          NUMERIC(15,4) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT DEFAULT 'cash',
  notes           TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id)
);
```

---

## 7. INTEGRATION WITH EXISTING MODULES

### 7.1 complete_sale() — update to post journal entry

The existing `complete_sale()` RPC in migration 011 needs to be updated to also call `post_journal_entry()` after the sale is recorded.

**For cash sales:**
```
DEBIT  Cash (1000)              total_amount
CREDIT Sales Revenue (4000)     subtotal + service_fee
DEBIT  Cost of Goods Sold (5000) sum of (qty × purchase_price)
CREDIT Inventory (1200)          sum of (qty × purchase_price)
```

**For credit sales:**
```
DEBIT  Accounts Receivable (1100)  total_amount  [party: customer]
CREDIT Sales Revenue (4000)        subtotal + service_fee
DEBIT  Cost of Goods Sold (5000)   sum of (qty × purchase_price)
CREDIT Inventory (1200)            sum of (qty × purchase_price)
```

### 7.2 complete_grn() — update to post journal entry

When GRN is recorded:
```
DEBIT  Inventory (1200)        total GRN amount  
CREDIT Accounts Payable (2000) total GRN amount  [party: supplier]
```

### 7.3 Existing data — opening balances

For medicines already in stock (added before Phase 7):
The accounting module starts from the point it's activated.
Existing inventory value can be entered as an opening balance journal entry.

---

## 8. MULTI-CURRENCY SUPPORT

### 8.1 Current implementation

- All accounts have a `currency` field (default 'PKR')
- All journal lines store both `amount` (in transaction currency) and `amount_pkr`
- `exchange_rate` on journal_entries converts to PKR

### 8.2 Exchange rate table (new)

```sql
CREATE TABLE exchange_rates (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  currency     TEXT NOT NULL,  -- 'USD', 'EUR', 'AED' etc.
  rate_to_pkr  NUMERIC(15,6) NOT NULL,  -- 1 USD = X PKR
  rate_date    DATE NOT NULL,
  source       TEXT DEFAULT 'manual',   -- 'manual' or 'api'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   UUID REFERENCES profiles(id),
  UNIQUE(currency, rate_date)
);
```

### 8.3 Exchange rate settings

Add to settings table:
- `base_currency`: 'PKR' (always PKR for this pharmacy)
- `multicurrency_enabled`: 'false' (default)
- `exchange_rate_api_key`: '' (for future API integration)

When `multicurrency_enabled = false`: all transactions are PKR only.
When enabled: exchange_rate field appears on manual journal entries and supplier payments.

---

## 9. UI — LEDGER MODULE

### 9.1 Routes

```
/superadmin/ledger                  → Overview + quick actions
/superadmin/ledger/journal          → Journal entries list + manual entry
/superadmin/ledger/accounts         → Chart of accounts
/superadmin/ledger/suppliers        → Supplier ledger (all suppliers)
/superadmin/ledger/suppliers/[id]   → Single supplier ledger
/superadmin/ledger/customers        → Customer ledger (udhaar list)
/superadmin/ledger/customers/[id]   → Single customer ledger
/superadmin/ledger/borrowing        → Borrowing pharmacies
/superadmin/ledger/borrowing/[id]   → Single pharmacy ledger
/superadmin/ledger/cashbook         → Daily cash book

/admin/ledger                       → Limited view (no manual entries)
/admin/ledger/suppliers             → Supplier ledger
/admin/ledger/customers             → Customer ledger
```

### 9.2 Ledger overview dashboard

```
┌─────────────────────────────────────────────────────┐
│  Ledger Overview                                    │
│                                                     │
│  Cash in Hand          Receivables    Payables      │
│  Rs 45,200             Rs 12,500      Rs 89,000     │
│                                                     │
│  Today's entries: 8    Pending: 2                  │
├─────────────────────────────────────────────────────┤
│  Suppliers owed (top 5)  |  Customers owe (top 5)  │
│  MedPlus      Rs 35,000  |  Ali Khan    Rs 2,500   │
│  PharmaDist   Rs 28,000  |  Sara Ahmad  Rs 1,800   │
│  ...                     |  ...                    │
├─────────────────────────────────────────────────────┤
│  Borrowing balance                                  │
│  We owe: Rs 1,200  |  They owe us: Rs 800          │
└─────────────────────────────────────────────────────┘
```

### 9.3 Party ledger view (supplier/customer/borrowing)

```
Supplier: MedPlus Distributors
Outstanding balance: Rs 35,000 (we owe them)
[Record Payment]

Date        Description              Debit    Credit   Balance
─────────────────────────────────────────────────────────────
01 Jun      GRN-20260601-0001        —        25,000   25,000
05 Jun      GRN-20260605-0002        —        18,000   43,000
08 Jun      Payment — Cash           8,000    —        35,000
─────────────────────────────────────────────────────────────
                                     8,000    43,000   35,000
```

### 9.4 Cash book view

```
Cash Book — 10 Jun 2026
Opening balance: Rs 12,000

Time   Description              In       Out      Balance
────────────────────────────────────────────────────────
09:15  Sale SR-20260610-0001    Rs 450   —        12,450
09:32  Sale SR-20260610-0002    Rs 280   —        12,730
10:15  Supplier payment         —        Rs 2,000 10,730
11:00  Sale SR-20260610-0003    Rs 120   —        10,850
...
────────────────────────────────────────────────────────
Closing balance: Rs 45,200
Total in: Rs 38,200  |  Total out: Rs 5,000
```

### 9.5 Manual journal entry form

For adjustments, corrections, and non-automated entries:

```
New Journal Entry
─────────────────
Date: [10 Jun 2026]
Description: [text]
Reference: [optional]

Lines:
  Account        Direction  Amount    Description
  [Search...]    [Debit ▼]  [0.00]   [optional]
  [Search...]    [Credit ▼] [0.00]   [optional]
  [+ Add line]

Balance check:
  Total Debits:  Rs 0.00
  Total Credits: Rs 0.00
  Difference:    Rs 0.00  ← must be 0 to save

[Save as Draft]  [Post Entry]
```

Draft entries can be edited. Posted entries are immutable.

---

## 10. SERVER ACTIONS

File: `app/actions/ledger.ts`

```typescript
// getAccountBalances() — superadmin, admin
// Returns current balance for all active accounts
// Balance = sum(debits) - sum(credits) adjusted for normal balance

// getPartyLedger(partyType, partyId, dateFrom?, dateTo?)
// Returns all journal lines for a specific party
// Used for supplier, customer, borrowing pharmacy ledgers

// getCashBook(date)
// Returns all cash transactions for a given date

// getJournalEntries(filters)
// Returns paginated journal entries with lines

// createManualJournalEntry(input)
// superadmin only
// Validates balance before posting
// Calls post_journal_entry() RPC

// reverseJournalEntry(entryId, reason)
// superadmin only
// Creates an equal and opposite journal entry
// Marks original as reversed

// recordSupplierPayment(supplierId, amount, method, notes)
// Creates supplier_payments record
// Calls post_journal_entry() for the accounting entries

// recordCustomerPayment(customerId, amount, notes)
// Creates customer_payments record
// Updates customers.credit_balance
// Calls post_journal_entry()

// createBorrowingPharmacy(input)
// createBorrowingTransaction(pharmacyId, input)
// recordBorrowingSettlement(transactionId, amount)

// getFinancialSummary(dateFrom, dateTo)
// Returns: revenue, cogs, gross profit, expenses, net profit
// Used for P&L report in Phase 9
```

File: `app/actions/exchange-rates.ts`

```typescript
// getExchangeRates(date?)
// Returns latest rates for all currencies

// setExchangeRate(currency, rate, date)
// superadmin only — manual rate entry

// fetchLiveRates()
// Calls exchangerate-api.com if API key is set
// Stores in exchange_rates table
```

---

## 11. EXECUTION PLAN

### Phase 7A — Database foundation
1. Read all previous migrations carefully
2. Write migration 012 — accounts, journal_entries, journal_lines,
   borrowing_pharmacies, borrowing_transactions,
   supplier_payments, customer_payments, exchange_rates
3. Seed chart of accounts
4. Create post_journal_entry() RPC
5. Create verify_journal_balance() function
6. Show SQL — I run manually
7. Run verification queries

### Phase 7B — Integration: update existing RPCs
1. Update complete_sale() to call post_journal_entry()
   after sale is recorded
2. Update complete_grn() to call post_journal_entry()
   after GRN is recorded
3. Write tests to verify every sale and GRN creates
   a balanced journal entry
4. npx tsc --noEmit

### Phase 7C — Server actions
1. Create app/actions/ledger.ts (9 actions)
2. Create app/actions/exchange-rates.ts
3. Update lib/audit.ts with new action types
4. npx tsc --noEmit

### Phase 7D — UI: Overview + Party Ledgers
1. Build ledger overview dashboard
2. Build supplier ledger pages
3. Build customer ledger pages
4. Build borrowing pharmacy pages
5. Wire sidebar links

### Phase 7E — UI: Cash Book + Journal
1. Build cash book view
2. Build journal entries list
3. Build manual journal entry form
4. npx next build — clean

### Phase 7F — Verification + Tests
1. Full browser test
2. Update route-access tests
3. Run full test suite — 0 failures
4. Verify accounting equation holds:
   Total Assets = Total Liabilities + Total Equity

---

## 12. CRITICAL RULES (add to CLAUDE.md)

```
## Phase 7 Rules — Ledger & Accounting
- journal_lines is IMMUTABLE — no UPDATE, no DELETE, ever
- journal_entries with status='posted' are IMMUTABLE
- Every journal entry MUST balance (debits = credits)
  post_journal_entry() RPC enforces this and will RAISE EXCEPTION
  if entry does not balance — let it fail, never suppress the error
- All monetary amounts in accounting tables: NUMERIC(15,4)
- COGS is calculated from stock_batches.purchase_price at time of sale
- Manual journal entries require superadmin role
- Reversal = new equal and opposite entry, never edit existing
- exchange_rate = 1.0 for all PKR transactions
- amount_pkr = amount * exchange_rate (always stored explicitly)
- Opening balances entered as manual journal entries 
  with reference_type = 'opening_balance'
- Never calculate balances in JavaScript — always use SQL SUM queries
  to prevent floating point errors
```

---

*End of PHARMACARE_PHASE_7_LEDGER.md*