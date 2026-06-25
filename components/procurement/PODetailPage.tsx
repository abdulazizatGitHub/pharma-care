'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, Package, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import {
  confirmPO, cancelPO, revertPOToDraft, getPOGRNHistory,
  forceClosePO, softDeletePO, getPOItemsWithReceipt,
} from '@/app/actions/procurement'
import { POStatusBadge }   from './POStatusBadge'
import { POApprovalBanner } from './POApprovalBanner'
import { POLineItems }      from './POLineItems'
import { GRNForm }          from './GRNForm'
import type { POStatus }    from '@/lib/db-types'
import type { GRNSummary, POItemWithReceipt } from '@/app/actions/procurement'
import type { POItemRow, MedicineLookup }  from './POLineItems'
import type { GRNLineItem } from './GRNForm'

export interface PODetail {
  id:             string
  po_number:      string
  status:         POStatus
  total_amount:   number
  notes:          string | null
  created_at:     string
  supplier_name:  string | null
  rejection_note: string | null
  shortage_notes: string | null
}

interface PODetailPageProps {
  po:        PODetail
  items:     POItemRow[]
  medicines: MedicineLookup[]
  basePath:  string
}

// ─── Force Close Modal ────────────────────────────────────────────────────────

function ForceCloseModal({
  open,
  onClose,
  poId,
  enrichedItems,
  onSuccess,
}: {
  open:          boolean
  onClose:       () => void
  poId:          string
  enrichedItems: POItemWithReceipt[]
  onSuccess:     () => void
}) {
  const { toast } = useToast()
  const [notes,        setNotes]        = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const undelivered = enrichedItems.filter(i => i.received_qty < i.ordered_qty)
  const allReceived = enrichedItems.length > 0 && undelivered.length === 0

  async function handleConfirm() {
    if (allReceived) return
    setIsSubmitting(true)
    const result = await forceClosePO(poId, notes.trim() || undefined)
    setIsSubmitting(false)
    if (result.error) {
      toast(result.error, 'error')
      return
    }
    toast('Purchase order closed with shortage', 'success')
    onClose()
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Close PO with Shortage" size="md">
      <div className="space-y-4">
        {allReceived ? (
          <p className="text-[13px] text-[#6b7280]">
            All items have been received — this PO cannot be force closed.
          </p>
        ) : (
          <>
            <div>
              <p className="text-[12px] text-[#6b7280] mb-2">The following items will be marked as undelivered:</p>
              <ul className="space-y-1">
                {undelivered.map(item => (
                  <li key={item.id} className="text-[12px] text-[#111827] flex items-center gap-2">
                    <span className="text-[#A32D2D]">•</span>
                    <span>{item.medicine_name} — {item.ordered_qty - item.received_qty} unit{item.ordered_qty - item.received_qty !== 1 ? 's' : ''} short</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#6b7280]">Reason / Notes (optional)</label>
              <textarea
                rows={3}
                maxLength={500}
                placeholder="e.g. Supplier confirmed shortage, no ETA"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-md border border-[rgba(0,0,0,0.15)] px-2.5 py-2 text-[12px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              />
              <p className="text-[10px] text-[#9ca3af] text-right">{notes.length}/500</p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800">
                This action cannot be undone. The PO will be marked as Closed (Short) and no further GRNs can be recorded against it.
              </p>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {!allReceived && (
            <Button variant="danger" loading={isSubmitting} onClick={handleConfirm}>
              Close with Shortage
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({ status, shortageNotes }: { status: POStatus; shortageNotes?: string | null }) {
  const bannerMap: Partial<Record<POStatus, { bg: string; border: string; color: string; text: string }>> = {
    partially_received: {
      bg: '#FFFBEB', border: '#FDE68A', color: '#92400E',
      text: 'This order has been partially received. Record additional GRNs or force close if remaining items will not arrive.',
    },
    received: {
      bg: '#E1F5EE', border: '#A7F3D0', color: '#065F46',
      text: 'This purchase order has been fully received and cannot be modified.',
    },
    cancelled: {
      bg: '#FCEBEB', border: '#F09595', color: '#A32D2D',
      text: 'This purchase order is cancelled.',
    },
    closed_short: {
      bg: '#F0F0F0', border: '#D1D5DB', color: '#374151',
      text: shortageNotes
        ? `This purchase order was closed with shortage. ${shortageNotes}`
        : 'This purchase order was closed with shortage.',
    },
  }

  const config = bannerMap[status]
  if (!config) return null

  return (
    <div
      className="rounded-lg border px-4 py-3 mb-4 text-[12px]"
      style={{ background: config.bg, borderColor: config.border, color: config.color }}
    >
      {config.text}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PODetailPage({ po, items, medicines, basePath }: PODetailPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { role, permissions } = useDashboardUser()

  // Canonical canWrite pattern from POListPage
  const canWrite   = role === 'superadmin' || hasPermission(permissions, 'purchase_orders')
  const isSuperAdmin = role === 'superadmin'

  const [grnOpen,       setGrnOpen]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'confirm' | 'cancel' | 'revert' | 'delete' | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [grnHistory,    setGrnHistory]    = useState<GRNSummary[]>([])
  const [forceCloseOpen, setForceCloseOpen] = useState(false)
  const [dialog, setDialog] = useState<'cancel' | 'revert' | 'delete' | null>(null)

  // Enriched items (receipt status) for partially_received / received / closed_short
  const [enrichedItems,   setEnrichedItems]   = useState<POItemWithReceipt[]>([])
  const [enrichedLoading, setEnrichedLoading] = useState(false)

  const needsEnrichedItems = ['partially_received', 'received', 'closed_short'].includes(po.status)
  const canApprove = isSuperAdmin && po.status === 'pending_approval'

  useEffect(() => {
    getPOGRNHistory(po.id).then(result => {
      if (result.data) setGrnHistory(result.data)
    })
  }, [po.id, po.status])

  useEffect(() => {
    if (!needsEnrichedItems) return
    setEnrichedLoading(true)
    getPOItemsWithReceipt(po.id).then(result => {
      setEnrichedLoading(false)
      if (result.data) setEnrichedItems(result.data)
    })
  }, [po.id, po.status, needsEnrichedItems])

  function handleConfirmPO() {
    setError(null)
    setPendingAction('confirm')
    startTransition(async () => {
      const result = await confirmPO(po.id)
      setPendingAction(null)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleCancel() {
    setDialog(null)
    setError(null)
    setPendingAction('cancel')
    startTransition(async () => {
      const result = await cancelPO(po.id)
      setPendingAction(null)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleRevert() {
    setDialog(null)
    setError(null)
    setPendingAction('revert')
    startTransition(async () => {
      const result = await revertPOToDraft(po.id)
      setPendingAction(null)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    setDialog(null)
    setError(null)
    setPendingAction('delete')
    startTransition(async () => {
      const result = await softDeletePO(po.id)
      setPendingAction(null)
      if (result.error) { setError(result.error); return }
      toast('Purchase order deleted', 'success')
      router.push(basePath)
    })
  }

  const grnItems: GRNLineItem[] = items.map(item => ({
    poItemId:     item.id,
    medicineId:   item.medicineId,
    medicineName: item.medicineName,
    orderedQty:   item.quantity,
    unitPrice:    item.unitPrice,
  }))

  const formattedDate = new Date(po.created_at).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div style={{ padding: '24px 28px', background: PAGE.bg, minHeight: '100%' }}>
      {/* Back link */}
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#0F6E56] hover:underline mb-4"
      >
        <ArrowLeft size={13} />
        Back to Purchase Orders
      </Link>

      {/* PO Header card */}
      <div
        className="rounded-xl border border-[rgba(0,0,0,0.07)] mb-4"
        style={{ background: PAGE.surface, padding: '18px 20px' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 style={{ fontSize: FONT.pageHeading, fontWeight: 600, color: TEXT.primary, margin: 0 }}>
                {po.po_number}
              </h1>
              <POStatusBadge status={po.status} size="md" />
            </div>
            <p style={{ fontSize: FONT.pageSubhead, color: TEXT.secondary }}>
              {po.supplier_name ?? 'Unknown supplier'} · Created {formattedDate}
            </p>
            {po.notes && (
              <p style={{ fontSize: 12, color: TEXT.secondary, marginTop: 4 }}>
                Notes: {po.notes}
              </p>
            )}
            {po.rejection_note && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-[#FCEBEB] border border-[#E8BABA]">
                <p className="text-[11px] font-medium text-[#A32D2D]">Rejection note</p>
                <p className="text-[12px] text-[#A32D2D]">{po.rejection_note}</p>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-[#6b7280]">Total Amount</p>
            <p className="text-[22px] font-semibold text-[#0F6E56]">
              Rs {po.total_amount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <StatusBanner status={po.status} shortageNotes={po.shortage_notes} />

      {/* Approval banner (superadmin, pending_approval) */}
      {canApprove && <POApprovalBanner poId={po.id} />}

      {/* Global error */}
      {error && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {/* Line items */}
      <div
        className="rounded-xl border border-[rgba(0,0,0,0.07)] mb-4"
        style={{ background: PAGE.surface, padding: '18px 20px' }}
      >
        <POLineItems
          poId={po.id}
          status={po.status}
          items={items}
          medicines={medicines}
          canWrite={canWrite}
          receivedItems={needsEnrichedItems ? enrichedItems : undefined}
          receivedItemsLoading={enrichedLoading}
        />
      </div>

      {/* ── Action buttons (status-driven) ───────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-4">

        {/* DRAFT */}
        {po.status === 'draft' && canWrite && (
          <>
            <Button
              variant="primary"
              icon={<CheckCircle size={14} />}
              loading={isPending && pendingAction === 'confirm'}
              disabled={isPending}
              onClick={handleConfirmPO}
            >
              Confirm PO
            </Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => { setDialog('cancel'); setError(null) }}
            >
              Cancel PO
            </Button>
          </>
        )}

        {/* PENDING APPROVAL */}
        {po.status === 'pending_approval' && canWrite && (
          <>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => { setDialog('cancel'); setError(null) }}
            >
              Cancel PO
            </Button>
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={isPending && pendingAction === 'revert'}
              disabled={isPending}
              onClick={() => { setDialog('revert'); setError(null) }}
            >
              Revert to Draft
            </Button>
          </>
        )}

        {/* CONFIRMED */}
        {po.status === 'confirmed' && canWrite && (
          <>
            <Button
              variant="primary"
              icon={<Package size={14} />}
              onClick={() => setGrnOpen(true)}
              disabled={isPending || items.length === 0}
            >
              Record GRN
            </Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => { setDialog('cancel'); setError(null) }}
            >
              Cancel PO
            </Button>
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={isPending && pendingAction === 'revert'}
              disabled={isPending}
              onClick={() => { setDialog('revert'); setError(null) }}
            >
              Revert to Draft
            </Button>
          </>
        )}

        {/* PARTIALLY RECEIVED */}
        {po.status === 'partially_received' && (
          <>
            {canWrite && (
              <Button
                variant="primary"
                icon={<Package size={14} />}
                onClick={() => setGrnOpen(true)}
                disabled={isPending || items.length === 0}
              >
                Record Additional GRN
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                variant="danger"
                disabled={isPending}
                onClick={() => setForceCloseOpen(true)}
              >
                Force Close PO
              </Button>
            )}
          </>
        )}

        {/* CANCELLED — superadmin only */}
        {po.status === 'cancelled' && isSuperAdmin && (
          <>
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={isPending && pendingAction === 'revert'}
              disabled={isPending}
              onClick={() => { setDialog('revert'); setError(null) }}
            >
              Revert to Draft
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              loading={isPending && pendingAction === 'delete'}
              disabled={isPending}
              onClick={() => { setDialog('delete'); setError(null) }}
            >
              Delete PO
            </Button>
          </>
        )}
      </div>

      {/* GRN History */}
      {grnHistory.length > 0 && (
        <div
          className="rounded-xl border border-[rgba(0,0,0,0.07)]"
          style={{ background: PAGE.surface, padding: '18px 20px' }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 12 }}>
            GRN History ({grnHistory.length})
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {(['GRN Number', 'Date Received', 'Total', 'Notes'] as const).map(h => (
                    <th
                      key={h}
                      style={{
                        fontSize: FONT.tableHeader, fontWeight: 600, color: TEXT.secondary,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        padding: '7px 12px', textAlign: h === 'Total' ? 'right' : 'left',
                        borderBottom: `1px solid ${PAGE.border}`, whiteSpace: 'nowrap',
                        background: '#f9fafb',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grnHistory.map(grn => (
                  <tr key={grn.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td style={{ fontSize: FONT.tableCell, color: TEXT.primary, padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}` }}>
                      <span className="font-mono text-[12px] font-medium">{grn.grn_number}</span>
                    </td>
                    <td style={{ fontSize: FONT.tableCell, color: TEXT.secondary, padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}`, whiteSpace: 'nowrap' }}>
                      {new Date(grn.received_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ fontSize: FONT.tableCell, color: TEXT.primary, padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}`, textAlign: 'right', fontWeight: 500 }}>
                      {grn.total_amount != null
                        ? `Rs ${grn.total_amount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: FONT.tableCell, color: TEXT.secondary, padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}` }}>
                      {grn.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GRN modal */}
      {grnOpen && items.length > 0 && (
        <GRNForm
          poId={po.id}
          lineItems={grnItems}
          onClose={() => setGrnOpen(false)}
        />
      )}

      {/* Force Close modal */}
      <ForceCloseModal
        open={forceCloseOpen}
        onClose={() => setForceCloseOpen(false)}
        poId={po.id}
        enrichedItems={enrichedItems}
        onSuccess={() => router.refresh()}
      />

      {/* Cancel PO confirmation */}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConfirm={handleCancel}
        title="Cancel Purchase Order"
        message="Cancel this purchase order? It can be reverted to draft later."
        confirmLabel="Cancel PO"
        confirmVariant="danger"
        loading={isPending && pendingAction === 'cancel'}
      />

      {/* Revert to Draft confirmation */}
      <ConfirmDialog
        open={dialog === 'revert'}
        onClose={() => setDialog(null)}
        onConfirm={handleRevert}
        title="Revert to Draft"
        message="Revert this PO to draft? It will need to go through approval again."
        confirmLabel="Revert to Draft"
        confirmVariant="secondary"
        loading={isPending && pendingAction === 'revert'}
      />

      {/* Delete PO confirmation */}
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
        title="Delete Purchase Order"
        message="Permanently hide this PO? It will no longer appear in any list. This cannot be undone from the UI."
        confirmLabel="Delete PO"
        confirmVariant="danger"
        loading={isPending && pendingAction === 'delete'}
      />
    </div>
  )
}
