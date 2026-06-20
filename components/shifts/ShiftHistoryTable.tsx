'use client'

import React from 'react'
import type { ShiftRow } from '@/app/actions/shifts'

function fmtPKR(n: number | null | undefined) {
  if (n == null) return '—'
  return 'Rs ' + Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return '—'
  const mins = Math.floor((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface Props {
  shifts:    ShiftRow[]
  showName?: boolean
  onSelect:  (shift: ShiftRow) => void
}

export function ShiftHistoryTable({ shifts, showName = false, onSelect }: Props) {
  if (shifts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
        No closed shifts found for the selected period.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <Th>Date</Th>
            {showName && <Th>Pharmacist</Th>}
            <Th>Status</Th>
            <Th>Opened</Th>
            <Th>Closed</Th>
            <Th>Duration</Th>
            <Th right>Opening</Th>
            <Th right>Expected</Th>
            <Th right>Closing</Th>
            <Th right>Difference</Th>
          </tr>
        </thead>
        <tbody>
          {shifts.map(shift => {
            const diff = shift.cash_difference
            const largeDiff = diff != null && Math.abs(diff) > 100
            return (
              <tr
                key={shift.id}
                onClick={() => onSelect(shift)}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  background: largeDiff ? '#fef2f2' : undefined,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = largeDiff ? '#fee2e2' : '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = largeDiff ? '#fef2f2' : '' }}
              >
                <Td>{fmtDate(shift.opened_at)}</Td>
                {showName && <Td>{shift.cashier_name ?? '—'}</Td>}
                <Td>
                  {shift.notes?.startsWith('Auto-closed') ? (
                    <span style={{
                      display: 'inline-block', padding: '2px 7px',
                      borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: '#FEF3C7', color: '#92400E',
                      border: '1px solid #FDE68A', letterSpacing: '0.03em',
                    }}>
                      Auto-closed
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-block', padding: '2px 7px',
                      borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: '#F3F4F6', color: '#6b7280',
                      border: '1px solid #e5e7eb', letterSpacing: '0.03em',
                    }}>
                      Closed
                    </span>
                  )}
                </Td>
                <Td>{fmtTime(shift.opened_at)}</Td>
                <Td>{shift.closed_at ? fmtTime(shift.closed_at) : '—'}</Td>
                <Td>{fmtDuration(shift.opened_at, shift.closed_at)}</Td>
                <Td right>{fmtPKR(shift.opening_cash)}</Td>
                <Td right>{fmtPKR(shift.expected_cash)}</Td>
                <Td right>{fmtPKR(shift.closing_cash)}</Td>
                <Td right>
                  {diff != null ? (
                    <span style={{ color: diff < -0.005 ? '#dc2626' : diff > 0.005 ? '#16a34a' : '#374151', fontWeight: largeDiff ? 600 : 400 }}>
                      {diff >= 0 ? '+' : ''}{fmtPKR(diff)}
                    </span>
                  ) : '—'}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '8px 12px', textAlign: right ? 'right' : 'left',
      fontSize: 11, fontWeight: 600, color: '#6b7280',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td style={{
      padding: '10px 12px', textAlign: right ? 'right' : 'left',
      color: '#374151', whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  )
}
