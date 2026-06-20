'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Package } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT, FONT, PAGE } from '@/lib/design-tokens'
import { createGRN } from '@/app/actions/procurement'
import type { GRNItemInput } from '@/app/actions/procurement'

export interface GRNLineItem {
  poItemId:      string
  medicineId:    string
  medicineName:  string
  orderedQty:    number
  unitPrice:     number
}

interface GRNFormProps {
  poId:      string
  lineItems: GRNLineItem[]
  onClose:   () => void
}

interface RowState {
  batchNo:     string
  expiryDate:  string
  receivedQty: string
  unitPrice:   string
}

export function GRNForm({ poId, lineItems, onClose }: GRNFormProps) {
  const router = useRouter()
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [rows, setRows] = useState<RowState[]>(() =>
    lineItems.map(item => ({
      batchNo:     '',
      expiryDate:  '',
      receivedQty: String(item.orderedQty),
      unitPrice:   String(item.unitPrice),
    })),
  )

  function updateRow(index: number, patch: Partial<RowState>) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  function handleSubmit() {
    setError(null)

    const items: GRNItemInput[] = []
    for (let i = 0; i < lineItems.length; i++) {
      const row  = rows[i]
      const line = lineItems[i]

      if (!row.batchNo.trim()) { setError(`Row ${i + 1}: Batch number is required`); return }
      if (!row.expiryDate)     { setError(`Row ${i + 1}: Expiry date is required`); return }

      const qty = parseInt(row.receivedQty, 10)
      const up  = parseFloat(row.unitPrice)

      if (isNaN(qty) || qty <= 0)  { setError(`Row ${i + 1}: Received qty must be positive`); return }
      if (isNaN(up)  || up <= 0)   { setError(`Row ${i + 1}: Unit price must be positive`); return }

      items.push({
        medicine_id: line.medicineId,
        batch_no:    row.batchNo.trim(),
        expiry_date: row.expiryDate,
        quantity:    qty,
        unit_price:  up,
      })
    }

    startTransition(async () => {
      const result = await createGRN(poId, items, notes.trim() || undefined)
      if (result.error) { setError(result.error); return }
      router.refresh()
      onClose()
    })
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: TEXT.secondary,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${PAGE.border}`,
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          className="bg-white rounded-xl shadow-2xl flex flex-col"
          style={{ width: '100%', maxWidth: 680, maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-[#0F6E56]" />
              <h2 className="text-[14px] font-medium text-[#111827]">Record Goods Receipt (GRN)</h2>
            </div>
            <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <p style={sectionHead}>Line Items — Enter received batch details</p>

            {lineItems.map((line, i) => (
              <div
                key={line.poItemId}
                className="rounded-lg border border-[rgba(0,0,0,0.08)] p-4 space-y-3"
                style={{ background: '#fafafa' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-[#111827]">{line.medicineName}</p>
                  <span className="text-[11px] text-[#6b7280]">Ordered: {line.orderedQty} units</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Batch number"
                    required
                    placeholder="e.g. BTH-2024-001"
                    value={rows[i].batchNo}
                    onChange={e => updateRow(i, { batchNo: e.target.value })}
                  />
                  <Input
                    label="Expiry date"
                    required
                    type="date"
                    value={rows[i].expiryDate}
                    onChange={e => updateRow(i, { expiryDate: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Received qty"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={rows[i].receivedQty}
                    onChange={e => updateRow(i, { receivedQty: e.target.value })}
                  />
                  <Input
                    label="Unit price (Rs)"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={rows[i].unitPrice}
                    onChange={e => updateRow(i, { unitPrice: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <div>
              <p style={sectionHead}>GRN Notes</p>
              <Textarea
                label="Notes"
                placeholder="Optional — any GRN-level notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

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
            <Button className="flex-1" loading={isPending} onClick={handleSubmit}>
              Complete GRN
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
