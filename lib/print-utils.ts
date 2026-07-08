import type { PrintSettings } from '@/app/actions/settings'

export const FALLBACK_PRINT_SETTINGS: PrintSettings = {
  logoUrl: '', pharmacyAddress: '', pharmacyPhone: '',
  pharmacyEmail: '', pharmacyLicense: '', footerText: '',
  logoEveryPage: false, headerEveryPage: true,
  footerEveryPage: false, showPageNumbers: true,
  showGeneratedDate: true, watermarkLogo: false,
  watermarkText: false, watermarkTextValue: 'CONFIDENTIAL',
  watermarkOpacity: 8,
}

// =============================================================================
// print-utils.ts — Single source of truth for all business document printing.
//
// All A4 print output goes through printDocument() → buildDocumentHtml()
// → openPrintWindow(). The popup window pattern avoids all the app-shell
// overflow/height clipping issues that made @media print unreliable.
//
// Why popup works for page numbers (unlike @media print):
//   The popup has a clean <body> with no overflow containers. position:fixed
//   elements pin correctly to each page bottom. CSS counter(page) / counter(pages)
//   work as specified in CSS Paged Media because there is no interfering container.
//
// Callers: every Print button in the app imports printDocument() from here.
// The PrintDocument React component (components/print/PrintDocument.tsx) provides
// the on-screen preview only — it does not print.
// =============================================================================

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Escape a plain string for use as a CSS string literal value (inside quotes).
function cssStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

// =============================================================================
// Shared design tokens for all print body HTML builders.
// Every buildXxxBodyHtml() uses these inline-style strings so all reports
// share the same visual language.
// =============================================================================

export const PRINT_STYLES = {
  // Section 1 — Document Title
  docTitle: 'text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-size:16px;font-weight:700;color:#1F2937;margin:0 0 20px',

  // Section 2 — Metadata block
  metaTable: 'width:100%;border:1px solid #E5E7EB;border-collapse:separate;border-spacing:0;margin-bottom:20px',
  metaCellLeft:  'padding:12px 16px;vertical-align:top;width:50%;border-right:1px solid #E5E7EB',
  metaCellRight: 'padding:12px 16px;vertical-align:top;width:50%',
  metaLabel: 'color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px',
  metaLabelSpaced: 'color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:10px;margin-bottom:2px',
  metaValueLarge: 'color:#1F2937;font-size:14px;font-weight:600',
  metaValue: 'color:#1F2937;font-size:13px',
  metaValueGreen: 'color:#0F6E56;font-size:13px;font-weight:600',

  // Section 3 — Data table
  dataTable: 'width:100%;border-collapse:collapse;margin-bottom:0',
  TH:  'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#374151;padding:8px 12px;border:1px solid #E5E7EB;background:rgba(249,250,251,0.85);text-align:left',
  THR: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#374151;padding:8px 12px;border:1px solid #E5E7EB;background:rgba(249,250,251,0.85);text-align:right',
  TD:  'font-size:12px;color:#1F2937;padding:8px 12px;border:1px solid #E5E7EB;vertical-align:top',
  TDR: 'font-size:12px;color:#1F2937;padding:8px 12px;border:1px solid #E5E7EB;text-align:right;font-variant-numeric:tabular-nums;vertical-align:top',
  TDE: 'font-size:12px;color:#9CA3AF;padding:8px 12px;border:1px solid #E5E7EB;text-align:center;vertical-align:top',
  rowOdd:  'background:#FFFFFF',
  rowEven: 'background:rgba(250,250,250,0.75)',

  // Section 4 — Summary container
  summaryWrap:  'border:1px solid #E5E7EB;background:rgba(250,250,250,0.8);padding:16px 20px;margin-top:24px',
  summaryTitle: 'font-size:11px;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;border-bottom:1px solid #E5E7EB;padding-bottom:8px;margin-bottom:12px',
  summaryTable: 'width:100%;border-collapse:collapse',
  summaryRow: 'padding:4px 0;font-size:13px;color:#374151',
  summaryRowRight: 'padding:4px 0;font-size:13px;color:#374151;text-align:right;font-variant-numeric:tabular-nums',
  summaryGrandLeft:  'padding:8px 0 0;font-size:14px;font-weight:700;border-top:1px solid #D1D5DB',
  summaryGrandRight: 'padding:8px 0 0;font-size:14px;font-weight:700;border-top:1px solid #D1D5DB;text-align:right;font-variant-numeric:tabular-nums',

  // Colours
  green: '#0F6E56',
  red:   '#991B1B',
  gray:  '#6B7280',
  dark:  '#1F2937',
}

