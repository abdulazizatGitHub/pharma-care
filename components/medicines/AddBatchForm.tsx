'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT, PAGE } from '@/lib/design-tokens'
import { addStockBatch } from '@/app/actions/stock'
import type { MedicineRow, Supplier } from '@/lib/db-types'

interface AddBatchFormProps {
  medicine:  MedicineRow
  suppliers: Supplier[]
  onClose:   () => void
  onDone:    () => void
}

export function AddBatchForm({ medicine, suppliers, onClose, onDone }: AddBatchFormProps) {
  const router = useRouter()

  const [batchNo,       setBatchNo]       = useState('')
  const [expiryDate,    setExpiryDate]    = useState('')
  const [qtyStr,        setQtyStr]        = useState('')
  const [purchasePrStr, setPurchasePrStr] = useState('')
  const [salePrStr,     setSalePrStr]     = useState('')
  const [mrpStr,        setMrpStr]        = useState(String(medicine.mrp))
  const [supplierId,    setSupplierId]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [warning,       setWarning]       = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()

  const isOpen = true

  const sectionHead: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: `1px solid ${PAGE.border}`,
  }

  function validate(): boolean {
    setError(null)
    setWarning(null)

    if (!batchNo.trim())       { setError('Batch number is required'); return false }
    if (!expiryDate)           { setError('Expiry date is required'); return false }

    const qty  = parseInt(qtyStr, 10)
    const pp   = parseFloat(purchasePrStr)
    const sp   = parseFloat(salePrStr)
    const mrp  = parseFloat(mrpStr)

    if (isNaN(qty)  || qty <= 0)   { setError('Quantity must be a positive integer'); return false }
    if (isNaN(pp)   || pp <= 0)    { setError('Purchase price must be a positive number'); return false }
    if (isNaN(sp)   || sp <= 0)    { setError('Sale price must be a positive number'); return false }
    if (isNaN(mrp)  || mrp <= 0)   { setError('MRP must be a positive number'); return false }

    const resolvedMrp = isNaN(mrp) ? medicine.mrp : mrp
    if (sp > resolvedMrp) {
      setError(`Sale price (${sp}) cannot exceed MRP (${resolvedMrp})`)
      return false
    }

    if (sp < pp) {
      setWarning(`Sale price (${sp}) is below purchase price (${pp}) — proceed with caution`)
    }

    return true
  }

  function handleSave() {
    if (!validate()) return

    const qty = parseInt(qtyStr, 10)
    const pp  = parseFloat(purchasePrStr)
    const sp  = parseFloat(salePrStr)
    const mrp = parseFloat(mrpStr)

    startTransition(async () => {
      const result = await addStockBatch({
        medicine_id:    medicine.id,
        batch_no:       batchNo.trim(),
        expiry_date:    expiryDate,
        quantity:       qty,
        purchase_price: pp,
        sale_price:     sp,
        mrp:            isNaN(mrp) ? undefined : mrp,
        supplier_id:    supplierId || undefined,
        notes:          notes.trim() || undefined,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onDone()
      onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/20" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full z-70 bg-white shadow-2xl flex flex-col"
        style={{
          width: 440,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div>
            <h2 className="text-[14px] font-medium text-[#111827]">Add Stock Batch</h2>
            <p className="text-[11px] text-[#6b7280] mt-0.5">{medicine.name}</p>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Section 1 — Batch */}
          <div>
            <p style={sectionHead}>Batch Details</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Batch number"
                  required
                  placeholder="e.g. BTH-2024-001"
                  value={batchNo}
                  onChange={e => setBatchNo(e.target.value)}
                />
                <Input
                  label="Expiry date"
                  required
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                />
              </div>
              <Input
                label="Quantity"
                required
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={qtyStr}
                onChange={e => setQtyStr(e.target.value)}
              />
            </div>
          </div>

          {/* Section 2 — Pricing */}
          <div>
            <p style={sectionHead}>Pricing</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Purchase price (Rs)"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrStr}
                  onChange={e => setPurchasePrStr(e.target.value)}
                />
                <Input
                  label="Sale price (Rs)"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={salePrStr}
                  onChange={e => setSalePrStr(e.target.value)}
                />
              </div>
              <Input
                label="MRP (Rs)"
                type="number"
                min="0"
                step="0.01"
                placeholder={`Default: ${medicine.mrp} (from medicine master)`}
                value={mrpStr}
                onChange={e => setMrpStr(e.target.value)}
                hint="Leave unchanged to use medicine master MRP as the legal price ceiling."
              />
            </div>
          </div>

          {/* Section 3 — Supplier & Notes */}
          <div>
            <p style={sectionHead}>Supplier & Notes</p>
            <div className="space-y-3">
              <Select
                label="Supplier"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
              >
                <option value="">— Optional —</option>
                {suppliers.length === 0 ? (
                  <option disabled>No suppliers yet — add one first</option>
                ) : (
                  suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                )}
              </Select>
              <Textarea
                label="Notes"
                placeholder="Optional — any batch-level notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          {warning && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FAEEDA] border border-[#F5CC8A]">
              <AlertTriangle size={13} className="text-[#854F0B] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#854F0B]">{warning}</p>
            </div>
          )}

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
            Add Batch
          </Button>
        </div>
      </div>
    </>
  )
}
