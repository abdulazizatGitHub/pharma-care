'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ChevronUp, ChevronDown, BarChart2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import { useDashboardUser } from '@/lib/dashboard-context'
import type { MedicineCategory, MedicineSubcategory, MedicineRow } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicineTableProps {
  medicines:       MedicineRow[]
  categories:      MedicineCategory[]
  subcategories:   MedicineSubcategory[]
  canWrite:        boolean
  onEdit:          (m: MedicineRow) => void
  onDeactivate:    (m: MedicineRow) => void
  onReactivate:    (m: MedicineRow) => void
  onViewStock:     (m: MedicineRow) => void
  // Pagination + filter defaults
  currentPage:     number
  totalCount:      number
  pageSize:        number
  defaultSearch:   string
  defaultCat:      string
  defaultSubcat:   string
  defaultSchedule: string
  defaultStatus:   string
}

type SortKey = 'name' | 'code' | 'manufacturer' | 'mrp' | 'total_stock'
type SortDir = 'asc' | 'desc'

const SCHEDULE_BADGE: Record<string, 'success' | 'info' | 'danger'> = {
  OTC:          'success',
  prescription: 'info',
  controlled:   'danger',
}

const SCHEDULE_LABEL: Record<string, string> = {
  OTC:          'OTC',
  prescription: 'Prescription',
  controlled:   'Controlled',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MedicineTable({
  medicines,
  categories,
  subcategories,
  canWrite,
  onEdit,
  onDeactivate,
  onReactivate,
  onViewStock,
  currentPage,
  totalCount,
  pageSize,
  defaultSearch,
  defaultCat,
  defaultSubcat,
  defaultSchedule,
  defaultStatus,
}: MedicineTableProps) {
  const router = useRouter()
  const { role } = useDashboardUser()
  const canReport = role === 'superadmin' || role === 'admin'

  // Local state only for the text search input (typed but not yet submitted)
  const [localSearch, setLocalSearch] = useState(defaultSearch)

  // Sort state is client-side (sorts within the current page)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Derive display values from props (updated on each server render after navigation)
  const catFilter    = defaultCat
  const subCatFilter = defaultSubcat
  const schedFilter  = defaultSchedule
  const statusFilter = defaultStatus || 'all'

  // Subcategories visible depend on selected category
  const visibleSubcats = useMemo(
    () => catFilter ? subcategories.filter(s => s.category_id === catFilter) : subcategories,
    [subcategories, catFilter],
  )

  const catMap = useMemo(
    () => new Map(categories.map(c => [c.id, c.name])),
    [categories],
  )

  // Sort within the current page (server already filtered)
  const sorted = useMemo(() => {
    return [...medicines].sort((a, b) => {
      let av: string | number = a[sortKey] ?? ''
      let bv: string | number = b[sortKey] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [medicines, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={11} style={{ opacity: 0.3 }} />
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ color: '#0F6E56' }} />
      : <ChevronDown size={11} style={{ color: '#0F6E56' }} />
  }

  // Build URL from the currently-applied filter props + any overrides
  function pushDropdownChange(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const all = {
      search:   defaultSearch,
      cat:      catFilter,
      subcat:   subCatFilter,
      schedule: schedFilter,
      status:   statusFilter === 'all' ? '' : statusFilter,
      ...overrides,
    }
    if (all.search)                              params.set('search',   all.search)
    if (all.cat)                                 params.set('cat',      all.cat)
    if (all.subcat)                              params.set('subcat',   all.subcat)
    if (all.schedule)                            params.set('schedule', all.schedule)
    if (all.status && all.status !== 'all')      params.set('status',   all.status)
    // page omitted → resets to 1
    router.push('?' + params.toString())
  }

  function submitSearch() {
    const params = new URLSearchParams()
    if (localSearch)                                   params.set('search',   localSearch)
    if (catFilter)                                     params.set('cat',      catFilter)
    if (subCatFilter)                                  params.set('subcat',   subCatFilter)
    if (schedFilter)                                   params.set('schedule', schedFilter)
    if (statusFilter && statusFilter !== 'all')        params.set('status',   statusFilter)
    router.push('?' + params.toString())
  }

  const thStyle: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: FONT.tableHeader,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${PAGE.border}`,
    background: '#fafbfc',
  }

  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: FONT.tableCell,
    color: TEXT.primary,
    borderBottom: `1px solid ${PAGE.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div>
      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Search */}
        <div className="relative flex-1 min-w-45 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, code, manufacturer… (Enter)"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitSearch() }}
            style={{
              width: '100%',
              height: 32,
              paddingLeft: 30,
              paddingRight: 10,
              fontSize: 12,
              border: `1px solid ${PAGE.border}`,
              borderRadius: 6,
              outline: 'none',
              background: '#fff',
              color: TEXT.primary,
            }}
          />
        </div>

        {/* Category filter */}
        <select
          value={catFilter}
          onChange={e => pushDropdownChange({ cat: e.target.value, subcat: '' })}
          style={{ height: 32, fontSize: 12, border: `1px solid ${PAGE.border}`, borderRadius: 6, padding: '0 8px', background: '#fff', color: TEXT.primary, minWidth: 130 }}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Subcategory filter */}
        <select
          value={subCatFilter}
          onChange={e => pushDropdownChange({ subcat: e.target.value })}
          style={{ height: 32, fontSize: 12, border: `1px solid ${PAGE.border}`, borderRadius: 6, padding: '0 8px', background: '#fff', color: TEXT.primary, minWidth: 140 }}
        >
          <option value="">All Subcategories</option>
          {visibleSubcats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Schedule filter */}
        <select
          value={schedFilter}
          onChange={e => pushDropdownChange({ schedule: e.target.value })}
          style={{ height: 32, fontSize: 12, border: `1px solid ${PAGE.border}`, borderRadius: 6, padding: '0 8px', background: '#fff', color: TEXT.primary, minWidth: 130 }}
        >
          <option value="">All Schedules</option>
          <option value="OTC">OTC</option>
          <option value="prescription">Prescription</option>
          <option value="controlled">Controlled</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => pushDropdownChange({ status: e.target.value })}
          style={{ height: 32, fontSize: 12, border: `1px solid ${PAGE.border}`, borderRadius: 6, padding: '0 8px', background: '#fff', color: TEXT.primary, minWidth: 110 }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${PAGE.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {(['code', 'name', 'generic_name', 'manufacturer'] as const).map(col => {
                const label = col === 'code' ? 'Code' : col === 'name' ? 'Name' : col === 'generic_name' ? 'Generic' : 'Manufacturer'
                const sortable = col !== 'generic_name'
                return (
                  <th key={col} style={thStyle}>
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(col as SortKey)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
                      >
                        {label} <SortIcon col={col as SortKey} />
                      </button>
                    ) : label}
                  </th>
                )
              })}
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Schedule</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>
                <button onClick={() => toggleSort('mrp')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}>
                  MRP <SortIcon col="mrp" />
                </button>
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }}>
                <button onClick={() => toggleSort('total_stock')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}>
                  Stock <SortIcon col="total_stock" />
                </button>
              </th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: TEXT.secondary, padding: '24px 10px' }}>
                  No medicines found
                </td>
              </tr>
            )}
            {sorted.map(m => (
              <tr
                key={m.id}
                style={{ transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#0F6E56', fontWeight: 500 }}>
                  {m.code ?? '—'}
                </td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{m.name}</td>
                <td style={{ ...tdStyle, color: TEXT.secondary }}>{m.generic_name ?? '—'}</td>
                <td style={tdStyle}>{m.manufacturer ?? '—'}</td>
                <td style={{ ...tdStyle, color: TEXT.secondary, fontSize: 11 }}>
                  {m.category_id ? (catMap.get(m.category_id) ?? '—') : '—'}
                </td>
                <td style={tdStyle}>
                  <Badge variant={SCHEDULE_BADGE[m.schedule] ?? 'neutral'}>
                    {SCHEDULE_LABEL[m.schedule] ?? m.schedule}
                  </Badge>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  Rs {Number(m.mrp).toFixed(2)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {m.total_stock > 0
                    ? <span style={{ color: m.total_stock < (m.reorder_level ?? 10) ? '#854F0B' : TEXT.primary }}>{m.total_stock}</span>
                    : <span style={{ color: '#A32D2D' }}>0</span>
                  }
                </td>
                <td style={tdStyle}>
                  <Badge variant={m.is_active ? 'success' : 'neutral'}>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => onViewStock(m)}>
                      Stock
                    </Button>
                    {canReport && (
                      <Link
                        href={`/${role}/reports/item-detail?medicine_id=${m.id}`}
                        className="inline-flex items-center justify-center font-medium transition-all duration-150 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6E56] focus-visible:ring-offset-2 h-7 px-3 text-[11px] rounded-md gap-1.5 text-[#111827] hover:bg-[#f3f4f6]"
                        style={{ textDecoration: 'none' }}
                      >
                        <BarChart2 size={12} />
                        Report
                      </Link>
                    )}
                    {canWrite && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => onEdit(m)}>
                          Edit
                        </Button>
                        {m.is_active ? (
                          <Button variant="danger" size="sm" onClick={() => onDeactivate(m)}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button variant="success" size="sm" onClick={() => onReactivate(m)}>
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / pageSize) || 1}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={(p) => {
          const params = new URLSearchParams(window.location.search)
          params.set('page', String(p))
          router.push('?' + params.toString())
        }}
        className="mt-2"
      />
    </div>
  )
}
