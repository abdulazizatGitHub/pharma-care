'use client'

import React from 'react'
import { useCart } from '@/lib/pos-context'
import type { ReturnCredit } from '@/lib/pos-types'

interface Props {
  serviceFeeEnabled: boolean
  returnCredit?:     ReturnCredit | null
}

function TotalsRow({
  label,
  value,
  valueColor = '#111827',
  muted = false,
}: {
  label:       string
  value:       string
  valueColor?: string
  muted?:      boolean
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span style={{ color: muted ? '#9ca3af' : '#6b7280' }}>{label}</span>
      <span style={{ color: valueColor }}>{value}</span>
    </div>
  )
}

export function CartTotals({ serviceFeeEnabled, returnCredit }: Props) {
  const { items, itemCount, subtotal, discountAmount, serviceFee, serviceFeeLabel, total } = useCart()

  // Gross before any discounts (at full MRP)
  const grossAtMRP      = items.reduce((sum, i) => sum + i.mrp * i.quantity, 0)
  // Patient discount: MRP → batch sale price
  const patientDiscount = items.reduce((sum, i) => sum + Math.max(0, i.mrp - i.unitPrice) * i.quantity, 0)
  // Extra discount: manual per-item override (discountPct select)
  const extraDiscount   = items.reduce((sum, i) => sum + i.quantity * i.unitPrice * (i.discountPct / 100), 0)
  // Net value = sum(totalPrice), already computed as subtotal in context
  const netValue        = subtotal

  const creditAmount     = returnCredit?.amount ?? 0
  const effectiveTotal   = Math.max(0, total - creditAmount)
  const refundToCustomer = Math.max(0, creditAmount - total)
  const hasCredit        = creditAmount > 0

  const fmt = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2 })

  return (
    <div className="border-t border-[rgba(0,0,0,0.08)] pt-3 space-y-1.5">

      {/* ── Gross + discounts breakdown ── */}
      <TotalsRow
        label="Gross Value (at MRP)"
        value={`Rs ${fmt(grossAtMRP)}`}
      />
      {patientDiscount > 0 && (
        <TotalsRow
          label="Patient Discount"
          value={`-Rs ${fmt(patientDiscount)}`}
          valueColor="#0F6E56"
        />
      )}
      {/* Phase 5B-2: replace false with permission check */}
      {false && extraDiscount > 0 && (
        <TotalsRow
          label="Extra Discount"
          value={`-Rs ${fmt(extraDiscount)}`}
          valueColor="#0F6E56"
        />
      )}

      <TotalsRow
        label={`Net Value (${itemCount} item${itemCount !== 1 ? 's' : ''})`}
        value={`Rs ${fmt(netValue)}`}
      />

      {serviceFeeEnabled && serviceFee > 0 && (
        <TotalsRow
          label={serviceFeeLabel}
          value={`Rs ${fmt(serviceFee)}`}
        />
      )}

      <TotalsRow
        label="Adv. Tax"
        value="Rs 0.00"
        muted
      />

      {/* Sale-level discount (superadmin override), shown only if non-zero */}
      {discountAmount > 0 && (
        <TotalsRow
          label="Sale Discount"
          value={`-Rs ${fmt(discountAmount)}`}
          valueColor="#0F6E56"
        />
      )}

      {hasCredit && (
        <TotalsRow
          label={`Return credit (${returnCredit!.returnNo})`}
          value={`-Rs ${fmt(creditAmount)}`}
          valueColor="#D97706"
        />
      )}

      {/* ── Grand total ── */}
      <div className="border-t border-[rgba(0,0,0,0.1)] pt-2 flex items-center justify-between">
        <span className="text-[14px] font-bold text-[#111827]">
          {hasCredit ? 'NET TOTAL' : 'TOTAL'}
        </span>
        <span className="text-[16px] font-bold" style={{ color: refundToCustomer > 0 ? '#D97706' : '#0F6E56' }}>
          {refundToCustomer > 0
            ? `-Rs ${fmt(refundToCustomer)}`
            : `Rs ${fmt(effectiveTotal)}`
          }
        </span>
      </div>

      {refundToCustomer > 0 && (
        <p style={{ fontSize: 10, color: '#D97706', textAlign: 'right' }}>
          Pharmacy refunds Rs {fmt(refundToCustomer)} after exchange
        </p>
      )}
    </div>
  )
}
