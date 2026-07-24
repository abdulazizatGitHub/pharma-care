# PharmaCare
### Pharmacy Management System
**Complete Point-of-Sale & Accounting Solution**

*Version 1.0 — 2026*

---

## Executive Summary

PharmaCare is a complete pharmacy management system built specifically for single-branch Pakistani pharmacies. It covers every part of daily pharmacy operations — from dispensing medicines at the point of sale, to managing supplier relationships and purchase orders, to tracking batch-level inventory with expiry dates, to producing full double-entry accounting reports without ever hiring a bookkeeper.

The system runs entirely in a web browser, requires no software installation, and is built on modern, production-grade infrastructure (Next.js and Supabase/PostgreSQL) hosted on Vercel's global cloud platform.

**Key numbers from the demo environment** (three months of realistic pharmacy activity — April through June 2026):

- **PKR 1,380,200** in gross sales revenue processed across three months
- **246 sales transactions** completed through the point of sale
- **45 medicines** actively managed with full batch and expiry tracking
- **5 suppliers** with complete purchase order and goods-receipt history
- **9 purchase orders**, from draft through partial and full receipt
- **6 customer returns** processed with automatic stock and accounting reversal
- **Complete double-entry bookkeeping** — every sale, purchase, expense, payment, and return posts a fully balanced journal entry automatically. Zero manual bookkeeping required.
- Built around the compliance requirements of the **Drugs Act 1976** and the **Punjab Drugs Rules 2007** (Maximum Retail Price enforcement, controlled-substance handling, and an append-only audit trail)

PharmaCare replaces notebooks, loose invoices, and spreadsheets with a single system that a pharmacy owner, an operations manager, and front-counter pharmacists can each use from their own dedicated view — every action recorded, every rupee accounted for, every stock movement traceable back to its source.

---

## The Problem PharmaCare Solves

Most single-branch pharmacies in Pakistan run on a mix of paper registers, a calculator, and a shopkeeper's memory. That works — until it doesn't. PharmaCare was built directly against the everyday failure points of that approach.

**"Manual sales recording leads to errors and theft."**
PharmaCare solves this by making every sale go through a single point-of-sale screen that automatically enforces the medicine's legal Maximum Retail Price, calculates totals, records the exact cashier and shift responsible, and prints a receipt. There is no gap between what was sold and what was recorded — the sale *is* the record.

**"No visibility into stock levels until medicines run out."**
PharmaCare tracks every medicine at the batch level — quantity, expiry date, and cost — and surfaces low-stock and near-expiry alerts directly on the dashboard before a shelf goes empty or a batch goes to waste.

**"Supplier invoices managed on paper."**
Every purchase order, every goods receipt, and every payment made to a supplier is recorded against that specific supplier's ledger. At any moment, the exact amount owed to any supplier is one click away — not a stack of invoices in a drawer.

**"No audit trail for controlled drugs."**
Every action in the system — every sale, every stock adjustment, every user change — writes an entry to an append-only audit log that cannot be edited or deleted by anyone, including the pharmacy owner. Controlled substances have their own dedicated register.

**"Monthly accounts require hiring an accountant."**
Every transaction in PharmaCare — a cash sale, a credit sale, a supplier payment, a customer payment, an expense, a stock receipt, a return — automatically posts a correctly balanced double-entry journal entry behind the scenes. The Balance Sheet, Trial Balance, and Cash Book are always live and always in balance. No one has to manually post a single journal entry.

**"Credit customers (udhaar) tracked in notebooks."**
Every credit customer has a running ledger showing every credit sale and every payment received, with a live outstanding balance. There is no notebook to lose and no arithmetic to get wrong.

**"Cannot tell if the pharmacy is profitable."**
Because every transaction is captured with correct accounting treatment automatically, the owner can open the Financial Overview at any time and see real revenue, real cost of goods sold, real expenses, and real net profit for the period — not an estimate.

---

## Core Features

### Point of Sale (POS)

The POS screen is where the pharmacy makes its money, so it is built for speed:

- Fast medicine dispensing driven by keyboard shortcuts — an experienced cashier can search, add, and check out a sale without touching the mouse
- Instant medicine search by name or barcode
- Four payment methods: cash, credit (udhaar), bank transfer, and cheque
- Receipt printing, formatted for standard printers
- Hold / park a sale mid-transaction and resume it later without losing the cart
- A generic medicine alternatives comparison tool, letting the cashier show a customer lower-cost equivalents for the same items in one screen
- Configurable service fee and bag charge added at checkout
- Shift-based cash management — every sale is tied to the open shift of the pharmacist who processed it

### Inventory Management

- Batch/lot-level tracking: every unit of stock is tied to a specific batch number and expiry date, never just a bulk count
- FEFO (First-Expired, First-Out) is used as the guiding principle for which batch a pharmacist should sell from first
- Low-stock alerts, configurable per medicine via a reorder level
- Near-expiry alerts on a configurable day window
- Stock adjustment and write-off tools for correcting counts or removing expired stock, with a reason recorded every time
- Bulk medicine import from a CSV file for fast catalog setup

### Supplier & Procurement

- Full supplier relationship records: contact person, phone, address, credit terms, credit limit
- Purchase order creation with a status workflow (draft → confirmed → received / partially received / cancelled / closed-short)
- Goods receipt (GRN) against a purchase order, with support for partial deliveries when a supplier can't fulfil the full order at once
- Supplier payment recording against outstanding balances
- A live outstanding-payables view showing exactly what is owed to every supplier

### Customer Management

