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
- Phase 5B-2: Special Discount Permission System — migration 029 (profiles.special_discount_max_tier NUMERIC(10,2), sales.special_discount_applied/type/value, settings keys special_discount_enabled/type/tiers); Settings UI: Special Discount subsection in POS & Fees (enable toggle, type radio %/fixed, tier chip input max 6 tiers, validated, comma-stored), updateSpecialDiscountSettings() server action; User Management: per-pharmacist grant in EditUserDrawer (toggle + max tier dropdown, superadmin only), updateUserSpecialDiscount() server action, SPECIAL_DISCOUNT_GRANTED audit action; Checkout: eligibleTiers filtered to t <= maxTier, computed specialDiscountAmt, effectiveTotal updated, combined into p_discount_amt for complete_sale(), fire-and-forget UPDATE on sales after completeSale records special_discount_applied/type/value; Receipt: Special Discount row in both ReceiptView (ReceiptContent) and buildReceiptHtml (print HTML), total adjusted by specialDiscountAmt
- Phase 5B-4: Generic Alternatives Comparison Wizard — migration 030: get_generic_alternatives(UUID[]) DB function (LANGUAGE sql, not plpgsql — avoids scope ambiguity between RETURNS TABLE column names and CTE aliases; FEFO batch selection; option ranking per original_med_id; ORDER BY (alt_med_id = original_med_id) DESC ensures original always gets option_index=1 in its own group even when multiple cart items share the same generic; empty array guard via array_length() in WHERE clause); getGenericAlternatives() server action in app/actions/item-report.ts (pharmacist/admin/superadmin, early exit on empty input); GenericComparisonWizard component (components/pos/generics/GenericComparisonWizard.tsx): full-screen overlay z-index 1100, calls useCart() directly — no cartItems prop, 4-column comparison table (ORIGINAL + up to 3 alternatives sorted by sale_price ASC), per-row radio selection, no-generic rows greyed with "—" cells, bulk actions (All Original / All Option 2/3/4 / ✦ Lowest), summary row with lowest-cost column highlighted green, Apply performs removeItem + addItem cart mutations with qty capping and warning toasts; F3 keyboard trigger from POSPage, button disabled={items.length === 0} in all three layouts; MedicineReplacement interface exported from wizard file
- Unified POS Keyboard Navigation System — lib/pos-shortcuts.ts: single source of truth, 24 shortcuts, 5 categories (sale/navigation/cart/modal/wizard), getShortcuts()/getShortcutsByCategory() filters, focusNextQtyInput()/focusLastQtyInput() DOM helpers; F2 search (all layouts — card via cardRef.current?.focusSearch(), table/mixed handle internally), F3 wizard, F4 hold, F5 checkout (card only), F6 return, F8 lend, F9 checkout (table/mixed), ? help overlay; LendToPharmacyModal lifted to POSPage level (single instance, onLend prop added to CartPanel/TableLayout/MixedLayout Props); cart qty Enter → focusNextQtyInput (CartItem/TableLayout/MixedLayout); auto-focus last qty after add (MedicineResultCard.doAdd + TableLayout.handleAddFromList, 50ms delay); SearchPanel + TableLayout inline dropdown: highlightedIdx state, ArrowDown/Up on search input cycles results, Enter adds highlighted non-OOS result; CheckoutModal Enter key: useRef amountInputRef, useEffect after handleComplete — Enter focuses amount if empty/zero (cash), completes sale if canComplete; GenericComparisonWizard: keyboard hints strip rewritten from pos-shortcuts.ts (getShortcuts('wizard') deduplicated), POSPage silences its handler via if (wizardOpen) return; help overlay dynamic from getShortcutsByCategory(['pos','all']), grouped Sale Actions / Navigation / Cart & Quantities
- Phase 12A: Shift Management Schema Foundation — migration 031 (DB only, no UI); all Phase 12 features disabled by default (opt-in design); feature flags: phase12_shift_policies_enabled, phase12_cash_out_enabled, phase12_daily_reconciliation_enabled, phase12_mandatory_shift_close, phase12_shift_transfer_enabled (all 'false'); policy settings: shift_policy_type='custom', shift_duration_hours='12', shift_start_times='00:00,12:00', cash_out_categories (6 default categories with per-category daily limits); shifts: 10 new columns (policy_type, scheduled_start TIME, scheduled_end TIME, reconciled BOOLEAN NOT NULL DEFAULT FALSE, reconciled_at, reconciled_by, original_pharmacist_id, transferred_at, transferred_by, transfer_reason); expenses: shift_id UUID REFERENCES shifts(id), cash_out_reason TEXT; profiles: can_perform_daily_close BOOLEAN NOT NULL DEFAULT FALSE; accounts: 4800 Cash Overage Income (revenue/credit/is_system), 6800 Cash Shortage Expense (expense/debit/is_system); daily_reconciliations table (reconciliation_date UNIQUE, expected_cash, actual_cash, difference, journal_entry_id, performed_by NOT NULL) with RLS SELECT+INSERT for superadmin/admin OR can_perform_daily_close=true; journal_entries reference_type CHECK extended to include 'daily_reconciliation' (15 values total)

