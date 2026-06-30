'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { ShiftHistoryTable } from './ShiftHistoryTable'
import { ShiftDetailPanel } from './ShiftDetailPanel'
import type { ShiftRow } from '@/app/actions/shifts'

interface PharmacistOption {
  id:        string
  full_name: string | null
}

interface Props {
  shifts:              ShiftRow[]
  pharmacistOptions:   PharmacistOption[]
  currentPage:         number
  totalCount:          number
  pageSize:            number
  defaultPharmacistId: string
  defaultDateFrom:     string
  defaultDateTo:       string
}

export function AdminShiftsContent({
  shifts,
  pharmacistOptions,
  currentPage,
  totalCount,
  pageSize,
  defaultPharmacistId,
  defaultDateFrom,
  defaultDateTo,
}: Props) {
  const router = useRouter()

  const [selectedShift,    setSelectedShift]    = useState<ShiftRow | null>(null)
  const [localPharmacist,  setLocalPharmacist]  = useState(defaultPharmacistId)
  const [localDateFrom,    setLocalDateFrom]     = useState(defaultDateFrom)
  const [localDateTo,      setLocalDateTo]       = useState(defaultDateTo)

  const totalPages = Math.ceil(totalCount / pageSize)

  function pushUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    router.push('?' + params.toString())
  }

  function applyFilter() {
    pushUrl({ pharmacist: localPharmacist, from: localDateFrom, to: localDateTo, page: '' })
  }

  function clearFilter() {
    setLocalPharmacist('')
    setLocalDateFrom('')
    setLocalDateTo('')
    pushUrl({ pharmacist: '', from: '', to: '', page: '' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Shift Management"
        description="View and review all pharmacist shifts."
      />

      {/* Filter bar */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '12px 16px', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Pharmacist</label>
          <select
            value={localPharmacist}
            onChange={e => setLocalPharmacist(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, minWidth: 160 }}
          >
            <option value="">All pharmacists</option>
            {pharmacistOptions.map(p => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>From</label>
          <input
            type="date"
            value={localDateFrom}
            onChange={e => setLocalDateFrom(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>To</label>
          <input
            type="date"
            value={localDateTo}
            onChange={e => setLocalDateTo(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>

        <button
          onClick={applyFilter}
          style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Apply
        </button>

        <button
          onClick={clearFilter}
          style={{ padding: '6px 12px', fontSize: 13, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 8,
        border: '1px solid #e5e7eb',
        padding: '0 0 4px',
      }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>Shift History</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Click a row to view full details</p>
          </div>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{totalCount} shift{totalCount !== 1 ? 's' : ''}</span>
        </div>
        <ShiftHistoryTable
          shifts={shifts}
          showName={true}
          onSelect={setSelectedShift}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={n => pushUrl({ page: n === 1 ? '' : String(n) })}
          className="px-4 py-3 border-t border-gray-100"
        />
      </div>

      <ShiftDetailPanel
        shift={selectedShift}
        onClose={() => setSelectedShift(null)}
      />
    </div>
  )
}
