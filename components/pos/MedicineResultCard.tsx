'use client'

import React, { useState } from 'react'
import { useCart } from '@/lib/pos-context'
import { focusLastQtyInput } from '@/lib/pos-shortcuts'
import { BorrowToFulfillModal } from './BorrowToFulfillModal'
import type { POSMedicineResult, CartItem } from '@/lib/pos-types'

interface Props {
  result:         POSMedicineResult
  showBatchLabel: boolean   // true when same medicine has multiple batch cards in the grid
  onAdded:        () => void
  highlighted?:   boolean
}

export function MedicineResultCard({ result, showBatchLabel, onAdded, highlighted }: Props) {
  const { addItem } = useCart()

  const batch = result.batches[0]

  const [confirmFlag,    setConfirmFlag]    = useState(false)
  const [borrowModalOpen, setBorrowModalOpen] = useState(false)

  const needsFlag  = result.schedule === 'controlled' || result.schedule === 'prescription'
  const isLowStock = !result.isOutOfStock && result.reorderLevel > 0 && result.totalStock <= result.reorderLevel

  // ── Out-of-stock card ──────────────────────────────────────────────────────
  if (result.isOutOfStock) {
    return (
      <>
        <div
          className={`bg-[#f3f4f6] rounded-md p-2 select-none border border-[rgba(0,0,0,0.08)]${highlighted ? ' ring-2 ring-[#166534]' : ''}`}
          style={{ opacity: 0.85 }}
        >
          <p className="text-[13px] font-bold text-[#6b7280] truncate leading-tight mb-0.5">
            {result.medicineName}
          </p>
          <p className="text-[11px] text-[#9ca3af] truncate leading-tight mb-0.5">
            {result.packSize ?? 'No stock'}
          </p>
          <p className="text-[12px] font-bold text-[#6b7280] leading-tight mb-1">
            Rs {result.mrp.toFixed(2)}
          </p>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] font-bold text-[#dc2626] bg-red-50 border border-red-200 rounded px-1 py-0.5 uppercase tracking-wide">
              Out of stock
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setBorrowModalOpen(true) }}
              tabIndex={-1}
              className="text-[9px] font-semibold bg-amber-500 text-white rounded px-1.5 py-0.5 hover:bg-amber-600 transition-colors"
            >
              Borrow
            </button>
          </div>
        </div>

        <BorrowToFulfillModal
          open={borrowModalOpen}
          onClose={() => setBorrowModalOpen(false)}
          medicine={{ id: result.medicineId, name: result.medicineName, salePrice: result.mrp }}
          onAddToCart={(item) => { addItem(item); focusLastQtyInput(); setBorrowModalOpen(false); onAdded() }}
        />
      </>
    )
  }

  // ── Normal in-stock card ───────────────────────────────────────────────────
  if (!batch) return null

  const expiryStr = batch.expiryDate
    ? new Date(batch.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : null

  // Multi-batch: show batchNo + expiry so pharmacist knows which batch they're selecting.
  // Single-batch: show packSize + batchNo (always show batchNo), expiry shown separately if packSize occupies line2.
  const line2 = showBatchLabel
    ? `${batch.batchNo}${expiryStr ? ` · ${expiryStr}` : ''}`
    : result.packSize
      ? `${result.packSize} · ${batch.batchNo}`
      : (expiryStr ? `${batch.batchNo} · ${expiryStr}` : batch.batchNo)

  // When packSize occupies line2 for a single-batch card, expiry has no line2 space — show it separately.
  const showExpiryBelow = !showBatchLabel && !!result.packSize && !!expiryStr

  const hasBatchDiscount  = batch.mrp > batch.salePrice
  const cardDiscountPct   = hasBatchDiscount && batch.mrp > 0
    ? Math.round(((batch.mrp - batch.salePrice) / batch.mrp) * 100)
    : 0

  function doAdd() {
    const item: CartItem = {
      id:                 crypto.randomUUID(),
      medicineId:         result.medicineId,
      medicineName:       result.medicineName,
      batchId:            batch.batchId,
      batchNo:            batch.batchNo,
      expiryDate:         batch.expiryDate,
      quantity:           1,
      unitPrice:          batch.salePrice,
      mrp:                batch.mrp,
      specialDiscountPct: 0,
      discountPct:        0,
      totalPrice:         batch.salePrice,
      isControlled:       result.schedule === 'controlled',
      isPrescription:     result.schedule === 'prescription',
    }
    addItem(item)
    focusLastQtyInput()
    setConfirmFlag(false)
    onAdded()
  }

  function handleCardClick() {
    if (needsFlag && !confirmFlag) { setConfirmFlag(true); return }
    if (confirmFlag) return
    doAdd()
  }

  const borderClass = isLowStock
    ? 'border-2 border-amber-400'
    : 'border border-[rgba(0,0,0,0.1)]'

  return (
    <div
      className={`bg-white rounded-md p-2 cursor-pointer select-none transition-colors ${borderClass} ${
        confirmFlag
          ? 'bg-amber-50'
          : 'hover:bg-[#f0fdf7] hover:border-[#5DCAA5]'
      }${highlighted ? ' ring-2 ring-[#166534] bg-[#f0fdf4]' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick() } }}
      aria-label={`Add ${result.medicineName} to cart`}
    >
      {confirmFlag ? (
        <div onClick={e => e.stopPropagation()}>
          <p className="text-[12px] font-bold text-[#111827] truncate leading-tight mb-1.5">
            {result.medicineName}
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
            <p className="text-[10px] text-amber-700 leading-snug">
              ⚠ {result.schedule === 'controlled' ? 'Controlled drug' : 'Prescription required'}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); doAdd() }}
              tabIndex={-1}
              className="flex-1 text-[10px] font-semibold bg-[#0F6E56] text-white rounded py-1 hover:bg-[#0a5a45] transition-colors"
            >
              Confirm Add
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmFlag(false) }}
              tabIndex={-1}
              className="text-[10px] text-[#6b7280] rounded py-1 px-2 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[13px] font-bold text-[#111827] truncate leading-tight mb-0.5">
            {result.medicineName}
          </p>
          <p className="text-[11px] text-[#9ca3af] truncate leading-tight mb-0.5">
            {line2}
          </p>
          <p className="text-[12px] font-bold text-[#0F6E56] leading-tight mb-0.5">
            Rs {batch.salePrice.toFixed(2)}
          </p>
          {hasBatchDiscount && (
            <p className="text-[10px] text-[#9ca3af] leading-tight mb-0.5">
              MRP Rs {batch.mrp.toFixed(2)}
            </p>
          )}
          {hasBatchDiscount && batch.mrp > 0 && (
            <p className="text-[10px] font-medium text-[#0F6E56] leading-tight mb-0.5">
              {cardDiscountPct}% off MRP
            </p>
          )}
          {showExpiryBelow && (
            <p className="text-[10px] text-[#9ca3af] leading-tight mb-0.5">
              Exp: {expiryStr}
            </p>
          )}
          <p className={`text-[10px] leading-tight ${isLowStock ? 'text-amber-600 font-medium' : 'text-[#9ca3af]'}`}>
            {isLowStock ? '⚠ ' : ''}{batch.quantity} units
          </p>
        </>
      )}
    </div>
  )
}
