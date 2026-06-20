'use client'

import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import {
  getPLStatement, getMonthlyBalances, getCashFlow,
} from '@/app/actions/reports'
import type {
  PLStatementRow, MonthlyBalanceRow, CashFlowRow,
} from '@/app/actions/reports'
import { exportCSV } from '../export/exportCSV'
import { fmtPKR, fmtShortDate, fmtAxis } from '@/lib/report-utils'

interface Props {
  dateRange: DateRange
  role:      string
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const PIE_COLORS = [
  '#dc2626', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#0d9488', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899',
]

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8, padding: '14px 16px',
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, highlight,
}: {
  label: string; value: string; sub?: string; color?: string; highlight?: boolean
}) {
  return (
    <div style={{ ...CARD, borderLeft: highlight ? '3px solid #0D9488' : undefined }}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700, color: color ?? '#111827', margin: '8px 0 0', lineHeight: 1.2 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

// ─── Chart tooltips ───────────────────────────────────────────────────────────

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; stroke?: string; fill?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0 0', color: p.stroke ?? p.fill }}>{p.name}: {fmtPKR(p.value ?? 0)}</p>
      ))}
    </div>
  )
}

function CashFlowTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; fill?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label ? fmtShortDate(label) : ''}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0 0' }}>{p.name}: {fmtPKR(Math.abs(p.value ?? 0))}</p>
      ))}
    </div>
  )
}

// ─── Donut centre label ───────────────────────────────────────────────────────

