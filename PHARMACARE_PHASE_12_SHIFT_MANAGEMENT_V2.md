# PharmaCare — Phase 12: Shift Management, Cash Accountability & Daily Reconciliation
## Revision 2 — All features opt-in, configurable by superadmin

---

## Design Principle

**Nothing in this phase is mandatory or on by default.**

Every feature is a configurable module that superadmin enables per pharmacy.
A pharmacy that does not need shift policies, cash out tracking, or daily
reconciliation sees none of these features. The existing shift open/close
behaviour continues to work exactly as today when all Phase 12 features
are disabled.

---

## Feature Flags (new settings keys)

All default to 'false'. Superadmin enables per pharmacy.

```
phase12_shift_policies_enabled     → 'false'
phase12_cash_out_enabled           → 'false'
phase12_daily_reconciliation_enabled → 'false'
phase12_mandatory_shift_close      → 'false'
phase12_shift_transfer_enabled     → 'false'
```

When all flags are false: system behaves exactly as Phase 11.
Each flag can be enabled independently.

---

## Part 1 — Shift Policy Engine
### Enabled by: phase12_shift_policies_enabled = 'true'

### 1.1 Policy settings

```
shift_policy_type           → 'custom' (default) | 'fixed'
shift_duration_hours        → '12' (default)
shift_start_times           → '00:00,12:00' (default for 12hr)
shift_auto_close_enabled    → 'true'
shift_auto_close_time       → '04:59' (existing default)
shift_max_duration_hours    → '24' (safety cap, not enforced
                               as hard limit — see 1.3)
```

### 1.2 Default shift schedule (12-hour, 2 shifts/day)

```
Shift 1: 00:00 – 12:00
Shift 2: 12:00 – 00:00
```

Other supported configurations:
- 8-hour (3 shifts): 00:00 / 08:00 / 16:00
- 24-hour (1 shift): 00:00
- Custom: no time boundaries, pharmacist opens/closes freely

### 1.3 Shift time flexibility — IMPORTANT

**Exceeding shift time is ALLOWED and never forced to close.**

If a pharmacist's 12-hour shift reaches 12:00 and they have not
closed, the system does NOT auto-close or block them. They continue
working. The shift shows as "running long" in admin view only.

Auto-close only fires at the configured auto_close_time (e.g. 04:59)
as a safety net for genuinely abandoned shifts — not at shift
boundary times.

Superadmin can extend a shift manually from the admin panel:
  - Change scheduled end time
  - Add a note (e.g. "Covering for absent colleague")

### 1.4 Shift transfer / reassignment
### Enabled by: phase12_shift_transfer_enabled = 'true'

When a pharmacist is absent or needs to hand over mid-shift:

Superadmin or admin can reassign an open shift:
  - Select the open shift
  - Select the replacement pharmacist
  - The shift is transferred: new pharmacist takes ownership
  - Original pharmacist is recorded as original_pharmacist_id
  - Audit log records the transfer with reason

Use cases:
  - Pharmacist goes on leave mid-day
  - Pharmacist sick, colleague covers remaining hours
  - Manager fills in temporarily

Schema addition:
```sql
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS original_pharmacist_id
    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transfer_reason TEXT;
```

---

## Part 2 — Pharmacist Shift Changes

### 2.1 When phase12_shift_policies_enabled = false (default)

Shift open/close works exactly as Phase 11:
  - Opening cash input (optional, with Rs prefix — bug fix applied)
  - Close shift shows cash summary + actual cash count
  - Auto-close at configured time

### 2.2 When phase12_shift_policies_enabled = true

**Opening shift changes:**
  - Keep opening cash input (still optional)
  - Show policy-based suggested start time if applicable
  - Day always starts from zero — no carry-over from previous shift
    NOTE: "Start from zero" means the opening cash the pharmacist
    manually enters is whatever they physically count in the drawer.
    There is no auto-population from yesterday's closing count.
    Each shift open is a fresh manual count.

**Closing shift changes:**
  - Remove "Actual cash in drawer" input from pharmacist close modal
  - Pharmacist sees their sales summary only
  - One-click close with optional notes
  - Cash counting moves to Daily Reconciliation (manager level)
  - If phase12_daily_reconciliation_enabled = false: keep existing
    cash count in close modal (do not remove it)

### 2.3 Suggested opening cash
(Only shown when phase12_shift_policies_enabled = true)

