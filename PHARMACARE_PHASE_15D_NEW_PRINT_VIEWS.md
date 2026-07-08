# PharmaCare — Phase 15D: New Print Views

## Overview

Four new print views using the existing printDocument() infrastructure
from Phase 15B/C. All views follow the established pattern: build body
HTML → call printDocument() → popup window with branded header/footer.

No migrations. No new server actions unless noted. Print buttons added
to existing pages.

---

## Shared Pattern (all four views)

Every print button in this phase follows the same implementation:

```typescript
async function handlePrint() {
  setIsPrinting(true)
  try {
    const [printSettings, pharmacyName] = await Promise.all([
      getPrintSettings(),
      getPharmacyName(),
    ])
    const bodyHtml = buildXxxBodyHtml(data, filters)
    printDocument({
      title: 'Document Title',
      subtitle: 'Date range or identifier',
      bodyHtml,
      printSettings: printSettings.data ?? FALLBACK_PRINT_SETTINGS,
      pharmacyName: pharmacyName.data ?? 'PharmaCare',
    })
  } finally {
    setIsPrinting(false)
  }
}
```

Button shows "Preparing..." while loading. Uses the same async
pattern as ShiftDetailPanel.

### Body HTML conventions

- All styles inline (no class dependencies — popup is standalone)
- Tables: border-collapse, 1px #E5E7EB borders, 8px 12px cell padding
- Header row: #F9FAFB background, #374151 text, font-weight 600
- Negative numbers: #991B1B color, parentheses format
- Section headers: #0F6E56 color, uppercase, letter-spacing 0.05em
  (matches Balance Sheet pattern)
- Total rows: bold, border-top 2px solid #D1D5DB
- Grand total rows: bold, border-top 2px solid #0F6E56, #0F6E56 text
- Use doc-* utility classes from print-utils.ts where available
  (doc-section-header, doc-negative, doc-positive, doc-table-header,
  doc-total-row, doc-grand-total — all have !important on color)
- Elements that should not print: data-print-hide attribute

---

## View 1 — Purchase Order Print

### Location

Print button on PO detail page (the page showing a single PO).

### Mode switch

Two print options via a dropdown or two buttons:

```
[Print Supplier Copy]  — clean PO to hand/send to supplier
[Print Internal Copy]  — full record with receipt status
```

Both use the same buildPOBodyHtml() function with a
`mode: 'supplier' | 'internal'` parameter.

### Supplier Copy layout

```
┌──────────────────────────────────────────────────────┐
│  [Standard PharmaCare header from printDocument()]    │
│                                                      │
│  PURCHASE ORDER                                      │
│  PO #: PO-2026-0042         Date: 01 July 2026      │
│  Status: Approved            Payment Terms: Net 30   │
│                                                      │
│  TO:                                                 │
│  Supplier Name                                       │
│  Contact Person                                      │
│  Phone: +92 xxx xxxxxxx                              │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  #  │ Medicine       │ Pack  │ Qty    │ Unit Price │ │
│     │                │ Size  │ Ordered│            │ │
│  ───┼────────────────┼───────┼────────┼────────────┤ │
│  1  │ Panadol 500mg  │ 10    │ 100    │ 12.50      │ │
│  2  │ Brufen 400mg   │ 20    │ 50     │ 8.00       │ │
│  ───┴────────────────┴───────┴────────┴────────────┤ │
│                                                      │
│                           Subtotal:     Rs 1,650.00  │
│                                                      │
│  Notes: [PO notes if any]                            │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  Authorized by: [created_by user name]               │
│  Approved by: [approved_by user name, if approved]   │
│                                                      │
│  [Standard footer from printDocument()]              │
└──────────────────────────────────────────────────────┘
```

Columns: #, Medicine Name, Pack Size, Qty Ordered, Unit Price, Total
No received quantities. No status badges. No GRN references.
This is what the supplier sees.

### Internal Copy layout

Same as Supplier Copy, plus:
- Additional columns: Qty Received, Remaining, Line Status
- Per-line status: "Received", "Partial (X/Y)", "Pending"
- GRN reference numbers listed below the table if any GRNs exist
- PO status shown prominently (draft/pending_approval/approved/
  partially_received/received/closed_short/cancelled)

### Data source

The PO detail page already fetches PO header + line items + supplier
info. No new server action needed — pass existing data to the
build function.

### Subtotal calculation

Sum of (qty_ordered × unit_price) per line. This is the PO value,
not the received value. Internal copy can additionally show
"Received Value" as sum of (qty_received × unit_price).

---

## View 2 — Supplier Ledger Print

### Location

Print button on Supplier Ledger Detail page
(/superadmin/ledger/suppliers/[id]).

### Print scope

**Print what's on screen.** The page has date-range filters
(from/to, with "Show All"). The print captures whatever the
current filtered dataset is. The subtitle reflects the filter:
- "1 June 2026 – 30 June 2026" (date range active)
- "All Transactions" (Show All active)

### Layout

