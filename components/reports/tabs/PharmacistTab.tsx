'use client'

import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import { getPharmacistStats, getPharmacistDaily } from '@/app/actions/reports'
import type { PharmacistStatsRow, PharmacistDailyRow } from '@/app/actions/reports'
import { exportCSV } from '../export/exportCSV'
import { fmtPKR, fmtAxis } from '@/lib/report-utils'

interface Props {
  dateRange: DateRange
  role:      string
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8, padding: '14px 16px',
}

const PHARMACIST_COLORS = ['#0D9488', '#6366f1', '#f59e0b', '#dc2626', '#22c55e', '#f97316']

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, highlight }: {
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

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function BarTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; fill?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0 0', color: p.fill }}>
          {p.name}: {p.name === 'Revenue' ? fmtPKR(p.value) : p.value.toLocaleString('en-PK')}
        </p>
      ))}
    </div>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function Heatmap({ rows, pharmacists }: { rows: PharmacistDailyRow[]; pharmacists: string[] }) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Build lookup: cashier_id+dow → revenue
  const lookup = new Map<string, number>()
  rows.forEach(r => lookup.set(`${r.cashier_id}:${r.day_of_week}`, Number(r.revenue)))

  // Max value for colour scaling
  const allRevenues = rows.map(r => Number(r.revenue)).filter(v => v > 0)
  const maxRev = allRevenues.length > 0 ? Math.max(...allRevenues) : 1

  // cashier_id → cashier_name lookup
  const nameMap = new Map<string, string>()
  rows.forEach(r => nameMap.set(r.cashier_id, r.cashier_name))

  function cellColor(rev: number): string {
    if (rev === 0) return '#f9fafb'
    const intensity = rev / maxRev
    if (intensity < 0.25) return '#ccfbf1'
    if (intensity < 0.5)  return '#5eead4'
    if (intensity < 0.75) return '#14b8a6'
    return '#0D9488'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 380 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: 10, color: '#6b7280', fontWeight: 600, minWidth: 100 }}>
              Pharmacist
            </th>
            {DAY_NAMES.map(d => (
              <th key={d} style={{ padding: '4px 6px', textAlign: 'center', fontSize: 10, color: '#6b7280', fontWeight: 600, width: 52 }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pharmacists.map(cId => (
            <tr key={cId}>
              <td style={{ padding: '4px 8px', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {nameMap.get(cId) ?? cId.slice(0, 8)}
              </td>
              {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                const rev = lookup.get(`${cId}:${dow}`) ?? 0
                return (
                  <td key={dow} title={`${DAY_NAMES[dow]}: ${fmtPKR(rev)}`} style={{
                    padding: '3px 4px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 44, height: 28, borderRadius: 4,
                      background: cellColor(rev),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: rev > maxRev * 0.5 ? '#fff' : '#374151',
                      fontWeight: rev > 0 ? 600 : 400,
                    }}>
                      {rev > 0 ? `${(rev / 1000).toFixed(0)}K` : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 9, color: '#9ca3af' }}>Low</span>
        {['#ccfbf1', '#5eead4', '#14b8a6', '#0D9488'].map(c => (
          <div key={c} style={{ width: 16, height: 10, borderRadius: 2, background: c }} />
        ))}
        <span style={{ fontSize: 9, color: '#9ca3af' }}>High</span>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PharmacistTab({ dateRange, role }: Props) {
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [stats,     setStats]     = useState<PharmacistStatsRow[]>([])
  const [daily,     setDaily]     = useState<PharmacistDailyRow[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const [stR, dyR] = await Promise.all([
        getPharmacistStats(dateRange.from, dateRange.to),
        getPharmacistDaily(dateRange.from, dateRange.to),
      ])
      if (cancelled) return
      if (stR.error) { setError(stR.error); return }
      setStats(stR.data ?? [])
      setDaily(dyR.data ?? [])
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to])

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  const totalPharmacists = stats.length
  const totalRevenue     = stats.reduce((s, r) => s + Number(r.revenue),    0)
  const totalSales       = stats.reduce((s, r) => s + Number(r.sale_count), 0)
  const avgPerPharmacist = totalPharmacists > 0 ? totalRevenue / totalPharmacists : 0

  // ── Grouped BarChart data — transactions + revenue side by side ────────────

  const groupedData = stats.map((r, i) => ({
    name:         r.cashier_name.length > 12 ? r.cashier_name.split(' ')[0] : r.cashier_name,
    Transactions: Number(r.sale_count),
    Revenue:      Number(r.revenue),
    fill:         PHARMACIST_COLORS[i % PHARMACIST_COLORS.length],
  }))

  // Unique pharmacist IDs in deterministic order (by revenue desc)
  const pharmacistIds = stats.map(r => r.cashier_id)

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = [
      ...stats.map(r => ({
        section: 'Summary',
        pharmacist: r.cashier_name, sales: r.sale_count,
        revenue: r.revenue, avg_sale: r.avg_sale,
        top_medicine: r.top_medicine, best_day: r.best_day_of_week,
      })),
      ...daily.map(r => ({
        section: 'Daily',
        pharmacist: r.cashier_name, day: r.day_name,
        revenue: r.revenue, sales: r.sale_count,
      })),
    ]
    exportCSV(rows, `pharmacists-${dateRange.from}-${dateRange.to}`)
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (role === 'pharmacist') {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
        Pharmacist analytics are restricted to admin and above.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 70 }} />)}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabHeader
        title="Pharmacist Performance"
        description={`${dateRange.from} → ${dateRange.to}  ·  revenue, transactions & heatmap`}
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 4 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard label="Active Pharmacists"  value={totalPharmacists.toString()} highlight />
        <KpiCard label="Total Revenue"       value={fmtPKR(totalRevenue)} />
        <KpiCard label="Total Transactions"  value={totalSales.toLocaleString('en-PK')} />
        <KpiCard label="Avg Revenue / Staff" value={fmtPKR(avgPerPharmacist)} />
      </div>

      {/* Chart 1 — Grouped BarChart (transactions + revenue) */}
      <div style={CARD}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
          Transactions &amp; Revenue by Pharmacist
        </p>
        {groupedData.length === 0 ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No sales in this period</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={groupedData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left"  tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => String(v)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip content={BarTip as any} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left"  dataKey="Revenue"      fill="#0D9488" maxBarSize={24} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="right" dataKey="Transactions" fill="#6366f1" maxBarSize={24} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Heatmap — 7 days × N pharmacists */}
      <div style={CARD}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
          Revenue Heatmap — by Day of Week
        </p>
        {daily.length === 0 ? (
          <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No data</span>
          </div>
        ) : (
          <Heatmap rows={daily} pharmacists={pharmacistIds} />
        )}
      </div>

      {/* Table — Extended pharmacist stats */}
      <div style={CARD}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
          Pharmacist Performance Summary
        </p>
        {stats.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No data</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Pharmacist', 'Sales', 'Revenue', 'Avg Sale', 'Top Medicine', 'Best Day'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Pharmacist' || h === 'Top Medicine' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((r, i) => (
                <tr key={r.cashier_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500, color: '#111827' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: PHARMACIST_COLORS[i % PHARMACIST_COLORS.length],
                        flexShrink: 0,
                      }} />
                      {r.cashier_name}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.sale_count).toLocaleString('en-PK')}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{fmtPKR(Number(r.revenue))}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>{fmtPKR(Number(r.avg_sale))}</td>
                  <td style={{ padding: '6px 8px', color: '#374151', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.top_medicine ?? '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#0D9488', fontWeight: 500 }}>
                    {r.best_day_of_week ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
