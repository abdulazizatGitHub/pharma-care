'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, XCircle, Package } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import { useDashboardUser } from '@/lib/dashboard-context'
import { confirmPO, cancelPO } from '@/app/actions/procurement'
import { POStatusBadge }   from './POStatusBadge'
import { POApprovalBanner } from './POApprovalBanner'
import { POLineItems }      from './POLineItems'
import { GRNForm }          from './GRNForm'
import type { POStatus }    from '@/lib/db-types'
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
}

interface PODetailPageProps {
  po:        PODetail
  items:     POItemRow[]
  medicines: MedicineLookup[]
  basePath:  string           // e.g. '/admin/purchase-orders'
}

export function PODetailPage({ po, items, medicines, basePath }: PODetailPageProps) {
  const router   = useRouter()
  const { role } = useDashboardUser()
  const canWrite = role === 'superadmin' || role === 'admin'

  const [grnOpen,       setGrnOpen]       = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelReason,  setCancelReason]  = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()

  const isSuperadmin    = role === 'superadmin'
  const canApprove      = isSuperadmin && po.status === 'pending_approval'
  const isReadOnly      = po.status === 'received' || po.status === 'cancelled'

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmPO(po.id)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelPO(po.id, cancelReason.trim() || undefined)
      if (result.error) { setError(result.error); return }
      setCancelConfirm(false)
      setCancelReason('')
      router.refresh()
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

      {/* Approval banner (superadmin only, pending_approval POs) */}
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
        />
      </div>

      {/* Action buttons */}
      {!isReadOnly && canWrite && (
        <div className="flex flex-wrap gap-3">
          {po.status === 'draft' && (
            <>
              <Button
                variant="primary"
                icon={<CheckCircle size={14} />}
                loading={isPending && !cancelConfirm}
                onClick={handleConfirm}
              >
                Confirm PO
              </Button>
              <Button
                variant="secondary"
                icon={<XCircle size={14} />}
                onClick={() => { setCancelConfirm(c => !c); setError(null) }}
                disabled={isPending}
              >
                Cancel PO
              </Button>
            </>
          )}

          {po.status === 'confirmed' && (
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
                icon={<XCircle size={14} />}
                onClick={() => { setCancelConfirm(c => !c); setError(null) }}
                disabled={isPending}
              >
                Cancel PO
              </Button>
            </>
          )}

          {/* Cancel confirmation inline */}
          {cancelConfirm && (
            <div
              className="w-full rounded-xl border border-[rgba(0,0,0,0.08)] p-4 space-y-3"
              style={{ background: '#fff' }}
            >
              <p className="text-[13px] font-medium text-[#111827]">Cancel this purchase order?</p>
              <textarea
                placeholder="Optional reason for cancellation…"
                rows={2}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full rounded-md border border-[rgba(0,0,0,0.15)] px-2.5 py-2 text-[12px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setCancelConfirm(false); setError(null) }}
                  disabled={isPending}
                >
                  Keep PO
                </Button>
                <Button
                  size="sm"
                  loading={isPending}
                  onClick={handleCancel}
                  style={{ background: '#A32D2D', border: 'none' }}
                >
                  Yes, Cancel PO
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isReadOnly && (
        <p className="text-[12px] text-[#6b7280] italic">
          This purchase order is {po.status} and cannot be modified.
        </p>
      )}

      {/* GRN modal */}
      {grnOpen && items.length > 0 && (
        <GRNForm
          poId={po.id}
          lineItems={grnItems}
          onClose={() => setGrnOpen(false)}
        />
      )}
    </div>
  )
}
