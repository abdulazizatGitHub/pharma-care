'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PackageX, ExternalLink, ClipboardList, RotateCcw, Handshake } from 'lucide-react'
import { useDashboardUser } from '@/lib/dashboard-context'
import { FONT, TEXT, BADGE_COLORS } from '@/lib/design-tokens'
import type { LowStockMedicine, ExpiringBatch } from '@/app/actions/stock'
import type { SettlementDuePharmacy } from '@/app/actions/borrowing'

interface AlertsPanelProps {
  lowStockMedicines:        LowStockMedicine[]
  expiringBatches:          ExpiringBatch[]
  expiryAlertDays:          number
  pendingApprovalPOCount?:  number
  pendingReturnCount?:      number
  settlementDuePharmacies?: SettlementDuePharmacy[]
}

function inventoryRoute(role: string): string {
  if (role === 'superadmin') return '/superadmin/medicines'
  if (role === 'admin')      return '/admin/inventory'
  return '/pharmacist/inventory'
}

function daysTill(dateStr: string): number {
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const expiry = new Date(dateStr)
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000)
}

function expiryChip(dateStr: string): { label: string; bg: string; color: string } {
  const d = daysTill(dateStr)
  if (d < 0)   return { label: 'Expired',         bg: BADGE_COLORS.danger.bg,  color: BADGE_COLORS.danger.color  }
  if (d <= 7)  return { label: `${d}d left`,       bg: BADGE_COLORS.danger.bg,  color: BADGE_COLORS.danger.color  }
  if (d <= 30) return { label: `${d}d left`,       bg: BADGE_COLORS.warning.bg, color: BADGE_COLORS.warning.color }
  return       { label: `${d}d left`,              bg: '#f0fdf4',               color: '#166534'                  }
}

function stockChip(totalStock: number): { bg: string; color: string } {
  if (totalStock === 0) return { bg: BADGE_COLORS.danger.bg,  color: BADGE_COLORS.danger.color  }
  return                       { bg: BADGE_COLORS.warning.bg, color: BADGE_COLORS.warning.color }
}

const sectionHead: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: TEXT.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid rgba(0,0,0,0.06)',
  background: '#ffffff',
  marginBottom: 5,
}

