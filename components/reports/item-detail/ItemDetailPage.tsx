'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import {
  getMedicineById, searchMedicines,
  getItemBatchDetail, getItemSalesDetail,
  getItemSupplierHistory, getItemReturnHistory,
} from '@/app/actions/item-report'
import type {
  MedicineDetail, MedicineSearchResult, ItemBatch,
  ItemSaleRow, ItemSupplierRow, ItemReturnRow,
} from '@/app/actions/item-report'
import { fmtPKR, fmtShortDate, fmtAxis } from '@/lib/report-utils'

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today      = () => new Date().toISOString().split('T')[0]
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const firstOfYear = () => `${new Date().getFullYear()}-01-01`

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '0.5px solid rgba(0,0,0,0.08)',
  borderRadius: 8,
  padding: '14px 16px',
}

const TH: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  borderBottom: '1px solid #f3f4f6',
  whiteSpace: 'nowrap',
  background: '#fafbfc',
}

const TD: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: '#111827',
  borderBottom: '0.5px solid rgba(0,0,0,0.05)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const BTN: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid rgba(0,0,0,0.15)',
  borderRadius: 6,
  cursor: 'pointer',
  background: '#fff',
  color: '#111827',
  whiteSpace: 'nowrap',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={CARD}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '8px 0 0', lineHeight: 1.2 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={CARD}>
      <div style={{ background: '#f3f4f6', borderRadius: 4, height: 10, width: '55%', marginBottom: 10 }} />
      <div style={{ background: '#f3f4f6', borderRadius: 4, height: 22, width: '80%' }} />
    </div>
  )
}

function InlineError({ msg }: { msg: string }) {
  return (
    <div style={{ ...CARD, color: '#dc2626', fontSize: 13, textAlign: 'center', padding: 24 }}>
      {msg}
    </div>
  )
}

function SalesTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const rawValue = payload[0]?.value
  const units = typeof rawValue === 'number' ? rawValue : 0
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{typeof label === 'string' ? fmtShortDate(label) : label}</p>
      <p style={{ margin: '3px 0 0' }}>Units: {units}</p>
    </div>
  )
}

function PriceTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const rawValue = payload[0]?.value
  const v = typeof rawValue === 'number' ? rawValue : 0
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{typeof label === 'string' ? fmtShortDate(label) : label}</p>
      <p style={{ margin: '3px 0 0' }}>Purchase Price: {fmtPKR(v)}</p>
    </div>
  )
}

function RevenueTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const rawValue = payload[0]?.value
  const v = typeof rawValue === 'number' ? rawValue : 0
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{typeof label === 'string' ? fmtShortDate(label) : label}</p>
      <p style={{ margin: '3px 0 0' }}>Revenue: {fmtPKR(v)}</p>
    </div>
  )
}

function SupplierUnitsTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const rawValue = payload[0]?.value
  const v = typeof rawValue === 'number' ? rawValue : 0
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '3px 0 0' }}>Units: {v.toLocaleString('en-PK')}</p>
    </div>
  )
}

function BatchStockTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  const rawValue = payload[0]?.value
  const v = typeof rawValue === 'number' ? rawValue : 0
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '3px 0 0' }}>Units: {v.toLocaleString('en-PK')}</p>
    </div>
  )
}

function RevDiscountTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload.length) return null
  return (
    <div style={{ background: '#1f2937', color: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{typeof label === 'string' ? fmtShortDate(label) : label}</p>
      {payload.map((entry, i) => {
        const v = typeof entry.value === 'number' ? entry.value : 0
        return (
          <p key={i} style={{ margin: '3px 0 0', color: entry.color as string }}>
            {entry.name}: {fmtPKR(v)}
          </p>
        )
      })}
    </div>
  )
}

function getBatchStatus(b: ItemBatch): { label: string; bg: string; color: string } {
  if (b.quantity === 0)    return { label: 'Out of Stock',   bg: '#f3f4f6',               color: '#6b7280' }
  if (!b.expiry_date)      return { label: 'Active',          bg: 'rgba(22,163,74,0.1)',   color: '#15803d' }
  const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000)
  if (days < 0)            return { label: 'Expired',         bg: 'rgba(220,38,38,0.08)', color: '#dc2626' }
  if (days <= 90)          return { label: 'Expiring Soon',   bg: 'rgba(245,158,11,0.1)', color: '#d97706' }
  return                          { label: 'Active',          bg: 'rgba(22,163,74,0.1)',  color: '#15803d' }
}

