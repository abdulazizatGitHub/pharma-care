'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { closeShift, getShiftSummary } from '@/app/actions/shifts'
import { getDailyBorrowingReport } from '@/app/actions/borrowing'
import type { ShiftRow, ShiftSummaryData } from '@/app/actions/shifts'
import type { DailyBorrowingReport } from '@/app/actions/borrowing'

function fmtPKR(n: number) {
  return 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDuration(openedAt: string, closedAt?: string | null) {
  const start = new Date(openedAt).getTime()
  const end   = closedAt ? new Date(closedAt).getTime() : Date.now()
  const mins  = Math.floor((end - start) / 60000)
  const h     = Math.floor(mins / 60)
  const m     = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface Props {
  open:      boolean
  shift:     ShiftRow
  onClose:   () => void
  onSuccess: () => void
}

export function CloseShiftModal({ open, shift, onClose, onSuccess }: Props) {
  const [summary,        setSummary]        = useState<ShiftSummaryData | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [borrowReport,   setBorrowReport]   = useState<DailyBorrowingReport | null>(null)
  const [closingCash,    setClosingCash]    = useState('')
  const [notes,          setNotes]          = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [confirmed,      setConfirmed]      = useState(false)

  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().split('T')[0]
    setLoadingSummary(true)
    Promise.all([
      getShiftSummary(shift.id),
      getDailyBorrowingReport(today),
    ]).then(([shiftRes, borrowRes]) => {
      setSummary(shiftRes.data)
      setBorrowReport(borrowRes.data)
      setLoadingSummary(false)
    })
  }, [open, shift.id])

  const closingNum   = parseFloat(closingCash)
  const expectedCash = summary?.expectedCash ?? Number(shift.opening_cash)
  const difference   = isNaN(closingNum) ? null : closingNum - expectedCash
  const shortage     = difference !== null && difference < -0.005

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isNaN(closingNum) || closingNum < 0) {
      setError('Enter actual cash in drawer')
      return
    }
    if (shortage && !confirmed) {
      setConfirmed(true)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await closeShift(shift.id, closingNum, notes || undefined)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      handleClose()
      onSuccess()
    }
  }

  function handleClose() {
    setClosingCash('')
    setNotes('')
    setError(null)
    setConfirmed(false)
    setSummary(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Close Shift" size="xl">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* LEFT — Shift Summary */}
          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, marginTop: 0 }}>
              Shift Summary
            </p>
            {loadingSummary ? (
              <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SummaryRow label="Opened at"      value={fmtTime(shift.opened_at)} />
                <SummaryRow label="Duration"       value={fmtDuration(shift.opened_at)} />
                <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                <SummaryRow
                  label="Cash sales"
                  value={`${fmtPKR(summary?.cashSalesTotal ?? 0)} (${summary?.totalSalesCount ?? 0} txn)`}
                />
                <SummaryRow
                  label="Credit sales"
                  value={fmtPKR(summary?.creditSalesTotal ?? 0)}
                />
                <SummaryRow
                  label="Total sales"
                  value={fmtPKR((summary?.cashSalesTotal ?? 0) + (summary?.creditSalesTotal ?? 0))}
                  bold
                />
                <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                <SummaryRow label="Opening cash"   value={fmtPKR(Number(shift.opening_cash))} />
                <SummaryRow label="Cash expenses"  value={`− ${fmtPKR(summary?.expensesTotal ?? 0)}`} />
                <SummaryRow label="Expected cash"  value={fmtPKR(expectedCash)} bold />

                {/* Borrowing activity */}
                {borrowReport && (borrowReport.totalBorrowedToday > 0 || borrowReport.totalLentToday > 0) && (
                  <>
                    <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 4px' }}>
                      Today&apos;s Borrowing Activity
                    </p>
                    {borrowReport.totalBorrowedToday > 0 && (
                      <SummaryRow label="Borrowed from others" value={fmtPKR(borrowReport.totalBorrowedToday)} />
                    )}
                    {borrowReport.totalLentToday > 0 && (
                      <SummaryRow label="Lent to others" value={fmtPKR(borrowReport.totalLentToday)} />
                    )}
                    <div style={{ marginTop: 4 }}>
                      <Link href="/superadmin/ledger/borrowing" style={{ fontSize: 10, color: '#0F6E56', textDecoration: 'none' }}>
                        View full report →
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Cash Count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 0, marginTop: 0 }}>
              Cash Count
            </p>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Actual cash in drawer (Rs)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={e => { setClosingCash(e.target.value); setConfirmed(false) }}
                placeholder="0.00"
                autoFocus
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 14,
                  border: '1px solid #d1d5db', borderRadius: 6,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {difference !== null && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 6,
                background: difference >= -0.005 ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${difference >= -0.005 ? '#bbf7d0' : '#fecaca'}`,
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: difference >= -0.005 ? '#16a34a' : '#dc2626' }}>
                  {fmtPKR(Math.abs(difference))}{' '}
                  {difference > 0.005 ? '— Overage' : difference < -0.005 ? '— Shortage' : '— Balanced'}
                </p>
                {shortage && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#dc2626' }}>
                    Cash is short. Verify before closing.
                  </p>
                )}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Notes (optional)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes about this shift…"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid #d1d5db', borderRadius: 6,
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
            </div>

            {confirmed && shortage && (
              <div style={{ padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#c2410c', fontWeight: 600 }}>
                  Are you sure? Cash is short by {fmtPKR(Math.abs(difference!))}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9a3412' }}>
                  Click "Close Shift" again to confirm.
                </p>
              </div>
            )}

            {error && (
              <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{error}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Button variant="secondary" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || loadingSummary}>
            {submitting ? 'Closing…' : shortage && !confirmed ? 'Close Shift (shortage)' : 'Close Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: bold ? 600 : 400, color: bold ? '#111827' : '#374151' }}>{value}</span>
    </div>
  )
}
