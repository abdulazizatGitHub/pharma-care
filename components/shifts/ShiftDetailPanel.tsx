'use client'

import React, { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { getShiftSummary } from '@/app/actions/shifts'
import type { ShiftRow, ShiftSummaryData } from '@/app/actions/shifts'

function fmtPKR(n: number) {
  return 'Rs ' + Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function printShiftReport(htmlContent: string) {
  const pw = window.open('', '_blank', 'width=600,height=800')
  if (!pw) return
  pw.document.write(`<!DOCTYPE html><html><head><style>
    body { font-family: sans-serif; font-size: 12px;
      padding: 24px; max-width: 600px; margin: 0 auto; }
    .section-title { font-weight: 700; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: #6b7280; margin: 16px 0 6px; }
    .row { display: flex; justify-content: space-between;
      margin-bottom: 3px; }
    .bold { font-weight: 700; }
    .divider { border-top: 1px solid #e5e7eb; margin: 8px 0; }
  </style></head><body>${htmlContent}</body></html>`)
  pw.document.close()
  pw.focus()
  pw.print()
  pw.close()
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
  const [summary, setSummary] = useState<ShiftSummaryData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!shift) { setSummary(null); return }
    setLoading(true)
    getShiftSummary(shift.id).then(res => {
      setSummary(res.data)
      setLoading(false)
    })
  }, [shift?.id])

  function buildShiftReportHtml(): string {
    if (!shift || !summary) return ''

    const diffVal  = Number(shift.cash_difference ?? 0)
    const diffSign = diffVal >= 0 ? '+' : ''
    const diffColor = Math.abs(diffVal) > 0.005
      ? (diffVal < 0 ? 'color:#dc2626' : 'color:#16a34a')
      : ''

    const timingRows = [
      `<div class="row"><span>Opened</span><span>${fmtDateTime(shift.opened_at)}</span></div>`,
      shift.closed_at ? `<div class="row"><span>Closed</span><span>${fmtDateTime(shift.closed_at)}</span></div>` : '',
      `<div class="row"><span>Duration</span><span>${fmtDuration(shift.opened_at, shift.closed_at)}</span></div>`,
    ].join('')

    const cashierRow = shift.cashier_name
      ? `<div class="row"><span>Cashier</span><span>${escHtml(shift.cashier_name)}</span></div>`
      : ''

    const salesRows = [
      `<div class="row"><span>Cash sales</span><span>${fmtPKR(summary.cashSalesTotal)} (${summary.totalSalesCount} txn)</span></div>`,
      `<div class="row"><span>Credit sales</span><span>${fmtPKR(summary.creditSalesTotal)}</span></div>`,
      `<div class="row bold"><span>Total sales</span><span>${fmtPKR(summary.cashSalesTotal + summary.creditSalesTotal)}</span></div>`,
      summary.expensesTotal > 0
        ? `<div class="row"><span>Cash expenses</span><span>− ${fmtPKR(summary.expensesTotal)}</span></div>`
        : '',
    ].join('')

    const recoRows = [
      `<div class="row"><span>Opening cash</span><span>${fmtPKR(Number(shift.opening_cash))}</span></div>`,
      `<div class="row"><span>+ Cash sales</span><span>${fmtPKR(summary.cashSalesTotal)}</span></div>`,
      summary.expensesTotal > 0
        ? `<div class="row"><span>− Cash expenses</span><span>${fmtPKR(summary.expensesTotal)}</span></div>`
        : '',
      `<div class="row bold"><span>Expected cash</span><span>${fmtPKR(summary.expectedCash)}</span></div>`,
      shift.closing_cash != null
        ? `<div class="row"><span>Actual cash</span><span>${fmtPKR(Number(shift.closing_cash))}</span></div>`
        : '',
      shift.closing_cash != null
        ? `<div class="row bold" style="${diffColor}"><span>Difference</span><span>${diffSign}${fmtPKR(diffVal)}</span></div>`
        : '',
    ].join('')

    const byHourRows = summary.salesByHour.length > 0
      ? `<p class="section-title">Sales by Hour</p>` +
        summary.salesByHour.map(({ hour, total, count }) =>
          `<div class="row"><span>${String(hour).padStart(2, '0')}:00</span><span>${fmtPKR(total)} (${count})</span></div>`
        ).join('')
      : ''

    const notesSection = shift.notes
      ? `<p class="section-title">Notes</p><p style="margin:0;line-height:1.5">${escHtml(shift.notes)}</p>`
      : ''

    return `
      <p style="margin:0 0 2px;font-size:15px;font-weight:700">Shift Report</p>
      ${cashierRow}
      <div class="divider"></div>
      <p class="section-title">Timing</p>
      ${timingRows}
      <div class="divider"></div>
      <p class="section-title">Sales</p>
      ${salesRows}
      <div class="divider"></div>
      <p class="section-title">Cash Reconciliation</p>
      ${recoRows}
      ${byHourRows ? `<div class="divider"></div>${byHourRows}` : ''}
      ${notesSection ? `<div class="divider"></div>${notesSection}` : ''}
    `
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
                  onClick={() => printShiftReport(buildShiftReportHtml())}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, fontWeight: 500, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}
                >
                  <Printer size={13} /> Print
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
