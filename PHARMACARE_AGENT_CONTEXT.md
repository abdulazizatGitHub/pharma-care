# PHARMACARE — COMPLETE AGENT CONTEXT DOCUMENT
> **Version:** 1.0  
> **Purpose:** Single source of truth for any AI agent to understand, plan, divide into tasks, execute, and test the PharmaCare pharmacy management system.  
> **Read this entire document before writing a single line of code.**

---

## 0. AGENT OPERATING INSTRUCTIONS

You are a senior full-stack engineer building a production-grade pharmacy management system for a single-branch pharmacy in Pakistan. This document is your complete specification. Follow these rules without exception:

1. **Read every section before starting.** Do not skip to implementation.
2. **Never use `localStorage` or `sessionStorage` for any business data.** All persistence goes through Supabase.
3. **Never hard-delete any record.** Use `is_deleted = true` + `deleted_at` soft-delete on every table.
4. **Never expose the service role key on the client.** Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for client-side calls only.
5. **Every table must have `created_at`, `updated_at`, `created_by` (uuid FK → profiles), `is_deleted`, `deleted_at`.**
6. **Every write operation must insert a row into `audit_logs`.**
7. **Test every module after building it.** Do not proceed to the next task until the current one passes its acceptance criteria.
8. **Role checks happen in two places:** Supabase RLS policies (DB layer) AND Next.js middleware / server actions (app layer). Never rely on only one.
9. **The existing prototype UI/UX is good — keep component structure and Tailwind patterns. Replace only the data layer.**
10. **When in doubt, refer to Section 8 (Pakistan Compliance Rules). They are non-negotiable.**

---

## 1. PROJECT OVERVIEW

| Property | Value |
|---|---|
| Project name | PharmaCare |
| Type | Single-branch pharmacy management system + POS |
| Country | Pakistan (Punjab province) |
| Regulatory framework | Drugs Act 1976, Punjab Drugs Rules 2007 (Rule 20), DRAP MRP enforcement |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Recharts, Lucide React |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Auth strategy | Email + Password via Supabase Auth (simple, role-based) |
| Permission model | RLS at DB level + app-layer guards in Next.js middleware and server actions |
| Deployment | Vercel (frontend) + Supabase cloud (backend) |
| Offline strategy | Out of scope for MVP. Build for online-first with graceful error states. |