```
┌──────────────────────────────────────────────────────┐
│  [Standard PharmaCare header]                        │
│                                                      │
│  SUPPLIER LEDGER                                     │
│  Supplier: ABC Pharmaceuticals                       │
│  Contact: Muhammad Ali │ Phone: +92 300 1234567      │
│  Period: 01 Jun 2026 – 30 Jun 2026                   │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  Date     │ Description        │ Debit  │ Credit  │  │
│           │                    │        │         │  │
│  ─────────┼────────────────────┼────────┼─────────┤  │
│  01 Jun   │ GRN #GRN-2026-001 │        │ 5,000   │  │
│  05 Jun   │ Payment (Cash)     │ 3,000  │         │  │
│  15 Jun   │ GRN #GRN-2026-005 │        │ 8,500   │  │
│  ─────────┴────────────────────┴────────┴─────────┤  │
│                                                      │
│  Opening Balance:                         0.00       │
│  Total Debits:                        3,000.00       │
│  Total Credits:                      13,500.00       │
│  Closing Balance:                    10,500.00 Cr    │
│                                                      │
│  [Standard footer]                                   │
└──────────────────────────────────────────────────────┘
```

### Columns

Date, Description (reference_type + reference number), Debit,
Credit, Running Balance (optional — include if the on-screen
table shows it; omit if the page only shows debit/credit without
running balance)

### Summary block

Below the table:
- Opening Balance (balance before the filtered period)
- Total Debits (period sum)
- Total Credits (period sum)
- Closing Balance (opening + credits - debits, with Cr/Dr suffix)

IMPORTANT: The opening balance calculation depends on whether
the page currently computes it. If the existing getPartyLedger()
server action returns transactions without an opening balance
for the filtered period, do NOT add that calculation in 15D.
Print what's on screen — no new data. Add a note in the spec
for a future enhancement if opening/closing balance is needed.

If the page does not show opening/closing balance today, the
print summary is simply:
- Total Debits
- Total Credits
- Net Balance (Dr/Cr)

Match whatever the on-screen view shows.

---

## View 3 — Customer Ledger Print

### Location

Print button on Customer Ledger Detail page
(/superadmin/ledger/customers/[id]).

### Print scope

Same as Supplier Ledger — print what's on screen with active
date filters reflected in subtitle.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  [Standard PharmaCare header]                        │
│                                                      │
│  CUSTOMER LEDGER (UDHAAR)                            │
│  Customer: Rizwan Ahmed                              │
│  Phone: +92 321 9876543                              │
│  Credit Balance: Rs 2,500.00                         │
│  Period: 01 Jun 2026 – 30 Jun 2026                   │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  Date     │ Description        │ Debit  │ Credit  │  │
│  ─────────┼────────────────────┼────────┼─────────┤  │
│  03 Jun   │ Sale #INV-0042     │ 1,200  │         │  │
│  10 Jun   │ Payment (Cash)     │        │ 500     │  │
│  22 Jun   │ Sale #INV-0058     │ 1,800  │         │  │
│  ─────────┴────────────────────┴────────┴─────────┤  │
│                                                      │
│  Total Debits:                        3,000.00       │
│  Total Credits:                         500.00       │
│  Net Balance:                         2,500.00 Dr    │
│                                                      │
│  [Standard footer]                                   │
└──────────────────────────────────────────────────────┘
```

### Key difference from Supplier Ledger

- Title: "CUSTOMER LEDGER (UDHAAR)" — the term udhaar is
  used in Pakistani pharmacies for credit sales
- Credit Balance shown prominently below customer name
  (current balance, not period-filtered)
- Customer phone displayed (useful — pharmacist may print
  this to follow up on outstanding udhaar)

### Summary block

Same approach as Supplier Ledger — match on-screen data.

---

## View 4 — Cash Book Print

### Location

Print button on Cash Book page (/superadmin/ledger/cash-book).

### Print scope

Print what's on screen. The Cash Book has date navigation
(the handoff describes "date nav, summary bar, table").
The print captures the currently displayed date/range.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  [Standard PharmaCare header]                        │
│                                                      │
│  CASH BOOK                                           │
│  Period: 04 July 2026                                │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  SUMMARY                                             │
│  Opening Balance:                     10,000.00      │
│  Total Receipts:                       5,200.00      │
│  Total Payments:                       3,100.00      │
│  Closing Balance:                     12,100.00      │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  Date/Time │ Description      │ In     │ Out    │    │
│            │                  │        │        │    │
│  ──────────┼──────────────────┼────────┼────────┤    │
│  09:15 AM  │ Sale #INV-0065   │ 450    │        │    │
│  10:30 AM  │ Sale #INV-0066   │ 1,200  │        │    │
│  11:00 AM  │ Expense: Tea     │        │ 200    │    │
│  02:15 PM  │ Supplier Payment │        │ 2,900  │    │
│  ──────────┼──────────────────┼────────┼────────┤    │
│            │                  │        │        │    │
│  Running   │ Closing Balance  │        │12,100  │    │
│  ──────────┴──────────────────┴────────┴────────┤    │
│                                                      │
│  [Standard footer]                                   │
└──────────────────────────────────────────────────────┘
```

