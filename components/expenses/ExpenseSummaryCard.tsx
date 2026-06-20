import React from 'react'
import type { ExpenseSummary } from '@/app/actions/expenses'

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  summary:   ExpenseSummary | null
  monthLabel: string  // e.g. "June 2026"
}

export function ExpenseSummaryCard({ summary, monthLabel }: Props) {
  if (!summary || summary.lines.length === 0) {
    return (
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '14px 18px',
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
          Expenses — {monthLabel}
        </p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No expenses this month.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.08)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 18px 8px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Expenses — {monthLabel}
        </p>
      </div>

      <div style={{ padding: '8px 0' }}>
        {summary.lines.map(line => (
          <div
            key={line.account_code}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 18px',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: '#374151', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.account_name}
            </span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 500, color: '#A32D2D', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {fmtPKR(line.total)}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 18px',
          background: '#f9fafb',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Total</span>
        <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#A32D2D' }}>
          {fmtPKR(summary.grandTotal)}
        </span>
      </div>
    </div>
  )
}