### Environment Variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=<provided by client>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<provided by client>
```
> Never add a `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`. If server-side admin operations are needed, use Supabase Edge Functions or Next.js Server Actions with the anon key + RLS.

---

## 2. ACTORS, ROLES & RESPONSIBILITIES

There are **5 roles** in the system. Every user has exactly one role stored in the `profiles` table. Role is checked at login and injected into the session.

---

### 2.1 SUPERUSER
**Purpose:** Development/testing account with unrestricted access to every feature of every actor. Used during development to verify the full system without switching accounts. In production this account is disabled and replaced by the Owner.

**Responsibilities:**
- Access every screen, module, and action in the system
- Bypass no business rules (MRP caps, prescription requirements still apply)
- Create/edit/delete any user including other Owners
- View all audit logs without filter
- Access system settings and configuration

**Dashboard widgets:** All widgets from all roles combined. Role switcher widget to preview any role's dashboard without logging out.

**Permissions:** ALL — no restrictions anywhere in the system.

---

### 2.2 OWNER (Admin)
**Purpose:** The pharmacy owner or designated manager. Has full business visibility and control. Cannot be created by any other role except Superuser.

**Responsibilities:**
- View full business performance: revenue, profit, expenses, stock value
- Manage all users (create cashier, pharmacist, procurement accounts; reset passwords)
- Configure system settings (pharmacy name, licence number, tax settings, low-stock thresholds, expiry alert windows)
- Access all reports and export them
- Approve or reject purchase orders above a configurable value threshold
- View and export the full audit trail
- Manage supplier master data
- Override discounts beyond standard limits (with audit log entry)
- View shift reconciliation reports for all cashiers
- Handle expense recording

**Dashboard widgets:**
- Today's revenue vs yesterday (PKR)
- Today's gross profit margin (%)
- Total outstanding customer credit (udhaar)
- Low stock alert count (clickable → inventory)
- Expiry alert count (clickable → expiry report)
- 7-day revenue + expense chart (Recharts)
- Top 5 selling medicines this week
- Pending POs awaiting approval
- Recent audit trail (last 10 entries)

**Permissions:** Full access to all modules. Cannot be demoted by any role other than Superuser.

---

### 2.3 PHARMACIST
**Purpose:** The qualified person legally required to supervise prescription and controlled drug sales under Punjab Drugs Rules 2007. Has clinical authority — can approve or block a sale on drug safety grounds.

**Responsibilities:**
- Verify and approve prescription sales at POS (cashier submits, pharmacist approves)
- Record prescriptions (doctor name, registration no., patient name, drug, quantity, batch no.)
- Manage inventory: add new medicines to master, adjust stock counts, record expiry write-offs
- Receive goods against a purchase order (record batch number + expiry on receipt)
- Mark controlled/Schedule B drugs and enforce the Rule 20 register entries
- View near-expiry and low-stock reports
- Record medicine returns (from customer or to supplier)
- Cannot see financial reports (revenue, profit, expenses) — clinical role only
- Cannot create or manage users
- Cannot see or modify supplier payment terms or pricing

**Dashboard widgets:**
- Prescription queue (sales awaiting pharmacist approval today)
- Expiry alerts: medicines expiring in 30 / 60 / 90 days
- Low stock alerts (below reorder point)
- Today's dispensing count (no revenue figures)
- Recent stock adjustments
- Controlled drug sales today (count only, not revenue)

**Permissions:**

| Module | Access |
|---|---|
| POS | Approve prescription sales; view queue; cannot initiate a regular sale |
| Inventory | Full CRUD (add, edit, adjust stock, write off) |
| Prescriptions | Full CRUD |
| Controlled drug register | Full CRUD |
| Purchase orders | View only (cannot create or approve) |
| Goods receipt (GRN) | Full — record batch + expiry on receipt |
| Returns | Full |
| Suppliers | View only |
| Reports | Stock report, expiry report, controlled drug register only |
| Expenses | No access |
| Users | No access |
| Settings | No access |
| Audit trail | No access |

---

### 2.4 CASHIER
**Purpose:** Front-counter staff who processes sales. The most restricted role. Cannot see any financial summary or inventory edit capabilities.

**Responsibilities:**
- Process sales at the POS: search medicine, add to cart, apply allowed discount, collect cash, print receipt
- For prescription/controlled drugs: flag the sale, enter patient name and prescription reference, submit to pharmacist queue — cannot complete the sale until pharmacist approves
- Process simple customer returns (same-day, unopened, undamaged only — other returns go to pharmacist)
- View their own shift summary (sales count and cash collected — no profit figures)
- Record opening float and closing cash at shift start/end
- Cannot add, edit, or delete any product
- Cannot view other cashiers' shifts
- Cannot apply discounts beyond the configured limit (default: 10% max for cashier)

**Dashboard widgets:**
- Today's sales count (this cashier's shift only)
- Today's cash collected (this cashier)
- Cart (quick-access, always visible)
- Low stock indicator only (cannot click through to edit)
- Shift open/close button

**Permissions:**

| Module | Access |
|---|---|
| POS | Full sale flow; prescription sales go to queue |
| Inventory | View only (search for products to sell) |
| Prescriptions | Create (submit to queue); cannot approve |
| Returns | Same-day simple returns only |
| Shift management | Own shift only |
| Reports | Own sales report for current shift only |
| Everything else | No access |

---

### 2.5 PROCUREMENT OFFICER
**Purpose:** Manages supplier relationships and purchasing. Focused entirely on the supply side. No access to sales or clinical data.

**Responsibilities:**
- Manage supplier master: add, edit suppliers (name, contact, NTN, address, credit terms, payment history)
- Create purchase orders: select supplier, add medicines with quantity and agreed price, submit for owner approval (if above threshold) or auto-approve (if below)
- Track PO status (draft → submitted → approved → received → invoiced)
- Record supplier invoices and payment dues
- View stock levels to make purchasing decisions (view only — cannot edit)
- Cannot see sales figures, customer data, or clinical records

**Dashboard widgets:**
- Pending POs (awaiting owner approval)
- POs in transit (approved, not yet received)
- Supplier payment dues this month
- Low stock alerts (to trigger new orders)
- Top 10 medicines by purchase frequency

**Permissions:**

| Module | Access |
|---|---|
| Suppliers | Full CRUD |
| Purchase orders | Full CRUD (create, submit, track) |
| Goods receipt | No — pharmacist handles GRN |
| Inventory | View only |
| Reports | Purchase report, supplier ledger only |
| POS | No access |
| Prescriptions | No access |
| Expenses | No access |
| Users | No access |
| Settings | No access |
| Audit trail | No access |

---

## 3. FEATURE MAP

Features are categorized as:
- **MVP** — must be built and tested before go-live
- **Phase 2** — built after MVP is stable, within the same codebase
- **Coming Soon** — UI placeholder badge, not built yet

---

### 3.1 AUTHENTICATION & USER MANAGEMENT
| Feature | Phase | Owner | Notes |
|---|---|---|---|
| Email + password login via Supabase Auth | MVP | Superuser / Owner | Simple auth, no magic links |
| Role assignment on user creation | MVP | Superuser / Owner | Role stored in `profiles.role` |
| Role-based redirect after login | MVP | All | Cashier → POS, Pharmacist → dashboard, etc. |
| Session persistence (Supabase session cookie) | MVP | All | |
| Password reset via email | MVP | All | Supabase built-in |
| Create / edit / deactivate users | MVP | Superuser, Owner | Deactivate = `is_active = false`, not delete |
| Role switcher (preview mode) | MVP | Superuser only | For testing; clearly labeled "Preview Mode" |
| Last login timestamp display | MVP | Superuser, Owner | |

---

### 3.2 DASHBOARD (role-specific)
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Owner dashboard (revenue, profit, alerts) | MVP | Owner, Superuser | |
| Pharmacist dashboard (expiry, prescriptions, stock) | MVP | Pharmacist, Superuser | |
| Cashier dashboard (shift, cart) | MVP | Cashier, Superuser | |
| Procurement dashboard (POs, suppliers, stock) | MVP | Procurement, Superuser | |
| 7-day revenue/expense chart | MVP | Owner, Superuser | Recharts — existing code, keep it |
| Role switcher preview widget | MVP | Superuser | |
| Real-time alert badges in sidebar | Phase 2 | All | |

---

### 3.3 MEDICINE MASTER
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Add medicine (name, generic/salt, manufacturer, DRAP reg no., schedule, MRP, pack size, unit) | MVP | Pharmacist, Owner, Superuser | |
| Drug schedule classification (OTC / Prescription / Controlled) | MVP | Pharmacist, Owner, Superuser | Gates sale workflow |
| MRP field (enforced — cannot bill above this) | MVP | All | See compliance rules |
| Barcode field (optional — for scanner support) | MVP | Pharmacist, Owner, Superuser | |
| Medicine search (name, generic, manufacturer) | MVP | All | Typeahead — existing code, keep it |
| Bulk CSV import | MVP | Owner, Superuser | Existing code, keep it; add batch/expiry columns |
| Edit / soft-delete medicine | MVP | Pharmacist, Owner, Superuser | |
| Salt/generic substitute lookup | Coming Soon | Pharmacist | |

---

### 3.4 INVENTORY (BATCH-LEVEL)
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Batch/lot model: each stock entry has batch no. + expiry | MVP | Pharmacist, Owner, Superuser | One medicine → many batches |
| FEFO dispensing (oldest expiry sold first, auto-selected) | MVP | All | Auto at POS; manual override for pharmacist |
| Low stock alert (configurable threshold per medicine) | MVP | Pharmacist, Owner, Procurement, Superuser | |
| Expiry alerts: 30 / 60 / 90 day windows (configurable) | MVP | Pharmacist, Owner, Superuser | |
| Stock adjustment (count correction with reason) | MVP | Pharmacist, Owner, Superuser | Writes to audit log |
| Expiry write-off (remove expired stock with reason code) | MVP | Pharmacist, Owner, Superuser | |
| Stock valuation (total inventory value at cost price) | MVP | Owner, Superuser | |
| Barcode label printing for internal use | Coming Soon | Pharmacist, Owner | |

---

### 3.5 POS / BILLING
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Two-column POS layout (existing design — keep it) | MVP | Cashier, Pharmacist, Owner, Superuser | |
| Medicine search + typeahead at POS | MVP | All | Existing code |
| FEFO auto-batch selection at sale | MVP | All | |
| MRP enforcement (cannot bill above MRP) | MVP | All | Hard block, not just warning |
| Cashier discount limit (configurable, default 10%) | MVP | Cashier | Above limit → requires Owner/Pharmacist approval |
| Owner/Superuser discount override (up to 40% of MRP) | MVP | Owner, Superuser | Audit logged |
| Cash tendered + change calculator | MVP | Cashier, All | |
| Receipt generation (A4 print via `@media print`) | MVP | All | Existing code — keep it |
| 80mm thermal receipt layout | Phase 2 | All | Separate print stylesheet |
| Hold/park sale (pause and resume) | Phase 2 | Cashier | |
| Prescription drug sale → submit to pharmacist queue | MVP | Cashier | |
| Pharmacist approves queued prescription sale | MVP | Pharmacist | |
| Sale history (searchable by date, cashier, receipt no.) | MVP | Owner, Pharmacist, Superuser | Cashier sees own only |
| Refund / void sale | MVP | Owner, Pharmacist, Superuser | With reason; writes to audit log |

---

### 3.6 PRESCRIPTION & CONTROLLED DRUG REGISTER
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Prescription capture: doctor name, reg no., patient name, drug, qty, batch, date | MVP | Pharmacist, Superuser | Required for Schedule D drugs |
| Doctor master (name, PMDC registration number, specialization) | MVP | Pharmacist, Owner, Superuser | |
| Patient record (name, phone, basic notes) | MVP | Pharmacist, Owner, Superuser | |
| Controlled drug register (Rule 20 fields — see Section 8) | MVP | Pharmacist, Superuser | Append-only; immutable once saved |
| Prescription image upload (photo of physical prescription) | Phase 2 | Pharmacist | Supabase Storage |
| Prescription history per patient | MVP | Pharmacist, Superuser | |

---

### 3.7 PURCHASING & PROCUREMENT
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Supplier master (name, contact, NTN, address, credit terms) | MVP | Procurement, Owner, Superuser | |
| Create purchase order (supplier, line items, quantities, agreed price) | MVP | Procurement, Superuser | |
| PO approval workflow (auto-approve below threshold; Owner approves above) | MVP | Owner, Superuser approve | Configurable threshold in settings |
| Goods receipt / GRN (record batch no. + expiry on receipt) | MVP | Pharmacist, Superuser | Links to PO; updates stock |
| Supplier invoice recording | MVP | Procurement, Owner, Superuser | |
| Supplier payment due tracking | MVP | Procurement, Owner, Superuser | |
| PO status tracking (Draft → Submitted → Approved → In Transit → Received) | MVP | Procurement, Owner, Pharmacist (view), Superuser | |

---

### 3.8 CUSTOMER & CREDIT (UDHAAR)
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Customer record (name, phone, CNIC optional) | MVP | Cashier, Pharmacist, Owner, Superuser | |
| Credit (udhaar) balance per customer | MVP | Owner, Superuser | |
| Credit sale (mark sale as credit, deduct from credit limit) | MVP | Cashier (with Owner approval), Owner, Superuser | |
| Credit payment recording | MVP | Owner, Superuser | |
| Customer statement (sales + payments ledger) | MVP | Owner, Superuser | |
| Customer purchase history | MVP | Pharmacist, Owner, Superuser | |
| SMS payment reminder | Coming Soon | Owner | |
| Customer loyalty points | Coming Soon | All | |

---

### 3.9 RETURNS & WRITE-OFFS
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Customer return (same-day, simple) | MVP | Cashier | Restocks automatically |
| Customer return (other cases) | MVP | Pharmacist, Owner, Superuser | With reason code |
| Return to supplier (damaged/near-expiry batch) | MVP | Procurement, Pharmacist, Owner, Superuser | Creates credit note |
| Expiry write-off | MVP | Pharmacist, Owner, Superuser | Removes from stock; records loss |
| Damage write-off | MVP | Pharmacist, Owner, Superuser | |
| All returns / write-offs write to audit log | MVP | System | Non-negotiable |

---

### 3.10 SHIFT & CASH MANAGEMENT
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Shift open: record opening float | MVP | Cashier, Owner, Superuser | |
| Shift close: record closing cash, system vs actual reconciliation | MVP | Cashier, Owner, Superuser | |
| Shift report per cashier | MVP | Owner, Superuser (all); Cashier (own only) | |
| Cash drawer discrepancy alert | Phase 2 | Owner | |

---

### 3.11 EXPENSES
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Record expense (amount, category, description, date) | MVP | Owner, Superuser | |
| Expense categories (rent, electricity, salaries, maintenance, other) | MVP | Owner, Superuser | |
| Monthly expense summary | MVP | Owner, Superuser | |
| Expense vs revenue P&L | MVP | Owner, Superuser | |

---

### 3.12 REPORTS
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Daily sales report | MVP | Owner, Superuser | |
| Stock valuation report | MVP | Owner, Pharmacist, Superuser | |
| Near-expiry report (30/60/90 day filter) | MVP | Owner, Pharmacist, Superuser | |
| Controlled drug register export (PDF) | MVP | Owner, Pharmacist, Superuser | Mandatory for DRAP inspection |
| Supplier ledger | MVP | Owner, Procurement, Superuser | |
| Profit & Loss summary | MVP | Owner, Superuser | |
| Purchase report | MVP | Owner, Procurement, Superuser | |
| Cashier shift reports | MVP | Owner, Superuser | |
| Audit trail export | MVP | Owner, Superuser | |
| FBR e-invoice report | Coming Soon | Owner | Only if Tier-1 |

---

### 3.13 AUDIT TRAIL
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Every write operation logged to `audit_logs` | MVP | System | No exceptions |
| Log fields: user, role, action, table, record_id, old_value (JSON), new_value (JSON), timestamp, IP | MVP | System | |
| Audit log viewer with filters (by user, date, action, table) | MVP | Owner, Superuser | |
| Audit log is read-only — no edit, no delete | MVP | System | RLS: INSERT only, no UPDATE/DELETE |

---

### 3.14 SETTINGS
| Feature | Phase | Roles | Notes |
|---|---|---|---|
| Pharmacy profile (name, address, licence number, pharmacist name) | MVP | Owner, Superuser | |
| Low stock threshold (global default + per-medicine override) | MVP | Owner, Superuser | |
| Expiry alert window (30/60/90 days — configurable) | MVP | Owner, Superuser | |
| Cashier discount limit (%) | MVP | Owner, Superuser | |
| PO auto-approval threshold (PKR) | MVP | Owner, Superuser | |
| Tax configuration (for future FBR use) | MVP | Owner, Superuser | Store but don't apply yet |
| Backup / restore | Coming Soon | Owner, Superuser | |
| FBR POS integration | Coming Soon | Owner | |

---

## 4. DATABASE SCHEMA

All tables use UUID primary keys. All timestamps are `TIMESTAMPTZ`. All monetary values are stored as `NUMERIC(12,2)`. Never store money as `FLOAT`.

---

### 4.1 CONVENTIONS (apply to every table)
```sql
id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
created_by     UUID REFERENCES profiles(id),
updated_by     UUID REFERENCES profiles(id),
is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
deleted_at     TIMESTAMPTZ,
deleted_by     UUID REFERENCES profiles(id)
```
Add a trigger on every table: `UPDATE updated_at = NOW()` on every UPDATE.

---

### 4.2 PROFILES (extends Supabase auth.users)
```sql
CREATE TABLE profiles (
  id             UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL CHECK (role IN ('superuser','owner','pharmacist','cashier','procurement')),
  is_active      BOOLEAN DEFAULT TRUE NOT NULL,
  phone          TEXT,
  last_login_at  TIMESTAMPTZ,
  -- standard audit columns
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  is_deleted     BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at     TIMESTAMPTZ
);
```
> Populate via trigger on `auth.users` INSERT.

---

### 4.3 MEDICINES (master catalog)
```sql
CREATE TABLE medicines (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT NOT NULL,
  generic_name      TEXT,
  manufacturer      TEXT,
  drap_reg_no       TEXT,
  schedule          TEXT NOT NULL DEFAULT 'OTC' CHECK (schedule IN ('OTC','prescription','controlled')),
  mrp               NUMERIC(10,2) NOT NULL,  -- Maximum Retail Price (DRAP enforced)
  pack_size         TEXT,                    -- e.g. "10 tablets", "100ml"
  unit              TEXT DEFAULT 'strip',    -- strip, bottle, vial, sachet, etc.
  reorder_level     INTEGER DEFAULT 10,
  barcode           TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);
