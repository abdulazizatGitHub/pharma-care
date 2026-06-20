'use client'

import React, { useState, useTransition } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ShiftHistoryTable } from './ShiftHistoryTable'
import { ShiftDetailPanel } from './ShiftDetailPanel'
import { getShiftHistory } from '@/app/actions/shifts'
import type { ShiftRow } from '@/app/actions/shifts'

interface PharmacistOption {
  id:        string
  full_name: string | null
}

interface Props {
  initialHistory:    ShiftRow[]
  pharmacistOptions: PharmacistOption[]
}

export function AdminShiftsContent({ initialHistory, pharmacistOptions }: Props) {
  const [history,       setHistory]       = useState<ShiftRow[]>(initialHistory)
  const [selectedShift, setSelectedShift] = useState<ShiftRow | null>(null)
  const [pharmacistId,  setPharmacistId]  = useState('')
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [isPending,     startTransition]  = useTransition()

  function applyFilter() {
    startTransition(async () => {
      const result = await getShiftHistory(
        pharmacistId || undefined,
        dateFrom || undefined,
        dateTo || undefined,
      )
      setHistory(result.data ?? [])
    })
  }

  function clearFilter() {
    setPharmacistId('')
    setDateFrom('')
    setDateTo('')
    startTransition(async () => {
      const result = await getShiftHistory()
      setHistory(result.data ?? [])
    })
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
            value={pharmacistId}
            onChange={e => setPharmacistId(e.target.value)}
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
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </div>

        <button
          onClick={applyFilter}
          disabled={isPending}
          style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {isPending ? 'Filtering…' : 'Apply'}
        </button>

        <button
          onClick={clearFilter}
          disabled={isPending}
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
          <span style={{ fontSize: 12, color: '#6b7280' }}>{history.length} shift{history.length !== 1 ? 's' : ''}</span>
        </div>
        <ShiftHistoryTable
          shifts={history}
          showName={true}
          onSelect={setSelectedShift}
        />
      </div>

      <ShiftDetailPanel
        shift={selectedShift}
        onClose={() => setSelectedShift(null)}
      />
    </div>
  )
}
