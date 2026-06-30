'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BalanceSheetRow {
  section:       string
  account_code:  string
  account_name:  string
  account_type:  string
  balance:       number
  display_order: number
}

interface Props {
  rows:         BalanceSheetRow[]
  asOfDate:     string
  pharmacyName: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#0F6E56', '#1e8c6e', '#34a888', '#4dc4a0', '#6dd5b8', '#92e2cc']

// No Rs prefix — used for individual rows and section totals
const fmtNum = (n: number) =>
  Math.abs(n).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

// Rs prefix — used for card footer summary
const fmt = (n: number) => 'Rs ' + fmtNum(n)

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#9ca3af',
  margin: '0 0 12px',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccountRow({ row }: { row: BalanceSheetRow }) {
  const isNet    = row.account_code === 'NET'
  const isLoss   = isNet && Number(row.balance) < 0
  const netColor = isNet ? (isLoss ? '#991B1B' : '#166534') : undefined

  const displayName = isNet
    ? (Number(row.balance) >= 0 ? 'Current Period Profit' : 'Current Period Loss')
    : row.account_name

  const numStr = fmtNum(Number(row.balance))
  const balStr = isNet && isLoss ? `(${numStr})` : numStr

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px solid #f9fafb',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            color: netColor ?? '#111827',
            fontStyle: isNet ? 'italic' : 'normal',
          }}
        >
          {displayName}
        </div>
        {!isNet && (
          <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
            {row.account_code}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 13,
          color: netColor ?? '#111827',
          fontVariantNumeric: 'tabular-nums',
          fontStyle: isNet ? 'italic' : 'normal',
        }}
      >
        {balStr}
      </span>
    </div>
  )
}

