'use client'

import React, { useState, useTransition, useEffect, useCallback } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FONT, TEXT } from '@/lib/design-tokens'
import { getStockSummary } from '@/app/actions/stock'
import { AddBatchForm }    from './AddBatchForm'
import { StockAdjustForm } from './StockAdjustForm'
import { WriteOffForm }    from './WriteOffForm'
import type { MedicineRow, StockBatch, Supplier } from '@/lib/db-types'
import type { StockSummary } from '@/app/actions/stock'

// Days threshold for near-expiry amber row highlight
const NEAR_EXPIRY_DAYS = 90

function getRowTint(expiryDate: string): string | undefined {
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  if (expiry < today) return '#FCEBEB'
  const diff = (expiry.getTime() - today.getTime()) / 86_400_000
  if (diff <= NEAR_EXPIRY_DAYS) return '#FAEEDA'
  return undefined
}

function getExpiryLabel(expiryDate: string): { text: string; color: string } {
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  if (expiry < today) return { text: 'Expired',    color: '#A32D2D' }
  const diff = (expiry.getTime() - today.getTime()) / 86_400_000
  if (diff <= 30)              return { text: `${Math.ceil(diff)}d left`,  color: '#A32D2D' }
  if (diff <= NEAR_EXPIRY_DAYS) return { text: `${Math.ceil(diff)}d left`, color: '#854F0B' }
  return { text: expiryDate, color: TEXT.secondary }
}

interface MedicineStockPanelProps {
  medicine:  MedicineRow
  suppliers: Supplier[]
  canWrite:  boolean
  onClose:   () => void
}

export function MedicineStockPanel({ medicine, suppliers, canWrite, onClose }: MedicineStockPanelProps) {
  const [summary,      setSummary]      = useState<StockSummary | null>(null)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [addOpen,      setAddOpen]      = useState(false)
  const [adjustBatch,  setAdjustBatch]  = useState<StockBatch | null>(null)
  const [writeOffBatch, setWriteOffBatch] = useState<StockBatch | null>(null)
  const [isLoading,    startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(async () => {
      setLoadError(null)
      const result = await getStockSummary(medicine.id)
      if (result.error) { setLoadError(result.error); return }
      setSummary(result.data ?? null)
    })
  }, [medicine.id])

  useEffect(() => { refresh() }, [refresh])

  const batches = summary?.batches ?? []

  const thStyle: React.CSSProperties = {
    fontSize: FONT.tableHeader,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '8px 12px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    background: '#f9fafb',
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    fontSize: FONT.tableCell,
    color: TEXT.primary,
    padding: '8px 12px',
    verticalAlign: 'middle',
  }

  return (
    <>
      {/* Backdrop — lower z than sub-modals */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 bg-white shadow-2xl flex flex-col"
        style={{ width: 660 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div>
            <h2 className="text-[14px] font-medium text-[#111827]">
              Stock — {medicine.name}
            </h2>
            <p className="text-[11px] text-[#6b7280] mt-0.5">
              {medicine.code ? `Code ${medicine.code} · ` : ''}
              {batches.length} batch{batches.length !== 1 ? 'es' : ''}
              {summary ? ` · Total: ${summary.total_quantity}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={12} />}
                onClick={() => setAddOpen(true)}
              >
                Add Batch
              </Button>
            )}
            <button
              onClick={onClose}
              className="text-[#6b7280] hover:text-[#111827] transition-colors ml-1"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && !summary && (
            <div className="flex items-center justify-center h-32 gap-2 text-[#6b7280]">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[12px]">Loading batches…</span>
            </div>
          )}

          {loadError && (
            <div className="m-5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-[12px] text-[#A32D2D]">
              {loadError}
            </div>
          )}

          {!isLoading && !loadError && batches.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-[#9ca3af]">
              <p className="text-[13px]">No stock batches found</p>
              {canWrite && (
                <p className="text-[11px] mt-1">Click "Add Batch" to record the first stock entry.</p>
              )}
            </div>
          )}

          {batches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 580 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Batch No</th>
                    <th style={thStyle}>Expiry</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Purchase</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Sale</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>MRP</th>
                    {canWrite && <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => {
                    const tint   = getRowTint(batch.expiry_date)
                    const expLbl = getExpiryLabel(batch.expiry_date)
                    return (
                      <tr
                        key={batch.id}
                        style={{ background: tint, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                      >
                        <td style={tdStyle}>
                          <span className="font-mono text-[11px]">{batch.batch_no}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: expLbl.color, fontSize: 11 }}>{expLbl.text}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <span
                            className="font-medium"
                            style={{ color: batch.quantity === 0 ? '#A32D2D' : batch.quantity < 5 ? '#854F0B' : TEXT.primary }}
                          >
                            {batch.quantity}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: TEXT.secondary }}>
                          {batch.purchase_price != null ? `Rs ${batch.purchase_price.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: TEXT.secondary }}>
                          {batch.sale_price != null ? `Rs ${batch.sale_price.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: TEXT.secondary }}>
                          {batch.mrp != null ? `Rs ${batch.mrp.toFixed(2)}` : '—'}
                        </td>
                        {canWrite && (
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdjustBatch(batch)}
                              >
                                Adjust
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWriteOffBatch(batch)}
                              >
                                Write Off
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        {batches.length > 0 && (
          <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.06)] flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#FCEBEB' }} />
              <span className="text-[10px] text-[#6b7280]">Expired</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#FAEEDA' }} />
              <span className="text-[10px] text-[#6b7280]">Within 90 days</span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-drawers and modals — higher z-index than the panel */}
      {addOpen && (
        <AddBatchForm
          medicine={medicine}
          suppliers={suppliers}
          onClose={() => setAddOpen(false)}
          onDone={refresh}
        />
      )}

      {adjustBatch && (
        <StockAdjustForm
          batch={adjustBatch}
          medicineName={medicine.name}
          onClose={() => setAdjustBatch(null)}
          onDone={refresh}
        />
      )}

      {writeOffBatch && (
        <WriteOffForm
          batch={writeOffBatch}
          medicineName={medicine.name}
          onClose={() => setWriteOffBatch(null)}
          onDone={refresh}
        />
      )}
    </>
  )
}
