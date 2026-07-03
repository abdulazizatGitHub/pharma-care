# PharmaCare — Phase 15: Unified Print System

## Overview

A single, configurable print design system for all A4-style business
documents across the application (Balance Sheet, Trial Balance,
Purchase Orders, Supplier Ledger, Customer Ledger, Cash Book, Shift
Reports, User details, etc).

POS receipts (thermal 80mm) remain separate — different format,
different printer, different use case. This phase does NOT touch
receipt printing.

---

## Design Principle

One global print design, configured once by superadmin, applied
consistently everywhere. No per-module visual customization in this
phase — that can be added later if needed.

---

## Part 1 — Print Settings (Superadmin Configurable)

### 1.1 New settings page section

Location: /superadmin/settings → new "Print & Document Design" section

Fields:
```
Logo                    [upload image] [preview] [remove]
Pharmacy Name           (pre-filled from existing pharmacy_name setting)
Address                 [textarea, 2 lines]
Phone                   [text]
Email                   [text]
License / Reg No.       [text, optional]
Footer Text             [textarea] e.g. "Thank you for choosing
                         PharmaCare — your trusted neighborhood pharmacy"

Document Header Options:
  Show logo on:          [Every page] [First page only]
  Show pharmacy info on: [Every page] [First page only]

Document Footer Options:
  Show footer text on:   [Every page] [Last page only]
  Show page numbers:     [toggle] — "Page X of Y"
  Show generated date:   [toggle] — "Generated on [date]"

Watermark:
  Logo watermark:        [toggle] — faint centered logo background
  Text watermark:        [toggle] + [text input]
                          (e.g. "CONFIDENTIAL", "DRAFT")
  Watermark opacity:     [slider 5-20%, default 8%]
```

### 1.2 Logo storage

Supabase Storage bucket: `pharmacy-assets` (public bucket)
Path: `pharmacy-assets/logo.{ext}`
Max file size: 2MB
Accepted formats: PNG, JPG, SVG
On upload: replace existing file (same path, overwrite)

### 1.3 Settings keys (new)

```sql
'print_logo_url'              → storage public URL or empty
'print_pharmacy_address'      → text
'print_pharmacy_phone'        → text
'print_pharmacy_email'        → text
'print_pharmacy_license'      → text
'print_footer_text'           → text
'print_logo_every_page'       → 'true' | 'false'
'print_header_every_page'     → 'true' | 'false'
'print_footer_every_page'     → 'true' | 'false'
'print_show_page_numbers'     → 'true' | 'false'
'print_show_generated_date'   → 'true' | 'false'
'print_watermark_logo'        → 'true' | 'false'
'print_watermark_text'        → 'true' | 'false'
'print_watermark_text_value'  → text, default 'CONFIDENTIAL'
'print_watermark_opacity'     → numeric string, default '8'
```

---

## Part 2 — Shared PrintDocument Component

### 2.1 Component location

`components/print/PrintDocument.tsx`

### 2.2 Usage pattern

```tsx
<PrintDocument
  printSettings={settings}      // fetched server-side, passed down
  documentTitle="Balance Sheet"
  documentSubtitle="As of 29 June 2026"
  watermarkOverride={null}      // optional per-document override
>
  {/* body content — unique per module */}
  <BalanceSheetBody rows={rows} />
</PrintDocument>
```

### 2.3 Component responsibilities

- Renders header (logo + pharmacy info) per configured rules
- Renders the body (children) — module-specific content
- Renders footer (footer text + page numbers + generated date)
  per configured rules
- Renders watermark if enabled (logo and/or text, configurable opacity)
- Provides print-specific CSS via a shared stylesheet/class names
- Exposes a `[Print]` trigger button (calls window.print())
- On screen: shows a "Print Preview" styled container (white page,
  shadow, A4 aspect ratio) so the user sees roughly what will print
- On print: applies @page margins, hides everything outside the
  document, handles page-break CSS for multi-page documents

### 2.4 Print CSS architecture

Create: `app/print.css` (or extend existing global print styles)
Shared classes:
```
.print-page           — A4 sizing, margins
.print-header         — logo + pharmacy info block
.print-header-repeat   — applied when "every page" is selected
                         (CSS: position runs at top of each printed page
                         via @page or repeated header technique)
.print-footer         — footer text + page number + date
.print-watermark      — absolutely positioned, centered, low opacity
.print-body           — the actual document content
.print-page-break      — forces a page break before an element
.print-avoid-break     — prevents an element splitting across pages
```

