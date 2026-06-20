'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { writeOffBatch } from '@/app/actions/stock'
import type { StockBatch } from '@/lib/db-types'

type WriteOffReason = 'expired' | 'near_expiry' | 'damaged' | 'other'

interface WriteOffFormProps {
  batch:        StockBatch
  medicineName: string
  onClose:      () => void
  onDone:       () => void
}

export function WriteOffForm({ batch, medicineName, onClose, onDone }: WriteOffFormProps) {
  const router = useRouter()

  const [qtyStr,    setQtyStr]    = useState('')
  const [reason,    setReason]    = useState<WriteOffReason>('expired')
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const qty = parseInt(qtyStr, 10)
  const remaining = isNaN(qty) || qty <= 0 ? null : batch.quantity - qty

  function handleSave() {
    setError(null)
    if (isNaN(qty) || qty <= 0)          { setError('Quantity must be a positive number'); return }
    if (qty > batch.quantity)            { setError(`Cannot write off more than available stock (${batch.quantity})`); return }
    startTransition(async () => {
      const result = await writeOffBatch(batch.id, qty, reason, notes.trim() || undefined)
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
              <h2 className="text-[14px] font-medium text-[#111827]">Write Off Stock</h2>
              <p className="text-[11px] text-[#6b7280] mt-0.5">{medicineName} · Batch {batch.batch_no}</p>
            </div>
            <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Batch info */}
            <div className="grid grid-cols-2 gap-2 px-3 py-2.5 rounded-lg bg-[#f9fafb] border border-[rgba(0,0,0,0.06)]">
              <div>
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Expiry Date</p>
                <p className="text-[12px] font-medium text-[#111827] mt-0.5">{batch.expiry_date}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">Available Qty</p>
                <p className="text-[12px] font-medium text-[#111827] mt-0.5">{batch.quantity}</p>
              </div>
            </div>

            <Input
              label="Quantity to write off"
              required
              type="number"
              min="1"
              max={String(batch.quantity)}
              step="1"
              placeholder={`Max ${batch.quantity}`}
              value={qtyStr}
              onChange={e => setQtyStr(e.target.value)}
            />

            {/* Remaining after write-off */}
            {remaining !== null && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-[#6b7280]">Remaining after write-off:</span>
                <span
                  className="font-medium"
                  style={{ color: remaining === 0 ? '#A32D2D' : remaining < 5 ? '#854F0B' : '#0F6E56' }}
                >
                  {remaining}
                </span>
              </div>
            )}

            <Select
              label="Reason"
              required
              value={reason}
              onChange={e => setReason(e.target.value as WriteOffReason)}
            >
              <option value="expired">Expired</option>
              <option value="near_expiry">Near expiry (proactive)</option>
              <option value="damaged">Damaged / broken</option>
              <option value="other">Other</option>
            </Select>

            <Textarea
              label="Notes"
              placeholder="Optional — details about the write-off"
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

          {/* Warning banner */}
          <div className="mx-5 mb-1 flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FAEEDA] border border-[#F5CC8A]">
            <AlertTriangle size={13} className="text-[#854F0B] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#854F0B]">
              This action reduces inventory permanently and is recorded in the audit log.
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={isPending} onClick={handleSave}>
              Write Off
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
