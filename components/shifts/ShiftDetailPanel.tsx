'use client'

import React, { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { getShiftSummary } from '@/app/actions/shifts'
import { getPrintSettings, getPharmacyName } from '@/app/actions/settings'
import { printDocument, FALLBACK_PRINT_SETTINGS, PRINT_STYLES } from '@/lib/print-utils'
import type { ShiftRow, ShiftSummaryData } from '@/app/actions/shifts'

function fmtPKR(n: number) {
  return 'Rs ' + Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return 'ongoing'
  const mins = Math.floor((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface Props {
  shift:   ShiftRow | null
  onClose: () => void
}

export function ShiftDetailPanel({ shift, onClose }: Props) {
  const [summary, setSummary]   = useState<ShiftSummaryData | null>(null)
  const [loading, setLoading]   = useState(false)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!shift) { setSummary(null); return }
    setLoading(true)
    getShiftSummary(shift.id).then(res => {
      setSummary(res.data)
      setLoading(false)
    })
  }, [shift?.id])

  function buildShiftReportBodyHtml(): string {
    if (!shift || !summary) return ''

    const diffVal   = Number(shift.cash_difference ?? 0)
    const diffSign  = diffVal >= 0 ? '+' : ''
    const diffColor = Math.abs(diffVal) > 0.005
      ? (diffVal < 0 ? '#dc2626' : '#16a34a')
      : '#111827'

    const sectionTitle = (t: string) =>
      `<p style="margin:16px 0 6px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280">${t}</p>`

    const divider = `<div style="border-top:1px solid #e5e7eb;margin:8px 0"></div>`

    const row = (label: string, value: string, bold = false, color = '#374151') =>
      `<div style="display:flex;justify-content:space-between;margin-bottom:3px">` +
      `<span style="color:#6b7280;font-size:12px">${label}</span>` +
      `<span style="font-weight:${bold ? 700 : 400};color:${color};font-size:12px">${value}</span>` +
      `</div>`

    const docTitleHtml = `<div style="${PRINT_STYLES.docTitle}">Shift Report</div>` +
      `<div style="text-align:center;font-size:12px;color:#6B7280;margin:-14px 0 20px">${fmtDateTime(shift.opened_at)} · ${fmtDuration(shift.opened_at, shift.closed_at)}</div>`

    const cashierSection = shift.cashier_name
      ? sectionTitle('Cashier') + row('Name', escHtml(shift.cashier_name))
      : ''

    const timingSection = sectionTitle('Timing') + [
      row('Opened',   fmtDateTime(shift.opened_at)),
      shift.closed_at ? row('Closed', fmtDateTime(shift.closed_at)) : '',
      row('Duration', fmtDuration(shift.opened_at, shift.closed_at)),
    ].join('')

    const salesSection = sectionTitle('Sales') + [
      row('Cash sales',   `${fmtPKR(summary.cashSalesTotal)} (${summary.totalSalesCount} txn)`),
      row('Credit sales', fmtPKR(summary.creditSalesTotal)),
      row('Total sales',  fmtPKR(summary.cashSalesTotal + summary.creditSalesTotal), true),
      summary.expensesTotal > 0
        ? row('Cash expenses', `− ${fmtPKR(summary.expensesTotal)}`)
        : '',
    ].join('')

    const recoSection = sectionTitle('Cash Reconciliation') + [
      row('Opening cash',    fmtPKR(Number(shift.opening_cash))),
      row('+ Cash sales',    fmtPKR(summary.cashSalesTotal)),
      summary.expensesTotal > 0
        ? row('− Cash expenses', fmtPKR(summary.expensesTotal))
        : '',
      row('Expected cash',   fmtPKR(summary.expectedCash), true),
      shift.closing_cash != null
        ? row('Actual cash', fmtPKR(Number(shift.closing_cash)))
        : '',
      shift.closing_cash != null
        ? row('Difference',  `${diffSign}${fmtPKR(diffVal)}`, true, diffColor)
        : '',
    ].join('')

    const byHourSection = summary.salesByHour.length > 0
      ? sectionTitle('Sales by Hour') +
        summary.salesByHour.map(({ hour, total, count }) =>
          row(`${String(hour).padStart(2, '0')}:00`, `${fmtPKR(total)} (${count})`)
        ).join('')
      : ''

    const notesSection = shift.notes
      ? sectionTitle('Notes') +
        `<p style="margin:0;line-height:1.5;font-size:12px;color:#374151">${escHtml(shift.notes)}</p>`
      : ''

    return [
      docTitleHtml,
      cashierSection ? cashierSection + divider : '',
      timingSection  + divider,
      salesSection   + divider,
      recoSection,
      byHourSection  ? divider + byHourSection : '',
      notesSection   ? divider + notesSection  : '',
    ].join('')
  }

  const visible = !!shift

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 30,
          background: 'rgba(0,0,0,0.25)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 31,
          width: 420, background: '#fff',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {shift && (
          <>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>Shift Report</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                  {shift.cashier_name ?? 'Pharmacist'} · {fmtDuration(shift.opened_at, shift.closed_at)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={printing}
                  onClick={async () => {
                    if (!shift) return
                    setPrinting(true)
                    try {
                      const [psResult, pharmacyName] = await Promise.all([
                        getPrintSettings(),
                        getPharmacyName(),
                      ])
                      printDocument({
                        printSettings:    psResult.data ?? FALLBACK_PRINT_SETTINGS,
                        pharmacyName,
                        documentTitle:    'Shift Report',
                        documentSubtitle: `${fmtDateTime(shift.opened_at)} · ${fmtDuration(shift.opened_at, shift.closed_at)}`,
                        bodyHtml:         buildShiftReportBodyHtml(),
                      })
                    } finally {
                      setPrinting(false)
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', fontSize: 12, fontWeight: 500,
                    border: '1px solid #d1d5db', borderRadius: 6,
                    background: '#fff', cursor: printing ? 'wait' : 'pointer',
                    color: '#374151', opacity: printing ? 0.6 : 1,
                  }}
                >
                  <Printer size={13} /> {printing ? 'Preparing…' : 'Print'}
                </button>
                <button
                  onClick={onClose}
                  style={{ display: 'flex', alignItems: 'center', padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#6b7280' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 20, flex: 1 }}>
              {loading ? (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
              ) : summary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Timing */}
                  <Section title="Timing">
                    <Row label="Opened"   value={fmtDateTime(shift.opened_at)} />
                    {shift.closed_at && <Row label="Closed" value={fmtDateTime(shift.closed_at)} />}
                    <Row label="Duration" value={fmtDuration(shift.opened_at, shift.closed_at)} />
                  </Section>

                  {/* Sales */}
                  <Section title="Sales">
                    <Row label="Cash sales"   value={`${fmtPKR(summary.cashSalesTotal)} (${summary.totalSalesCount} txn)`} />
                    <Row label="Credit sales" value={fmtPKR(summary.creditSalesTotal)} />
                    <Row label="Total sales"  value={fmtPKR(summary.cashSalesTotal + summary.creditSalesTotal)} bold />
                    {summary.expensesTotal > 0 && (
                      <Row label="Cash expenses" value={`− ${fmtPKR(summary.expensesTotal)}`} />
                    )}
                  </Section>

                  {/* Cash reconciliation */}
                  <Section title="Cash Reconciliation">
                    <Row label="Opening cash"   value={fmtPKR(Number(shift.opening_cash))} />
                    <Row label="+ Cash sales"   value={fmtPKR(summary.cashSalesTotal)} />
                    {summary.expensesTotal > 0 && (
                      <Row label="− Cash expenses" value={fmtPKR(summary.expensesTotal)} />
                    )}
                    <Row label="Expected cash"  value={fmtPKR(summary.expectedCash)} bold />
                    {shift.closing_cash != null && (
                      <>
                        <Row label="Actual cash"  value={fmtPKR(Number(shift.closing_cash))} />
                        <Row
                          label="Difference"
                          value={(shift.cash_difference != null && shift.cash_difference >= 0 ? '+' : '') + fmtPKR(Number(shift.cash_difference ?? 0))}
                          highlight={shift.cash_difference != null && Math.abs(shift.cash_difference) > 0.005 ? (shift.cash_difference < 0 ? 'red' : 'green') : undefined}
                          bold
                        />
                      </>
                    )}
                  </Section>

                  {/* Sales by hour */}
                  {summary.salesByHour.length > 0 && (
                    <Section title="Sales by Hour">
                      {summary.salesByHour.map(({ hour, total, count }) => (
                        <Row
                          key={hour}
                          label={`${String(hour).padStart(2, '0')}:00`}
                          value={`${fmtPKR(total)} (${count})`}
                        />
                      ))}
                    </Section>
                  )}

                  {/* Notes */}
                  {shift.notes && (
                    <Section title="Notes">
                      <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{shift.notes}</p>
                    </Section>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Unable to load shift details.</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: 'red' | 'green' }) {
  const color = highlight === 'red' ? '#dc2626' : highlight === 'green' ? '#16a34a' : (bold ? '#111827' : '#374151')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: bold ? 600 : 400, color }}>{value}</span>
    </div>
  )
}
