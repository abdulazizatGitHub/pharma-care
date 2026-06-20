'use client'

import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { DateRange } from '../DateRangeSelector'
import { TabHeader } from '../TabHeader'
import {
  getStockValuation, getExpiryReport, getDeadStock, getStockByCategory,
} from '@/app/actions/reports'
import type {
  StockValuationRow, ExpiryReportRow, DeadStockRow, StockByCategoryRow,
} from '@/app/actions/reports'
import { exportCSV } from '../export/exportCSV'
import { fmtPKR, fmtShortDate } from '@/lib/report-utils'

interface Props {
  dateRange: DateRange   // snapshot data ignores date; kept for API consistency
  role:      string
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8, padding: '14px 16px',
}

type SubTab = 'valuation' | 'expiry' | 'dead'

const CAT_COLORS = ['#0D9488', '#6366f1', '#f59e0b', '#dc2626', '#22c55e', '#f97316', '#8b5cf6', '#0ea5e9']

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

function BarTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ margin: '3px 0 0' }}>
          {p.name}: {p.name.toLowerCase().includes('value') ? fmtPKR(p.value) : p.value.toLocaleString('en-PK')}
        </p>
      ))}
    </div>
  )
}

// ─── SubTab pill buttons ───────────────────────────────────────────────────────

function SubTabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 500,
        background: active ? '#0D9488' : '#f3f4f6',
        color: active ? '#fff' : '#374151',
      }}
    >
      {label}
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function InventoryTab({ role }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [subTab,     setSubTab]     = useState<SubTab>('valuation')
  const [valuation,  setValuation]  = useState<StockValuationRow[]>([])
  const [expiry,     setExpiry]     = useState<ExpiryReportRow[]>([])
  const [dead,       setDead]       = useState<DeadStockRow[]>([])
  const [byCategory, setByCategory] = useState<StockByCategoryRow[]>([])
  const [valueFilter, setValueFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const [valR, expR, deadR, catR] = await Promise.all([
        getStockValuation(),
        getExpiryReport(90),
        getDeadStock(60),
        getStockByCategory(),
      ])
      if (cancelled) return
      if (valR.error) { setError(valR.error); return }
      setValuation(valR.data   ?? [])
      setExpiry(expR.data      ?? [])
      setDead(deadR.data       ?? [])
      setByCategory(catR.data  ?? [])
    }

    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  const totalSkus      = valuation.length
  const totalQty       = valuation.reduce((s, r) => s + Number(r.total_qty),   0)
  const totalCostValue = valuation.reduce((s, r) => s + Number(r.total_value), 0)
  const totalSaleValue = valuation.reduce((s, r) => s + Number(r.sale_value),  0)
  const expiringCount  = expiry.filter(r => r.days_to_expiry <= 30).length
  const outOfStock     = valuation.filter(r => Number(r.total_qty) === 0).length

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const minValue     = parseFloat(valueFilter) || 0
  const filteredVal  = valuation.filter(r => Number(r.total_value) >= minValue)
  const filteredDead = dead.filter(r => Number(r.stock_value) >= minValue)

  // ── Chart data ────────────────────────────────────────────────────────────

  const catData = byCategory.map(r => ({
    name:  r.category_name.length > 12 ? r.category_name.slice(0, 12) + '…' : r.category_name,
    Value: Number(r.total_value),
  }))

  const expiryBuckets: Record<string, number> = {}
  expiry.forEach(r => {
    const months = Math.ceil(r.days_to_expiry / 30)
    const key    = months <= 1 ? '≤1 mo' : months <= 2 ? '≤2 mo' : months <= 3 ? '≤3 mo' : '>3 mo'
    expiryBuckets[key] = (expiryBuckets[key] ?? 0) + 1
  })
  const ORDER = ['≤1 mo', '≤2 mo', '≤3 mo', '>3 mo']
  const expiryTimeline = ORDER
    .filter(k => k in expiryBuckets)
    .map(k => ({ name: k, Batches: expiryBuckets[k] }))

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const rows: Record<string, unknown>[] = []
    filteredVal.forEach(r => rows.push({
      section: 'Stock Valuation',
      medicine: r.medicine_name, code: r.medicine_code,
      qty: r.total_qty, avg_cost: r.avg_cost,
      cost_value: r.total_value, sale_value: r.sale_value,
    }))
    expiry.forEach(r => rows.push({
      section: 'Expiry',
      medicine: r.medicine_name, batch: r.batch_no,
      expiry_date: r.expiry_date, days_to_expiry: r.days_to_expiry,
      qty: r.quantity, value: r.value,
    }))
    filteredDead.forEach(r => rows.push({
      section: 'Dead Stock',
      medicine: r.medicine_name, last_sale: r.last_sale_date,
      days_inactive: r.days_inactive, qty: r.current_qty, value: r.stock_value,
    }))
    exportCSV(rows, 'inventory-report')
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (role === 'pharmacist') {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
        Inventory reports are restricted to admin and above.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {[...Array(6)].map((_, i) => <div key={i} style={{ ...CARD, height: 70 }} />)}
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
        title="Inventory Overview"
        description="Stock valuation snapshot · expiry · dead stock"
        onExportCSV={handleExportCSV}
        onExportPDF={() => window.print()}
        loading={loading}
      />

      {/* 6 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KpiCard label="Total SKUs"        value={totalSkus.toLocaleString('en-PK')} highlight />
        <KpiCard label="Out of Stock SKUs" value={outOfStock.toString()}
          color={outOfStock > 0 ? '#dc2626' : '#16a34a'} sub="zero-quantity items" />
        <KpiCard label="Total Units"       value={totalQty.toLocaleString('en-PK')} />
        <KpiCard label="Cost Value"        value={fmtPKR(totalCostValue)} sub="at purchase price" />
        <KpiCard label="Sale Value"        value={fmtPKR(totalSaleValue)} sub="at MRP" />
        <KpiCard label="Expiring ≤30 days" value={expiringCount.toString()}
          color={expiringCount > 0 ? '#f59e0b' : '#16a34a'} sub="batches near expiry" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Stock Value by Category</p>
          {catData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No data</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={72} />
                <Tooltip content={BarTip as any} />
                <Bar dataKey="Value" radius={[0, 2, 2, 0]} maxBarSize={18}>
                  {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={CARD}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Expiry Timeline (next 90 days)</p>
          {expiryTimeline.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>No expiring batches within 90 days</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={expiryTimeline} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Tooltip content={BarTip as any} />
                <Bar dataKey="Batches" fill="#f97316" radius={[2, 2, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sub-tab filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <SubTabPill label="Stock Valuation" active={subTab === 'valuation'} onClick={() => setSubTab('valuation')} />
          <SubTabPill label="Expiry Report"   active={subTab === 'expiry'}    onClick={() => setSubTab('expiry')}    />
          <SubTabPill label="Dead Stock"      active={subTab === 'dead'}      onClick={() => setSubTab('dead')}      />
        </div>
        {(subTab === 'valuation' || subTab === 'dead') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <label style={{ fontSize: 11, color: '#6b7280' }}>Min value (Rs)</label>
            <input
              type="number"
              value={valueFilter}
              onChange={e => setValueFilter(e.target.value)}
              placeholder="0"
              style={{
                width: 90, height: 28, padding: '0 8px', borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.12)', fontSize: 11, color: '#374151',
                background: '#fff',
              }}
            />
          </div>
        )}
      </div>

      {/* Sub-tab: Stock Valuation */}
      {subTab === 'valuation' && (
        <div style={CARD}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            Stock Valuation
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>{filteredVal.length} SKUs</span>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Medicine', 'Code', 'Units', 'Avg Cost', 'Cost Value', 'Sale Value'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Medicine' || h === 'Code' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVal.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No items above threshold</td></tr>
                : filteredVal.map(r => (
                  <tr key={r.medicine_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 500, color: '#111827' }}>{r.medicine_name}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{r.medicine_code ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.total_qty).toLocaleString('en-PK')}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>{fmtPKR(Number(r.avg_cost))}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{fmtPKR(Number(r.total_value))}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#0D9488' }}>{fmtPKR(Number(r.sale_value))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-tab: Expiry Report */}
      {subTab === 'expiry' && (
        <div style={CARD}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            Expiry Report
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>batches expiring within 90 days</span>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Medicine', 'Batch', 'Expiry Date', 'Days Left', 'Units', 'Value'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Medicine' || h === 'Batch' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expiry.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No expiring batches</td></tr>
                : expiry.map(r => {
                  const urgent = r.days_to_expiry <= 14
                  const warn   = r.days_to_expiry <= 30
                  return (
                    <tr key={`${r.medicine_id}-${r.batch_no}`} style={{
                      borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                      background: urgent ? 'rgba(220,38,38,0.04)' : warn ? 'rgba(245,158,11,0.04)' : undefined,
                    }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.medicine_name}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{r.batch_no}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtShortDate(r.expiry_date)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: urgent ? '#dc2626' : warn ? '#f59e0b' : '#374151' }}>
                        {r.days_to_expiry}d
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.quantity).toLocaleString('en-PK')}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtPKR(Number(r.value))}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-tab: Dead Stock */}
      {subTab === 'dead' && (
        <div style={CARD}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            Dead Stock
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>no sales in 60+ days</span>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Medicine', 'Last Sale', 'Days Inactive', 'Units', 'Stock Value'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Medicine' ? 'left' : 'right',
                    padding: '4px 8px', fontSize: 10, fontWeight: 600,
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDead.length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No dead stock above threshold</td></tr>
                : filteredDead.map(r => (
                  <tr key={r.medicine_id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.medicine_name}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>
                      {r.last_sale_date ? fmtShortDate(r.last_sale_date) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: r.days_inactive > 90 ? '#dc2626' : '#f59e0b' }}>
                      {r.days_inactive}d
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(r.current_qty).toLocaleString('en-PK')}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{fmtPKR(Number(r.stock_value))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