Show the most recent shift's expected_cash as a reference:
  "Previous shift expected cash: Rs X"
  (display only — pharmacist enters their own manual count)

This is informational, not pre-filled. The pharmacist counts
physically and enters what they count. The reference helps them
notice if the float is significantly different from expected.

### 2.4 Mandatory shift close
### Enabled by: phase12_mandatory_shift_close = 'true'

Three enforcement points:

A — Navigation away from pharmacist area:
  Blocking modal: "You have an open shift. Please close before leaving."
  [Close Shift Now] [Stay]
  Cannot dismiss without action.

B — Logout:
  Same blocking modal before signOut() is called.

C — Browser tab close:
  window.beforeunload handler — browser native dialog only.
  Soft warning, cannot be customized per browser security rules.

When phase12_mandatory_shift_close = false (default):
  No enforcement. Existing behaviour continues.

---

## Part 3 — Cash Out at POS (Petty Cash)
### Enabled by: phase12_cash_out_enabled = 'true'

### 3.1 Feature overview

Pharmacist can record informal cash taken from the drawer
during their shift. Each cash out is recorded as an expense
with a reason, reducing the expected cash for reconciliation.

### 3.2 Cash out categories — superadmin configurable

Default categories (can be added to / removed from settings):
  1. Staff meal / tea
  2. Hospitality (VIP guests)
  3. Errand / purchase
  4. Advance to staff
  5. Utility / small repair
  6. Other

Admin can add custom categories from settings UI.
Each category can have a daily spending limit (optional).

### 3.3 Daily limits per category

Superadmin sets a daily limit per category in settings:
Example:
  Staff meal / tea    → Rs 1,000 / day limit
  Hospitality         → Rs 2,000 / day limit
  Errand              → Rs 500 / day limit
  Other               → no limit (NULL)

When pharmacist records a cash out:
  System checks: sum of all cash outs today in this category
  If adding this amount would exceed the daily limit: block
  Show error: "Daily limit for [category] is Rs X.
    Already used: Rs Y. Remaining: Rs Z."

If limit is NULL for a category: no check, always allowed.

### 3.4 Cash Out modal UI

Triggered by F10 at POS (when phase12_cash_out_enabled = true).
Button added to POS action bar between Lend and Hold.

```
┌──────────────────────────────────────────┐
│  Record Cash Out                      ✕  │
│                                          │
│  Amount (Rs) *                           │
│  [                              ]        │
│                                          │
│  Category *                              │
│  ● Staff meal / tea    (limit: Rs 1,000) │
│  ○ Hospitality (VIP)   (limit: Rs 2,000) │
│  ○ Errand / purchase   (limit: Rs 500)   │
│  ○ Advance to staff    (no limit)        │
│  ○ Other               (no limit)        │
│                                          │
│  Remaining today for selected: Rs 650    │
│                                          │
│  Note (optional)                         │
│  [                              ]        │
│                                          │
│  Authorized by (optional)                │
│  [                              ]        │
│                                          │
│  [Cancel]        [Record Cash Out]       │
└──────────────────────────────────────────┘
```

### 3.5 What cash out creates

1. Expense record (reuses existing expenses table):
   account_code: petty cash expense account (configurable)
   payment_method: 'cash'
   category: selected category name
   description: category + note
   shift_id: current shift id
   cash_out_reason: category key

2. Journal entry via post_journal_entry():
   DEBIT expense account / CREDIT 1000 Cash

3. The expense is automatically included in shift summary
   under "Cash expenses" (existing column).

### 3.6 New settings for cash out categories

```
cash_out_categories → JSON string:
  '[
    {"key":"meal","label":"Staff meal / tea","limit":1000},
    {"key":"hospitality","label":"Hospitality (VIP)","limit":2000},
    {"key":"errand","label":"Errand / purchase","limit":500},
    {"key":"advance","label":"Advance to staff","limit":null},
    {"key":"utility","label":"Utility / small repair","limit":null},
    {"key":"other","label":"Other","limit":null}
  ]'
```

Superadmin can add, remove, rename, and set/remove limits
from the settings UI.

### 3.7 Schema changes

```sql
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id),
  ADD COLUMN IF NOT EXISTS cash_out_reason TEXT;
```

---

## Part 4 — Daily Reconciliation
### Enabled by: phase12_daily_reconciliation_enabled = 'true'

