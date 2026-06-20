'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FONT, TEXT, PAGE } from '@/lib/design-tokens'
import { cancelPO } from '@/app/actions/procurement'
import { POStatusBadge } from './POStatusBadge'
import type { POStatus } from '@/lib/db-types'

export interface POListRow {
  id:            string
  po_number:     string
  supplier_id:   string
  supplier_name: string | null
  item_count:    number
  total_amount:  number
  status:        POStatus
  created_at:    string
}

type StatusFilter = 'all' | POStatus

interface POTableProps {
  pos:       POListRow[]
  suppliers: { id: string; name: string }[]
  basePath:  string    // e.g. '/admin/purchase-orders'
  canWrite:  boolean
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Draft',    value: 'draft' },
  { label: 'Pending',  value: 'pending_approval' },
  { label: 'Confirmed',value: 'confirmed' },
  { label: 'Received', value: 'received' },
  { label: 'Cancelled',value: 'cancelled' },
]

export function POTable({ pos, suppliers, basePath, canWrite }: POTableProps) {
  const router = useRouter()
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [isPending,      startTransition]   = useTransition()
  const [cancelError,    setCancelError]    = useState<string | null>(null)

  const filtered = useMemo(() => {
    return pos.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (supplierFilter && p.supplier_id !== supplierFilter) return false
      return true
    })
  }, [pos, statusFilter, supplierFilter])

  function handleCancel(poId: string) {
    setCancelError(null)
    startTransition(async () => {
      const result = await cancelPO(poId)
      if (result.error) { setCancelError(result.error); return }
      router.refresh()
    })
  }

  const thStyle: React.CSSProperties = {
    fontSize: FONT.tableHeader, fontWeight: 600, color: TEXT.secondary,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 12px', textAlign: 'left',
    borderBottom: `1px solid ${PAGE.border}`, whiteSpace: 'nowrap',
    background: '#f9fafb',
  }

  const tdStyle: React.CSSProperties = {
    fontSize: FONT.tableCell, color: TEXT.primary,
    padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Status tabs */}
        <div className="flex gap-1 bg-[#f3f4f6] rounded-md p-0.5 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className="text-[11px] font-medium rounded px-3 py-1 transition-colors"
              style={{
                background: statusFilter === tab.value ? '#ffffff' : 'transparent',
                color:      statusFilter === tab.value ? TEXT.primary : TEXT.secondary,
                boxShadow:  statusFilter === tab.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Supplier filter */}
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="h-8 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
        >
          <option value="">All suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {cancelError && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {cancelError}
        </p>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>PO Number</th>
              <th style={thStyle}>Supplier</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Items</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ ...tdStyle, textAlign: 'center', color: TEXT.secondary, padding: '32px 12px' }}
                >
                  No purchase orders match your filters.
                </td>
              </tr>
            ) : (
              filtered.map(po => {
                const canCancel = canWrite && (po.status === 'draft' || po.status === 'confirmed')
                return (
                  <tr key={po.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td style={tdStyle}>
                      <span className="font-medium font-mono text-[12px]">{po.po_number}</span>
                    </td>
                    <td style={{ ...tdStyle, color: TEXT.secondary }}>
                      {po.supplier_name ?? <span className="text-[#9ca3af]">—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{po.item_count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                      Rs {po.total_amount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={tdStyle}>
                      <POStatusBadge status={po.status} />
                    </td>
                    <td style={{ ...tdStyle, color: TEXT.secondary, whiteSpace: 'nowrap' }}>
                      {new Date(po.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`${basePath}/${po.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F6E56] hover:underline"
                        >
                          View <ExternalLink size={10} />
                        </Link>
                        {canCancel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleCancel(po.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
