'use client'

import React from 'react'
import '@/app/print.css'
import type { PrintSettings } from '@/app/actions/settings'

// =============================================================================
// PrintDocument — Phase 15B shared component for all A4 printed documents.
//
// Uses a <table> root with <thead> / <tfoot> so the browser's native
// table-header-group / table-footer-group behaviour causes the header and
// footer to repeat automatically on every printed page. This is the only
// reliable pure-CSS cross-browser technique for repeating headers/footers.
//
// KNOWN LIMITATION — "first page only" / "last page only" settings:
// printSettings.logoEveryPage, headerEveryPage, and footerEveryPage are
// stored and passed in but are NOT enforced at the CSS level in this phase.
// The thead/tfoot table technique inherently repeats on every page — CSS
// has no mechanism to suppress a thead after page 1 or a tfoot before the
// last page without a JS pagination library (e.g. Paged.js). The header
// and footer are therefore always shown on every page regardless of these
// settings. True first/last-only suppression is deferred to a future phase.
//
// KNOWN LIMITATION — page numbers (deferred to Phase 15F):
// CSS counters with @page counter-increment are unreliable for repeating tfoot
// elements (shows "Page 0" in Chrome). JS beforeprint is also not viable —
// tfoot is a single DOM node regardless of page count, so per-page injection
// is impossible. Correct solution: server-side PDF (Puppeteer/WeasyPrint).
// The showPageNumbers setting is preserved in DB + interface but not rendered.
// TODO Phase 15F: implement page numbering via server-side PDF rendering.
//
// KNOWN LIMITATION — tfoot bottom-pinning:
// The tfoot repeats at the bottom of every FULL page via table-footer-group,
// but on the last (short) page it appears immediately after the last content
// row rather than at the true A4 bottom. True bottom-pinning on short pages
// requires JS-based pagination (e.g. Paged.js) — out of scope, accepted.
//
// KNOWN LIMITATION — watermark on Firefox:
// The .print-watermark uses position:fixed, which only renders on page 1
// in Firefox (longstanding browser bug). Works correctly on every page in
// Chrome/Edge. See print.css for full explanation and rationale.
// =============================================================================

export interface PrintDocumentProps {
  printSettings:     PrintSettings
  pharmacyName:      string
  documentTitle:     string
  documentSubtitle?: string
  /**
   * Allows a specific document to force watermark text on or off regardless
   * of the global setting. Useful for e.g. forcing "DRAFT" on an unconfirmed
   * purchase order, or suppressing watermark on a final signed document.
   * Set to null or omit to use the global printSettings values.
   */
  watermarkOverride?: {
    enabled: boolean
    text?:   string
  } | null
  children:         React.ReactNode
  /** Default true. Set false to hide the Print button (e.g. when embedding
   *  PrintDocument inside a modal that has its own print trigger). */
  showPrintButton?: boolean
}

