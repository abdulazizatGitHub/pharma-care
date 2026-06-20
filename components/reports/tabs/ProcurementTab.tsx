'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import { getSupplierAnalysis, getSalesByDay } from '@/app/actions/reports'
import type { SupplierAnalysisRow } from '@/app/actions/reports'
import { exportCSV } from '../export/exportCSV'
import { fmtPKR, fmtAxis, fmtShortDate } from '@/lib/report-utils'

interface Props {
  dateRange: DateRange
  role:      string
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8, padding: '14px 16px',
}

const SUP_COLORS = ['#0D9488', '#6366f1', '#f59e0b', '#dc2626', '#22c55e', '#f97316', '#8b5cf6', '#0ea5e9']

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

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function PkrTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; fill?: string; stroke?: string }[]; label?: string }) {
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProcurementTab({ dateRange, role }: Props) {
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierAnalysisRow[]>([])
  const [byDay,     setByDay]     = useState<{ date: string; revenue: number }[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const [supR, dayR] = await Promise.all([
        getSupplierAnalysis(dateRange.from, dateRange.to),
        getSalesByDay(dateRange.from, dateRange.to),
      ])
      if (cancelled) return
      if (supR.error) { setError(supR.error); return }
      setSuppliers(supR.data ?? [])
      setByDay((dayR.data ?? []).map(r => ({ date: r.sale_date, revenue: Number(r.revenue) })))
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to])

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  const totalSuppliers   = suppliers.length
  const totalPurchased   = suppliers.reduce((s, r) => s + Number(r.total_purchased), 0)
  const totalPaid        = suppliers.reduce((s, r) => s + Number(r.total_paid),      0)
  const totalOutstanding = suppliers.reduce((s, r) => s + Number(r.outstanding),     0)
  const totalOrders      = suppliers.reduce((s, r) => s + Number(r.total_orders),    0)

  // ── Chart data ────────────────────────────────────────────────────────────

  const supplierBarData = suppliers.slice(0, 8).map((r, i) => ({
    name:      r.supplier_name.length > 14 ? r.supplier_name.slice(0, 14) + '…' : r.supplier_name,
    fullName:  r.supplier_name,
    Purchased: Number(r.total_purchased),
    color:     SUP_COLORS[i % SUP_COLORS.length],
  }))

  const monthlyData = byDay.map(r => ({
    date:      r.date,
    Purchases: r.revenue,
  }))

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = suppliers.map(r => ({
      supplier: r.supplier_name,
      orders: r.total_orders,
      purchased: r.total_purchased,
      paid: r.total_paid,
      outstanding: r.outstanding,
    }))
    exportCSV(rows, `procurement-${dateRange.from}-${dateRange.to}`)
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (role === 'pharmacist') {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
        Procurement reports are restricted to admin and above.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ ...CARD, height: 70 }} />)}
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
        title="Procurement Overview"
        description={`${dateRange.from} → ${dateRange.to}  ·  supplier analysis & purchase trends`}
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 5 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <KpiCard label="Active Suppliers"   value={totalSuppliers.toString()} highlight />
        <KpiCard label="Total Orders"       value={totalOrders.toLocaleString('en-PK')} />
        <KpiCard label="Total Purchased"    value={fmtPKR(totalPurchased)} sub="in period" />
        <KpiCard label="Total Paid"         value={fmtPKR(totalPaid)} color="#16a34a" />
        <KpiCard label="Outstanding (AP)"   value={fmtPKR(totalOutstanding)}
          color={totalOutstanding > 0 ? '#dc2626' : '#16a34a'}
          sub="amounts owed to suppliers" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Chart 1 — By-supplier bar */}
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Purchases by Supplier
          </p>
          {supplierBarData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No purchases in this period</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={supplierBarData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip content={PkrTip as any} />
                <Bar dataKey="Purchased" radius={[0, 2, 2, 0]} maxBarSize={18}>
                  {supplierBarData.map((item, i) => <Cell key={i} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Monthly purchase trend (using daily revenue as proxy) */}
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Purchase Trend
          </p>
          {monthlyData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No data</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={PkrTip as any} />
                <Line type="monotone" dataKey="Purchases" stroke="#0D9488" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table — Supplier analysis */}
      <div style={CARD}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
          Supplier Analysis
        </p>
        {suppliers.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No supplier data for this period</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Supplier', 'Orders', 'Total Purchased', 'Total Paid', 'Outstanding', 'Ledger'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Supplier' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(r => {
                const outstanding = Number(r.outstanding)
                return (
                  <tr key={r.supplier_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 500, color: '#111827' }}>{r.supplier_name}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.total_orders).toLocaleString('en-PK')}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{fmtPKR(Number(r.total_purchased))}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#16a34a' }}>{fmtPKR(Number(r.total_paid))}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: outstanding > 0 ? '#dc2626' : '#16a34a' }}>
                      {fmtPKR(outstanding)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                      {role === 'superadmin' ? (
                        <Link
                          href={`/superadmin/ledger/suppliers/${r.supplier_id}`}
                          style={{ fontSize: 11, color: '#0D9488', textDecoration: 'none', fontWeight: 500 }}
                        >
                          Ledger →
                        </Link>
                      ) : (
                        <Link
                          href={`/admin/ledger/suppliers/${r.supplier_id}`}
                          style={{ fontSize: 11, color: '#0D9488', textDecoration: 'none', fontWeight: 500 }}
                        >
                          Ledger →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
