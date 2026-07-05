# PharmaCare
## Pharmacy Management System

PharmaCare is a comprehensive pharmacy management system built for independent and small-chain pharmacies in Pakistan. It replaces disconnected manual processes — handwritten Udhaar ledgers, spreadsheet stock records, paper purchase orders — with a unified, cloud-backed platform covering point of sale, inventory, procurement, double-entry accounting, and reporting. PharmaCare is designed for how Pakistani pharmacies actually operate: cash-dominant sales, DRAP-scheduled medicine categories, supplier credit relationships, inter-pharmacy borrowing, and patient credit (Udhaar) as a core part of daily business.

---

## What PharmaCare Does

### Point of Sale

- Three POS layouts — Card, Table, and Mixed — optimised for different screen sizes and pharmacist preferences
- Full keyboard navigation so experienced pharmacists never need to lift their hands from the keyboard
- Generic alternatives comparison wizard: compare branded vs. generic options side-by-side before finalising a sale
- Special patient discount tiers configurable per pharmacist
- Hold and retrieve in-progress sales
- Return and exchange processing with policy enforcement (partial returns, controlled-medicine blocks)
- Borrowing and lending between pharmacies: when a medicine is out of stock, it can be sourced from a partner pharmacy and tracked automatically

### Inventory and Procurement

- Medicine catalog with generic names, brand names, manufacturer, categories, and DRAP schedules (OTC, Prescription, Controlled)
- Purchase orders with a full lifecycle: Draft → Pending Approval → Confirmed → Partial → Received
- Approval threshold configuration — orders above a set value require superadmin sign-off
- Goods receipt (GRN) with batch-level tracking: each batch records purchase price, sale price, MRP, expiry date, and quantity
- FEFO (First Expiry, First Out) batch selection at point of sale
- Stock adjustments and write-offs
- Low-stock and expiry alerts
- Bulk medicine import via CSV

### Accounting (Double-Entry)

Every financial transaction in PharmaCare — every sale, purchase, expense, payment, return, and opening balance — automatically posts a balanced journal entry. No manual bookkeeping required.

- Full double-entry bookkeeping enforced at the database level
- Balance Sheet (Assets, Liabilities, Equity) with net profit calculation
- Trial Balance with date-range filtering
- Profit and Loss (income statement) for any period
- Cash Book with daily navigation
- Supplier Ledger and Accounts Payable tracking
- Customer Ledger and Accounts Receivable (Udhaar) tracking
- Expense recording with void and journal reversal
- Opening balances entry for existing pharmacies migrating to the system
- PKR as the base currency; exchange rate framework in place for future multi-currency support
- Payment routing: Cash (Account 1000), Bank Transfer/Cheque (Account 1001), Credit/Udhaar (Account 1100)

### Customer Management

- Customer profiles with outstanding Udhaar balance tracking
- Credit sales recorded against customer accounts
- Payment collection with full ledger history
- Borrowing pharmacy management: partner pharmacies, lending records, settlement tracking

### Shift Management

- Pharmacist shift open and close with opening and closing cash recording
- Sales and cash accountability per shift
- Shift history with detailed reporting
- Printable shift summary reports

### Reports

- Sales, Financial, Inventory, Procurement, Customer, and Pharmacist report tabs
- Item Detail Report: per-medicine view of stock batches, sales history, supplier history, pricing, and returns
- Financial statements: Balance Sheet, Trial Balance, and income statement
- CSV export for tabular reports
- All reports are printable with full branding

### Print System

- Professional A4 document printing via browser popup — unaffected by application layout constraints
- Configurable pharmacy logo (PNG, JPEG, or SVG), address, phone, email, and licence number
- Branded header on every document; repeating compact header on pages 2+
- Optional watermark (logo or text, configurable opacity)
- Configurable footer text on all documents
- Balance Sheet, Trial Balance, and Shift Reports currently supported; all future reports use the same print pipeline

### Access Control

PharmaCare uses a strict three-tier role system:

| Role | Access |
|---|---|
| **SuperAdmin** | Full system access: settings, user management, accounting, all reports, audit trail |
| **Admin** | Operations: purchase orders, GRN, supplier management, staff shifts, admin-level reports |
| **Pharmacist** | POS, shift management, inventory view, pharmacist-level reports |

Permissions are enforced at two levels simultaneously: Next.js middleware (route access) and Supabase Row Level Security (database access). Bypassing the UI does not bypass the data layer.

Granular permissions allow fine-grained control within each role — for example, which pharmacists can apply special discounts and at what tier.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Next.js Server Actions (no separate API server) |
| Database | PostgreSQL via Supabase (34 migrations) |
| Auth | Supabase Auth + Row Level Security |
| Storage | Supabase Storage (pharmacy assets — logo) |
| Charts | Recharts |
| Testing | Jest — route access, RLS policy, and functional flow test suites |

---

## System Architecture

PharmaCare is a full-stack Next.js application. Server Actions replace a traditional REST API — database operations happen server-side, never exposing credentials or business logic to the client. Supabase provides the PostgreSQL database, authentication, and file storage.

Double-entry accounting integrity is enforced at the database level: the `post_journal_entry` RPC validates that every entry balances (debits = credits) before committing — any imbalanced entry raises an exception and the transaction is rolled back. Journal lines are immutable by trigger; posted entries cannot be edited or deleted.

The three-tier RBAC system is enforced at both the Next.js middleware layer (route-level access control) and the Supabase RLS layer (row-level data access). These two layers are independent — a request that bypasses middleware still hits RLS enforcement at the database.

---

## Version 1 — Current Release

Version 1 of PharmaCare includes the complete core pharmacy operations platform: point of sale, inventory and procurement, full double-entry accounting, customer and supplier management, shift management, reporting, and the print system. The system is in active use.

PharmaCare follows a versioned release model. Version 1 covers the core platform. Additional modules are planned for subsequent versions.

---

## Planned for Future Versions

- FBR/PRA fiscal integration (receipt serialisation, tax reporting)
- Daily cash reconciliation module with variance journal posting
- Shift policy enforcement (scheduled shifts, mandatory close, cash-out tracking)
- Comparative financial statements (period-over-period)
- Additional report types (Supplier Detail, Batch Detail)
- Desktop application with offline operation and online sync
- Multi-branch support

---

## Development Setup

### Prerequisites

- Node.js 18 or later
- npm
- A Supabase project (free tier sufficient for development)

### Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Running Locally

```bash
npm install
npm run dev
```

### Database Setup

Run migrations in order using the Supabase SQL editor or CLI:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_...
...
supabase/migrations/034_print_system.sql
```

Migrations are numbered sequentially and must be applied in order. Each migration is idempotent where possible (uses `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

### Tests

```bash
npx jest tests/route-access.test.ts      # 148 tests — route-level access control
npx jest tests/rls-policies.test.ts      # 54 tests  — database RLS policies
npx jest tests/functional-flows.test.ts  # 29 tests  — end-to-end business flows
```

Route access tests require a running dev server at `localhost:3000`.

---

## Status and Licensing

**Status:** Active development — Version 1  
**Built for:** Pakistani pharmacy market  
**Currency:** PKR (Pakistani Rupee)  
**Regulatory note:** FBR/PRA fiscal integration is in development for an upcoming release.
