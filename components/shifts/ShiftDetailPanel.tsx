'use client'

import React, { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { getShiftSummary } from '@/app/actions/shifts'
import type { ShiftRow, ShiftSummaryData } from '@/app/actions/shifts'

function fmtPKR(n: number) {
  return 'Rs ' + Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
                  onClick={() => window.print()}
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