```

---

### 4.4 STOCK_BATCHES (batch-level inventory)
```sql
CREATE TABLE stock_batches (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medicine_id     UUID NOT NULL REFERENCES medicines(id),
  batch_no        TEXT NOT NULL,
  expiry_date     DATE NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  purchase_price  NUMERIC(10,2),      -- cost price per unit for this batch
  supplier_id     UUID REFERENCES suppliers(id),
  grn_id          UUID REFERENCES goods_receipts(id),
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id),
  UNIQUE(medicine_id, batch_no)
);
```
> View `stock_summary` = GROUP BY medicine_id, SUM(quantity) WHERE NOT is_deleted AND expiry_date > NOW().

---

### 4.5 SUPPLIERS
```sql
CREATE TABLE suppliers (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  ntn            TEXT,             -- National Tax Number (Pakistan)
  credit_days    INTEGER DEFAULT 30,
  credit_limit   NUMERIC(12,2),
  notes          TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);
```

---

### 4.6 PURCHASE_ORDERS
```sql
CREATE TABLE purchase_orders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number       TEXT NOT NULL UNIQUE,    -- auto-generated: PO-YYYYMMDD-XXXX
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected','received','invoiced')),
  total_amount    NUMERIC(12,2),
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  notes           TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);

CREATE TABLE purchase_order_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