export function AlertsPanel({ lowStockMedicines, expiringBatches, expiryAlertDays, pendingApprovalPOCount, pendingReturnCount, settlementDuePharmacies }: AlertsPanelProps) {
  const router = useRouter()
  const { role } = useDashboardUser()
  const route = inventoryRoute(role)

  const hasPendingPOs        = (pendingApprovalPOCount ?? 0) > 0
  const hasPendingReturns    = (pendingReturnCount ?? 0) > 0
  const hasSettlementDue     = (settlementDuePharmacies?.length ?? 0) > 0

  if (lowStockMedicines.length === 0 && expiringBatches.length === 0 && !hasPendingPOs && !hasPendingReturns && !hasSettlementDue) return null

  return (
    <div
      className="rounded-xl border border-[rgba(0,0,0,0.07)] overflow-hidden"
      style={{ background: '#fafafa' }}
    >
      {/* Panel header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,0,0,0.07)]"
        style={{ background: '#fff' }}
      >
        <AlertTriangle size={14} style={{ color: '#854F0B' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary }}>Alerts</span>
        {lowStockMedicines.length > 0 && (
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ ...BADGE_COLORS.danger, ...{ background: BADGE_COLORS.danger.bg } }}
          >
            {lowStockMedicines.length} low stock
          </span>
        )}
        {expiringBatches.length > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: BADGE_COLORS.warning.bg, color: BADGE_COLORS.warning.color }}
          >
            {expiringBatches.length} expiring
          </span>
        )}
        {hasPendingPOs && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: BADGE_COLORS.info.bg, color: BADGE_COLORS.info.color }}
          >
            {pendingApprovalPOCount} PO{pendingApprovalPOCount !== 1 ? 's' : ''} pending approval
          </span>
        )}
        {hasPendingReturns && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: '#FEF3C7', color: '#92400E' }}
          >
            {pendingReturnCount} return{pendingReturnCount !== 1 ? 's' : ''} pending
          </span>
        )}
        {hasSettlementDue && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: '#EDE9FE', color: '#5B21B6' }}
          >
            {settlementDuePharmacies!.length} settlement{settlementDuePharmacies!.length !== 1 ? 's' : ''} due
          </span>
        )}
      </div>

      <div className="p-4 space-y-5">

        {/* ── Low Stock ───────────────────────────── */}
        {lowStockMedicines.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <PackageX size={13} style={{ color: '#A32D2D' }} />
              <p style={sectionHead}>Low Stock ({lowStockMedicines.length})</p>
            </div>
            {lowStockMedicines.map(med => {
              const chip = stockChip(med.total_stock)
              return (
                <div key={med.id} style={rowStyle}>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: FONT.tableCell, fontWeight: 500, color: TEXT.primary, truncate: true } as React.CSSProperties} className="truncate">
                      {med.name}
                    </p>
                    {med.code && (
                      <p style={{ fontSize: 10, color: TEXT.muted, fontFamily: 'monospace' }}>{med.code}</p>
                    )}
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
                    style={{ background: chip.bg, color: chip.color }}
                  >
                    {med.total_stock === 0 ? 'Out of stock' : `${med.total_stock} / ${med.reorder_level}`}
                  </span>
                  <button
                    onClick={() => router.push(route)}
                    className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[#0F6E56] hover:underline"
                    title="View in inventory"
                  >
                    View <ExternalLink size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Expiring Soon ───────────────────────── */}
        {expiringBatches.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={13} style={{ color: '#854F0B' }} />
              <p style={sectionHead}>Expiring within {expiryAlertDays} days ({expiringBatches.length})</p>
            </div>
            {expiringBatches.map(batch => {
              const chip = expiryChip(batch.expiry_date)
              return (
                <div key={batch.id} style={rowStyle}>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: FONT.tableCell, fontWeight: 500, color: TEXT.primary }} className="truncate">
                      {batch.medicine_name}
                    </p>
                    <p style={{ fontSize: 10, color: TEXT.muted, fontFamily: 'monospace' }}>
                      Batch {batch.batch_no} · Qty {batch.quantity}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
                    style={{ background: chip.bg, color: chip.color }}
                  >
                    {chip.label}
                  </span>
                  <button
                    onClick={() => router.push(route)}
                    className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[#0F6E56] hover:underline"
                    title="View in inventory"
                  >
                    View <ExternalLink size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {/* ── Pending PO Approvals (superadmin only) ── */}
        {hasPendingPOs && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ClipboardList size={13} style={{ color: '#185FA5' }} />
              <p style={sectionHead}>
                Purchase Orders Awaiting Approval ({pendingApprovalPOCount})
              </p>
            </div>
            <div style={rowStyle}>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: FONT.tableCell, fontWeight: 500, color: TEXT.primary }}>
                  {pendingApprovalPOCount} order{pendingApprovalPOCount !== 1 ? 's' : ''} require{pendingApprovalPOCount === 1 ? 's' : ''} your approval
                </p>
                <p style={{ fontSize: 10, color: TEXT.muted }}>
                  Total amount exceeds auto-approval threshold
                </p>
              </div>
              <button
                onClick={() => router.push('/superadmin/purchase-orders')}
                className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[#185FA5] hover:underline"
              >
                Review <ExternalLink size={10} />
              </button>
            </div>
          </div>
        )}

        {/* ── Pending Return Approvals (superadmin only) ── */}
        {hasPendingReturns && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <RotateCcw size={13} style={{ color: '#92400E' }} />
              <p style={sectionHead}>
                Returns Awaiting Approval ({pendingReturnCount})
              </p>
            </div>
            <div style={rowStyle}>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: FONT.tableCell, fontWeight: 500, color: TEXT.primary }}>
                  {pendingReturnCount} return{pendingReturnCount !== 1 ? 's' : ''} require{pendingReturnCount === 1 ? 's' : ''} your review
                </p>
                <p style={{ fontSize: 10, color: TEXT.muted }}>
                  Submitted by pharmacists — approve or deny each request
                </p>
              </div>
              <button
                onClick={() => router.push('/superadmin/returns')}
                className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[#92400E] hover:underline"
              >
                Review <ExternalLink size={10} />
              </button>
            </div>
          </div>
        )}

        {/* ── Settlements Due (superadmin only) ── */}
        {hasSettlementDue && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Handshake size={13} style={{ color: '#5B21B6' }} />
              <p style={{ ...sectionHead, color: '#5B21B6' }}>
                Settlements Due ({settlementDuePharmacies!.length})
              </p>
            </div>
            {settlementDuePharmacies!.map(p => (
              <div key={p.pharmacyId} style={rowStyle}>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: FONT.tableCell, fontWeight: 500, color: TEXT.primary }} className="truncate">
                    {p.pharmacyName}
                  </p>
                  <p style={{ fontSize: 10, color: TEXT.muted }}>
                    {Math.abs(p.currentBalance) > 0.005
                      ? `${p.currentBalance > 0 ? 'They owe us' : 'We owe them'} Rs ${Math.abs(p.currentBalance).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
                      : 'Settled'}
                    {' · '}{p.settlementCadence} cadence
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/superadmin/ledger/borrowing/${p.pharmacyId}`)}
                  className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-[#5B21B6] hover:underline"
                >
                  Settle <ExternalLink size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
