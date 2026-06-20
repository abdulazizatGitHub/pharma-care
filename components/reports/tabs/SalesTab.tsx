'use client'

import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import {
  getSalesSummary, getSalesByDay, getSalesByHour, getSalesComparison,
} from '@/app/actions/reports'
import type {
  SalesSummaryRow, SalesByDayRow, SalesByHourRow, SalesComparisonRow,
} from '@/app/actions/reports'
import { exportCSV } from '../export/exportCSV'
import { fmtPKR, fmtShortDate, fmtAxis, getPreviousPeriod } from '@/lib/report-utils'

interface Props {
  dateRange: DateRange
  role:      string
  userId:    string
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8, padding: '14px 16px',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, highlight,
}: {
  label: string; value: string; sub?: string; color?: string; highlight?: boolean
}) {
  return (
    <div style={{
      ...CARD,
      borderLeft: highlight ? '3px solid #0D9488' : undefined,
    }}>
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

function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...CARD, ...style }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>{title}</p>
      {children}
    </div>
  )
}

function RevTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; stroke: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label ? fmtShortDate(label) : ''}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0 0', color: p.stroke }}>{p.name}: {fmtPKR(p.value ?? 0)}</p>
      ))}
    </div>
  )
}

function HourTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length) return null
  const hr   = label ?? 0
  const ampm = hr === 0 ? '12 AM' : hr < 12 ? `${hr} AM` : hr === 12 ? '12 PM' : `${hr - 12} PM`
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{ampm}</p>
      <p style={{ margin: '3px 0 0' }}>Sales: {payload[0]?.value ?? 0}</p>
    </div>
  )
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ fontSize: 10, color: '#9ca3af' }}>New</span>
  const up = pct >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 10, fontWeight: 600,
      color: up ? '#16a34a' : '#dc2626',
      background: up ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
      borderRadius: 4, padding: '1px 5px',
    }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

const PAY_COLORS = ['#0D9488', '#F59E0B']
const HOUR_COLOR = '#6366f1'

// ─── Main component ───────────────────────────────────────────────────────────