export function PrintDocument({
  printSettings,
  pharmacyName,
  documentTitle,
  documentSubtitle,
  watermarkOverride = null,
  children,
  showPrintButton = true,
}: PrintDocumentProps) {

  // ── Effective watermark state ─────────────────────────────────────────────
  // Logo watermark is controlled exclusively by the global setting.
  // Text watermark can be overridden per-document via watermarkOverride.
  const showLogoWatermark     = printSettings.watermarkLogo && !!printSettings.logoUrl
  const showTextWatermark     = watermarkOverride?.enabled ?? printSettings.watermarkText
  const effectiveWatermarkText = watermarkOverride?.text ?? printSettings.watermarkTextValue
  const watermarkOpacity      = printSettings.watermarkOpacity / 100

  const showAnyWatermark = showLogoWatermark || showTextWatermark

  function handlePrint() {
    window.print()
  }

  // ── Generated date (computed once at render time) ─────────────────────────
  const generatedDate = new Date().toLocaleDateString('en-PK', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <>
      {/* Print button — hidden during printing via [data-print-hide] in globals.css */}
      <div
        data-print-hide
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}
      >
        {showPrintButton && (
          <button
            type="button"
            onClick={handlePrint}
            style={{
              fontSize: 12,
              padding: '6px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              background: '#0F6E56',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Print
          </button>
        )}
      </div>

      {/* ── Root table — thead/tfoot repeat natively on every printed page ── */}
      <table className="print-page-table">

        {/* ── HEADER — pharmacy branding + document title ─────────────────── */}
        <thead>
          <tr>
            <td className="print-header-cell">

              {/* Logo (shown when URL is set; logoEveryPage stored but not
                  enforced at CSS level — see file-level comment above) */}
              {printSettings.logoUrl && (
                <img
                  src={printSettings.logoUrl}
                  alt="Pharmacy logo"
                  style={{
                    maxHeight: 60,
                    maxWidth: 200,
                    objectFit: 'contain',
                    display: 'block',
                    marginBottom: 8,
                  }}
                />
              )}

              {/* Pharmacy info (headerEveryPage stored but not enforced at
                  CSS level — see file-level comment above) */}
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px' }}>
                {pharmacyName}
              </h1>

              {printSettings.pharmacyAddress && (
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 2px', whiteSpace: 'pre-line' }}>
                  {printSettings.pharmacyAddress}
                </p>
              )}

              {(printSettings.pharmacyPhone || printSettings.pharmacyEmail) && (
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 2px' }}>
                  {[printSettings.pharmacyPhone, printSettings.pharmacyEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}

              {printSettings.pharmacyLicense && (
                <p style={{ fontSize: 10, color: '#9ca3af', margin: '2px 0 0' }}>
                  License: {printSettings.pharmacyLicense}
                </p>
              )}

              <hr style={{ margin: '12px 0 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

              {/* Document title — always shown, not configurable */}
              <div style={{ marginTop: 12, marginBottom: 8 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>
                  {documentTitle}
                </h2>
                {documentSubtitle && (
                  <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                    {documentSubtitle}
                  </p>
                )}
              </div>

            </td>
          </tr>
        </thead>

        {/* ── FOOTER — footer text + generated date + page numbers ────────── */}
        <tfoot>
          <tr>
            <td className="print-footer-cell">

              {printSettings.footerText && (
                <p style={{ margin: '0 0 4px' }}>
                  {printSettings.footerText}
                </p>
              )}

              {/* footerEveryPage stored but not enforced at CSS level —
                  see file-level comment above */}
              {/* showPageNumbers is intentionally not rendered here — see
                  Phase 15F TODO in the file-level comment block above. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {printSettings.showGeneratedDate ? (
                  <span>Generated on {generatedDate}</span>
                ) : (
                  <span />
                )}
                {printSettings.pharmacyLicense && (
                  <span>License: {printSettings.pharmacyLicense}</span>
                )}
              </div>

            </td>
          </tr>
        </tfoot>

        {/* ── BODY — watermark layer + document content ───────────────────── */}
        <tbody>
          <tr>
            <td className="print-body-cell">

              {/* Watermark — hidden on screen, shown on print via CSS.
                  position:fixed in @media print centers it on each page in
                  Chrome/Edge. Firefox page-1-only limitation: see print.css. */}
              {showAnyWatermark && (
                <div
                  className="print-watermark"
                  style={{ opacity: watermarkOpacity }}
                  aria-hidden="true"
                >
                  {showLogoWatermark && (
                    <img
                      src={printSettings.logoUrl}
                      alt=""
                      style={{ maxWidth: 300, maxHeight: 300 }}
                    />
                  )}
                  {showTextWatermark && (
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: 800,
                        color: '#9ca3af',
                        transform: 'rotate(-30deg)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}
                    >
                      {effectiveWatermarkText}
                    </div>
                  )}
                </div>
              )}

              {/* Document body content — z-index above watermark */}
              <div className="print-body-content">
                {children}
              </div>

            </td>
          </tr>
        </tbody>

      </table>
    </>
  )
}