---

### 4.7 GOODS_RECEIPTS (GRN)
```sql
CREATE TABLE goods_receipts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_number   TEXT NOT NULL UNIQUE,
  po_id        UUID REFERENCES purchase_orders(id),
  supplier_id  UUID NOT NULL REFERENCES suppliers(id),
  received_by  UUID NOT NULL REFERENCES profiles(id),
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);

CREATE TABLE grn_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id        UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  medicine_id   UUID NOT NULL REFERENCES medicines(id),
  batch_no      TEXT NOT NULL,
  expiry_date   DATE NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(10,2),
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```
> On GRN save: INSERT into `stock_batches` or UPDATE quantity if batch already exists.

---

### 4.8 SALES
```sql
CREATE TABLE sales (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_no      TEXT NOT NULL UNIQUE,    -- SR-YYYYMMDD-XXXX
  cashier_id      UUID NOT NULL REFERENCES profiles(id),
  pharmacist_id   UUID REFERENCES profiles(id),   -- set when prescription sale approved
  customer_id     UUID REFERENCES customers(id),
  shift_id        UUID REFERENCES shifts(id),
  sale_type       TEXT DEFAULT 'cash' CHECK (sale_type IN ('cash','credit','return')),
  status          TEXT DEFAULT 'completed' CHECK (status IN ('completed','voided','pending_approval')),
  subtotal        NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL,
  amount_paid     NUMERIC(12,2),
  change_amount   NUMERIC(12,2),
  notes           TEXT,
  voided_by       UUID REFERENCES profiles(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);

CREATE TABLE sale_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id   UUID NOT NULL REFERENCES medicines(id),
  batch_id      UUID NOT NULL REFERENCES stock_batches(id),
  batch_no      TEXT NOT NULL,          -- denormalized for receipt printing
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(10,2) NOT NULL, -- must be <= MRP
  mrp           NUMERIC(10,2) NOT NULL, -- MRP at time of sale (snapshot)
  discount_pct  NUMERIC(5,2) DEFAULT 0,
  total_price   NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```
