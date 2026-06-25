import React from 'react'
import { getCashBook } from '@/app/actions/ledger'
import { CashBookDateNav } from '@/components/ledger/CashBookDateNav'
import type { CashBookEntry } from '@/app/actions/ledger'

interface TaggedEntry extends CashBookEntry {
  date: string
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch {
    return ts
  }
}

function fmtDateHeading(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-PK', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return d
  }
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start  = new Date(from + 'T00:00:00')
  const end    = new Date(to   + 'T00:00:00')
  if (start > end) return [from]
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from: fromParam, to: toParam } = await searchParams
  const today = new Date().toISOString().split('T')[0]

  const from = fromParam ?? today
  const to   = toParam   ?? today

  const dates   = getDatesInRange(from, to)
  const results = await Promise.all(dates.map(d => getCashBook(d)))

  const openingBalance = results[0]?.data?.openingBalance ?? 0

  const allEntries: TaggedEntry[] = []
  for (let i = 0; i < dates.length; i++) {
    for (const e of (results[i]?.data?.entries ?? [])) {
      allEntries.push({ ...e, date: dates[i] })
    }
  }

  const cashIn  = allEntries.reduce((s, e) => s + Number(e.in_amount),  0)
  const cashOut = allEntries.reduce((s, e) => s + Number(e.out_amount), 0)
  const closingBalance = openingBalance + cashIn - cashOut

  const hasError = results.some(r => r.error)

  const colDefs = [
    { h: 'Time',        w: 70,     align: 'left'  as const },
    { h: 'Entry No',    w: 150,    align: 'left'  as const },
    { h: 'Description', w: 'auto', align: 'left'  as const },
    { h: 'Cash In',     w: 120,    align: 'right' as const },
    { h: 'Cash Out',    w: 120,    align: 'right' as const },
    { h: 'Balance',     w: 130,    align: 'right' as const },
  ]

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Cash Book</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            Cash movements for account 1000
          </p>
        </div>
        <CashBookDateNav from={from} to={to} basePath="/superadmin/ledger/cashbook" />
      </div>

      {hasError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FCEBEB', borderRadius: 6, fontSize: 12, color: '#A32D2D' }}>
          Some data could not be loaded. Partial results shown.
        </div>
      )}

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Opening Balance', value: openingBalance, color: '#6b7280' },
          { label: 'Cash In',         value: cashIn,         color: '#0F6E56' },
          { label: 'Cash Out',        value: cashOut,        color: '#A32D2D' },
          { label: 'Closing Balance', value: closingBalance, color: closingBalance >= 0 ? '#111827' : '#A32D2D' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '12px 16px' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 600, color, margin: '4px 0 0', fontFamily: 'monospace' }}>
              {fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Transaction table */}
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
        {allEntries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No cash transactions in this date range.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {colDefs.map(({ h, w, align }) => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', textAlign: align, width: w }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = []
                let lastDate = ''
                let rowIdx   = 0
                for (const e of allEntries) {
                  if (e.date !== lastDate) {
                    rows.push(
                      <tr key={`sep-${e.date}`}>
                        <td colSpan={6} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#0F6E56', background: '#f0fdf4', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                          {fmtDateHeading(e.date)}
                        </td>
                      </tr>
                    )
                    lastDate = e.date
                  }
                  const bal = Number(e.running_balance)
                  rows.push(
                    <tr key={`${e.entry_id}-${rowIdx}`} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: rowIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '9px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {fmtTime(e.entry_time)}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.entry_no}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.description}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', color: '#0F6E56' }}>
                        {Number(e.in_amount) > 0 ? fmt(Number(e.in_amount)) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', color: '#A32D2D' }}>
                        {Number(e.out_amount) > 0 ? fmt(Number(e.out_amount)) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, fontWeight: 500, textAlign: 'right', fontFamily: 'monospace', color: bal >= 0 ? '#111827' : '#A32D2D' }}>
                        {fmt(bal)}
                      </td>
                    </tr>
                  )
                  rowIdx++
                }
                return rows
              })()}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                <td colSpan={3} style={{ padding: '9px 12px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                  {allEntries.length} transaction{allEntries.length !== 1 ? 's' : ''}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0F6E56' }}>
                  {fmt(cashIn)}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#A32D2D' }}>
                  {fmt(cashOut)}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>
                  {fmt(closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
