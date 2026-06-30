'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { FONT, TEXT, PAGE } from '@/lib/design-tokens'
import { cancelPO, revertPOToDraft, softDeletePO } from '@/app/actions/procurement'
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
  pos:              POListRow[]
  suppliers:        { id: string; name: string }[]
  basePath:         string
  canWrite:         boolean
  isSuperAdmin?:    boolean
  currentPage:      number
  totalCount:       number
  pageSize:         number
  defaultStatus:    string
  defaultSupplierId: string
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',          value: 'all' },
  { label: 'Draft',        value: 'draft' },
  { label: 'Pending',      value: 'pending_approval' },
  { label: 'Confirmed',    value: 'confirmed' },
  { label: 'Partial',      value: 'partially_received' },
  { label: 'Received',     value: 'received' },
  { label: 'Cancelled',    value: 'cancelled' },
  { label: 'Closed Short', value: 'closed_short' },
]

const EDITABLE_STATUSES: POStatus[] = ['draft', 'pending_approval', 'confirmed']

type DialogType = 'revert' | 'delete'

export function POTable({
  pos, suppliers, basePath, canWrite, isSuperAdmin = false,
  currentPage, totalCount, pageSize, defaultStatus, defaultSupplierId,
}: POTableProps) {
  const router = useRouter()
  const [isPending,   startTransition] = useTransition()
  const [actionError, setActionError]  = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ type: DialogType; poId: string } | null>(null)

  const statusFilter   = (defaultStatus as StatusFilter) || 'all'
  const supplierFilter = defaultSupplierId || ''

  function pushFilters(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const all = {
      status:     statusFilter === 'all' ? '' : statusFilter,
      supplierId: supplierFilter,
      ...overrides,
    }
    if (all.status)     params.set('status',     all.status)
    if (all.supplierId) params.set('supplierId', all.supplierId)
    // page omitted → resets to 1
    router.push('?' + params.toString())
  }

  function handleCancel(poId: string) {
    setActionError(null)
    startTransition(async () => {
      const result = await cancelPO(poId)
      if (result.error) { setActionError(result.error); return }
      router.refresh()
    })
  }

  function handleRevert() {
    if (!dialog) return
    const { poId } = dialog
    setDialog(null)
    setActionError(null)
    startTransition(async () => {
      const result = await revertPOToDraft(poId)
      if (result.error) { setActionError(result.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    if (!dialog) return
    const { poId } = dialog
    setDialog(null)
    setActionError(null)
    startTransition(async () => {
      const result = await softDeletePO(poId)
      if (result.error) { setActionError(result.error); return }
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
        <div className="flex gap-1 bg-[#f3f4f6] rounded-md p-0.5 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => pushFilters({ status: tab.value === 'all' ? '' : tab.value })}
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

        <select
          value={supplierFilter}
          onChange={e => pushFilters({ supplierId: e.target.value })}
          className="h-8 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
        >
          <option value="">All suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {actionError && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {actionError}
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
            {pos.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ ...tdStyle, textAlign: 'center', color: TEXT.secondary, padding: '32px 12px' }}
                >
                  No purchase orders match your filters.
                </td>
              </tr>
            ) : (
              pos.map(po => {
                const isEditable         = EDITABLE_STATUSES.includes(po.status)
                const canEdit            = isEditable && canWrite
                const canCancel          = (po.status === 'draft' || po.status === 'confirmed') && canWrite
                const canAddGRN          = po.status === 'partially_received'
                const canRevertConfirmed = po.status === 'confirmed' && canWrite
                const canRevertCancelled = po.status === 'cancelled' && isSuperAdmin
                const canDelete          = (po.status === 'cancelled' || po.status === 'closed_short') && isSuperAdmin

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
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {canEdit ? (
                          <Link
                            href={`${basePath}/${po.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#185FA5] hover:underline"
                          >
                            Edit <Pencil size={10} />
                          </Link>
                        ) : (
                          <Link
                            href={`${basePath}/${po.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F6E56] hover:underline"
                          >
                            View <ExternalLink size={10} />
                          </Link>
                        )}

                        {canAddGRN && (
                          <Link
                            href={`${basePath}/${po.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F6E56] hover:underline"
                          >
                            + GRN <ExternalLink size={10} />
                          </Link>
                        )}

                        {canRevertConfirmed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setDialog({ type: 'revert', poId: po.id })}
                          >
                            Revert
                          </Button>
                        )}

                        {canRevertCancelled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setDialog({ type: 'revert', poId: po.id })}
                          >
                            Revert
                          </Button>
                        )}

                        {canDelete && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setDialog({ type: 'delete', poId: po.id })}
                          >
                            Delete
                          </Button>
                        )}

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
        className="mt-3"
      />

      {/* Revert to Draft confirmation */}
      <ConfirmDialog
        open={dialog?.type === 'revert'}
        onClose={() => setDialog(null)}
        onConfirm={handleRevert}
        title="Revert to Draft"
        message="Revert this PO to draft? It will need to go through approval again."
        confirmLabel="Revert to Draft"
        confirmVariant="secondary"
        loading={isPending}
      />

      {/* Delete PO confirmation */}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
        title="Delete Purchase Order"
        message="Permanently hide this PO? It will no longer appear in any list. This cannot be undone from the UI."
        confirmLabel="Delete PO"
        confirmVariant="danger"
        loading={isPending}
      />
    </div>
  )
}