> On sale completion: UPDATE `stock_batches.quantity` -= sold quantity. If batch.quantity reaches 0, do NOT delete the batch (audit trail needs it).

---

### 4.9 PRESCRIPTIONS
```sql
CREATE TABLE prescriptions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id          UUID REFERENCES sales(id),
  patient_id       UUID REFERENCES customers(id),
  doctor_id        UUID REFERENCES doctors(id),
  doctor_name      TEXT,               -- fallback if doctor not in master
  prescription_ref TEXT,               -- handwritten ref number from prescription
  notes            TEXT,
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by      UUID REFERENCES profiles(id),
  approved_at      TIMESTAMPTZ,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);
```

---

### 4.10 CONTROLLED_DRUG_REGISTER (Rule 20 — Punjab Drugs Rules 2007)
```sql
CREATE TABLE controlled_drug_register (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_no           SERIAL,                    -- Rule 20(1)(f) field 1
  sale_date           DATE NOT NULL,             -- Rule 20(1)(f) field 2
  doctor_name         TEXT NOT NULL,             -- Rule 20(1)(f) field 3
  doctor_reg_no       TEXT,                      -- PMDC registration number
  patient_name        TEXT NOT NULL,             -- Rule 20(1)(f) field 4
  medicine_id         UUID NOT NULL REFERENCES medicines(id),
  medicine_name       TEXT NOT NULL,             -- denormalized
  manufacturer        TEXT NOT NULL,             -- Rule 20(1)(f) field 6
  batch_no            TEXT NOT NULL,             -- Rule 20(1)(f) field 7
  quantity_sold       INTEGER NOT NULL,
  quantity_purchased  INTEGER,                   -- running balance support
  balance             INTEGER,
  supervising_pharmacist_id UUID REFERENCES profiles(id),
  sale_id             UUID REFERENCES sales(id),
  -- NO soft delete on this table — regulatory record
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by          UUID NOT NULL REFERENCES profiles(id)
);
```
> **CRITICAL:** No UPDATE or DELETE allowed on this table — enforced by RLS. It is an append-only legal register.

---

### 4.11 DOCTORS
```sql
CREATE TABLE doctors (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  pmdc_reg_no  TEXT,
  specialization TEXT,
  phone        TEXT,
  hospital     TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ
);
```

---

### 4.12 CUSTOMERS
```sql
CREATE TABLE customers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  cnic          TEXT,
  credit_limit  NUMERIC(10,2) DEFAULT 0,
  credit_balance NUMERIC(10,2) DEFAULT 0,  -- outstanding amount owed by customer
  notes         TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);
```

---

### 4.13 SHIFTS
```sql
CREATE TABLE shifts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cashier_id      UUID NOT NULL REFERENCES profiles(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  opening_float   NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_cash    NUMERIC(10,2),
  system_cash     NUMERIC(10,2),            -- calculated from sales
  discrepancy     NUMERIC(10,2),            -- closing_cash - system_cash
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes           TEXT,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id)
);
```

---

### 4.14 EXPENSES
```sql
CREATE TABLE expenses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL CHECK (category IN ('rent','electricity','salaries','maintenance','supplier_payment','other')),
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- standard audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id)
);
```

---

### 4.15 AUDIT_LOGS
```sql
CREATE TABLE audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id),
  user_role   TEXT,
  action      TEXT NOT NULL,   -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, VOID, etc.
  table_name  TEXT,
  record_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```
> RLS: authenticated users can INSERT. No role can UPDATE or DELETE. Only owner/superuser can SELECT.

---

### 4.16 SETTINGS
```sql
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  label  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES profiles(id)
);
```
**Seed data:**
```sql
INSERT INTO settings (key, value, label) VALUES
('pharmacy_name', 'PharmaCare', 'Pharmacy Name'),
('pharmacy_address', '', 'Address'),
('licence_number', '', 'Drug Licence Number'),
('pharmacist_name', '', 'Qualified Pharmacist Name'),
('low_stock_default_threshold', '10', 'Default Low Stock Level'),
('expiry_alert_days_1', '30', 'Expiry Alert Window 1 (days)'),
('expiry_alert_days_2', '60', 'Expiry Alert Window 2 (days)'),
('expiry_alert_days_3', '90', 'Expiry Alert Window 3 (days)'),
('cashier_discount_limit_pct', '10', 'Max Cashier Discount (%)'),
('po_auto_approve_threshold', '50000', 'PO Auto-Approve Below (PKR)'),
('tax_rate_pct', '1', 'Sales Tax Rate (%) - default 1% for registered medicines'),
('currency', 'PKR', 'Currency');
```

---

## 5. ROW LEVEL SECURITY (RLS) POLICIES

Enable RLS on every table. The pattern is:
1. Disable all access by default (no policy = no access).
2. Add explicit policies per role/action.

Role is read from `profiles.role` by joining on `auth.uid()`.

### Helper function (run once):
```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = TRUE AND is_deleted = FALSE;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Pattern per table:
```sql
-- Example: medicines table
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

-- SELECT: all active authenticated users can read
CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = FALSE);

-- INSERT: pharmacist, owner, superuser
CREATE POLICY "medicines_insert" ON medicines FOR INSERT
  WITH CHECK (get_user_role() IN ('pharmacist','owner','superuser'));

-- UPDATE: pharmacist, owner, superuser
CREATE POLICY "medicines_update" ON medicines FOR UPDATE
  USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- DELETE: blocked for everyone (use soft-delete)
-- No DELETE policy = no one can hard delete.
```

### Special policies:
```sql
-- audit_logs: INSERT for all, SELECT for owner/superuser only, NO UPDATE/DELETE
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (get_user_role() IN ('owner','superuser'));

