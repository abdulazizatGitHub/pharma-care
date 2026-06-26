@AGENTS.md

## Active specification
The current build is governed by PHARMACARE_RBAC_V2.md.
This replaces the role system described in PHARMACARE_AGENT_CONTEXT.md.
Read PHARMACARE_RBAC_V2.md fully before any work on auth, routing, 
roles, permissions, or user management.

## Route access (final decision)
/superadmin/*  → superadmin only
/admin/*       → admin + superadmin  
/pharmacist/*  → pharmacist + superadmin
Admins CANNOT access /pharmacist/* routes. Strict separation.

## Deferred: Sub-permission system
The current permission model is flat (18 permissions).
A hierarchical sub-permission system (view/edit/deactivate
per module) is planned for a future phase.
Do NOT implement sub-permissions until a separate spec
document is written and approved.
The two affected components when this is built:
  - components/superadmin/wizard-steps/Step2RolePermissions.tsx
  - components/superadmin/PermissionEditor.tsx

## Hard rules
- Phase E MUST delete app/(dashboard)/dashboard/* pages. These are unguarded after Phase C. Do not defer.

## Completed Phases
- Phase 0: Infrastructure (Supabase, migrations, RLS)
- Phase 1: Auth + Role routing (3-tier RBAC)
- Phase F: User Management (wizard, permissions, force password change)
- Phase 2: Medicine Master (catalog, categories, bulk import)
- Phase 3: Stock Management (batches, alerts, adjust, write-off)
- Phase 4: Supplier & Procurement (supplier master, purchase orders, GRN, approval workflow)
- Phase 5: POS (point of sale, receipt, hold/park, service fee, settings page)
- Phase 7A: Ledger DB foundation (migration 012 — accounts, journal tables, RPCs)
- Phase 7B: Accounting integration (migration 013 — complete_sale + complete_grn post journal entries)
- Phase 7C: Server actions + types (migration 014, app/actions/ledger.ts, app/actions/exchange-rates.ts)
- Phase 7D: Ledger UI — overview, supplier/customer/borrowing ledger pages, sidebars wired
- Phase 7E: Cash Book + Journal UI — cashbook page (date nav, summary bar, table), journal page (filters, inline expansion, post/reverse, manual entry modal), admin read-only supplier/customer ledger pages
- Phase 7: Ledger & Accounting — double-entry accounting, auto-posting (sales/GRN), supplier/customer/borrowing ledgers, cash book, journal entries (complete)
- Phase 8: Expenses Module — expense recording with double-entry accounting (DEBIT 6xxx / CREDIT Cash), 6xxx account categories, soft-delete with journal guard, monthly summary card, superadmin dashboard stat card; `expenses` added to ADMIN_BASE_PERMISSIONS in lib/permissions.ts
- Phase 9: Reports & Analytics — 6 report tabs (Sales, Financial, Inventory, Procurement, Customers, Pharmacist), 17 DB functions (migrations 016 + 017), Recharts charts, tab-level CSV + PDF export, `@media print` CSS with print header; routes: /superadmin/reports, /admin/reports, /pharmacist/reports
- Phase 6: Returns & Exchanges — atomic process_return() RPC (Mode A initiate / Mode B approve), double-entry journal reversal, COGS reversal, controlled-medicine block, full/partial determination, 7 policy settings keys; server actions (initiateReturn, approveReturn, denyReturn, getPendingReturns, getReturnHistory, evaluateReturnPolicy, getSaleForReturn); ReturnBuilder multi-step modal at POS (F6), ReturnApprovalQueue (pending + history tabs), /superadmin/returns page, Returns & Exchanges settings section, superadmin dashboard alert; migrations 019 + 020
- Phase 10: Audit Trail UI — read-only audit log viewer at /superadmin/audit; getAuditLogs (paginated, 5 filters: user/action/table/date range), getAuditStats (total/by-type/by-user/by-day), getAuditFilterOptions; AuditPage (3 stat cards, filter row, activity LineChart, paginated table), AuditLogRow (relative time, role badge, action badge coloured by category, expandable old/new value as key:value pairs)
- Phase 11: Shift Management — migration 018 (column renames: opening_float→opening_cash, system_cash→expected_cash, discrepancy→cash_difference), openShift/closeShift/getCurrentShift/getShiftHistory/getShiftSummary server actions, ShiftStatusBanner (POS + pharmacist dashboard), OpenShiftModal, CloseShiftModal, ShiftHistoryTable, ShiftDetailPanel, PharmacistShiftsContent, AdminShiftsContent; routes: /pharmacist/shifts, /admin/shifts, /superadmin/shifts; POS Complete Sale disabled when no shift open
- Phase 7F: Borrowing POS Integration — migration 022 (settlement columns on borrowing_pharmacies, sale_id/sale_item_id/is_pos_borrow on borrowing_transactions, is_borrowed/borrowed_from/borrow_cost on sale_items, is_borrowed on stock_batches); server actions: borrowToFulfill, completeBorrowingSale, lendToPharmacy, getDailyBorrowingReport, getSettlementDuePharmacies, processSettlement, updatePharmacySettlement; POS UI: OOS medicines shown with Borrow button, BorrowToFulfillModal, LendToPharmacyModal, borrowed CartItem display, CheckoutModal passes borrowedItems; DailyBorrowingReport printable component; CloseShiftModal borrowing summary; LedgerBorrowingDetailPage settlement settings + action cards; superadmin dashboard settlement-due alerts; LedgerBorrowingListPage daily report picker; pharmacist shifts page borrowing report button
- Phase 9B: Reports Sidebar & Item Detail Report — collapsible Reports group in superadmin + admin sidebars (localStorage persistence, auto-expand on report routes, exact-match active highlighting for child routes); Report link on each medicine row in MedicineTable; migration 028 (4 DB functions: get_item_batch_detail, get_item_sales_detail, get_item_supplier_history, get_item_return_history); app/actions/item-report.ts (6 server actions, 6 typed interfaces); ItemDetailPage.tsx (6 sections: Overview KPIs, Stock & Batches, Sales History, Supplier History, Discount & Returns, Price & Margin; date range filter with Apply/This Month/YTD; 6 Recharts charts: daily units bar, revenue line, stock-by-batch Cell-coloured bar, supplier units bar, revenue vs discount stacked bar, purchase price history line; skeletons, pagination, error states); routes: /superadmin/reports/item-detail, /admin/reports/item-detail

## Deferred: Reports sub-pages (future phases)
- Phase 9C: Supplier Detail Report
- Phase 9D: Batch Detail Report
- Export (CSV/PDF) for Item Detail Report — deferred until report is stable

## Known Conventions
Test runner: Jest (not Vitest)
  npx jest tests/route-access.test.ts      → 145/145
  npx jest tests/rls-policies.test.ts      → 83/83
  npx jest tests/functional-flows.test.ts  → all pass

Sidebar collapsible groups:
  localStorage key pattern: 'sidebar_[section]_expanded'
  Active child check: exact pathname match (===), NOT startsWith —
    startsWith causes parent-level routes (e.g. /admin/reports) to
    falsely highlight when on a child route (e.g. /admin/reports/item-detail)

## Known RLS Gaps
- purchase_order_items DELETE policy: role-only check.
  Status guard (draft only) enforced at app layer in
  removePOItem(). Direct API calls bypass this check.

## Phase 4 Rules — Supplier & Procurement
- GRN creation must use complete_grn() RPC for atomicity.
  Do NOT create GRN + stock_batches in separate client calls.
- PO status transitions are one-way except rejection (pending_approval → draft).
- Cancelled and received POs are read-only — no edits.
- next_po_number() is not transaction-safe for concurrent inserts
  (acceptable for single-branch pharmacy with low PO volume).
- AddBatchForm supplier field is now a UUID FK to suppliers,
  not a plain text field.
- getSuppliers() only returns is_active = true suppliers for dropdowns.
- Phase 4 server actions read 'po_approval_threshold' settings key
  (migration 009). Migration 001 also has 'po_auto_approve_threshold' —
  both coexist; use po_approval_threshold in all new code.

## Future: Multi-Tenant Policy Engine
The Phase 6 return/exchange policy system uses Option A (settings keys + RPC IF statements).
This is intentional for MVP. After all modules are complete and tested, this will be scaled to:
- Dynamic policy engine (rules table, evaluated at runtime, superadmin-configurable without code changes)
- Multi-tenant support (each pharmacy has its own policy set)
- The process_return() RPC policy evaluation block is intentionally isolated in one section
  of the function to make this replacement straightforward.

## Phase 7 Rules — Ledger & Accounting
- journal_lines is IMMUTABLE — no UPDATE, no DELETE, ever.
  Enforced by BEFORE UPDATE OR DELETE trigger AND no RLS UPDATE policy.
- journal_entries with status='posted' or 'reversed': financial fields are
  IMMUTABLE (entry_date, description, reference_*, currency, exchange_rate).
  Enforced by prevent_posted_entry_mutation trigger.
  ONLY allowed update on posted entries: status→'reversed', reversed_by, reversal_of.
- Every journal entry MUST balance: SUM(debits) = SUM(credits).
  post_journal_entry() RPC enforces this and will RAISE EXCEPTION if the entry
  does not balance — never suppress this error, let it propagate.
- All monetary amounts in accounting tables: NUMERIC(15,4) — four decimal places.
- COGS is calculated from stock_batches.purchase_price (NUMERIC(10,2)) at time of sale.
- Manual journal entries require superadmin role only.
- Reversal = new equal and opposite entry via post_journal_entry(), then UPDATE
  original entry status→'reversed' and set reversed_by. Never edit existing lines.
- exchange_rate = 1.000000 for all PKR transactions (multicurrency_enabled='false').
- amount_pkr = amount × exchange_rate — always stored explicitly, never recalculated.
- Opening balances entered as manual journal entries with reference_type='opening_balance'.
- Never calculate balances in JavaScript — always use SQL SUM queries to prevent
  floating-point accumulation errors.
- All ledger routes are superadmin/admin only — pharmacist has no ledger access.
- post_journal_entry() is SECURITY DEFINER: it bypasses RLS. Do not call it
  from client-side code; only call it from server actions or other RPCs.

## Future: Auth security hardening (out of scope for MVP)
The following improvements are planned after all modules are complete and stable.
Do NOT implement these until a separate spec document is written and approved.
- HTTP-only cookies for session tokens (eliminate XSS token theft risk)
- CSRF protection (SameSite=Strict + CSRF token header on mutations)
- Separate short-lived access tokens + long-lived refresh tokens
  (current @supabase/ssr uses a single rolling JWT — acceptable for MVP)
- Rate-limiting on /login and /change-password endpoints