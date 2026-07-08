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
- Phase 13A: Accounting Audit Fixes (DB/RPC layer) — migration 032; full double-entry audit completed 2026-06-28; bugs fixed: (1) complete_grn() journal entry restored — migration 024 had silently dropped it, all GRNs since 024 were missing DEBIT 1200/CREDIT 2000; party_type='supplier'+party_id on AP line for supplier ledger, guarded by IF v_total > 0; (2) payment account routing — complete_sale() and process_return() were hardcoded to 1000 Cash; now cash→1000, bank_transfer/cheque→1001, credit→1100; (3) discount separation — complete_sale() 4000 credit now shows gross subtotal, discount posted separately to new 4900 Sales Discount (contra-revenue, account_type='revenue', normal_balance='debit', is_system=true); (4) process_return() payment routing — looks up original sale payment_type, routes refund to correct account; credit returns use CREDIT 1100 (reduce receivable, no cash movement); exchange upgrades on credit use DEBIT 1100 (increase receivable); account 1001 renamed Cash in Hand→Bank Account; historical data: 4 test GRNs (~Rs 93,850) have no journal entries — accepted as test data, immutable; pre-032 sales show netted revenue in 4000 — immutable by trigger, not corrected; verified correct and unchanged: post_journal_entry() balance enforcement, borrowing accounting (borrow_in/borrow_out), all report functions, expense void reversal
- Phase 13B: Accounting Fixes (Server Action layer) — no migration; recordExpense() (app/actions/expenses.ts): payment routing added, creditAccount = bank_transfer/cheque→1001 else 1000; recordSupplierPayment() (app/actions/ledger.ts): payment routing on credit line + Gap 6 fixed — INSERT payment first → post_journal_entry(p_reference_id=paymentId) → UPDATE supplier_payments.journal_entry_id; recordCustomerPayment() (app/actions/ledger.ts): payment routing on debit line + Gap 6 fixed same pattern + Gap 5 partial — credit_balance failure now returns error with payment ID instead of silent log (full atomicity deferred to migration 033)
- Phase 13C: Opening Balances UI — postOpeningBalances() in app/actions/ledger.ts (superadmin only, duplicate guard via reference_type='opening_balance' check, delegates balance enforcement to post_journal_entry() RPC); /superadmin/opening-balances page: read-only view when balances exist (green banner + lines table), entry form when not (11 asset/liability/equity accounts, live debit/credit totals, balanced indicator, submit disabled until balanced); sidebar: "Opening Balances" link under Ledger section with Scale icon; route-access.test.ts: 146 tests (was 145). Phase 13 complete — full accounting audit: 13A fixed complete_grn/complete_sale/process_return at DB layer; 13B fixed recordExpense/recordSupplierPayment/recordCustomerPayment at server action layer; 13C added opening balances mechanism.
- Sidebar Restructure (all three roles) — SuperAdminSidebar: 7 collapsible groups (Medicines & Stock [Medicines, Purchase Orders], Suppliers [Supplier List, Supplier Ledger], Customers [Customers Udhaar, Borrowing], Accounting [Overview P&L, Balance Sheet, Trial Balance, Cash Book, Journal, Opening Balances, Expenses], Operations [Returns, Shifts], Reports [Overview, Item Detail, Supplier Soon, Batch Soon], User Management [Users & Roles]) + Dashboard/Settings/Audit Trail standalone; AdminSidebar: 6 collapsible groups (Medicines & Stock, Suppliers, Customers, Accounting, Operations, Reports) + Dashboard/Staff Management standalone, per-child permission filtering preserved, group hidden when all children filtered out; PharmacistSidebar: flat items (Dashboard, POS, Customers, Shifts, Inventory) + Reports collapsible group (Overview) + Prescriptions/Controlled Drugs flat; all three: groupsOpen persisted as JSON in localStorage (keys: sidebar_superadmin_groups, sidebar_admin_groups, sidebar_pharmacist_reports_expanded), auto-expand active group on mount + pathname change (exact-match), disabled items render as non-clickable div with Soon badge (#F3F4F6 bg, #9CA3AF text, 1px #E5E7EB border), group click toggles only (no navigation), useRouter removed from admin + superadmin sidebars.
- Phase 14A: Financial Statements DB Functions — migration 033; customer_payments.reference_no column added (parity with supplier_payments); get_trial_balance(p_from DATE, p_to DATE): all 27 accounts with debit/credit totals and net balance, LANGUAGE sql, LEFT JOIN so zero-activity accounts appear with zeros and has_activity=false, verified SUM(debits) = SUM(credits) = 51,590.00; get_balance_sheet(p_as_of_date DATE): all-time asset/liability/equity balances (non-zero only) + synthetic NET profit equity row (account_code='NET', display_order=999, always shown), NET profit = credit-normal revenue (4xxx) − debit-normal revenue (4900 Sales Discount) − COGS (5xxx) − Expenses (6xxx) for fiscal YTD (DATE_TRUNC('year', p_as_of_date)), verified Assets = Liabilities + Equity (diff = 0.0000, 42282.50 = 34890 + 7392.50); record_customer_payment() atomic RPC: Gap 5 fully resolved — single plpgsql transaction (validate customer → INSERT customer_payments → post_journal_entry → UPDATE journal_entry_id → UPDATE credit_balance), 1100 AR credit line carries party_type='customer' + party_id for get_party_ledger visibility; REVOKE/GRANT authenticated on all three functions; recordCustomerPayment() server action updated to call RPC (Gap 5 complete end-to-end)
- Phase 14B: Balance Sheet + Trial Balance Pages — /superadmin/ledger/balance-sheet: date picker (searchParam ?date=, defaults today), three sections Assets/Liabilities/Equity, NET row italic+coloured (green profit/red loss, parentheses for negative), summary Total Assets vs Total L+E with balanced indicator, @media print hides sidebar/nav; /superadmin/ledger/trial-balance: date range picker (searchParams ?from=?to=, defaults first-of-month to today), All/Active-only toggle (has_activity filter), account type badges (6 types colour-coded), totals footer with ✓ Balanced when debits=credits, @media print; Sidebar: Balance Sheet + Trial Balance promoted from Soon stubs to active links; route-access.test.ts: 148 tests (was 146); 55 routes total. Phase 14 complete.
- Balance Sheet + Trial Balance + Ledger Overview improvements — BalanceSheetPage: two-column grid (Assets left, Liabilities+Equity right), recharts PieChart asset composition (data-print-hide), print header (pharmacy name / title / as-of date, display:none on screen), print footer (generated date, confidential note), pharmacyName fetched in page.tsx via Promise.all alongside RPC call and passed as prop, print CSS uses class-based selectors (.print-header, .print-footer, .balance-sheet-grid, .balance-sheet-row); TrialBalancePage: print header (pharmacy name / title / period), print footer, .trial-table-wrap className on table card, print CSS adds * { overflow: visible !important } + .trial-table-wrap { max-height: none !important } to prevent table clipping; Ledger Overview page renamed "Financial Overview" (sidebar label + page h1), income statement card for current month (Revenue, COGS, Gross Profit, Expenses, Net Profit — red with parentheses if loss), ProfitTrendChart client component (components/superadmin/ProfitTrendChart.tsx, recharts BarChart, 3 bars: Revenue/Expenses/Net Profit), 7 parallel get_financial_summary RPC calls (current month + 6-month trend), layout: two-column grid (280px income statement | 1fr chart).
- Pagination final pass + ledger date filters — Shifts (all 3 roles): converted AdminShiftsContent from client-side useTransition/server-action refetch to URL-driven searchParams (?page=&pharmacist=&from=&to=); PharmacistShiftsContent: added ?page= searchParam + Pagination component; getShiftHistory() now accepts page/pageSize params, uses { count: 'exact' }, returns total count, falls back to .limit(200) when called without pagination; Pagination component added inside the shift table card for both roles; Supplier Ledger Detail (/superadmin/ledger/suppliers/[id]): date-range filter added (From/To inputs, defaults to first day of current month + today, Show All button pushes ?from=&to= to bypass defaults and fetch full history, Apply pushes ?from=&to= with values, subtitle shows "Showing transactions from X to Y" or "Showing all transactions"); Customer Ledger Detail (/superadmin/ledger/customers/[id]): identical pattern; both server pages read searchParams and pass dateFrom/dateTo to getPartyLedger(); client components use useEffect to sync local input state on navigation; Balance Sheet footer alignment fixed (borderRight on left footer cell matches column divider above it); Gap 6 supplier payment reference_id confirmed correct from Phase 13B (no change needed); verified no pagination needed for: suppliers list, customer ledger list, borrowing list, users, trial balance, cash book (all genuinely bounded for single-branch pharmacy); returns history already has working client-side pagination via ReturnApprovalQueue (Previous/Next buttons, 20/page, server action called directly). Tests: 148/148 route-access, 54/54 rls-policies, 29/29 functional-flows.
- Phase 15A: Print System Foundation — migration 034 (15 print_* settings keys with sensible defaults, pharmacy-assets storage bucket [public, 2MB limit, PNG/JPEG/SVG allowed_mime_types], 4 RLS policies on storage.objects: public SELECT, superadmin-only INSERT/UPDATE/DELETE via EXISTS subquery on profiles); app/actions/settings.ts: exported PrintSettings interface (15 camelCase fields), getPrintSettings() [all authenticated roles, single .like('key','print_%') query, boolean coercion + parseFloat mapping], updatePrintSettings(Partial<PrintSettings>) [superadmin only, validates watermarkOpacity ∈ [5,20], upsert loop matching updateSettings() pattern], uploadPharmacyLogo(FormData) [superadmin only, dual ext+MIME validation, sharp resize→PNG 800×400 compressionLevel 8 for raster, raw passthrough for SVG, orphan file cleanup on format change, upserts print_logo_url]; Settings UI: new "Documents" sidebar group + "Print & Documents" NavItem (Printer icon), SectionPanel with saveLabel prop, logo upload/preview/remove with ?v= cache-busting, pharmacy info (address/phone/email/license/footer), header options (2 radio groups), footer options (radio + 2 toggles), watermark (2 toggles + animated text reveal + range slider); page.tsx: Promise.all([settingsQuery, getPrintSettings()]), passes printSettings={printResult.data} (null falls back to DEFAULT_PRINT_SETTINGS); sharp@^0.35.2 added to dependencies (native TS types, no @types package needed). Tests: 148/148 route-access, 54/54 rls-policies, 29/29 functional-flows. Migration 034 pending user execution.
- Phase 15C: Print popup system — lib/print-utils.ts: printDocument() single export, buildDocumentHtml() builds complete standalone HTML string (inline CSS, no external deps), openPrintWindow() opens 850×1100 popup + setTimeout(print,500) without closing; @page margin boxes for pages 2+ header (@top-left=pharmacyName, @top-right=title—subtitle) and every-page footer (@bottom-left=footerText+generated date, @bottom-right=license); @page :first suppresses margin-box header + reduces margin-top to 5mm (page 1 has full branded in-body header in normal flow); FALLBACK_PRINT_SETTINGS exported constant; getPharmacyName() server action added to app/actions/settings.ts (all roles, reads pharmacy_name key); BalanceSheetPage: Print button → printDocument() using .balance-sheet-card innerHTML, removed @media print <style> block + .print-header + .print-footer divs; TrialBalancePage: same pattern using .trial-table-wrap innerHTML; ShiftDetailPanel: printShiftReport() removed, buildShiftReportHtml() renamed → buildShiftReportBodyHtml() rewritten with inline styles (no class dependencies), printing state + async onClick fetches getPrintSettings()+getPharmacyName() in parallel then calls printDocument(); test page app/superadmin/print-test/ deleted. Tests: 148/148 route-access, 54/54 rls-policies, 29/29 functional-flows.
- Phase 15D: Business Document Print Views — 4 new A4 print views + design system overhaul applied to all print output. (1) Purchase Order (components/procurement/PODetailPage.tsx): buildPOBodyHtml(mode:'supplier'|'internal'); Supplier Copy = external document (columns: #/Medicine/Pack Size/Qty/Unit Price/Total; watermark suppressed via watermarkOverride:{enabled:false}); Internal Copy = full record (adds Received/Remaining/Status columns + GRN History sub-section; status color-coded in metadata); status gating: draft/pending_approval → no print buttons; confirmed → both copies; partially_received/received/closed_short → Internal Copy only; cancelled → Internal Copy only with CANCELLED watermark override. (2) Supplier Ledger (components/ledger/LedgerSupplierDetailPage.tsx): buildSupplierLedgerBodyHtml(); columns Date/Ref/Description/Debit/Credit/Balance; balance labels 'Payable' (green — we owe supplier) / 'Receivable' (red — supplier owes us) — never Cr/Dr to avoid crore confusion; dual Print (filtered view) + Print Full Ledger buttons; Print disabled when data is empty. (3) Customer Ledger (components/ledger/LedgerCustomerDetailPage.tsx): buildCustomerLedgerBodyHtml(); same pattern, directions inverted ('Receivable' green / 'Payable' red); Outstanding Receivable shown in metadata block. (4) Cash Book (components/ledger/CashBookPrintButton.tsx, new client component wired into app/superadmin/ledger/cashbook/page.tsx): buildCashBookBodyHtml(); metadata: Period left / Opening Balance right; summary block: Opening Balance / Total Receipts / Total Payments / Closing Balance; date-grouped transaction rows. Design system (PRINT_STYLES in lib/print-utils.ts — standard for all future print views): 4-section structure — Section 1: document title (centered, uppercase, letter-spacing); Section 2: 2-column bordered metadata table (gray labels, bold values); Section 3: data table (full cell borders, alternating rgba row shading, right-aligned tabular-nums, em-dash empty cells); Section 4: summary block (rgba background, grand total in brand green); printCurrency() + printNumber() helpers exported; document title moved OUT of pharmacy header → document title is now Section 1 in doc-body (header contains branding only: logo + pharmacy name/address/contact). Bug fixes: openPrintWindow() onload approach (pw.onload + 3s fallback, printed flag prevents double-fire) replaces 500ms fixed timeout — prevents logo missing when Supabase CDN image loads slowly; watermark z-index:9999 so it renders above tables; table/summary backgrounds changed to rgba (0.75–0.85 opacity) so watermark shows through; metaTable border-collapse:separate;border-spacing:0 prevents outer left border halving; .doc-content padding:0 4px prevents sub-pixel clipping at @page 15mm boundary; POTable.tsx removed 'confirmed' from EDITABLE_STATUSES so confirmed POs show View (not Edit) in list; both PO detail pages (superadmin + admin) expand supplier query to join contact_person/phone/email/address from suppliers table. No new migrations (pure frontend). Files: lib/print-utils.ts, components/procurement/PODetailPage.tsx, components/procurement/POTable.tsx, components/ledger/LedgerSupplierDetailPage.tsx, components/ledger/LedgerCustomerDetailPage.tsx, components/ledger/CashBookPrintButton.tsx (new), app/superadmin/purchase-orders/[id]/page.tsx, app/admin/purchase-orders/[id]/page.tsx, app/superadmin/ledger/cashbook/page.tsx. Tests unchanged: 148/148 route-access, 54/54 rls-policies, 29/29 functional-flows (print body builders not exercised by Jest — noted gap, not blocking).

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
  npx jest tests/route-access.test.ts      → 148/148
  npx jest tests/rls-policies.test.ts      → 54/54
  npx jest tests/functional-flows.test.ts  → 29/29

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
  031 = phase12_shift_management (schema only, all flags false),
  032 = phase13a_accounting_fixes (account 4900, rename 1001, fix complete_grn/complete_sale/process_return),
  033 = phase14a_financial_statements (customer_payments.reference_no, get_trial_balance, get_balance_sheet, record_customer_payment RPC).
  034 = phase15a_print_system (15 print_* settings keys, pharmacy-assets storage bucket + RLS) — pending user execution.

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
- Payment account routing (established in migration 032, applies to all new code):
    cash          → 1000 Cash
    bank_transfer → 1001 Bank Account
    cheque        → 1001 Bank Account
    credit sale   → 1100 Accounts Receivable
  Any function or server action posting a payment journal line MUST use this
  routing — never hardcode 1000 for non-cash payment types.
- Account 4900 Sales Discount: contra-revenue, normal_balance='debit', is_system=true.
  complete_sale() posts CREDIT 4000 = gross subtotal, DEBIT 4900 = p_discount_amt
  (only if > 0). Pre-032 entries show netted revenue in 4000 — immutable, accepted.
- complete_grn() posts DEBIT 1200 / CREDIT 2000 per GRN (full or partial).
  The 2000 AP line carries party_type='supplier', party_id=v_supplier for the
  supplier ledger. Guard: IF v_total > 0 (zero-value GRNs skip journal posting).
- process_return() routes the refund/receivable line by original sale payment_type:
    cash/bank   v_net > 0 → CREDIT 1000/1001 (cash out)
    cash/bank   v_net < 0 → DEBIT  1000/1001 (cash in, exchange upgrade)
    credit sale v_net > 0 → CREDIT 1100 (reduce receivable — customer owes less)
    credit sale v_net < 0 → DEBIT  1100 (increase receivable — customer owes more)

## Future: Auth security hardening (out of scope for MVP)
The following improvements are planned after all modules are complete and stable.
Do NOT implement these until a separate spec document is written and approved.
- HTTP-only cookies for session tokens (eliminate XSS token theft risk)
- CSRF protection (SameSite=Strict + CSRF token header on mutations)
- Separate short-lived access tokens + long-lived refresh tokens
  (current @supabase/ssr uses a single rolling JWT — acceptable for MVP)
- Rate-limiting on /login and /change-password endpoints