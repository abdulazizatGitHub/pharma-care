'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { getBorrowingPharmacies, borrowToFulfill } from '@/app/actions/borrowing'
import type { CartItem } from '@/lib/pos-types'

interface Medicine {
  id:        string
  name:      string
  salePrice: number   // MRP used as default sale price for OOS medicines
}

interface Props {
  open:        boolean
  onClose:     () => void
  medicine:    Medicine
  onAddToCart: (item: CartItem) => void
}

interface PharmacyOption {
  id:             string
  name:           string
  currentBalance: number
}

export function BorrowToFulfillModal({ open, onClose, medicine, onAddToCart }: Props) {
  const [pharmacies,   setPharmacies]   = useState<PharmacyOption[]>([])
  const [pharmacyId,   setPharmacyId]   = useState('')
  const [borrowCostStr, setBorrowCostStr] = useState('')
  const [qtyStr,       setQtyStr]       = useState('1')
  const [loading,      setLoading]      = useState(false)
  const [loadingPharm, setLoadingPharm] = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Load pharmacies once when modal opens
  useEffect(() => {
    if (!open) return
    setPharmacyId('')
    setBorrowCostStr('')
    setQtyStr('1')
    setError(null)

    setLoadingPharm(true)
    getBorrowingPharmacies().then(res => {
      setLoadingPharm(false)
      if (res.data) setPharmacies(res.data)
    })
  }, [open])

  const borrowCost = parseFloat(borrowCostStr) || 0
  const qty        = Math.max(1, parseInt(qtyStr, 10) || 1)
  const margin     = (medicine.salePrice - borrowCost) * qty
  const marginPct  = medicine.salePrice > 0
    ? ((medicine.salePrice - borrowCost) / medicine.salePrice) * 100
    : 0

  const selectedPharmacy = pharmacies.find(p => p.id === pharmacyId)

  const canSubmit = pharmacyId && borrowCost > 0 && qty > 0

  async function handleAdd() {
    if (!canSubmit) return
    setError(null)
    setLoading(true)

    const res = await borrowToFulfill({
      medicineId: medicine.id,
      pharmacyId,
      quantity:   qty,
      borrowCost,
      salePrice:  medicine.salePrice,
    })

    setLoading(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Failed to set up borrow')
      return
    }

    const cartItem: CartItem = {
      id:               crypto.randomUUID(),
      medicineId:       res.data.medicineId,
      medicineName:     res.data.medicineName,
      batchId:          res.data.batchId,
      batchNo:          res.data.batchNo,
      expiryDate:       '2099-12-31',
      quantity:         res.data.quantity,
      unitPrice:        res.data.unitPrice,
      mrp:                medicine.salePrice,
      specialDiscountPct: 0,
      discountPct:        0,
      totalPrice:       res.data.unitPrice * res.data.quantity,
      isControlled:     false,
      isPrescription:   false,
      isBorrowed:       true,
      borrowedFrom:     pharmacyId,
      borrowedFromName: selectedPharmacy?.name ?? '',
      borrowCost,
    }

    onAddToCart(cartItem)
  }

  return (
    <Modal open={open} onClose={onClose} title="Borrow to Fulfill" size="sm">
      <div className="flex flex-col gap-4">

        {/* Medicine info */}
        <div className="rounded-lg bg-[#f9fafb] border border-[rgba(0,0,0,0.08)] px-3 py-2.5">
          <p className="text-[12px] font-bold text-[#111827]">{medicine.name}</p>
          <p className="text-[11px] text-[#6b7280] mt-0.5">
            Our sale price: <span className="font-semibold text-[#0F6E56]">Rs {medicine.salePrice.toFixed(2)}</span>
          </p>
        </div>

        {/* Pharmacy selector */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
            Borrow from pharmacy
          </label>
          {loadingPharm ? (
            <p className="text-[11px] text-[#9ca3af]">Loading pharmacies…</p>
          ) : pharmacies.length === 0 ? (
            <p className="text-[11px] text-[#A32D2D]">No active borrowing pharmacies configured.</p>
          ) : (
            <select
              value={pharmacyId}
              onChange={e => { setPharmacyId(e.target.value); setError(null) }}
              className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            >
              <option value="">Select pharmacy…</option>
              {pharmacies.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.currentBalance !== 0
                    ? ` (balance: Rs ${Math.abs(p.currentBalance).toFixed(2)} ${p.currentBalance < 0 ? 'owed' : 'receivable'})`
                    : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Their cost to us */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
            Their cost to us (Rs per unit)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={borrowCostStr}
            onChange={e => { setBorrowCostStr(e.target.value); setError(null) }}
            placeholder="What we owe them per unit"
            className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#d1d5db] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
        </div>

        {/* Quantity */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
            Quantity
          </label>
          <input
            type="number"
            min="1"
            value={qtyStr}
            onChange={e => { setQtyStr(e.target.value); setError(null) }}
            className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
        </div>

        {/* Calculated margins */}
        {borrowCost > 0 && (
          <div className={`rounded-lg border px-3 py-2.5 text-[11px] ${
            margin < 0
              ? 'bg-red-50 border-red-200'
              : 'bg-[#f0fdf4] border-[#86efac]'
          }`}>
            <div className="flex justify-between mb-1">
              <span className="text-[#6b7280]">Total borrow cost</span>
              <span className="font-semibold text-[#111827]">Rs {(borrowCost * qty).toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[#6b7280]">Our margin</span>
              <span className={`font-semibold ${margin < 0 ? 'text-[#dc2626]' : 'text-[#0F6E56]'}`}>
                Rs {margin.toFixed(2)} ({marginPct.toFixed(1)}%)
              </span>
            </div>
            {margin < 0 && (
              <p className="text-[#dc2626] font-medium mt-1">
                ⚠ Selling below borrow cost — you will lose Rs {Math.abs(margin).toFixed(2)}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-[11px] text-[#A32D2D]">⚠ {error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            loading={loading}
            disabled={!canSubmit || loading}
            className="flex-1"
          >
            Add to Cart as Borrowed
          </Button>
        </div>
      </div>
    </Modal>
  )
}
