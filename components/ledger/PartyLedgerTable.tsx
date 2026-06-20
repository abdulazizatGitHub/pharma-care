import React from 'react'
import type { PartyLedgerLine } from '@/app/actions/ledger'

const fmt = (n: number) =>
  n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  lines: PartyLedgerLine[]
}

export function PartyLedgerTable({ lines }: Props) {
  if (lines.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: '#9ca3af',
          fontSize: 13,
          background: '#fff',
          borderRadius: 8,
          border: '0.5px solid rgba(0,0,0,0.08)',
        }}
      >
        No transactions recorded yet.
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
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
            {['Date', 'Ref', 'Description', 'Debit', 'Credit', 'Balance'].map((h, i) => (
              <th
                key={h}
                style={{
                  padding: '8px 12px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#6b7280',
                  textAlign: i >= 3 ? 'right' : 'left',
                  width: i === 0 ? 90 : i === 1 ? 140 : i >= 3 ? 110 : 'auto',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const balance = Number(line.running_balance)
            const balColor = balance > 0.005
              ? '#0F6E56'
              : balance < -0.005
              ? '#A32D2D'
              : '#6b7280'

            return (
              <tr
                key={line.entry_id + i}
                style={{
                  borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                  background: i % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {line.entry_date}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {line.entry_no}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {line.description}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(line.debit_amount) > 0 ? fmt(Number(line.debit_amount)) : '—'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(line.credit_amount) > 0 ? fmt(Number(line.credit_amount)) : '—'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500, color: balColor, textAlign: 'right', fontFamily: 'monospace' }}>
                  {fmt(Math.abs(balance))}
                  {Math.abs(balance) > 0.005 && (
                    <span style={{ fontSize: 9, marginLeft: 3, fontWeight: 400 }}>
                      {balance > 0 ? 'Dr' : 'Cr'}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
