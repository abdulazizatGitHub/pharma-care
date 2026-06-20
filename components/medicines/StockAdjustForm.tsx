'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT } from '@/lib/design-tokens'
import { adjustStock } from '@/app/actions/stock'
import type { StockBatch } from '@/lib/db-types'

type AdjustReason = 'physical_count' | 'damaged' | 'theft' | 'other'

interface StockAdjustFormProps {
  batch:        StockBatch
  medicineName: string
  onClose:      () => void
  onDone:       () => void
}

export function StockAdjustForm({ batch, medicineName, onClose, onDone }: StockAdjustFormProps) {
  const router = useRouter()

  const [newQtyStr, setNewQtyStr] = useState(String(batch.quantity))
  const [reason,    setReason]    = useState<AdjustReason>('physical_count')
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const newQty  = parseInt(newQtyStr, 10)
  const diff    = isNaN(newQty) ? null : newQty - batch.quantity
  const diffStr = diff === null ? null : diff >= 0 ? `+${diff}` : String(diff)
  const diffColor = diff === null ? TEXT.secondary : diff > 0 ? '#0F6E56' : diff < 0 ? '#A32D2D' : TEXT.secondary

  function handleSave() {
    setError(null)
    if (isNaN(newQty) || newQty < 0) { setError('New quantity must be 0 or greater'); return }
    startTransition(async () => {
      const result = await adjustStock(batch.id, newQty, reason, notes.trim() || undefined)
      if (result.error) { setError(result.error); return }
      router.refresh()
      onDone()
      onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-60 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-2xl w-full flex flex-col"
          style={{ maxWidth: 420 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
            <div>
              <h2 className="text-[14px] font-medium text-[#111827]">Adjust Stock</h2>
              <p className="text-[11px] text-[#6b7280] mt-0.5">{medicineName} · Batch {batch.batch_no}</p>
            </div>
            <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Current qty display */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#f9fafb] border border-[rgba(0,0,0,0.06)]">
              <span className="text-[11px] text-[#6b7280]">Current quantity</span>
              <span className="text-[13px] font-medium text-[#111827] ml-auto">{batch.quantity}</span>
            </div>

            {/* New qty + diff */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="New quantity"
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={newQtyStr}
                  onChange={e => setNewQtyStr(e.target.value)}
                />
              </div>
              {diffStr !== null && (
                <div
                  className="h-8 px-3 flex items-center rounded-md border text-[13px] font-semibold shrink-0"
                  style={{
                    color: diffColor,
                    borderColor: diffColor,
                    background: diff === 0 ? '#f9fafb' : diff! > 0 ? '#E1F5EE' : '#FCEBEB',
                    minWidth: 56,
                    justifyContent: 'center',
                  }}
                >
                  {diffStr}
                </div>
              )}
            </div>

            <Select
              label="Reason"
              required
              value={reason}
              onChange={e => setReason(e.target.value as AdjustReason)}
            >
              <option value="physical_count">Physical count correction</option>
              <option value="damaged">Damaged / spoiled</option>
              <option value="theft">Theft / loss</option>
              <option value="other">Other</option>
            </Select>

            <Textarea
              label="Notes"
              placeholder="Optional — describe the reason in detail"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            {error && (
              <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button className="flex-1" loading={isPending} onClick={handleSave}>
              Save Adjustment
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