function DonutCenter({ total }: { total: number }) {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
        {fmtAxis(total)}
      </div>
      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>total</div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={CARD}>
            <div style={{ background: '#f3f4f6', borderRadius: 4, height: 10, width: '55%', marginBottom: 10 }} />
            <div style={{ background: '#f3f4f6', borderRadius: 4, height: 22, width: '80%' }} />
          </div>
        ))}
      </div>
      <div style={{ ...CARD, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinancialTab({ dateRange, role }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [plRows,     setPlRows]     = useState<PLStatementRow[]>([])
  const [monthly,    setMonthly]    = useState<MonthlyBalanceRow[]>([])
  const [cashFlow,   setCashFlow]   = useState<CashFlowRow[]>([])

  const year = new Date(dateRange.from).getFullYear()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const [plR, monR, cfR] = await Promise.all([
        getPLStatement(dateRange.from, dateRange.to),
        getMonthlyBalances(year),
        getCashFlow(dateRange.from, dateRange.to),
      ])
      if (cancelled) return
      if (plR.error) { setError(plR.error); return }
      setPlRows(plR.data    ?? [])
      setMonthly(monR.data  ?? [])
      setCashFlow(cfR.data  ?? [])
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to, year])

  // ── Derived KPIs from P&L rows ─────────────────────────────────────────────

  const revenue   = plRows.filter(r => r.account_type === 'revenue')
    .reduce((s, r) => s + Number(r.total_amount), 0)
  const cogsTotal = plRows.filter(r => r.account_code?.startsWith('5'))
    .reduce((s, r) => s + Math.abs(Number(r.total_amount)), 0)
  const grossProfit  = revenue - cogsTotal
  const grossMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const expenses = plRows.filter(r => r.account_type === 'expense' && !r.account_code?.startsWith('5'))
    .reduce((s, r) => s + Math.abs(Number(r.total_amount)), 0)
  const netProfit   = grossProfit - expenses
  const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0

  // ── Monthly area chart data ────────────────────────────────────────────────

  const monthData = monthly.map(m => ({
    name:        m.month_name.slice(0, 3),
    Revenue:     Number(m.revenue),
    'Gross Profit': Number(m.gross_profit),
    Expenses:    Number(m.expenses),
    'Net Profit': Number(m.net_profit),
  }))

  // ── Expense breakdown pie ──────────────────────────────────────────────────

  const expenseRows = plRows.filter(
    r => r.account_type === 'expense' && !r.account_code?.startsWith('5') && Number(r.total_amount) !== 0,
  )
  const expensePie = expenseRows.map(r => ({
    name:  r.account_name,
    value: Math.abs(Number(r.total_amount)),
  }))
  const totalExpense = expensePie.reduce((s, r) => s + r.value, 0)

  // ── Cash flow ComposedChart data ───────────────────────────────────────────

  const cfData = cashFlow.map(r => ({
    date:     r.flow_date,
    'Cash In':  Number(r.cash_in),
    'Cash Out': -Math.abs(Number(r.cash_out)),   // negative for below-axis bars
    'Net Flow': Number(r.net_flow),
  }))

  // ── Running balance for cash book summary ─────────────────────────────────

  let running = 0
  const cashBook = cashFlow.map(r => {
    running += Number(r.net_flow)
    return {
      date:     r.flow_date,
      cash_in:  Number(r.cash_in),
      cash_out: Number(r.cash_out),
      net:      Number(r.net_flow),
      balance:  running,
    }
  })

  // ── CSV export ─────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = []
    plRows.forEach(r => rows.push({
      section: 'P&L Statement',
      account_code: r.account_code, account_name: r.account_name,
      account_type: r.account_type, amount: r.total_amount,
    }))
    monthly.forEach(m => rows.push({
      section: 'Monthly P&L',
      month: m.month_name, revenue: m.revenue, cogs: m.cogs,
      gross_profit: m.gross_profit, expenses: m.expenses, net_profit: m.net_profit,
    }))
    cashFlow.forEach(r => rows.push({
      section: 'Cash Flow',
      date: r.flow_date, cash_in: r.cash_in, cash_out: r.cash_out, net: r.net_flow,
    }))
    exportCSV(rows, `financial-${dateRange.from}-${dateRange.to}`)
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (role !== 'superadmin') {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
        Financial data is restricted to superadmin.
      </div>
    )
  }

  if (loading) return <Skeleton />

  if (error) {
    return <div style={{ ...CARD, color: '#dc2626', fontSize: 13, textAlign: 'center', padding: 32 }}>{error}</div>
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabHeader
        title="Financial Overview"
        description={`${dateRange.from} → ${dateRange.to}  ·  P&L, cash flow & expense breakdown`}
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 6 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KpiCard label="Revenue"        value={fmtPKR(revenue)} highlight />
        <KpiCard label="COGS"           value={fmtPKR(cogsTotal)}
          color="#f97316" sub="cost of goods sold" />
        <KpiCard label="Gross Profit"   value={fmtPKR(grossProfit)}
          color={grossProfit >= 0 ? '#16a34a' : '#dc2626'} />
        <KpiCard label="Gross Margin"   value={`${grossMargin.toFixed(1)}%`}
          color={grossMargin >= 30 ? '#16a34a' : grossMargin >= 15 ? '#f59e0b' : '#dc2626'} />
        <KpiCard label="Expenses"       value={fmtPKR(expenses)}
          sub={`${expenseRatio.toFixed(1)}% of revenue`} color="#6366f1" />
        <KpiCard label="Net Profit"     value={fmtPKR(netProfit)}
          color={netProfit >= 0 ? '#16a34a' : '#dc2626'} highlight={netProfit >= 0} />
      </div>

      {/* Chart 1 — Monthly stacked AreaChart (full width) */}
      <div style={CARD}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
          Monthly P&L — {year}
        </p>
        {monthData.length === 0 ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No monthly data for {year}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#0D9488" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="npGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={MonthTooltip as any} />
              <Area type="monotone" dataKey="Revenue"      stroke="#0D9488" fill="url(#revGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Gross Profit" stroke="#16a34a" fill="url(#gpGrad)"  strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="Net Profit"   stroke="#6366f1" fill="url(#npGrad)"  strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts row — Expense Donut + Cash Flow ComposedChart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12 }}>

        {/* Chart 2 — Expense breakdown donut */}
        <div style={{ ...CARD, minWidth: 260, display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Expense Breakdown
          </p>
          {expensePie.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No expenses</span>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto' }}>
                <PieChart width={200} height={200}>
                  <Pie data={expensePie} cx={100} cy={100} innerRadius={58} outerRadius={84} dataKey="value" stroke="none">
                    {expensePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
                <DonutCenter total={totalExpense} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {expensePie.slice(0, 6).map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: '#374151' }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#111827', flexShrink: 0 }}>{fmtPKR(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Chart 3 — Cash Flow ComposedChart */}
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Cash Flow — Cash In / Out &amp; Net
          </p>
          {cfData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No cash flow data</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={cfData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={CashFlowTooltip as any} />
                <Bar dataKey="Cash In"  fill="#0D9488" opacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="Cash Out" fill="#dc2626" opacity={0.75} radius={[0, 0, 2, 2]} maxBarSize={14} />
                <Line type="monotone" dataKey="Net Flow" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table 1 — Formal P&L Statement */}
      <div style={CARD}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
          Profit & Loss Statement
          <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
            {dateRange.from} → {dateRange.to}
          </span>
        </p>
        {plRows.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No journal entries in this period</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Code', 'Account', 'Type', 'Amount'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Amount' ? 'right' : 'left',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastType = ''
                return plRows.map(r => {
                  const showHeader = r.account_type !== lastType
                  lastType = r.account_type
                  const isNeg = r.account_type !== 'revenue'
                  const amt   = Number(r.total_amount)
                  return (
                    <React.Fragment key={r.account_code}>
                      {showHeader && (
                        <tr style={{ background: '#f9fafb' }}>
                          <td colSpan={4} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151' }}>
                            {r.account_type.toUpperCase()}
                          </td>
                        </tr>
                      )}
                      <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{r.account_code}</td>
                        <td style={{ padding: '6px 8px', color: '#111827' }}>{r.account_name}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', textTransform: 'capitalize' }}>{r.account_type}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: isNeg && amt > 0 ? '#dc2626' : '#111827' }}>
                          {fmtPKR(Math.abs(amt))}
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })
              })()}
              {/* Summary rows */}
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td colSpan={3} style={{ padding: '8px 8px', fontWeight: 700, fontSize: 12, color: '#374151' }}>Gross Profit</td>
                <td style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 700, fontSize: 13, color: grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmtPKR(grossProfit)}
                </td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td colSpan={3} style={{ padding: '6px 8px', fontWeight: 700, fontSize: 12, color: '#374151' }}>Net Profit</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, fontSize: 14, color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmtPKR(netProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Table 2 — Cash Book Summary with running balance */}
      <div style={CARD}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
          Cash Book Summary
          <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
            running balance column
          </span>
        </p>
        {cashBook.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No cash transactions in this period</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Date', 'Cash In', 'Cash Out', 'Net', 'Running Balance'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Date' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashBook.map(r => (
                <tr key={r.date} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{fmtShortDate(r.date)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#16a34a', fontWeight: 500 }}>{fmtPKR(r.cash_in)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#dc2626' }}>{fmtPKR(r.cash_out)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: r.net >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtPKR(r.net)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>{fmtPKR(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
