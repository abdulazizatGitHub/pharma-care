'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { printDocument } from '@/lib/print-utils'
import type { PrintSettings } from '@/app/actions/settings'

interface TrialBalanceRow {
  account_code:   string
  account_name:   string
  account_type:   string
  normal_balance: string
  total_debits:   number
  total_credits:  number
  net_balance:    number
  has_activity:   boolean
}

interface Props {
  rows:          TrialBalanceRow[]
  fromDate:      string
  toDate:        string
  pharmacyName:  string
  printSettings: PrintSettings
}

const fmt = (n: number) =>
  'Rs ' + Math.abs(n).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  asset:     { bg: '#EFF6FF', color: '#1D4ED8' },
  liability: { bg: '#FFF7ED', color: '#C2410C' },
  equity:    { bg: '#F5F3FF', color: '#7C3AED' },
  revenue:   { bg: '#F0FDF4', color: '#166534' },
  cogs:      { bg: '#FEFCE8', color: '#854D0E' },
  expense:   { bg: '#FEF2F2', color: '#991B1B' },
}

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_BADGE[type] ?? { bg: '#F3F4F6', color: '#374151' }
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 9,
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  )
}

const TH: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  background: '#f9fafb',
}

const TD: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: '#374151',
  verticalAlign: 'middle',
}

export function TrialBalancePage({ rows, fromDate, toDate, pharmacyName, printSettings }: Props) {
  const router  = useRouter()
  const today   = new Date().toISOString().split('T')[0]
  const [showAll, setShowAll] = useState(true)

  const displayRows   = showAll ? rows : rows.filter(r => r.has_activity)
  const totalDebits   = rows.reduce((s, r) => s + Number(r.total_debits),  0)
  const totalCredits  = rows.reduce((s, r) => s + Number(r.total_credits), 0)
  const difference    = Math.abs(totalDebits - totalCredits)
  const isBalanced    = difference < 0.01

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    padding: '4px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    background: active ? '#0F6E56' : 'white',
    color:      active ? 'white'   : '#374151',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  return (
    <>
      {/* Controls row */}
      <div
        data-print-hide
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>From:</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e =>
              router.push(
                '/superadmin/ledger/trial-balance?from=' + e.target.value + '&to=' + toDate,
              )
            }
            style={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 8px' }}
          />
          <label style={{ fontSize: 12, color: '#6b7280' }}>To:</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={today}
            onChange={e =>
              router.push(
                '/superadmin/ledger/trial-balance?from=' + fromDate + '&to=' + e.target.value,
              )
            }
            style={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 8px' }}
          />
        </div>

        {/* Filter + Print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={toggleBtn(showAll)}  onClick={() => setShowAll(true)}>All accounts</button>
          <button style={toggleBtn(!showAll)} onClick={() => setShowAll(false)}>Active only</button>
          <button
            onClick={() => {
              const bodyEl = document.querySelector('.trial-table-wrap')
              if (!bodyEl) return
              printDocument({
                printSettings,
                pharmacyName,
                documentTitle: 'Trial Balance',
                documentSubtitle: `${new Date(fromDate).toLocaleDateString('en-PK', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })} to ${new Date(toDate).toLocaleDateString('en-PK', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}`,
                bodyHtml: bodyEl.innerHTML,
              })
            }}
            style={{
              fontSize: 12,
              padding: '4px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              background: 'white',
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            Print
          </button>
        </div>
      </div>

      {/* Table card */}
      <div
        className="trial-table-wrap"
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 80 }}>Code</th>
              <th style={TH}>Account</th>
              <th style={{ ...TH, width: 90 }}>Type</th>
              <th style={{ ...TH, textAlign: 'right', width: 120 }}>Debit</th>
              <th style={{ ...TH, textAlign: 'right', width: 120 }}>Credit</th>
              <th style={{ ...TH, textAlign: 'right', width: 130 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => {
              const balColor =
                Number(row.net_balance) > 0 ? '#166534' :
                Number(row.net_balance) < 0 ? '#991B1B' : '#9ca3af'

              return (
                <tr
                  key={row.account_code}
                  style={{ opacity: row.has_activity ? 1 : 0.4 }}
                >
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>
                    {row.account_code}
                  </td>
                  <td style={TD}>{row.account_name}</td>
                  <td style={TD}>
                    <TypeBadge type={row.account_type} />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.total_debits) > 0 ? fmt(row.total_debits) : '—'}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.total_credits) > 0 ? fmt(row.total_credits) : '—'}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: balColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Number(row.net_balance) !== 0 ? fmt(row.net_balance) : '0.00'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #111827' }}>
              <td style={{ ...TD, fontWeight: 700, color: '#111827' }} />
              <td style={{ ...TD, fontWeight: 700, color: '#111827' }}>TOTALS</td>
              <td style={TD} />
              <td
                style={{
                  ...TD,
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#111827',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(totalDebits)}
              </td>
              <td
                style={{
                  ...TD,
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#111827',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(totalCredits)}
              </td>
              <td
                style={{
                  ...TD,
                  textAlign: 'right',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: isBalanced ? '#166534' : '#991B1B',
                }}
              >
                {isBalanced
                  ? '✓ Balanced'
                  : '⚠ ' + fmt(difference)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </>
  )
}