-- controlled_drug_register: INSERT for pharmacist/superuser, SELECT for pharmacist/owner/superuser, NO UPDATE/DELETE
ALTER TABLE controlled_drug_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cdr_insert" ON controlled_drug_register FOR INSERT WITH CHECK (get_user_role() IN ('pharmacist','superuser'));
CREATE POLICY "cdr_select" ON controlled_drug_register FOR SELECT USING (get_user_role() IN ('pharmacist','owner','superuser'));

-- profiles: users can SELECT their own row; owner/superuser can SELECT all
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_admin" ON profiles FOR SELECT USING (get_user_role() IN ('owner','superuser'));
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE USING (get_user_role() IN ('owner','superuser'));
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (get_user_role() IN ('owner','superuser'));
```

---

## 6. APPLICATION-LAYER GUARDS (Next.js)

### 6.1 Middleware (`middleware.ts`)
```typescript
// Pseudocode — implement fully
export async function middleware(request: NextRequest) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return redirect('/login');

  const role = session.user.user_metadata?.role ?? await fetchRoleFromDB(session.user.id);
  const path = request.nextUrl.pathname;

  // Route guard map
  const routeRoles: Record<string, string[]> = {
    '/dashboard/owner':       ['owner', 'superuser'],
    '/dashboard/pharmacist':  ['pharmacist', 'superuser'],
    '/dashboard/cashier':     ['cashier', 'superuser'],
    '/dashboard/procurement': ['procurement', 'superuser'],
    '/reports':               ['owner', 'superuser'],
    '/users':                 ['owner', 'superuser'],
    '/settings':              ['owner', 'superuser'],
    '/audit':                 ['owner', 'superuser'],
    '/prescriptions':         ['pharmacist', 'owner', 'superuser'],
    '/controlled-register':   ['pharmacist', 'owner', 'superuser'],
    '/suppliers':             ['procurement', 'owner', 'superuser'],
    '/purchase-orders':       ['procurement', 'owner', 'superuser'],
    '/expenses':              ['owner', 'superuser'],
  };

  // Check if path matches and role is allowed
  for (const [route, allowedRoles] of Object.entries(routeRoles)) {
    if (path.startsWith(route) && !allowedRoles.includes(role)) {
      return redirect('/unauthorized');
    }
  }
}
```

### 6.2 Server Actions pattern
Every server action that writes data must:
1. Get session and verify role.
2. Perform the business logic.
3. Insert into `audit_logs`.
4. Return typed result `{ data, error }`.

```typescript
// Pattern for every server action
'use server';
export async function createMedicine(input: MedicineInput) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: 'Unauthenticated' };

  const role = await getUserRole(session.user.id);
  if (!['pharmacist', 'owner', 'superuser'].includes(role)) {
    return { data: null, error: 'Unauthorized' };
  }

  // Validate input (use zod)
  const parsed = MedicineSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error };

  const { data, error } = await supabase.from('medicines').insert({...parsed.data, created_by: session.user.id });

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: session.user.id,
    user_role: role,
    action: 'CREATE',
    table_name: 'medicines',
    record_id: data?.[0]?.id,
    new_value: parsed.data,
  });

  return { data, error };
}
```

---

## 7. ROUTING STRUCTURE

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── unauthorized/page.tsx
├── (dashboard)/
│   ├── layout.tsx              ← shared sidebar + header; role-aware nav
│   ├── page.tsx                ← redirects to role-specific dashboard
│   ├── owner/page.tsx
│   ├── pharmacist/page.tsx
│   ├── cashier/page.tsx
│   └── procurement/page.tsx
├── pos/page.tsx                ← POS screen (cashier, pharmacist, owner, superuser)
├── inventory/
│   ├── page.tsx                ← stock list
│   └── [id]/page.tsx           ← batch detail
├── medicines/
│   ├── page.tsx
│   └── [id]/page.tsx
├── prescriptions/
│   ├── page.tsx
│   └── queue/page.tsx          ← pharmacist approval queue
├── controlled-register/page.tsx
├── suppliers/
│   ├── page.tsx
│   └── [id]/page.tsx
├── purchase-orders/
│   ├── page.tsx
│   └── [id]/page.tsx
├── grn/
│   ├── page.tsx
│   └── [id]/page.tsx
├── customers/
│   ├── page.tsx
│   └── [id]/page.tsx
├── shifts/page.tsx
├── expenses/page.tsx
├── reports/
│   ├── page.tsx
│   ├── sales/page.tsx
│   ├── stock/page.tsx
│   ├── expiry/page.tsx
│   ├── controlled-drugs/page.tsx
│   ├── suppliers/page.tsx
│   └── profit-loss/page.tsx
├── users/page.tsx
├── audit/page.tsx
└── settings/page.tsx
```

---

## 8. PAKISTAN COMPLIANCE RULES (NON-NEGOTIABLE)

These are hard rules derived from the Drugs Act 1976 and Punjab Drugs Rules 2007. The agent must implement all of them.

### 8.1 MRP Enforcement
- The `medicines.mrp` field is the DRAP Maximum Retail Price. No sale item's `unit_price` may exceed `mrp`. This is a hard block enforced in:
  - The POS UI (disable checkout button + show error)
  - The `sale_items` INSERT server action (validate before insert)
  - A database CHECK constraint: `unit_price <= mrp` (add this to `sale_items` after joining via medicine)
- Maximum discount: 40% of MRP. `unit_price >= mrp * 0.60`. Enforced in server action.

### 8.2 Controlled Drug Register (Rule 20(1)(f))
- Every sale of a Schedule B or Schedule G medicine must create a row in `controlled_drug_register`.
- Required fields (from the Rule): serial_no, date, doctor name, patient name, medicine name, manufacturer, batch_no, quantity sold, supervising pharmacist.
- This table is append-only. No UPDATE, no DELETE — enforced by RLS.
- The register must be exportable as a PDF report formatted to match the standard register layout.
- A cashier cannot sell a controlled drug. The sale must go through pharmacist approval.