function getExpiryColor(expiryDate: string | null): string {
  if (!expiryDate) return 'inherit'
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)
  if (days < 0)   return '#dc2626'
  if (days <= 90) return '#d97706'
  return 'inherit'
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  role:              'superadmin' | 'admin'
  initialMedicineId: string | null
}

const SALES_PAGE_SIZE = 50

// ─── Component ────────────────────────────────────────────────────────────────

export default function ItemDetailPage({ role, initialMedicineId }: Props) {
  const router = useRouter()

  const [medicineId,    setMedicineId]    = useState<string | null>(initialMedicineId)
  const [query,         setQuery]         = useState('')
  const [searchResults, setSearchResults] = useState<MedicineSearchResult[]>([])
  const [medicine,      setMedicine]      = useState<MedicineDetail | null>(null)
  const [batches,       setBatches]       = useState<ItemBatch[]>([])
  const [salesData,     setSalesData]     = useState<ItemSaleRow[]>([])
  const [supplierData,  setSupplierData]  = useState<ItemSupplierRow[]>([])
  const [returnData,    setReturnData]    = useState<ItemReturnRow[]>([])
  const [dateFrom,      setDateFrom]      = useState(firstOfMonth)
  const [dateTo,        setDateTo]        = useState(today)
  const [inputFrom,     setInputFrom]     = useState(firstOfMonth)
  const [inputTo,       setInputTo]       = useState(today)
  const [salesPage,     setSalesPage]     = useState(1)

  const [loading, setLoading] = useState({
    batches: false, sales: false, supplier: false, returns: false,
  })
  const [errors, setErrors] = useState<{
    batches: string | null; sales: string | null
    supplier: string | null; returns: string | null
  }>({ batches: null, sales: null, supplier: null, returns: null })

  const searchRef = useRef<HTMLDivElement>(null)

  // ── Load medicine + batches when medicineId changes ───────────────────────

  useEffect(() => {
    if (!medicineId) {
      setMedicine(null)
      setBatches([])
      return
    }
    let cancelled = false
    setLoading(prev => ({ ...prev, batches: true }))
    setErrors(prev => ({ ...prev, batches: null }))

    async function load() {
      const [medR, batchR] = await Promise.all([
        getMedicineById(medicineId!),
        getItemBatchDetail(medicineId!),
      ])
      if (cancelled) return
      setMedicine(medR.data)
      setBatches(batchR.data ?? [])
      if (batchR.error) setErrors(prev => ({ ...prev, batches: batchR.error }))
    }

    load().finally(() => { if (!cancelled) setLoading(prev => ({ ...prev, batches: false })) })
    return () => { cancelled = true }
  }, [medicineId])

  // ── Load date-range data when medicineId or dates change ──────────────────

  useEffect(() => {
    if (!medicineId) {
      setSalesData([])
      setSupplierData([])
      setReturnData([])
      return
    }
    let cancelled = false
    setSalesPage(1)
    setLoading(prev => ({ ...prev, sales: true, supplier: true, returns: true }))
    setErrors(prev => ({ ...prev, sales: null, supplier: null, returns: null }))

    async function load() {
      const [salesR, supplierR, returnR] = await Promise.all([
        getItemSalesDetail(medicineId!, dateFrom, dateTo),
        getItemSupplierHistory(medicineId!, dateFrom, dateTo),
        getItemReturnHistory(medicineId!, dateFrom, dateTo),
      ])
      if (cancelled) return
      setSalesData(salesR.data ?? [])
      setSupplierData(supplierR.data ?? [])
      setReturnData(returnR.data ?? [])
      if (salesR.error)    setErrors(prev => ({ ...prev, sales:    salesR.error }))
      if (supplierR.error) setErrors(prev => ({ ...prev, supplier: supplierR.error }))
      if (returnR.error)   setErrors(prev => ({ ...prev, returns:  returnR.error }))
    }

    load().finally(() => {
      if (!cancelled) setLoading(prev => ({ ...prev, sales: false, supplier: false, returns: false }))
    })
    return () => { cancelled = true }
  }, [medicineId, dateFrom, dateTo])

  // ── Debounced medicine search ──────────────────────────────────────────────

  useEffect(() => {
    if (query.length < 1) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const r = await searchMedicines(query)
      setSearchResults(r.data ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // ── Click-outside closes dropdown ─────────────────────────────────────────

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function selectMedicine(m: MedicineSearchResult) {
    setMedicineId(m.id)
    setQuery('')
    setSearchResults([])
    router.push(`?medicine_id=${m.id}`)
  }

  function applyThisMonth() {
    const from = firstOfMonth(); const to = today()
    setInputFrom(from); setInputTo(to); setDateFrom(from); setDateTo(to)
  }

  function applyYTD() {
    const from = firstOfYear(); const to = today()
    setInputFrom(from); setInputTo(to); setDateFrom(from); setDateTo(to)
  }

  function applyCustomRange() {
    setDateFrom(inputFrom)
    setDateTo(inputTo)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  // Section 1 — Overview
  const totalStock     = batches.reduce((s, b) => s + b.quantity, 0)
  const activeBatchCnt = batches.filter(b => b.quantity > 0).length
  const expiringSoon   = batches.filter(b => {
    if (!b.expiry_date || b.quantity === 0) return false
    const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 90
  }).length
  const avgSalePriceKpi = (() => {
    const active = batches.filter(b => b.quantity > 0 && b.sale_price != null)
    if (!active.length) return null
    return active.reduce((s, b) => s + (b.sale_price ?? 0), 0) / active.length
  })()

  // Section 3 — Sales
  const salesChartData = (() => {
    const map: Record<string, number> = {}
    for (const r of salesData) map[r.sale_date] = (map[r.sale_date] ?? 0) + r.quantity_sold
    return Object.entries(map)
      .map(([date, units]) => ({ date, units }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()
  const totalUnitsSold = salesData.reduce((s, r) => s + r.quantity_sold, 0)
  const totalRevenue   = salesData.reduce((s, r) => s + r.line_total, 0)
  const totalDiscount  = salesData.reduce((s, r) => s + r.discount_amount, 0)
  const netRevenue     = totalRevenue - totalDiscount
  const pagedSales     = salesData.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE)
  const salesTotalPages = Math.ceil(salesData.length / SALES_PAGE_SIZE)

  // Section 4 — Supplier
  const supplierBreakdown = (() => {
    const map: Record<string, { grns: Set<string>; units: number; spent: number }> = {}
    for (const r of supplierData) {
      const name = r.supplier_name ?? 'Unknown'
      if (!map[name]) map[name] = { grns: new Set(), units: 0, spent: 0 }
      map[name].grns.add(r.grn_number)
      map[name].units += r.quantity_received
      map[name].spent += r.line_total
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, grns: v.grns.size, units: v.units, spent: v.spent }))
      .sort((a, b) => b.spent - a.spent)
  })()
  const totalUnitsPurchased = supplierData.reduce((s, r) => s + r.quantity_received, 0)
  const totalSpent          = supplierData.reduce((s, r) => s + r.line_total, 0)
  const uniqueSuppliers     = new Set(supplierData.map(r => r.supplier_name)).size
  const uniqueGRNs          = new Set(supplierData.map(r => r.grn_number)).size

  // Section 5 — Discount & Returns
  const avgDiscountPerTx   = salesData.length > 0 ? totalDiscount / salesData.length : 0
  const withDiscountCnt    = salesData.filter(r => r.discount_amount > 0).length
  const withoutDiscountCnt = salesData.filter(r => r.discount_amount === 0).length
  const unitsReturned      = returnData.reduce((s, r) => s + r.quantity_returned, 0)
  const totalRefund        = returnData.reduce((s, r) => s + (r.refund_amount ?? 0), 0)
  const returnRate         = totalUnitsSold > 0
    ? ((unitsReturned / totalUnitsSold) * 100).toFixed(1) + '%'
    : '0%'

  // Section 6 — Price & Margin
  const activeBatchesWithPrice = batches.filter(b => b.quantity > 0 && b.purchase_price != null)
  const lowestPurchase   = activeBatchesWithPrice.length ? Math.min(...activeBatchesWithPrice.map(b => b.purchase_price!)) : null
  const highestPurchase  = activeBatchesWithPrice.length ? Math.max(...activeBatchesWithPrice.map(b => b.purchase_price!)) : null
  const avgPurchase      = activeBatchesWithPrice.length
    ? activeBatchesWithPrice.reduce((s, b) => s + b.purchase_price!, 0) / activeBatchesWithPrice.length
    : null
  const avgSalePriceSec6 = activeBatchesWithPrice.length
    ? activeBatchesWithPrice.reduce((s, b) => s + (b.sale_price ?? 0), 0) / activeBatchesWithPrice.length
    : null
  const avgMrpSec6 = activeBatchesWithPrice.length
    ? activeBatchesWithPrice.reduce((s, b) => s + (b.mrp ?? 0), 0) / activeBatchesWithPrice.length
    : null
  const saleMarginSec6 = avgPurchase && avgPurchase > 0 && avgSalePriceSec6 != null
    ? ((avgSalePriceSec6 - avgPurchase) / avgPurchase * 100).toFixed(1) + '%'
    : '—'
  const mrpMarginSec6 = avgPurchase && avgPurchase > 0 && avgMrpSec6 != null
    ? ((avgMrpSec6 - avgPurchase) / avgPurchase * 100).toFixed(1) + '%'
    : '—'
  const priceChartData = [...batches]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(b => ({ date: b.created_at.split('T')[0], price: b.purchase_price ?? 0 }))

  // Chart A — revenue trend (daily)
  const revenueChartData = (() => {
    const map: Record<string, number> = {}
    for (const r of salesData) map[r.sale_date] = (map[r.sale_date] ?? 0) + r.line_total
    return Object.entries(map)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()

  // Chart B — units received by supplier
  const supplierUnitsChartData = supplierBreakdown
    .slice(0, 10)
    .map(s => ({ name: s.name.length > 18 ? s.name.slice(0, 16) + '…' : s.name, units: s.units }))

  // Chart C — current stock by batch
  const batchStockChartData = batches
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12)
    .map(b => ({
      name: b.batch_no,
      qty: b.quantity,
      status: getBatchStatus(b).label,
    }))

  // Chart D — revenue vs discount per day (only when totalDiscount > 0)
  const revDiscountChartData = (() => {
    const map: Record<string, { revenue: number; discount: number }> = {}
    for (const r of salesData) {
      if (!map[r.sale_date]) map[r.sale_date] = { revenue: 0, discount: 0 }
      map[r.sale_date].revenue   += r.line_total
      map[r.sale_date].discount  += r.discount_amount
    }
    return Object.entries(map)
      .map(([date, v]) => ({ date, revenue: v.revenue, discount: v.discount }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()

  function getBatchBarColor(status: string): string {
    if (status === 'Expired')       return '#dc2626'
    if (status === 'Expiring Soon') return '#d97706'
    if (status === 'Out of Stock')  return '#9ca3af'
    return '#0D9488'
  }

  const inputDisplayValue = query !== '' ? query : (medicine ? medicine.name : '')

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>

      {/* Back link */}
      <Link
        href={`/${role}/reports`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: '#6b7280', fontSize: 13, marginBottom: 20,
          textDecoration: 'none', cursor: 'pointer',
        }}
      >
        ← Reports
      </Link>

      {/* Medicine search */}
      <div ref={searchRef} style={{ position: 'relative', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search medicine by name or code..."
          value={inputDisplayValue}
          onFocus={e => e.target.select()}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%', height: 38, padding: '0 12px', fontSize: 13,
            border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8,
            outline: 'none', background: '#fff', color: '#111827',
            boxSizing: 'border-box',
          }}
        />
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: 42, left: 0, right: 0, zIndex: 50,
            background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            maxHeight: 240, overflowY: 'auto',
          }}>
            {searchResults.map(m => (
              <button
                key={m.id}
                type="button"
                onMouseDown={() => selectMedicine(m)}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px',
                  textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', borderBottom: '0.5px solid #f3f4f6',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{m.name}</span>
                {m.code && (
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8, fontFamily: 'monospace' }}>
                    {m.code}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Medicine header */}
      {medicine && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>{medicine.name}</p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            {[
              medicine.code,
              medicine.manufacturer,
              medicine.mrp != null ? `MRP: ${fmtPKR(medicine.mrp)}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', marginTop: 12 }} />
        </div>
      )}

      {/* Date range bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 20, padding: '10px 14px',
        background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8,
      }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>From</span>
        <input
          type="date" value={inputFrom} onChange={e => setInputFrom(e.target.value)}
          style={{ height: 30, fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, padding: '0 8px' }}
        />
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>To</span>
        <input
          type="date" value={inputTo} onChange={e => setInputTo(e.target.value)}
          style={{ height: 30, fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, padding: '0 8px' }}
        />
        <button
          onClick={applyCustomRange}
          style={{ ...BTN, background: '#0F6E56', color: '#fff', border: 'none' }}
        >
          Apply
        </button>
        <button onClick={applyThisMonth} style={BTN}>This Month</button>
        <button onClick={applyYTD} style={BTN}>YTD</button>
      </div>

      {/* Empty state */}
      {!medicineId && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 14 }}>
          Select a medicine above to view its full report
        </div>
      )}

      {/* All sections — only shown when a medicine is selected */}
      {medicineId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── SECTION 1: Overview ─────────────────────────────────── */}
          <div>
            <SectionTitle title="Overview" />
            {loading.batches ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : errors.batches ? (
              <InlineError msg={errors.batches} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <KpiCard label="Total Units in Stock"    value={totalStock.toLocaleString('en-PK')} />
                <KpiCard label="Active Batches"          value={activeBatchCnt.toString()} />
                <KpiCard label="Expiring Within 90 Days" value={expiringSoon.toString()} />
                <KpiCard
                  label="Avg Sale Price (Active)"
                  value={avgSalePriceKpi != null ? fmtPKR(avgSalePriceKpi) : '—'}
                />
              </div>
            )}
          </div>

          {/* ── SECTION 2: Stock & Batches ──────────────────────────── */}
          <div style={CARD}>
            <SectionTitle title="Stock & Batches" />
            {loading.batches ? (
              <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
              </div>
            ) : errors.batches ? (
              <InlineError msg={errors.batches} />
            ) : batches.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No batches found</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {[
                          ['Batch No', false], ['Expiry Date', false], ['Qty', true],
                          ['Purchase Price', true], ['Sale Price', true], ['MRP', true],
                          ['Margin %', true], ['Supplier', false], ['Status', false],
                        ].map(([h, right]) => (
                          <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>
                            {h as string}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map(b => {
                        const status = getBatchStatus(b)
                        const margin = b.purchase_price && b.purchase_price > 0 && b.sale_price != null
                          ? ((b.sale_price - b.purchase_price) / b.purchase_price * 100).toFixed(1) + '%'
                          : '—'
                        return (
                          <tr key={b.batch_id}>
                            <td style={{ ...TD, fontFamily: 'monospace', color: '#0F6E56', fontWeight: 500 }}>
                              {b.batch_no}
                            </td>
                            <td style={{ ...TD, color: getExpiryColor(b.expiry_date) }}>
                              {b.expiry_date ?? '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {b.quantity}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {b.purchase_price != null ? fmtPKR(b.purchase_price) : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {b.sale_price != null ? fmtPKR(b.sale_price) : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {b.mrp != null ? fmtPKR(b.mrp) : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>{margin}</td>
                            <td style={{ ...TD, color: '#6b7280' }}>{b.supplier_name ?? '—'}</td>
                            <td style={TD}>
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: 99,
                                fontSize: 10, fontWeight: 600,
                                background: status.bg, color: status.color,
                              }}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Summary row */}
                <div style={{
                  display: 'flex', gap: 24, padding: '10px 10px 2px',
                  marginTop: 8, borderTop: '1px solid #f3f4f6',
                  background: '#fafbfc', borderRadius: '0 0 6px 6px',
                }}>
                  {[
                    ['Total Units',           totalStock.toLocaleString('en-PK')],
                    ['Stock Value at Cost',   fmtPKR(batches.reduce((s, b) => s + b.quantity * (b.purchase_price ?? 0), 0))],
                    ['Stock Value at MRP',    fmtPKR(batches.reduce((s, b) => s + b.quantity * (b.mrp ?? 0), 0))],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                        {label}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '3px 0 6px' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Chart C — Current Stock by Batch */}
                {batchStockChartData.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                      Stock by Batch
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={batchStockChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={fmtAxis}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={36}
                          allowDecimals={false}
                        />
                        <Tooltip content={BatchStockTooltip} />
                        <Bar dataKey="qty" radius={[2, 2, 0, 0]} maxBarSize={28}>
                          {batchStockChartData.map((entry, index) => (
                            <Cell key={index} fill={getBatchBarColor(entry.status)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── SECTION 3: Sales History ─────────────────────────────── */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>Sales History</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{dateFrom} – {dateTo}</p>
            </div>
            {loading.sales ? (
              <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
              </div>
            ) : errors.sales ? (
              <InlineError msg={errors.sales} />
            ) : (
              <>
                {/* 4 summary KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                  <KpiCard label="Units Sold"     value={totalUnitsSold.toLocaleString('en-PK')} />
                  <KpiCard label="Total Revenue"  value={fmtPKR(totalRevenue)} />
                  <KpiCard label="Total Discount" value={fmtPKR(totalDiscount)} />
                  <KpiCard label="Net Revenue"    value={fmtPKR(netRevenue)} />
                </div>

                {/* Bar chart — daily units */}
                {salesChartData.length === 0 ? (
                  <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>No sales in this period</span>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                      Daily Units Sold
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={salesChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtShortDate}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <Tooltip content={SalesTooltip} />
                        <Bar dataKey="units" fill="#0D9488" radius={[2, 2, 0, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Chart A — Revenue trend */}
                {revenueChartData.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                      Daily Revenue
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={revenueChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtShortDate}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={fmtAxis}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip content={RevenueTooltip} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Transaction table */}
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                  {salesData.length} transaction{salesData.length !== 1 ? 's' : ''}
                </p>
                {salesData.length > 0 && (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            {[
                              ['Sale Date', false], ['Receipt No', false], ['Batch', false],
                              ['Qty', true], ['Unit Price', true], ['Discount', true],
                              ['Line Total', true], ['Payment', false], ['Customer', false], ['Pharmacist', false],
                            ].map(([h, right]) => (
                              <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>
                                {h as string}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pagedSales.map((r, i) => (
                            <tr key={i}>
                              <td style={TD}>{r.sale_date}</td>
                              <td style={{ ...TD, fontFamily: 'monospace', color: '#0F6E56' }}>
                                {r.sale_reference}
                              </td>
                              <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                                {r.batch_no}
                              </td>
                              <td style={{ ...TD, textAlign: 'right' }}>{r.quantity_sold}</td>
                              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtPKR(r.unit_price)}
                              </td>
                              <td style={{
                                ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                color: r.discount_amount > 0 ? '#d97706' : 'inherit',
                              }}>
                                {r.discount_amount > 0 ? fmtPKR(r.discount_amount) : '—'}
                              </td>
                              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                                {fmtPKR(r.line_total)}
                              </td>
                              <td style={{ ...TD, color: '#6b7280' }}>{r.payment_type ?? '—'}</td>
                              <td style={{ ...TD, color: '#6b7280' }}>{r.customer_name ?? '—'}</td>
                              <td style={{ ...TD, color: '#6b7280' }}>{r.pharmacist_name ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {salesTotalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                        <button
                          disabled={salesPage <= 1}
                          onClick={() => setSalesPage(p => p - 1)}
                          style={{ ...BTN, opacity: salesPage <= 1 ? 0.4 : 1 }}
                        >
                          ← Prev
                        </button>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          {salesPage} / {salesTotalPages}
                        </span>
                        <button
                          disabled={salesPage >= salesTotalPages}
                          onClick={() => setSalesPage(p => p + 1)}
                          style={{ ...BTN, opacity: salesPage >= salesTotalPages ? 0.4 : 1 }}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* ── SECTION 4: Supplier History ──────────────────────────── */}
          <div style={CARD}>
            <SectionTitle title="Supplier History" />
            {loading.supplier ? (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
              </div>
            ) : errors.supplier ? (
              <InlineError msg={errors.supplier} />
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                  <KpiCard label="Total Units Purchased" value={totalUnitsPurchased.toLocaleString('en-PK')} />
                  <KpiCard label="Total Spent"           value={fmtPKR(totalSpent)} />
                  <KpiCard label="Suppliers"             value={uniqueSuppliers.toString()} />
                  <KpiCard label="GRNs"                  value={uniqueGRNs.toString()} />
                </div>

                {supplierUnitsChartData.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                      Units Received by Supplier
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={supplierUnitsChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={fmtAxis}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={36}
                          allowDecimals={false}
                        />
                        <Tooltip content={SupplierUnitsTooltip} />
                        <Bar dataKey="units" fill="#0D9488" radius={[2, 2, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {supplierBreakdown.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>By Supplier</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {[['Supplier', false], ['GRNs', true], ['Units Received', true], ['Total Spent', true]].map(([h, right]) => (
                            <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>{h as string}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {supplierBreakdown.map(r => (
                          <tr key={r.name}>
                            <td style={{ ...TD, fontWeight: 500 }}>{r.name}</td>
                            <td style={{ ...TD, textAlign: 'right' }}>{r.grns}</td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {r.units.toLocaleString('en-PK')}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {fmtPKR(r.spent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {supplierData.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>
                    No supplier history in this period
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {[
                            ['Date', false], ['GRN No', false], ['PO No', false],
                            ['Supplier', false], ['Batch', false],
                            ['Qty', true], ['Unit Price', true], ['Total', true],
                          ].map(([h, right]) => (
                            <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>
                              {h as string}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {supplierData.map((r, i) => (
                          <tr key={i}>
                            <td style={TD}>{r.grn_date}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', color: '#0F6E56' }}>{r.grn_number}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                              {r.po_number ?? '—'}
                            </td>
                            <td style={TD}>{r.supplier_name ?? '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                              {r.batch_no}
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>{r.quantity_received}</td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {r.unit_price != null ? fmtPKR(r.unit_price) : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                              {fmtPKR(r.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── SECTION 5: Discount & Returns ────────────────────────── */}
          <div style={CARD}>
            <SectionTitle title="Discount & Returns" />
            {(loading.sales || loading.returns) ? (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                  {/* Left — Discount */}
                  <div style={{ background: '#fafbfc', borderRadius: 8, padding: '12px 14px' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>
                      Discount Analysis
                    </p>
                    {[
                      ['Total Discount Given',       fmtPKR(totalDiscount)],
                      ['Avg Discount / Transaction', fmtPKR(avgDiscountPerTx)],
                      ['With Discount',              withDiscountCnt.toString()],
                      ['Without Discount',           withoutDiscountCnt.toString()],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}
                      >
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Right — Returns */}
                  <div style={{ background: '#fafbfc', borderRadius: 8, padding: '12px 14px' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>
                      Return Analysis
                    </p>
                    {[
                      ['Units Returned', unitsReturned.toString()],
                      ['Total Refund',   fmtPKR(totalRefund)],
                      ['Return Rate',    returnRate],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}
                      >
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart D — Revenue vs Discount (only when discounts exist) */}
                {totalDiscount > 0 && revDiscountChartData.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                      Revenue vs Discount
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={revDiscountChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtShortDate}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={fmtAxis}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip content={RevDiscountTooltip} />
                        <Bar dataKey="revenue"  name="Revenue"  stackId="a" fill="#0D9488" />
                        <Bar dataKey="discount" name="Discount" stackId="a" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Returns table */}
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                  Return Transactions
                </p>
                {returnData.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>
                    No returns in this period
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {[
                            ['Date', false], ['Return No', false], ['Original Sale', false],
                            ['Batch', false], ['Qty Returned', true], ['Refund', true], ['Status', false],
                          ].map(([h, right]) => (
                            <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>
                              {h as string}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {returnData.map((r, i) => (
                          <tr key={i}>
                            <td style={TD}>{r.return_date}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', color: '#0F6E56' }}>{r.return_number}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                              {r.original_sale_reference}
                            </td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                              {r.batch_no}
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>{r.quantity_returned}</td>
                            <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {r.refund_amount != null ? fmtPKR(r.refund_amount) : '—'}
                            </td>
                            <td style={TD}>
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: 99,
                                fontSize: 10, fontWeight: 600,
                                background: r.status === 'approved'
                                  ? 'rgba(22,163,74,0.1)'
                                  : r.status === 'pending'
                                  ? 'rgba(245,158,11,0.1)'
                                  : '#f3f4f6',
                                color: r.status === 'approved'
                                  ? '#15803d'
                                  : r.status === 'pending'
                                  ? '#d97706'
                                  : '#6b7280',
                              }}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── SECTION 6: Price & Margin Analysis ──────────────────── */}
          <div style={CARD}>
            <SectionTitle title="Price & Margin Analysis" sub="All-time data across all batches" />
            {loading.batches ? (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>
              </div>
            ) : (
              <>
                {/* Current pricing grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    ['Lowest Purchase Price',  lowestPurchase  != null ? fmtPKR(lowestPurchase)  : '—'],
                    ['Highest Purchase Price', highestPurchase != null ? fmtPKR(highestPurchase) : '—'],
                    ['Current Sale Price',     avgSalePriceSec6 != null ? fmtPKR(avgSalePriceSec6) : '—'],
                    ['Current MRP',            avgMrpSec6 != null ? fmtPKR(avgMrpSec6) : '—'],
                    ['Sale Margin',            saleMarginSec6],
                    ['MRP Margin',             mrpMarginSec6],
                  ].map(([label, value]) => (
                    <div key={label} style={{ ...CARD, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: 0 }}>
                        {label}
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '6px 0 0' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Purchase price history line chart */}
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                  Purchase Price History
                </p>
                {priceChartData.length < 2 ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      Not enough data to show price trend (need 2+ batches)
                    </span>
                  </div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={priceChartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtShortDate}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={(v: number) => `${v}`}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip content={PriceTooltip} />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#0D9488"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* All-batches margin table */}
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                  Batch Margin Table
                </p>
                {batches.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>No batches</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {[
                            ['Batch No', false], ['Date Added', false], ['Supplier', false],
                            ['Purchase Price', true], ['Sale Price', true], ['MRP', true], ['Margin %', true],
                          ].map(([h, right]) => (
                            <th key={h as string} style={{ ...TH, textAlign: right ? 'right' : 'left' }}>
                              {h as string}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...batches]
                          .sort((a, b) => b.created_at.localeCompare(a.created_at))
                          .map(b => {
                            const margin = b.purchase_price && b.purchase_price > 0 && b.sale_price != null
                              ? ((b.sale_price - b.purchase_price) / b.purchase_price * 100).toFixed(1) + '%'
                              : '—'
                            return (
                              <tr key={b.batch_id}>
                                <td style={{ ...TD, fontFamily: 'monospace', color: '#0F6E56', fontWeight: 500 }}>
                                  {b.batch_no}
                                </td>
                                <td style={{ ...TD, color: '#6b7280', fontSize: 11 }}>
                                  {b.created_at.split('T')[0]}
                                </td>
                                <td style={{ ...TD, color: '#6b7280' }}>{b.supplier_name ?? '—'}</td>
                                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {b.purchase_price != null ? fmtPKR(b.purchase_price) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {b.sale_price != null ? fmtPKR(b.sale_price) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {b.mrp != null ? fmtPKR(b.mrp) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right' }}>{margin}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