- Credit customer (udhaar) records with a configurable credit limit per customer
- A full customer ledger showing every credit sale and every payment, in order, with a running balance
- An outstanding-receivables dashboard showing every customer who currently owes the pharmacy money
- Payment recording and settlement, including full and partial payments

### Complete Accounting System

- Automatic double-entry bookkeeping behind every transaction — the pharmacy staff never sees a "debit" or "credit" field; they just make a sale, receive stock, or record an expense, and the correct accounting entry is posted for them
- Balance Sheet, Trial Balance, Cash Book, and a Financial Overview (revenue, cost of goods sold, gross profit, expenses, net profit) — all generated live from the underlying transaction data, never manually compiled
- Full supplier and customer ledgers
- Owner-capital borrowing tracked as its own liability
- No manual bookkeeping required at any point in the daily workflow

### Shift Management

- Pharmacists open a shift before they can process any sale, recording their opening cash float
- Every sale is attributed to the shift that processed it, so cash collected during a shift is always traceable
- Shift close records the closing cash count
- Full shift history and reporting for admin oversight, filterable by pharmacist and date range

### Returns & Exchanges

- Customer return processing against the original sale, item by item
- Stock is automatically restored to the batch it was originally sold from
- The accounting reversal — including a proportional reversal of any discount that was applied to the original sale — happens automatically; no manual journal entry is needed
- Return policy is configurable: a return window in days, an auto-approval limit, and whether opened packaging is eligible
- Controlled substances can never be returned, by hard rule — not a setting

### Reports & Analytics

- A Financial Overview covering revenue, cost of goods sold, gross profit, and expenses for any date range
- Medicine-level sales and inventory reports, including a full item-detail drill-down (stock by batch, sales history, supplier history, discount and return history, and purchase-price trend) with charts
- Supplier and customer ledger reports
- Both PDF-formatted print output and CSV export are available from the relevant report screens

### Controlled Drug Management

- A dedicated controlled-drug register, aligned with the Punjab Drugs Rules 2007 requirement for a durable, non-editable sales record of controlled substances
- Prescription tracking as a distinct module from ordinary retail sales
- A controlled or prescription-scheduled medicine is clearly flagged everywhere it appears in the POS

### Role-Based Access

- Three roles: **SuperAdmin**, **Admin**, and **Pharmacist** — each with its own dedicated dashboard, navigation, and set of screens
- Permissions can be fine-tuned per individual staff member beyond the role's default set — a SuperAdmin can grant a specific pharmacist extra access, or restrict a specific admin from something their role would normally allow
- A complete, append-only audit trail of every write action taken in the system, viewable by the SuperAdmin

---

## Compliance & Security

PharmaCare's accounting and inventory rules are built directly around Pakistani pharmacy regulation, not bolted on afterward:

- **Drugs Act 1976** and **Punjab Drugs Rules 2007 (Rule 20)** inform the controlled-drug register and prescription-handling design
- **DRAP Maximum Retail Price (MRP) enforcement** — no sale line item can ever be billed above the medicine's registered MRP; this is enforced at the database layer, not just in the screen the cashier sees
- A dedicated, append-only **controlled drug register**
- An **immutable audit trail** — every write action is logged, and the log itself cannot be edited or deleted by any role, including the owner
- **Role-based access control**, enforced both in the application and at the database level, so a pharmacist genuinely cannot query financial data they aren't permitted to see, even by working around the screen
- **Secure email + password authentication**, with a forced password change on first login for every new staff account
- **All data is backed up in real time** as part of the underlying managed database service — there is no end-of-day manual backup step to remember or forget

---

## Who Uses PharmaCare

### Owner / SuperAdmin
Full visibility into everything. Configures the system, manages every staff account and their permissions, views every financial report, sets opening balances, and reviews the complete audit trail. There is exactly one of these per pharmacy.

### Operations Manager / Admin
Runs day-to-day operations: manages the medicine catalog and stock, manages suppliers and purchase orders, oversees shifts, and reviews financial reports. Manages pharmacist staff accounts. Does not sit at the counter.

### Pharmacist
Serves customers at the point of sale. Opens and closes their own shift, processes sales and returns, and checks stock levels and alerts. Focused entirely on the counter, not on back-office administration.

---

## Technical Overview

In plain terms, for a non-technical reader:

- **Cloud-based** — PharmaCare works on any device with a modern web browser. There is nothing to install and nothing to configure locally.
- **No installation required** — staff simply log in with an email address and password.
- **Data stored securely** on Supabase's managed cloud database infrastructure.
- **Works on desktop, tablet, and mobile** — the interface adapts to the screen it's shown on.
- **Always up to date** — because the system runs from the cloud, every user always has the current version; there is no manual update process for staff to run.
- **Built on Next.js and PostgreSQL** — a modern, widely-used, production-grade technology combination, not a proprietary or unsupported stack.

---

## Getting Started

A live, fully-seeded demo environment is available for evaluation, populated with three months of realistic pharmacy activity so every screen shows real data rather than an empty state.

**Demo URL:** https://pharmacare-demo-eight.vercel.app

**Try it as:**

| Role | Email | Password |
|---|---|---|
| Pharmacy Owner (SuperAdmin) | `superadmin@pharmacare.demo` | `PharmaCare@2024` |
| Operations Manager (Admin) | `admin@pharmacare.demo` | `PharmaCare@2024` |
| Pharmacist | `pharmacist@pharmacare.demo` | `PharmaCare@2024` |

---

## Contact

*[Pharmacy business contact information to be added here.]*

**PharmaCare — Built for Pakistani Pharmacies**