### 8.3 Prescription Requirements
- Any medicine with `schedule = 'prescription'` or `'controlled'` requires a prescription at POS.
- Cashier flags the sale → it enters `status = 'pending_approval'` in `sales`.
- Pharmacist reviews and either approves (sale completes) or rejects (sale cancelled, items returned to stock).
- The prescription record must be retained (soft-delete only, never hard-delete).

### 8.4 Batch & Expiry Tracking
- Every stock entry must have a batch number and expiry date. Blank batch_no is not allowed for any controlled or prescription medicine.
- FEFO (First Expiry First Out): At POS, the system auto-selects the batch with the earliest expiry date. This auto-selection can only be overridden by a pharmacist or superuser.
- Expired stock (expiry_date < today) cannot be sold. The POS must exclude expired batches from available stock.

### 8.5 Record Retention
- All sales, prescriptions, purchase records, and audit logs must be retained for minimum 3 years.
- No hard delete on any of these tables, ever.
- `is_deleted = TRUE` only hides records from normal UI views. They remain in the database and remain accessible to owner/superuser.

### 8.6 Qualified Pharmacist on Controlled Sales
- The `sales.pharmacist_id` field must be populated for any sale containing a controlled or prescription drug.
- If no pharmacist is currently logged in or on shift, controlled drug sales are blocked.

---

## 9. TASK EXECUTION PLAN (Agent Instructions)

Execute tasks in this exact order. Do not skip. Run acceptance tests after each task group before proceeding.

---

### PHASE 0 — Setup & Infrastructure
**Task 0.1 — Install dependencies**
```bash
npm install @supabase/supabase-js @supabase/ssr zod
```