## Deferred: Phase 12 — Shift Management & Cash Accountability (future phases)
- Phase 12B: Cash Out at POS — F10 shortcut (hidden unless phase12_cash_out_enabled='true'), CashOutModal with category radio + daily-limit enforcement, expense recording via existing recordExpense(), shift_id + cash_out_reason populated
- Phase 12C: Shift policy + mandatory close enforcement — shift_policy_type wired to open/close behaviour, mandatory close blocking modal on navigation/logout/tab-close (when phase12_mandatory_shift_close='true'), suggested opening cash display (informational, not pre-filled)
- Phase 12D: Shift transfer / reassignment UI — admin/superadmin can reassign an open shift (original_pharmacist_id recorded, audit log), available when phase12_shift_transfer_enabled='true'
- Phase 12E: Daily reconciliation page — /superadmin/daily-close + /admin/daily-close (also accessible to profiles with can_perform_daily_close=true), shift summary, expected vs actual cash, journal entry posting (DEBIT 1000/CREDIT 4800 overage; DEBIT 6800/CREDIT 1000 shortage), marks shifts reconciled=true, DAILY_CLOSE_PERFORMED audit action, sidebar entry

## Deferred: Reports sub-pages (future phases)
- Phase 9C: Supplier Detail Report
- Phase 9D: Batch Detail Report
- Export (CSV/PDF) for Item Detail Report — deferred until report is stable

## Deferred: Generic Wizard Enhancements (future phases)
- Search mode: when cart is empty, F3 could open wizard in
  standalone search mode to compare generics without adding to
  cart first. Currently F3 opens wizard unconditionally; wizard
  shows an empty table when cart has no eligible items.
- isControlled / isPrescription flags: wizard currently sets
  both to false for all substituted items when calling addItem().
  Future improvement: look up these flags from the medicine
  record at apply time to correctly mark controlled/prescription
  alternatives.

## Deferred: POS Keyboard — F7 Borrow global key
F7 Borrow has no meaningful global trigger: borrow is initiated
per out-of-stock cart item via BorrowToFulfillModal. A global
key would need a "borrow mode" UI that doesn't yet exist.
Deferred until borrow flow supports a global entry point.

## Known Conventions
Test runner: Jest (not Vitest)
  npx jest tests/route-access.test.ts      → 145/145
  npx jest tests/rls-policies.test.ts      → 83/83
  npx jest tests/functional-flows.test.ts  → all pass

Special discount flow:
  Settings define tiers (comma string) + type + enabled flag
  profiles.special_discount_max_tier = NULL means no permission
  At checkout: eligibleTiers = tiers where t <= maxTier
  specialDiscountAmt passed as part of p_discount_amt to
  complete_sale() (combined with existing discountAmount)
  Post-sale: fire-and-forget UPDATE on sales table records
  special_discount_applied/type/value for reporting

GenericComparisonWizard architecture:
  Renders inside CartProvider JSX tree in POSPage (after the
  layout divs, before ReturnMode) so it can call useCart().
  wizardOpen state lives in POSPage (outside CartProvider).
  POSPage cannot call useCart() — it is the CartProvider host,
  not a descendant. Consequence: F3 keyboard handler in POSPage
  calls setWizardOpen(true) unconditionally (no items.length
  guard). The empty-cart guard lives only on the layout buttons
  via disabled={items.length === 0} (layouts have useCart()).
  Migration sequence: 029 = special_discount, 030 = get_generic_alternatives,
  031 = phase12_shift_management (schema only, all flags false).

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