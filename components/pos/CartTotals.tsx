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
}: {
  label:       string
  value:       string
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-[#6b7280]">{label}</span>
      <span style={{ color: valueColor }}>{value}</span>
    </div>
  )
}

export function CartTotals({ serviceFeeEnabled, returnCredit }: Props) {
  const { itemCount, subtotal, discountAmount, serviceFee, serviceFeeLabel, total } = useCart()

  const creditAmount    = returnCredit?.amount ?? 0
  const effectiveTotal  = Math.max(0, total - creditAmount)
  const refundToCustomer = Math.max(0, creditAmount - total)
  const hasCredit        = creditAmount > 0

  return (
    <div className="border-t border-[rgba(0,0,0,0.08)] pt-3 space-y-1.5">
      <TotalsRow
        label={`Items (${itemCount})`}
        value={`Rs ${subtotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`}
      />
      {discountAmount > 0 && (
        <TotalsRow
          label="Discount"
          value={`-Rs ${discountAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`}
          valueColor="#0F6E56"
        />
      )}
      {serviceFeeEnabled && serviceFee > 0 && (
        <TotalsRow
          label={serviceFeeLabel}
          value={`Rs ${serviceFee.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`}
        />
      )}
      {hasCredit && (
        <TotalsRow
          label={`Return credit (${returnCredit!.returnNo})`}
          value={`-Rs ${creditAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`}
          valueColor="#D97706"
        />
      )}
      <div className="border-t border-[rgba(0,0,0,0.1)] pt-2 flex items-center justify-between">
        <span className="text-[14px] font-bold text-[#111827]">
          {hasCredit ? 'NET TOTAL' : 'TOTAL'}
        </span>
        <span className="text-[16px] font-bold" style={{ color: refundToCustomer > 0 ? '#D97706' : '#0F6E56' }}>
          {refundToCustomer > 0
            ? `-Rs ${refundToCustomer.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
            : `Rs ${effectiveTotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
          }
        </span>
      </div>
      {refundToCustomer > 0 && (
        <p style={{ fontSize: 10, color: '#D97706', textAlign: 'right' }}>
          Pharmacy refunds Rs {refundToCustomer.toLocaleString('en-PK', { minimumFractionDigits: 2 })} after exchange
        </p>
      )}
    </div>
  )
}