export function printCurrency(n: number): string {
  return 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function printNumber(n: number): string {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildDocumentHtml(options: {
  printSettings:     PrintSettings
  pharmacyName:      string
  documentTitle:     string
  documentSubtitle?: string
  bodyHtml:          string
  watermarkOverride?: { enabled: boolean; text?: string } | null
}): string {
  const {
    printSettings: ps,
    pharmacyName,
    documentTitle,
    documentSubtitle,
    bodyHtml,
    watermarkOverride = null,
  } = options

  const generatedDate = new Date().toLocaleDateString('en-PK', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  // ── Watermark logic ──────────────────────────────────────────────────────
  const showLogoWatermark = ps.watermarkLogo && !!ps.logoUrl
  const showTextWatermark = watermarkOverride?.enabled ?? ps.watermarkText
  const watermarkText     = watermarkOverride?.text ?? ps.watermarkTextValue
  const watermarkOpacity  = ps.watermarkOpacity / 100
  const showAnyWatermark  = showLogoWatermark || showTextWatermark

  const watermarkHtml = showAnyWatermark ? `
    <div class="doc-watermark">
      ${showLogoWatermark ? `
        <img src="${esc(ps.logoUrl)}"
          style="max-width:250px; max-height:250px; opacity:${watermarkOpacity}">` : ''}
      ${showTextWatermark ? `
        <div style="font-size:90px; font-weight:800; color:#6B7280;
          transform:rotate(-35deg); opacity:${watermarkOpacity};
          white-space:nowrap; user-select:none; letter-spacing:0.02em">
          ${esc(watermarkText)}
        </div>` : ''}
    </div>` : ''

  // ── Header fields ────────────────────────────────────────────────────────
  const logoHtml = ps.logoUrl
    ? `<img class="doc-logo" src="${esc(ps.logoUrl)}" alt="Pharmacy logo">`
    : ''

  const addressHtml = ps.pharmacyAddress
    ? `<div class="doc-pharmacy-info" style="white-space:pre-line">${esc(ps.pharmacyAddress)}</div>`
    : ''

  const contactLine = [ps.pharmacyPhone, ps.pharmacyEmail].filter(Boolean).join(' · ')
  const contactHtml = contactLine
    ? `<div class="doc-pharmacy-info">${esc(contactLine)}</div>`
    : ''

  const licenseHtml = ps.pharmacyLicense
    ? `<div class="doc-pharmacy-info" style="font-size:10px; color:#9ca3af">License: ${esc(ps.pharmacyLicense)}</div>`
    : ''

  // ── @page margin box strings — plain text, CSS-escaped via cssStr() ─────────
  // NOT HTML-escaped. Used in @top-* and @bottom-* margin boxes.
  // TODO Phase 15F: Page numbers require Puppeteer/WeasyPrint server-side rendering.
  // showPageNumbers is kept in DB but not rendered until Phase 15F.
  const footerLeft = [
    ps.footerText || '',
    ps.showGeneratedDate ? `Generated on ${generatedDate}` : '',
  ].filter(Boolean).join(' · ')

  const footerRight = ps.pharmacyLicense
    ? `License: ${ps.pharmacyLicense}`
    : ''

  // Compact repeating header for pages 2+ via @top margin boxes.
  // Page 1 gets the full branded in-body header (normal document flow).
  const headerLeft  = pharmacyName
  const headerRight = documentTitle + (documentSubtitle ? ` — ${documentSubtitle}` : '')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(documentTitle)} — ${esc(pharmacyName)}</title>
<style>
  /* Pages 2+: compact text header in top margin via @top margin boxes.
     Page 1: full branded header is in document flow (not in margin box).
     @page :first overrides top margin to minimal since page 1 header
     is in-body and needs no margin-box space. */
  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;

    @top-left {
      content: "${cssStr(headerLeft)}";
      font-size: 9pt;
      font-weight: 700;
      color: #0F6E56;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      vertical-align: bottom;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 3pt;
    }

    @top-right {
      content: "${cssStr(headerRight)}";
      font-size: 8pt;
      color: #6b7280;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      vertical-align: bottom;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 3pt;
    }

    @bottom-left {
      content: "${cssStr(footerLeft)}";
      font-size: 8pt;
      color: #6b7280;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    @bottom-right {
      content: "${cssStr(footerRight)}";
      font-size: 8pt;
      color: #6b7280;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
  }

  /* Page 1: suppress the compact margin-box header (full branded header is
     already in document flow). Reduce top margin since no margin box occupies it. */
  @page :first {
    margin-top: 5mm;

    @top-left {
      content: none;
    }

    @top-right {
      content: none;
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #111827;
    background: white;
    /* no padding-top — header is in normal document flow on page 1 */
    /* no padding-bottom — @page bottom margin handles footer spacing */
  }

  .doc-header {
    /* Normal document flow — appears once on page 1 only.
       Pages 2+ get a compact header via @page @top-left/@top-right. */
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 3px solid #0F6E56;
    margin-bottom: 16px;
  }

  .doc-logo {
    max-height: 70px;
    max-width: 120px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .doc-header-text {
    flex: 1;
  }

  .doc-pharmacy-name {
    font-size: 18px;
    font-weight: 800;
    color: #0F6E56;
    margin-bottom: 3px;
    letter-spacing: -0.3px;
  }

  .doc-pharmacy-info {
    font-size: 10px;
    color: #6b7280;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .doc-body {
    margin-top: 0; /* body padding-top handles the gap below the fixed header */
  }

  /* .doc-footer removed — footer is now rendered via @page margin boxes
     (@bottom-left / @bottom-right). No in-body footer div exists. */

  /* Watermark: position:fixed covers each page. Works in Chrome/Edge.
     Firefox renders page 1 only (longstanding browser bug) — accepted. */
  .doc-watermark {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: none;
  }

  .doc-content {
    position: relative;
    z-index: 1;
    padding: 0 4px;
  }

  /* Page break utilities */
  .page-break  { page-break-before: always; break-before: page; }
  .avoid-break { page-break-inside: avoid;  break-inside: avoid; }

  /* Table defaults */
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 5px 4px; }

  [data-print-hide] { display: none !important; }

  .doc-section-header {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #0F6E56 !important;
    margin-bottom: 8px;
    margin-top: 4px;
  }

  .doc-negative { color: #991B1B !important; }

  .doc-positive { color: #0F6E56 !important; }

  .doc-table-header {
    background-color: #f0fdf4 !important;
    font-weight: 600;
    font-size: 11px;
  }

  .doc-total-row {
    font-weight: 700;
    border-top: 1.5px solid #111827;
    padding-top: 6px;
  }

  .doc-grand-total {
    font-size: 14px;
    font-weight: 800;
    color: #0F6E56 !important;
  }
</style>
</head>
<body>

${watermarkHtml}

<div class="doc-content">
  <div class="doc-header">
    ${logoHtml}
    <div class="doc-header-text">
      <div class="doc-pharmacy-name">${esc(pharmacyName)}</div>
      ${addressHtml}
      ${contactHtml}
      ${licenseHtml}
    </div>
  </div>

  <div class="doc-body">
    ${bodyHtml}
  </div>
</div>


</body>
</html>`
}

function openPrintWindow(html: string): void {
  const pw = window.open('', '_blank', 'width=850,height=1100')
  if (!pw) {
    alert(
      'Print window was blocked. Please allow popups for this site and try again.'
    )
    return
  }
  pw.document.write(html)
  pw.document.close()
  pw.focus()

  // Wait for all resources (including the pharmacy logo from Supabase CDN) to
  // finish loading before opening the print dialog. The logo can take >500ms on
  // a cold request; using onload guarantees it is present in the print output.
  // Do not call pw.close() — let the user close after reviewing or Save as PDF.
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    pw.print()
  }

  // Primary: fire when all images + resources are loaded
  pw.onload = () => setTimeout(doPrint, 200)

  // Fallback: if onload already fired (cached page, no images) or never fires
  setTimeout(doPrint, 3000)
}

export function printDocument(options: {
  printSettings:     PrintSettings
  pharmacyName:      string
  documentTitle:     string
  documentSubtitle?: string
  bodyHtml:          string
  watermarkOverride?: { enabled: boolean; text?: string } | null
}): void {
  const html = buildDocumentHtml(options)
  openPrintWindow(html)
}
