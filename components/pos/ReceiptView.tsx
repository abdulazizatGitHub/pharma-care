'use client'

import React from 'react'
import type { CartItem } from '@/lib/pos-types'

export interface ReceiptContentProps {
  pharmacyName:      string
  pharmacyAddress:   string        // shown below header note; hidden if empty
  headerNote:        string        // tagline below pharmacy name; hidden if empty
  cashierName:       string
  showCashierName:   boolean       // setting: show cashier name on receipt
  customerName:      string | null // shown if present
  receiptNo:         string | null // shown based on showReceiptNo; null before sale completes
  showReceiptNo:     boolean       // setting: show receipt number on receipt
  saleTime:          Date
  items:             CartItem[]
  subtotal:          number        // sum of item totalPrices (after per-item discounts)
  discountAmount:    number        // sale-level overall discount (cashier override)
  serviceFee:        number        // from settings (DB column: bag_charge)
  serviceFeeLabel:   string        // e.g. "Service Fee", "Handling Fee"
  serviceFeeEnabled: boolean       // whether to show the fee row
  total:             number
  paymentType:       'cash' | 'credit'
  amountPaid:        number
  change:            number
  returnPolicy:      string        // return/exchange policy; hidden if empty
  receiptFooter:     string
}

function HDivider({ double }: { double?: boolean }) {
  return (
    <div
      className={`my-1 ${double ? 'border-t-2 border-solid border-[#111827]' : 'border-t border-dashed border-[rgba(0,0,0,0.3)]'}`}
    />
  )
}

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#6b7280]">{label}</span>
      <span className={bold ? 'font-bold' : ''}>{value}</span>
    </div>
  )
}

function TotalRow({ label, value, muted, green, bold }: {
  label: string; value: string; muted?: boolean; green?: boolean; bold?: boolean
}) {
  return (
    <div className={`flex justify-between gap-2 ${muted ? 'text-[#6b7280]' : ''} ${green ? 'text-[#0F6E56]' : ''} ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function ReceiptContent({
  pharmacyName,
  pharmacyAddress,
  headerNote,
  cashierName,
  showCashierName,
  customerName,
  receiptNo,
  showReceiptNo,
  saleTime,
  items,
  subtotal,
  discountAmount,
  serviceFee,
  serviceFeeLabel,
  serviceFeeEnabled,
  total,
  paymentType,
  amountPaid,
  change,
  returnPolicy,
  receiptFooter,
}: ReceiptContentProps) {
  const dateStr = saleTime.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const timeStr = saleTime.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const fmt = (n: number) =>
    n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const grossAtMRP      = items.reduce((sum, i) => sum + i.mrp * i.quantity, 0)
  const patientDiscount = items.reduce((sum, i) => sum + Math.max(0, i.mrp - i.unitPrice) * i.quantity, 0)
  const netValue        = subtotal
  const hasAnyDiscount  = items.some(i => i.mrp > i.unitPrice)

  return (
    <div className="text-[11px] leading-snug">

      {/* Header */}
      <div className="text-center mb-1">
        <p className="font-bold text-[13px]">{pharmacyName}</p>
        {headerNote.trim() && (
          <p className="text-[10px] text-[#6b7280]">{headerNote.trim()}</p>
        )}
        {pharmacyAddress.trim() && (
          <p className="text-[10px] text-[#6b7280]">{pharmacyAddress.trim()}</p>
        )}
      </div>
      <HDivider double />

      {/* Meta */}
      <div className="space-y-0.5 my-1.5">
        <MetaRow label="Date:"    value={dateStr} />
        <MetaRow label="Time:"    value={timeStr} />
        {showReceiptNo  && <MetaRow label="Receipt No:" value={receiptNo ?? '---'} bold />}
        {showCashierName && <MetaRow label="Cashier:"   value={cashierName} />}
        {customerName   && <MetaRow label="Customer:"   value={customerName} />}
      </div>
      <HDivider />

      {/* Column headers — 5 cols if any item has a discount, otherwise 4 */}
      <div className="flex text-[10px] font-bold text-[#374151] my-0.5">
        <span className="flex-1">ITEM</span>
        <span className="w-7 text-right">QTY</span>
        <span className="w-14 text-right">MRP</span>
        {hasAnyDiscount && <span className="w-12 text-right text-[#0F6E56]">DISC</span>}
        <span className="w-16 text-right">AMT</span>
      </div>
      <HDivider />

      {/* Items */}
      <div className="my-1.5 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-[#9ca3af] text-center">No items</p>
        ) : (
          items.map(item => {
            const itemDiscAmt = Math.max(0, item.mrp - item.unitPrice) * item.quantity
            return (
              <div key={item.id} className="flex">
                <span className="flex-1 pr-1 font-medium text-[#111827] wrap-break-word">{item.medicineName}</span>
                <span className="w-7 text-right shrink-0">{item.quantity}</span>
                <span className="w-14 text-right shrink-0">Rs {fmt(item.mrp)}</span>
                {hasAnyDiscount && (
                  <span className="w-12 text-right shrink-0 text-[#0F6E56]">
                    {itemDiscAmt > 0 ? `Rs ${fmt(itemDiscAmt)}` : '—'}
                  </span>
                )}
                <span className="w-16 text-right shrink-0">Rs {fmt(item.totalPrice)}</span>
              </div>
            )
          })
        )}
      </div>
      <HDivider />

      {/* Totals breakdown */}
      <div className="space-y-0.5 my-1.5">
        {hasAnyDiscount && (
          <TotalRow label="Gross Value (at MRP):" value={`Rs ${fmt(grossAtMRP)}`}      muted />
        )}
        {hasAnyDiscount && (
          <TotalRow label="Patient Discount:"      value={`-Rs ${fmt(patientDiscount)}`} green />
        )}
        <TotalRow label="Net Value:" value={`Rs ${fmt(netValue)}`} />
        {discountAmount > 0 && (
          <TotalRow label="Sale Discount:" value={`-Rs ${fmt(discountAmount)}`} green />
        )}
        {serviceFeeEnabled && serviceFee > 0 && (
          <TotalRow label={`${serviceFeeLabel}:`} value={`Rs ${fmt(serviceFee)}`} muted />
        )}
      </div>
      <HDivider double />

      {/* Total */}
      <div className="flex justify-between font-bold text-[13px] my-1">
        <span>TOTAL:</span>
        <span>Rs {fmt(total)}</span>
      </div>

      {/* Payment */}
      {paymentType === 'cash' && amountPaid > 0 && (
        <div className="space-y-0.5">
          <TotalRow label="Cash Received:" value={`Rs ${fmt(amountPaid)}`} />
          <TotalRow label="Change:"        value={`Rs ${fmt(change)}`} />
        </div>
      )}
      {paymentType === 'credit' && (
        <TotalRow label="Payment:" value="Credit (Udhaar)" />
      )}
      <HDivider double />

      {/* Footer */}
      <div className="text-center mt-1 text-[#6b7280]">
        <p>{receiptFooter}</p>
        {returnPolicy.trim() && (
          <p className="text-[10px] mt-1">{returnPolicy.trim()}</p>
        )}
      </div>
    </div>
  )
}