### 4.1 What daily reconciliation is

At end of day, a designated person (manager/senior pharmacist)
physically counts all cash in the drawer and records the count.
The system computes the expected amount from all shifts that day
and calculates the difference.

**Starting from zero each day:**
Each day's reconciliation starts fresh. There is no automatic
carry-over from the previous day's count. The person counting
physically counts whatever is in the drawer and enters that number.
The system does not pre-fill or suggest an expected opening amount.

### 4.2 Permission model

```
perform_daily_close → granted per user
```

Who has it by default:
  superadmin: always (cannot be revoked)
  admin: yes by default
  pharmacist: no by default

Superadmin can grant perform_daily_close to specific pharmacists
(senior pharmacist use case) from User Management.

### 4.3 Page: /superadmin/daily-close + /admin/daily-close

Also accessible to pharmacist if perform_daily_close granted.
Navigation: new "Daily Close" section in sidebar (separate from Ledger).

### 4.4 Daily close page UI

```
Daily Cash Reconciliation          [← Previous Day] 28 Jun 2026 [Next Day →]

SHIFTS TODAY
─────────────────────────────────────────────────────────────────
Pharmacist      Opened    Closed    Cash Sales    Cash Outs   Status
Test Pharmacy   04:43 pm  06:24 pm  Rs 1,200.00   Rs  80.00  Closed ✓
Ahmed Khan      06:30 pm  —         Rs   800.00   Rs   0.00  Open ⚠
─────────────────────────────────────────────────────────────────
Warning: Ahmed Khan's shift is still open.
Shifts must be closed before reconciliation can be completed.

EXPECTED CASH (from shift records)
Total cash sales today:         Rs 2,000.00
- Total cash expenses today:    Rs   150.00
- Total cash outs today:        Rs    80.00
─────────────────────────────────────────────────────────────────
Expected in drawer:             Rs 1,770.00

ACTUAL CASH COUNT
Actual cash in drawer:          [              ]
─────────────────────────────────────────────────────────────────
Difference:                     —

Notes:          [                                              ]

[Record Reconciliation]   ← disabled until all shifts closed
                             and actual cash entered
```

### 4.5 Difference handling

Overage (actual > expected):
  Show: "Rs X.XX — Overage" (green)
  Journal entry: DEBIT 1000 Cash / CREDIT 4800 Cash Overage

Shortage (actual < expected):
  Show: "Rs X.XX — Shortage" (red)
  Journal entry: DEBIT 6800 Cash Shortage / CREDIT 1000 Cash

Balanced (actual = expected):
  Show: "Balanced ✓" (green)
  No journal entry needed.

### 4.6 On submit

1. Validate: all shifts for today are closed
2. Record daily_reconciliation row
3. Post journal entry if discrepancy exists
4. Mark all today's shifts as reconciled
5. logAction: DAILY_CLOSE_PERFORMED
6. Show success: "Reconciliation recorded. Difference: Rs X posted to ledger."

### 4.7 New accounts

```sql
INSERT INTO accounts (code, name, account_type, is_system)
VALUES
  ('4800', 'Cash Overage Income',   'income',  true),
  ('6800', 'Cash Shortage Expense', 'expense', true)
ON CONFLICT (code) DO NOTHING;
```

Also add 'daily_reconciliation' to journal_entries
reference_type CHECK constraint.

### 4.8 New table: daily_reconciliations

```sql
CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date   DATE NOT NULL UNIQUE,
  total_cash_sales      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_expenses   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_outs       NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash         NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cash           NUMERIC(12,2) NOT NULL,
  difference            NUMERIC(12,2) NOT NULL DEFAULT 0,
  journal_entry_id      UUID REFERENCES journal_entries(id),
  notes                 TEXT,
  performed_by          UUID REFERENCES profiles(id) NOT NULL,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reconciliations_select" ON daily_reconciliations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('superadmin', 'admin')
      AND is_active = true
      AND is_deleted = false
    )
  );
```

---

## Part 5 — Settings UI Changes

### 5.1 New settings section: "Shift & Cash Management"

Located in /superadmin/settings, new collapsible section.

**Sub-section A: Feature Flags**
All toggles, all off by default:
  □ Enable shift policies (fixed 8hr/12hr/24hr windows)
  □ Enable cash out recording at POS (F10)
  □ Enable daily cash reconciliation
  □ Enable mandatory shift close (pharmacist must close before logout)
  □ Enable shift transfer / reassignment