Note on repeating headers/footers in CSS print: browsers do not have
a native "repeat this on every page" mechanism outside of CSS-in-print
text trickery. The standard cross-browser approach is to use a
`<table>` based layout where `<thead>` and `<tfoot>` natively repeat
on every printed page. PrintDocument should use this technique:
```html
<table class="print-page">
  <thead><!-- header, repeats automatically --></thead>
  <tfoot><!-- footer, repeats automatically --></tfoot>
  <tbody><!-- body content --></tbody>
</table>
```
This is the only reliable cross-browser way to repeat header/footer
on every printed page without JavaScript pagination hacks.

---

## Part 3 — Server Action

### 3.1 getPrintSettings()

`app/actions/settings.ts`

```typescript
export async function getPrintSettings(): Promise<{
  data: PrintSettings | null
  error: string | null
}>
```

Fetches all `print_*` settings keys in one query, returns a typed
object. Available to all roles (read-only) since any role may need
to print a document.

### 3.2 updatePrintSettings()

Superadmin only. Validates and updates all print_* keys.
Separate action: uploadPharmacyLogo(file) — handles Supabase
Storage upload, returns public URL, updates print_logo_url setting.

---

## Part 4 — Migration

### 4.1 Migration 034

```sql
-- Print settings (all default empty/false except sensible defaults)
INSERT INTO settings (key, value) VALUES
  ('print_logo_url',             ''),
  ('print_pharmacy_address',     ''),
  ('print_pharmacy_phone',       ''),
  ('print_pharmacy_email',       ''),
  ('print_pharmacy_license',     ''),
  ('print_footer_text',          ''),
  ('print_logo_every_page',      'false'),
  ('print_header_every_page',    'true'),
  ('print_footer_every_page',    'false'),
  ('print_show_page_numbers',    'true'),
  ('print_show_generated_date',  'true'),
  ('print_watermark_logo',       'false'),
  ('print_watermark_text',       'false'),
  ('print_watermark_text_value', 'CONFIDENTIAL'),
  ('print_watermark_opacity',    '8')
ON CONFLICT (key) DO NOTHING;
```

### 4.2 Storage bucket

Created via Supabase dashboard or SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('pharmacy-assets', 'pharmacy-assets', true)
ON CONFLICT (id) DO NOTHING;
```
RLS policy: superadmin can upload/update, everyone can read (public).

---

## Part 5 — Migration of Existing Print Functions

Convert these existing scattered print implementations to use
PrintDocument:

```
CheckoutModal.tsx receipt        → STAYS AS-IS (thermal, separate)
Shift report (buildShiftReportHtml) → migrate to PrintDocument
Balance Sheet print              → migrate to PrintDocument
Trial Balance print              → migrate to PrintDocument
```

New print views to build using PrintDocument:
```
Purchase Order print/export
Supplier Ledger print
Customer Ledger print
Cash Book print
User details print (single user profile)
```

---

## Part 6 — Implementation Sequence

### Phase 15A — Foundation
- Migration 034 (settings + storage bucket)
- getPrintSettings() / updatePrintSettings() server actions
- uploadPharmacyLogo() server action
- Settings UI: Print & Document Design section

### Phase 15B — Shared Component
- PrintDocument.tsx component
- print.css shared stylesheet
- Table-based repeating header/footer technique
- Watermark rendering (logo + text)

### Phase 15C — Migrate Existing
- Balance Sheet → use PrintDocument
- Trial Balance → use PrintDocument
- Shift Report → use PrintDocument

### Phase 15D — New Print Views
- Purchase Order print
- Supplier Ledger print
- Customer Ledger print
- Cash Book print

### Phase 15E — User detail print (lower priority)
- Single user profile print view

---

## What Does NOT Change

- POS receipt printing (thermal, CheckoutModal.tsx) — separate system
- Generic alternatives wizard — no print needed
- All existing screen UI — print is additive, not a UI redesign

---

## Spec Version
Created: 2026-06-29
Migration: 034
Phases: 15A → 15B → 15C → 15D → 15E