### Summary bar

If the on-screen Cash Book page has a summary bar (opening,
receipts, payments, closing), reproduce it in the print above
the transaction table. This gives the reader the headline
numbers before the detail.

### Running balance column

Include only if the on-screen table shows it. The handoff says
"correct running balance computation" for get_cash_book(), so
it likely does. If present, add a Running Balance column after
In/Out.

### Time display

If the cash book shows timestamps, use time-only for
single-day view (09:15 AM) or date+time for multi-day ranges
(01 Jul 09:15 AM).

---

## Implementation Sequence

### Step 1 — buildPOBodyHtml()

File: component where PO detail lives (likely
components/superadmin/PODetailPage.tsx or similar)

Or: create a shared build function in lib/print-utils.ts
alongside existing print infrastructure. This is a judgment
call — if PO detail is only accessible from one page, keep
the build function co-located. If multiple pages might print
a PO (e.g. admin also has PO access), put it in print-utils.

Implementation:
1. Add two buttons to PO detail page header area
2. Build the body HTML function with mode parameter
3. Wire up the async print handler
4. Test with at least one PO in each status:
   draft, approved, partially_received, received, closed_short

### Step 2 — buildSupplierLedgerBodyHtml()

File: component for Supplier Ledger Detail page

Implementation:
1. Add Print button to the page header/filter bar area
2. Build function reads the already-fetched transaction data
3. Respects current date filter for subtitle
4. Wire up async print handler
5. Test with a supplier that has multiple transaction types
   (GRNs + payments)

### Step 3 — buildCustomerLedgerBodyHtml()

File: component for Customer Ledger Detail page

Implementation:
1. Nearly identical to supplier ledger
2. Add credit balance display in header area
3. Use "CUSTOMER LEDGER (UDHAAR)" title
4. Test with a customer that has sales + payments

### Step 4 — buildCashBookBodyHtml()

File: component for Cash Book page

Implementation:
1. Add Print button to the page header
2. Summary block first, then transaction table
3. Respect current date navigation state
4. Wire up async print handler
5. Test with a day that has multiple transaction types

---

## Verification Checklist

For each of the 4 views, verify in browser print popup:

- [ ] Header: logo renders, pharmacy name in #0F6E56,
      address/phone/email below, 3px green border
- [ ] Title and subtitle correct for the document type
- [ ] Table renders with borders, aligned columns
- [ ] Negative numbers in #991B1B with parentheses
- [ ] Totals row visually distinct (bold, border)
- [ ] Footer: footer text + generated date pinned to page bottom
- [ ] Watermark: "CONFIDENTIAL" renders if enabled in settings
- [ ] Multi-page: if enough data, header repeats on page 2+
      via @page margin boxes (text only, no logo — known limitation)
- [ ] Print dialog produces clean output (no app shell, no scrollbars)

### PO-specific checks
- [ ] Supplier Copy: no received qty columns, no status badges
- [ ] Internal Copy: received qty, line status, GRN refs visible
- [ ] Subtotal correct (sum of ordered × unit_price)

---

## What Does NOT Change

- printDocument(), buildDocumentHtml(), openPrintWindow() — no changes
- print.css — no changes
- FALLBACK_PRINT_SETTINGS — no changes
- Balance Sheet, Trial Balance, Shift Report prints — no changes
- POS receipt (thermal) — separate system, untouched
- No new migrations
- No new settings keys

---

## Dependencies

- Phase 15A (migration 034) — CONFIRMED RUN ✓
- Phase 15B/C (printDocument infrastructure) — CONFIRMED WORKING ✓
  (Balance Sheet print verified via PDF output)

---

## Known Decisions

1. **Print what's on screen** — all ledger views print the
   currently filtered data, not the full unfiltered dataset.
   Filter state reflected in document subtitle.

2. **PO dual mode** — single buildPOBodyHtml() function with
   mode parameter, not two separate templates. Supplier copy
   hides receipt columns; internal copy shows everything.

3. **No new server actions** — all data is already fetched
   by the existing pages. Print functions consume what's
   already in component state. Exception: if any page doesn't
   currently have access to printSettings/pharmacyName, add
   the standard Promise.all fetch pattern in the click handler.

4. **Opening/closing balance in ledger prints** — include
   only if the on-screen view already shows this data. Do not
   compute new data for print that isn't available on screen.

---

## Open Question for Coding Agent

The PO detail page location and component name need to be
confirmed by reading the codebase. The spec assumes it exists
at a path like /superadmin/purchase-orders/[id] with a detail
component, but the exact file path should be verified before
implementation begins.

Similarly, verify the exact column structure of the supplier
ledger, customer ledger, and cash book tables to ensure the
print HTML matches the on-screen columns precisely.

---

## Spec Version
Created: 2026-07-05
Migration: none (no DB changes)
Depends on: Migration 034 (Phase 15A), Phase 15B/C infrastructure
Phase: 15D (follows 15C)