Note shown: "These features are disabled by default. Enable only
what your pharmacy workflow requires."

**Sub-section B: Shift Policy** (shown when shift policies enabled)
  Shift duration: [Custom] [8-hour] [12-hour] [24-hour]
  Auto-close: [toggle] at [time picker]
  Max shift duration: [number] hours (soft cap, shown as warning only)

**Sub-section C: Cash Out Settings** (shown when cash out enabled)
  Category manager:
    List of categories with [label] [daily limit Rs] [remove]
    [+ Add category] button
    [Save categories] button
  
  Petty cash expense account:
    Dropdown of 6xxx accounts for posting cash out expenses

**Sub-section D: Daily Reconciliation** (shown when reconciliation enabled)
  (No additional settings needed — controlled by permissions)

---

## Part 6 — Migration 031 Summary

```sql
-- File: supabase/migrations/031_phase12_shift_management.sql

-- 1. Feature flag settings (all default false)
INSERT INTO settings (key, value) VALUES
  ('phase12_shift_policies_enabled',        'false'),
  ('phase12_cash_out_enabled',              'false'),
  ('phase12_daily_reconciliation_enabled',  'false'),
  ('phase12_mandatory_shift_close',         'false'),
  ('phase12_shift_transfer_enabled',        'false'),
  ('shift_policy_type',                     'custom'),
  ('shift_duration_hours',                  '12'),
  ('shift_start_times',                     '00:00,12:00'),
  ('cash_out_categories',                   '[...]')
ON CONFLICT (key) DO NOTHING;

-- 2. Shifts table additions
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS scheduled_start TIME,
  ADD COLUMN IF NOT EXISTS scheduled_end TIME,
  ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS original_pharmacist_id
    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transfer_reason TEXT;

-- 3. Expenses table additions
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id),
  ADD COLUMN IF NOT EXISTS cash_out_reason TEXT;

-- 4. Profiles table — perform_daily_close permission
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_perform_daily_close
    BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. New chart of accounts entries
INSERT INTO accounts (code, name, account_type, is_system, currency,
  is_active, is_deleted)
VALUES
  ('4800', 'Cash Overage Income',   'income',  true, 'PKR', true, false),
  ('6800', 'Cash Shortage Expense', 'expense', true, 'PKR', true, false)
ON CONFLICT (code) DO NOTHING;

-- 6. daily_reconciliations table
CREATE TABLE IF NOT EXISTS daily_reconciliations ( ... );

-- 7. Extend journal_entries reference_type CHECK
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'sale', 'sale_return', 'purchase_order', 'grn',
    'supplier_payment', 'customer_payment',
    'borrowing_out', 'borrowing_in', 'borrowing_payment',
    'expense', 'expense_void', 'manual', 'opening_balance',
    'adjustment', 'daily_reconciliation'
  ));
```

---

## Part 7 — Implementation Sequence

### Phase 12A — Migration only
Run migration 031. Verify. No UI changes yet.
All features still disabled (flags = false).

### Phase 12B — Settings UI (feature flags + cash out config)
Settings section with all toggles.
Cash out category manager.
No functional change until flags are enabled.

### Phase 12C — Cash Out at POS
F10 button (hidden unless phase12_cash_out_enabled = true)
Cash out modal with category selection and limit checking
Expense recording reusing existing recordExpense()

### Phase 12D — Shift policy + mandatory close
Shift policy settings wired to shift open/close behaviour
Mandatory close enforcement (when flag enabled)
Suggested opening cash display (informational only)
Shift transfer UI for admin/superadmin

### Phase 12E — Daily reconciliation
/superadmin/daily-close page
Permission grant in user management
Journal entry posting
Sidebar Daily Close entry

---

## What Does NOT Change (regardless of flags)

- Existing shift open/close server actions
- Existing auto-close mechanism
- POS shift enforcement (no open shift = no sale)
- Shift history page and shift report
- Borrowing report on shift close
- Opening cash input (Rs prefix bug already fixed)
- All existing journal entries and accounting flows

---

## Spec Version
Created: 2026-06-28
Revision: 2 (opt-in design, configurable cash out limits,
  zero-based reconciliation, flexible shift timing)
Migration: 031
Phases: 12A → 12B → 12C → 12D → 12E