export function SalesTab({ dateRange, role }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [summary,     setSummary]     = useState<SalesSummaryRow | null>(null)
  const [byDay,       setByDay]       = useState<SalesByDayRow[]>([])
  const [byHour,      setByHour]      = useState<SalesByHourRow[]>([])
  const [comparison,  setComparison]  = useState<SalesComparisonRow[]>([])

  const isPharmacist = role === 'pharmacist'
  const prev         = getPreviousPeriod(dateRange.from, dateRange.to)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const fetches: Promise<{ data: unknown; error: string | null }>[] = [
        getSalesSummary(dateRange.from, dateRange.to),
        getSalesByDay(dateRange.from, dateRange.to),
        getSalesByHour(dateRange.from, dateRange.to),
      ]
      if (!isPharmacist) {
        fetches.push(getSalesComparison(dateRange.from, dateRange.to, prev.from, prev.to, 20))
      }
      const [sumR, dayR, hrR, cmpR] = await Promise.all(fetches)
      if (cancelled) return
      if (sumR.error) { setError(sumR.error); return }
      setSummary(sumR.data    as SalesSummaryRow)
      setByDay((dayR.data     as SalesByDayRow[])       ?? [])
      setByHour((hrR.data     as SalesByHourRow[])      ?? [])
      setComparison((cmpR?.data as SalesComparisonRow[]) ?? [])
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to, role])

  // ── Derived data ──────────────────────────────────────────────

  const revenue      = Number(summary?.total_revenue  ?? 0)
  const cogs         = Number(summary?.total_cogs      ?? 0)
  const grossProfit  = Number(summary?.gross_profit    ?? 0)
  const grossMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const totalSales   = Number(summary?.total_sales     ?? 0)
  const avgSale      = Number(summary?.avg_sale_value  ?? 0)
  const discountGiven = Number(summary?.total_discount ?? 0)

  const revData = byDay.map(r => ({
    date:        r.sale_date,
    Revenue:     Number(r.revenue),
    'Gross Profit': Number(r.revenue) - (revenue > 0 ? (cogs / byDay.length) : 0),
  }))

  const hourData = byHour.map(r => ({
    hr:    r.hour_of_day,
    count: Number(r.sale_count),
  }))

  const cashAmt   = Number(summary?.cash_sales   ?? 0)
  const creditAmt = Number(summary?.credit_sales ?? 0)
  const totalForPie = totalSales > 0 ? totalSales : 1

  const payData = [
    { name: `Cash (${((cashAmt   / totalForPie) * 100).toFixed(0)}%)`, value: cashAmt },
    { name: `Credit (${((creditAmt / totalForPie) * 100).toFixed(0)}%)`, value: creditAmt },
  ]

  // Slow movers = items sold this period but with negative trend
  const slowMovers = comparison.filter(r => r.change_pct !== null && Number(r.change_pct) < 0)
    .sort((a, b) => Number(a.change_pct) - Number(b.change_pct))
    .slice(0, 10)

  // ── CSV export (all tab data combined) ───────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = []
    // Summary row
    if (summary) {
      rows.push({
        section: 'Summary',
        metric: 'Revenue', value: revenue,
      }, {
        section: 'Summary', metric: 'Gross Profit', value: grossProfit,
      }, {
        section: 'Summary', metric: 'Gross Margin %', value: grossMargin.toFixed(2),
      }, {
        section: 'Summary', metric: 'Total Transactions', value: totalSales,
      }, {
        section: 'Summary', metric: 'Avg Transaction Value', value: avgSale,
      }, {
        section: 'Summary', metric: 'Discount Given', value: discountGiven,
      })
    }
    byDay.forEach(r => rows.push({
      section: 'Daily Revenue', date: r.sale_date,
      sale_count: r.sale_count, revenue: r.revenue, discount: r.discount,
    }))
    byHour.forEach(r => rows.push({
      section: 'Hourly', hour: r.hour_of_day,
      sale_count: r.sale_count, revenue: r.revenue,
    }))
    comparison.forEach(r => rows.push({
      section: 'Item Comparison',
      medicine: r.medicine_name, code: r.medicine_code,
      current_qty: r.current_qty, current_revenue: r.current_revenue,
      prev_qty: r.prev_qty, prev_revenue: r.prev_revenue,
      change_pct: r.change_pct,
    }))
    exportCSV(rows, `sales-${dateRange.from}-${dateRange.to}`)
  }

  // ── Loading / error ───────────────────────────────────────────

  if (loading) {
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

  if (error) {
    return <div style={{ ...CARD, color: '#dc2626', fontSize: 13, textAlign: 'center', padding: 32 }}>{error}</div>
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabHeader
        title="Sales Overview"
        description={`${dateRange.from} → ${dateRange.to}  ·  comparison vs ${prev.from} → ${prev.to}`}
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 6 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KpiCard label="Revenue"              value={fmtPKR(revenue)} highlight />
        <KpiCard label="Gross Profit"         value={fmtPKR(grossProfit)}
          color={grossProfit >= 0 ? '#16a34a' : '#dc2626'} />
        <KpiCard label="Gross Margin"         value={`${grossMargin.toFixed(1)}%`}
          color={grossMargin >= 30 ? '#16a34a' : grossMargin >= 15 ? '#f59e0b' : '#dc2626'}
          sub="(Revenue − COGS) / Revenue" />
        <KpiCard label="Transactions"         value={totalSales.toLocaleString('en-PK')} />
        <KpiCard label="Avg Transaction"      value={fmtPKR(avgSale)} />
        <KpiCard label="Discount Given"       value={fmtPKR(discountGiven)}
          color={discountGiven > 0 ? '#f59e0b' : '#111827'}
          sub="revenue lost to discounts" />
      </div>

      {/* Chart 1 — Revenue + Gross Profit trend (full width) */}
      <ChartCard title="Revenue & Gross Profit Trend">
        {revData.length === 0 ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No sales in this period</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={RevTooltip as any} />
              <Line type="monotone" dataKey="Revenue"      stroke="#0D9488" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Gross Profit" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Charts row — Hour + Payment split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>

        {/* Chart 2 — Sales by hour */}
        <ChartCard title="Sales by Hour of Day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="hr" tickFormatter={h => `${h}h`} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip content={HourTooltip as any} />
              <Bar dataKey="count" name="Sales" fill={HOUR_COLOR} radius={[2, 2, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 3 — Payment split */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 220 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px', alignSelf: 'flex-start' }}>
            Payment Split
          </p>
          <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
            <PieChart width={180} height={180}>
              <Pie data={payData} cx={90} cy={90} innerRadius={50} outerRadius={75} dataKey="value" stroke="none">
                {payData.map((_, i) => <Cell key={i} fill={PAY_COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
            <div style={{ position: 'absolute', top: 90, left: 90, transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{totalSales}</div>
              <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>sales</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', paddingTop: 4 }}>
            {payData.map((item, i) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: PAY_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#374151' }}>{item.name}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{fmtPKR(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table 1 — Top Selling Medicines (admin + superadmin only) */}
      {!isPharmacist && (
        <div style={CARD}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            Top Selling Medicines
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
              vs {prev.from} → {prev.to}
            </span>
          </p>
          {comparison.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No data</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['#', 'Medicine', 'Code', 'Units', 'Revenue', 'Trend'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Medicine' || h === 'Code' ? 'left' : 'right',
                      padding: '4px 8px', fontSize: 10, fontWeight: 600,
                      color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((r, i) => (
                  <tr key={r.medicine_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 500, color: '#111827' }}>{r.medicine_name}</td>
                    <td style={{ padding: '6px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>{r.medicine_code ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{Number(r.current_qty).toLocaleString('en-PK')}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtPKR(Number(r.current_revenue))}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                      <TrendBadge pct={r.change_pct !== null ? Number(r.change_pct) : null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Table 2 — Slow Movers (admin + superadmin only) */}
      {!isPharmacist && slowMovers.length > 0 && (
        <div style={CARD}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            Slow Movers
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
              medicines with declining sales this period
            </span>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Medicine', 'Units (current)', 'Units (prev)', 'Change %'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Medicine' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slowMovers.map(r => (
                <tr key={r.medicine_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: 'rgba(220,38,38,0.03)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.medicine_name}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.current_qty).toLocaleString('en-PK')}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>{Number(r.prev_qty).toLocaleString('en-PK')}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                    <TrendBadge pct={r.change_pct !== null ? Number(r.change_pct) : null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