function SectionTotal({ label, total }: { label: string; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTop: '2px solid #111827',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
        {fmtNum(total)}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BalanceSheetPage({ rows, asOfDate, pharmacyName }: Props) {
  const router = useRouter()
  const today  = new Date().toISOString().split('T')[0]

  const assetRows     = rows.filter(r => r.section === 'asset')
  const liabilityRows = rows.filter(r => r.section === 'liability')
  const equityRows    = rows.filter(r => r.section === 'equity')

  const totalAssets      = assetRows.reduce((s, r) => s + Number(r.balance), 0)
  const totalLiabilities = liabilityRows.reduce((s, r) => s + Number(r.balance), 0)
  const totalEquity      = equityRows.reduce((s, r) => s + Number(r.balance), 0)
  const totalLE          = totalLiabilities + totalEquity
  const difference       = Math.abs(totalAssets - totalLE)
  const isBalanced       = difference < 0.01

  const humanDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PK', {
      day: '2-digit', month: 'long', year: 'numeric',
    })

  const pieData = assetRows
    .filter(r => Number(r.balance) > 0)
    .map(r => ({
      name:  r.account_name,
      code:  r.account_code,
      value: Number(r.balance),
    }))

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 40px' }}>

      {/* ── Print CSS ──────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          aside, nav, header, [data-print-hide] { display: none !important; }
          * { overflow: visible !important; }
          .print-header { display: block !important; }
          .print-footer { display: block !important; }
          .balance-sheet-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
          }
          .balance-sheet-footer {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
          }
          @page { margin: 15mm; }
          body { font-size: 12px; }
        }
      `}</style>

      {/* ── Print header (screen: hidden, print: visible) ──────────────────── */}
      <div className="print-header" style={{ display: 'none' }}>
        <p style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: '0 0 2px' }}>
          {pharmacyName}
        </p>
        <p style={{ fontSize: 14, textAlign: 'center', margin: '0 0 2px' }}>
          Balance Sheet
        </p>
        <p style={{ fontSize: 12, textAlign: 'center', color: '#6b7280', margin: '0 0 12px' }}>
          As of {humanDate(asOfDate)}
        </p>
        <hr style={{ margin: '0 0 16px', borderColor: '#e5e7eb' }} />
      </div>

      {/* ── Controls row ───────────────────────────────────────────────────── */}
      <div
        data-print-hide
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          marginBottom: 24,
        }}
      >
        <label style={{ fontSize: 12, color: '#6b7280' }}>As of:</label>
        <input
          type="date"
          value={asOfDate}
          max={today}
          onChange={e => router.push('/superadmin/ledger/balance-sheet?date=' + e.target.value)}
          style={{
            fontSize: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            padding: '3px 8px',
          }}
        />
        <button
          onClick={() => window.print()}
          style={{
            fontSize: 12,
            padding: '4px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            background: 'white',
            cursor: 'pointer',
          }}
        >
          Print
        </button>
      </div>

      {/* ── Main balance sheet card ────────────────────────────────────────── */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: '20px 28px 16px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
            Balance Sheet
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
            As of {humanDate(asOfDate)}
          </p>
        </div>

        {/* Two-column grid */}
        <div
          className="balance-sheet-grid"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}
        >
          {/* ── LEFT: ASSETS ─────────────────────────────────────────────── */}
          <div
            style={{
              padding: '20px 28px',
              minHeight: 300,
              borderRight: '1px solid #e5e7eb',
            }}
          >
            <p style={SECTION_LABEL}>Assets</p>
            {assetRows.map(row => <AccountRow key={row.account_code} row={row} />)}
            <SectionTotal label="Total Assets" total={totalAssets} />
          </div>

          {/* ── RIGHT: LIABILITIES + EQUITY ──────────────────────────────── */}
          <div style={{ padding: '20px 28px' }}>
            <p style={SECTION_LABEL}>Liabilities</p>
            {liabilityRows.map(row => <AccountRow key={row.account_code} row={row} />)}
            <SectionTotal label="Total Liabilities" total={totalLiabilities} />

            <div style={{ height: 28 }} />

            <p style={SECTION_LABEL}>Equity</p>
            {equityRows.map(row => <AccountRow key={row.account_code} row={row} />)}
            <SectionTotal label="Total Equity" total={totalEquity} />
          </div>
        </div>

        {/* Card footer */}
        <div
          className="balance-sheet-footer"
          style={{
            borderTop: '2px solid #111827',
            padding: '16px 28px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          {/* Left: Total Assets */}
          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: 28 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '0.04em',
                margin: '0 0 4px',
                textTransform: 'uppercase',
              }}
            >
              Total Assets
            </p>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(totalAssets)}
            </p>
          </div>

          {/* Right: Total L + E */}
          <div style={{ paddingLeft: 28 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '0.04em',
                margin: '0 0 4px',
                textTransform: 'uppercase',
              }}
            >
              Total Liabilities + Equity
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: isBalanced ? '#166534' : '#991B1B',
                margin: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmt(totalLE)}
            </p>
          </div>

          {/* Balance indicator — full width */}
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: 8 }}>
            {isBalanced ? (
              <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>✓ Balanced</span>
            ) : (
              <span style={{ fontSize: 12, color: '#991B1B', fontWeight: 600 }}>
                ⚠ Out of balance by {fmt(difference)}
              </span>
            )}
          </div>
        </div>

        {/* Print footer (screen: hidden, print: visible) */}
        <div
          className="print-footer"
          style={{
            display: 'none',
            borderTop: '1px solid #e5e7eb',
            padding: '12px 28px',
          }}
        >
          <p style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
            Generated on {new Date().toLocaleDateString('en-PK', {
              day: '2-digit', month: 'long', year: 'numeric',
            })}
            {' · '}{pharmacyName}{' · '}Confidential
          </p>
          <p style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
            This statement has been prepared from the books of account of the pharmacy.
          </p>
        </div>
      </div>

      {/* ── Asset composition card (screen only) ──────────────────────────── */}
      {pieData.length > 0 && (
        <div
          data-print-hide
          style={{
            marginTop: 32,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* Card header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
              Asset Composition
            </p>
          </div>

          {/* Card body */}
          <div
            style={{
              padding: 20,
              display: 'flex',
              gap: 32,
              alignItems: 'center',
            }}
          >
            {/* Donut chart — fixed size, no labels */}
            <div style={{ flexShrink: 0 }}>
              <PieChart width={200} height={200}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx={100}
                  cy={100}
                  outerRadius={85}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [
                    'Rs ' + Number(v).toLocaleString('en-PK', { minimumFractionDigits: 2 }),
                    'Balance',
                  ]}
                />
              </PieChart>
            </div>

            {/* Legend table */}
            <div style={{ flex: 1 }}>
              {pieData.map((entry, i) => {
                const pct = totalAssets > 0
                  ? ((entry.value / totalAssets) * 100).toFixed(1)
                  : '0.0'
                return (
                  <div
                    key={entry.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px solid #f9fafb',
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: COLORS[i % COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#374151' }}>{entry.name}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                        {entry.code}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#111827',
                        fontVariantNumeric: 'tabular-nums',
                        marginRight: 16,
                      }}
                    >
                      {fmtNum(entry.value)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#6b7280',
                        width: 48,
                        textAlign: 'right',
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                )
              })}

              {/* Footer row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '2px solid #111827',
                }}
              >
                <div style={{ width: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#111827' }}>
                  Total Assets
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#111827',
                    fontVariantNumeric: 'tabular-nums',
                    marginRight: 16,
                  }}
                >
                  {fmt(totalAssets)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#111827',
                    width: 48,
                    textAlign: 'right',
                  }}
                >
                  100.0%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
