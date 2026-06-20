'use client'

import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import { getOutstandingReceivables, getUdhaarAging } from '@/app/actions/reports'
import type { OutstandingReceivableRow, UdhaarAgingRow } from '@/app/actions/reports'
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

const AGING_COLORS: Record<string, string> = {
  '0-7 days':   '#16a34a',
  '8-30 days':  '#f59e0b',
  '31-60 days': '#f97316',
  '60+ days':   '#dc2626',
}

const BAR_DEFAULT = '#6366f1'

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

function AgingTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '3px 0 0' }}>Amount: {fmtPKR(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

function BalanceTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600, maxWidth: 160, wordBreak: 'break-word' }}>{label}</p>
      <p style={{ margin: '3px 0 0' }}>Balance: {fmtPKR(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CustomersTab({ role }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [receivables, setReceivables] = useState<OutstandingReceivableRow[]>([])
  const [aging,       setAging]       = useState<UdhaarAgingRow[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const [recR, agR] = await Promise.all([
        getOutstandingReceivables(),
        getUdhaarAging(),
      ])
      if (cancelled) return
      if (recR.error) { setError(recR.error); return }
      setReceivables(recR.data ?? [])
      setAging(agR.data        ?? [])
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  const totalCustomers  = receivables.length
  const totalBalance    = receivables.reduce((s, r) => s + Number(r.credit_balance), 0)
  const avgBalance      = totalCustomers > 0 ? totalBalance / totalCustomers : 0
  const overdue30       = aging.filter(r => ['31-60 days', '60+ days'].includes(r.bucket))
    .reduce((s, r) => s + Number(r.customer_count), 0)

  // ── Chart data ────────────────────────────────────────────────────────────

  const agingData = aging.map(r => ({
    name:   r.bucket,
    Amount: Number(r.total_amount),
    Count:  Number(r.customer_count),
  }))

  const top10 = receivables.slice(0, 10).map(r => ({
    name:    r.name.length > 16 ? r.name.slice(0, 16) + '…' : r.name,
    Balance: Number(r.credit_balance),
  }))

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = receivables.map(r => ({
      name: r.name, phone: r.phone,
      credit_balance: r.credit_balance,
      credit_limit: r.credit_limit,
      available_credit: r.credit_limit != null
        ? Math.max(0, Number(r.credit_limit) - Number(r.credit_balance))
        : null,
    }))
    exportCSV(rows, 'customers-outstanding')
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (role === 'pharmacist') {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
        Customer reports are restricted to admin and above.
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
        title="Customers Overview"
        description="Outstanding udhaar balances, aging, and credit analysis"
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 4 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard label="Customers with Udhaar" value={totalCustomers.toLocaleString('en-PK')} highlight />
        <KpiCard label="Total Outstanding"      value={fmtPKR(totalBalance)}
          color={totalBalance > 0 ? '#dc2626' : '#16a34a'} />
        <KpiCard label="Avg Balance"            value={fmtPKR(avgBalance)} />
        <KpiCard label="Overdue > 30 days"      value={overdue30.toString()}
          color={overdue30 > 0 ? '#dc2626' : '#16a34a'}
          sub="customers with old balances" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Chart 1 — Udhaar Aging */}
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Udhaar Aging
          </p>
          {agingData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No outstanding balances</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={AgingTip as any} />
                <Bar dataKey="Amount" radius={[2, 2, 0, 0]} maxBarSize={60}>
                  {agingData.map(item => (
                    <Cell key={item.name} fill={AGING_COLORS[item.name] ?? '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Largest Outstanding Balances (top 10 horizontal) */}
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>
            Largest Outstanding Balances
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>top 10</span>
          </p>
          {top10.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No outstanding balances</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip content={BalanceTip as any} />
                <Bar dataKey="Balance" fill={BAR_DEFAULT} radius={[0, 2, 2, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table — Outstanding receivables */}
      <div style={CARD}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
          Outstanding Receivables
          <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
            {totalCustomers} customers · sorted by balance
          </span>
        </p>
        {receivables.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
            No outstanding udhaar balances
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['#', 'Customer', 'Phone', 'Outstanding', 'Credit Limit', 'Available Credit'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Customer' || h === 'Phone' || h === '#' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receivables.map((r, i) => {
                const balance   = Number(r.credit_balance)
                const limit     = r.credit_limit != null ? Number(r.credit_limit) : null
                const available = limit != null ? Math.max(0, limit - balance) : null
                const overLimit = limit != null && balance > limit
                return (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: overLimit ? 'rgba(220,38,38,0.03)' : undefined }}>
                    <td style={{ padding: '6px 8px', color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 500, color: '#111827' }}>{r.name}</td>
                    <td style={{ padding: '6px 8px', color: '#6b7280' }}>{r.phone ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: '#dc2626' }}>
                      {fmtPKR(balance)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>
                      {limit != null ? fmtPKR(limit) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: overLimit ? '#dc2626' : '#16a34a' }}>
                      {available != null ? fmtPKR(available) : '—'}
                      {overLimit && <span style={{ fontSize: 9, marginLeft: 4 }}>OVER</span>}
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
