'use client'

import React from 'react'
import { Trash2, Minus, Plus } from 'lucide-react'
import { useCart } from '@/lib/pos-context'
import { focusNextQtyInput } from '@/lib/pos-shortcuts'
import type { CartItem as CartItemType } from '@/lib/pos-types'

interface Props {
  item:            CartItemType
  onChangeBatch?:  (item: CartItemType) => void
}

export function CartItemRow({ item, onChangeBatch }: Props) {
  const { removeItem, updateQuantity } = useCart()

  const expiryStr = item.isBorrowed || !item.expiryDate
    ? null
    : new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  const lineBeforeDiscount = item.quantity * item.unitPrice
  const borrowMargin       = item.isBorrowed && item.borrowCost != null
    ? item.unitPrice - item.borrowCost
    : null
  const patientDiscountAmt = (item.mrp - item.unitPrice) * item.quantity
  const patientDiscountPct = item.mrp > 0
    ? Math.round(((item.mrp - item.unitPrice) / item.mrp) * 100)
    : 0

  return (
    <div className="py-3 border-b border-[rgba(0,0,0,0.06)] last:border-0">
      {/* Name + remove */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[12px] font-bold text-[#111827] truncate">{item.medicineName}</p>
            {item.isBorrowed && (
              <span className="shrink-0 text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 py-0.5 uppercase tracking-wide">
                Borrowed
              </span>
            )}
          </div>
          {item.isBorrowed ? (
            <p className="text-[10px] text-[#9ca3af] mt-0.5">
              from {item.borrowedFromName ?? '—'}
              {item.borrowCost != null && (
                <> · Cost: Rs {item.borrowCost.toFixed(2)} · Margin: Rs {(borrowMargin ?? 0).toFixed(2)}</>
              )}
            </p>
          ) : (
            <p className="text-[10px] text-[#9ca3af] flex items-center gap-1.5">
              Batch: {item.batchNo}{expiryStr ? ` · Exp: ${expiryStr}` : ''}
              {onChangeBatch && (
                <button
                  onClick={() => onChangeBatch(item)}
                  tabIndex={-1}
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 3,
                    border: '1px solid #0F6E56',
                    color: '#0F6E56',
                    background: 'transparent',
                    cursor: 'pointer',
                    marginLeft: 4,
                  }}
                >
                  Change batch
                </button>
              )}
            </p>
          )}
          {(item.isControlled || item.isPrescription) && (
            <p
              className="text-[10px] font-medium"
              style={{ color: item.isControlled ? '#A32D2D' : '#185FA5' }}
            >
              {item.isControlled ? 'Controlled' : 'Prescription'}
            </p>
          )}
        </div>
        {/* TODO: add undo support to trash button click */}
        <button
          onClick={() => removeItem(item.id)}
          tabIndex={-1}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#e53e3e] hover:bg-rose-50 transition-colors"
          aria-label={`Remove ${item.medicineName}`}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Qty stepper + price calculation */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Qty stepper — read-only for borrowed items (qty fixed by temp batch) */}
        {item.isBorrowed ? (
          <div className="flex items-center rounded-md border border-[rgba(0,0,0,0.1)] bg-[#f9fafb] overflow-hidden">
            <span className="w-6 h-6 flex items-center justify-center text-[#9ca3af]">
              <Minus size={10} />
            </span>
            <span className="w-9 h-6 flex items-center justify-center text-center text-[11px] text-[#111827] border-x border-[rgba(0,0,0,0.08)]">
              {item.quantity}
            </span>
            <span className="w-6 h-6 flex items-center justify-center text-[#9ca3af]">
              <Plus size={10} />
            </span>
          </div>
        ) : (
        <div className="flex items-center rounded-md border border-[rgba(0,0,0,0.15)] bg-white overflow-hidden">
          <button
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            disabled={item.quantity <= 1}
            tabIndex={-1}
            className="w-6 h-6 flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-40 transition-colors"
            aria-label="Decrease quantity"
          >
            <Minus size={10} />
          </button>
          <input
            type="number"
            min="1"
            value={item.quantity}
            data-qty-input={item.id}
            onChange={e => updateQuantity(item.id, parseInt(e.target.value, 10) || 1)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                focusNextQtyInput(e.currentTarget as HTMLInputElement)
              }
            }}
            className="w-9 h-6 text-center text-[11px] text-[#111827] border-x border-[rgba(0,0,0,0.1)] focus:outline-none focus:ring-1 focus:ring-[#0F6E56]"
            aria-label="Quantity"
          />
          <button
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            tabIndex={-1}
            className="w-6 h-6 flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
            aria-label="Increase quantity"
          >
            <Plus size={10} />
          </button>
        </div>
        )}

        {/* qty × price */}
        <span className="text-[11px] text-[#6b7280]">
          × Rs {item.unitPrice.toFixed(2)}
        </span>
        <span className="text-[11px] text-[#9ca3af]">=</span>
        <span className="text-[11px] text-[#111827]">
          Rs {lineBeforeDiscount.toFixed(2)}
        </span>

        {/* MRP muted */}
        <span className="text-[10px] text-[#9ca3af] ml-1">
          MRP Rs {item.mrp.toFixed(2)}
        </span>
      </div>

      {/* Patient (MRP → sale price) discount line */}
      {item.mrp > item.unitPrice && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-[#9ca3af]">
            MRP discount: {patientDiscountPct}% · –Rs {patientDiscountAmt.toFixed(2)}
          </span>
        </div>
      )}

      {/* Line total */}
      <div className="flex justify-end items-center gap-2 mt-1">
        <span className="text-[11px] text-[#6b7280]">Total:</span>
        <span className="text-[12px] font-semibold text-[#111827]">
          Rs {item.totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