**Task 0.2 — Supabase client setup**
- Create `lib/supabase/client.ts` (browser client using `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- Create `lib/supabase/server.ts` (server client for Server Actions and middleware)
- Create `lib/supabase/middleware.ts` (session refresh helper)
- Update `middleware.ts` with route guards per Section 6.1

**Task 0.3 — Database setup (run in Supabase SQL editor)**
- Run all CREATE TABLE statements from Section 4 in dependency order:
  1. `profiles`
  2. `medicines`
  3. `suppliers`
  4. `doctors`
  5. `customers`
  6. `stock_batches`
  7. `purchase_orders` + `purchase_order_items`
  8. `goods_receipts` + `grn_items`
  9. `shifts`
  10. `sales` + `sale_items`
  11. `prescriptions`
  12. `controlled_drug_register`
  13. `expenses`
  14. `audit_logs`
  15. `settings`
- Run `get_user_role()` helper function
- Run all RLS policies from Section 5
- Run settings seed data
- Create `updated_at` trigger on all tables

**Task 0.4 — Seed superuser account**
```sql
-- After creating user in Supabase Auth dashboard with email: superuser@pharmacare.dev, password: SuperAdmin@123
INSERT INTO profiles (id, full_name, email, role, is_active)
VALUES ('<auth_user_uuid>', 'Super Admin', 'superuser@pharmacare.dev', 'superuser', true);
```

**✅ Acceptance: Supabase tables visible, RLS enabled, superuser can log in.**

---

### PHASE 1 — Auth & Role Routing
**Task 1.1** — Build `/login` page: email + password form using Supabase Auth `signInWithPassword`. On success, read `profiles.role` and redirect to role-specific dashboard.
**Task 1.2** — Build shared layout with role-aware sidebar navigation (hide menu items user cannot access).
**Task 1.3** — Build `/unauthorized` page.
**Task 1.4** — Build superuser role switcher widget on dashboard.
**Task 1.5** — Build User Management page (owner/superuser only): list users, create user, deactivate user, change role.

**✅ Acceptance: Each role logs in and lands on correct dashboard. Restricted routes return 401. Superuser can switch role preview.**

---

### PHASE 2 — Medicine Master & Inventory
**Task 2.1** — Medicine master CRUD (add, edit, soft-delete). Include all fields from Section 4.3.
**Task 2.2** — Batch/lot model: stock_batches CRUD. Link to medicines. Enforce batch_no + expiry on insert.
**Task 2.3** — Stock summary view (`stock_summary` view in Supabase: JOIN medicines + stock_batches, SUM quantity by medicine, excluding expired batches).
**Task 2.4** — Low stock alerts: query medicines where total stock < `reorder_level`.
**Task 2.5** — Expiry alerts: query batches expiring within 30/60/90 days.
**Task 2.6** — Stock adjustment form: reason + quantity delta → update batch quantity + audit log.
**Task 2.7** — Expiry write-off form: select expired batch → quantity to 0 + reason → audit log.
**Task 2.8** — CSV bulk import (update existing Papaparse code to write to Supabase).

**✅ Acceptance: Add 3 medicines with 2 batches each. Verify stock summary. Trigger low-stock and expiry alerts. Adjust stock and verify audit log entry.**

---

### PHASE 3 — POS & Billing
**Task 3.1** — Rebuild POS data layer: search from `medicines` + `stock_batches` via Supabase (replace LocalStorage).
**Task 3.2** — FEFO batch auto-selection at add-to-cart.
**Task 3.3** — MRP enforcement: block item total > MRP. Show clear error.
**Task 3.4** — Discount logic: cashier max 10% (from settings); owner/pharmacist/superuser up to 40%.
**Task 3.5** — Checkout flow: create `sales` + `sale_items` rows + decrement `stock_batches.quantity` in a Supabase transaction (use RPC function for atomicity).
**Task 3.6** — Receipt generation (keep existing `@media print` layout; pull data from Supabase).
**Task 3.7** — Prescription drug detection: if any item is `schedule = prescription/controlled`, flag → create `prescriptions` row with `status = pending_approval` → sale `status = pending_approval`.
**Task 3.8** — Pharmacist approval queue: list pending sales → approve (completes sale + creates `controlled_drug_register` entry if needed) or reject (voids sale + restores stock).
**Task 3.9** — Sale history page with filters.
**Task 3.10** — Void/refund: mark sale as voided + restore stock + audit log.

**✅ Acceptance: Complete a cash sale (OTC). Attempt over-MRP sale (blocked). Attempt prescription sale (goes to queue). Pharmacist approves. Receipt prints. Void a sale and verify stock restored.**

---

### PHASE 4 — Procurement
**Task 4.1** — Supplier CRUD.
**Task 4.2** — Purchase Order CRUD with status workflow.
**Task 4.3** — PO approval flow: auto-approve below threshold; owner approval above.
**Task 4.4** — GRN (goods receipt): receive against PO, record batch + expiry → creates `stock_batches` row.
**Task 4.5** — Supplier ledger (invoices + payment dues).

**✅ Acceptance: Create supplier. Create PO. Approve PO. Create GRN with batch + expiry. Verify new stock batch appears in inventory.**

---

### PHASE 5 — Customers, Shifts, Expenses
**Task 5.1** — Customer CRUD.
**Task 5.2** — Credit (udhaar) balance tracking: credit sales + payment recording.
**Task 5.3** — Shift management: open shift (float) → sell → close shift (cash count + reconciliation).
**Task 5.4** — Expenses CRUD with categories.

**✅ Acceptance: Open shift. Make 3 sales. Close shift. Verify cash reconciliation. Add a credit customer, make credit sale, record payment.**

---

### PHASE 6 — Reports & Audit
**Task 6.1** — Daily sales report.
**Task 6.2** — Stock valuation report.
**Task 6.3** — Near-expiry report (30/60/90 day filter).
**Task 6.4** — Controlled drug register export (PDF — formatted per Rule 20 layout).
**Task 6.5** — Profit & Loss summary.
**Task 6.6** — Audit trail viewer (owner/superuser only, with filters).

**✅ Acceptance: Generate each report. Export controlled drug register PDF. Verify audit trail shows all writes from Phases 1–5.**

---

### PHASE 7 — Role Dashboards & Settings
**Task 7.1** — Owner dashboard (all widgets per Section 2.2).
**Task 7.2** — Pharmacist dashboard.
**Task 7.3** — Cashier dashboard.
**Task 7.4** — Procurement dashboard.
**Task 7.5** — Settings page (pharmacy profile, thresholds, limits).
**Task 7.6** — "Coming Soon" badges on: barcode printing, FBR integration, SMS reminders, backup/restore, multi-branch, salt/generic substitutes.

**✅ Acceptance: Log in as each of the 5 roles. Verify correct dashboard, correct nav items, correct access blocks on restricted routes.**

---

### PHASE 8 — System Test
**Task 8.1 — Full flow test (Superuser)**
Walk through: login → create medicine → receive stock (GRN) → make OTC sale → make prescription sale (queue + approve) → make controlled drug sale → verify Rule 20 register → view all reports → view audit trail.

**Task 8.2 — Role isolation test**
For each role: verify they can only access permitted routes and data. Verify Supabase RLS blocks direct API calls from restricted roles.

**Task 8.3 — Business rule test**
- Attempt to sell at above MRP → blocked
- Attempt to sell expired stock → blocked
- Attempt to sell controlled drug as cashier → goes to queue
- Attempt to delete an audit log row → RLS blocks it
- Attempt to edit controlled drug register → RLS blocks it

**Task 8.4 — Data integrity test**
- Complete a sale → verify stock_batches.quantity decremented
- Void the sale → verify stock_batches.quantity restored
- Write off expired batch → verify it no longer appears in POS search

---

## 10. COMING SOON FEATURES (UI PLACEHOLDERS ONLY)

These features get a badge in the UI (`🔜 Coming Soon`) but no backend implementation in MVP:

| Feature | Badge location |
|---|---|
| Barcode label printing | Inventory page header |
| 80mm thermal receipt | POS settings |
| FBR POS integration | Settings → Tax |
| SMS reminders (refill, payment due) | Customer detail page |
| Prescription image upload | Prescription form |
| Salt/generic substitute lookup | POS search results |
| Automatic backup & restore | Settings → Backup |
| Multi-branch support | Settings → Branches |
| Demand forecasting / auto-reorder | Reports page |
| Cash drawer discrepancy alert | Shift management |

---

## 11. TECH DECISIONS & CONSTRAINTS

| Decision | Rationale |
|---|---|
| Supabase over custom backend | Eliminates backend boilerplate; built-in auth, RLS, realtime, storage. Client already has Supabase account. |
| Next.js Server Actions over API routes | Keeps auth context server-side; simpler than REST endpoints for CRUD. |
| Zod for all input validation | Parse before insert. Never trust client data. |
| NUMERIC(12,2) for money | Never use FLOAT for money in PostgreSQL. |
| Soft-delete everywhere | 3-year retention requirement; audit trail completeness. |
| No hard delete on `audit_logs` and `controlled_drug_register` | Legal requirement. RLS enforces this. |
| Supabase RPC for multi-table writes | `sales` + `sale_items` + `stock_batches` update must be atomic. Use a Postgres function called via `supabase.rpc()`. |
| Keep existing Recharts + Lucide + Tailwind | UI is good. Only replace the data layer. |

---

## 12. SEED DATA (for testing)

After schema is created, seed this data to enable testing:

```sql
-- Seed 5 user accounts (create in Supabase Auth first, then insert profiles)
-- superuser@pharmacare.dev  / SuperAdmin@123   role: superuser
-- owner@pharmacare.dev      / OwnerPass@123    role: owner
-- pharma@pharmacare.dev     / PharmaPass@123   role: pharmacist
-- cashier@pharmacare.dev    / CashierPass@123  role: cashier
-- procure@pharmacare.dev    / ProcurePass@123  role: procurement

-- Seed 10 sample medicines (mix of OTC, prescription, controlled)
-- Seed 2 suppliers
-- Seed 1 doctor
-- Seed stock for each medicine (2 batches per medicine, one expiring in 45 days)
-- Seed 1 customer with PKR 5000 credit limit
```

---

*End of PHARMACARE_AGENT_CONTEXT.md*  
*Any agent reading this document has everything needed to build, test, and deploy the complete system.*