'use client'

import React, { useState } from 'react'
import { ShoppingCart, PauseCircle, CheckCircle, RotateCcw, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CartItemRow } from './CartItem'
import { CartTotals } from './CartTotals'
import { LendToPharmacyModal } from './LendToPharmacyModal'
import { useCart } from '@/lib/pos-context'
import type { ReturnCredit } from '@/lib/pos-types'

function KbdBadge({ label, light = false }: { label: string; light?: boolean }) {
  return (
    <span
      style={{
        marginLeft: 'auto',
        fontSize: 9, fontWeight: 700,
        fontFamily: 'monospace',
        padding: '1px 5px',
        borderRadius: 4,
        background: light ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
        color: light ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)',
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

interface Props {
  maxDiscountPct:    number
  serviceFeeEnabled: boolean
  shiftOpen:         boolean
  onHold:            () => void
  onCheckout:        () => void
  onReturns:         () => void
  returnCredit?:     ReturnCredit | null
}

export function CartPanel({ maxDiscountPct, serviceFeeEnabled, shiftOpen, onHold, onCheckout, onReturns, returnCredit }: Props) {
  const { items } = useCart()
  const [lendModalOpen, setLendModalOpen] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Return credit banner */}
      {returnCredit && (
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', marginBottom: 6,
          borderRadius: 6,
          background: '#FFFBEB', border: '1px solid #FCD34D',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Return credit</p>
            <p style={{ fontSize: 10, color: '#92400E', fontFamily: 'monospace' }}>{returnCredit.returnNo}</p>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E', flexShrink: 0, marginLeft: 8 }}>
            -Rs {returnCredit.amount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Cart items — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[#9ca3af]">
            <ShoppingCart size={28} className="mb-2 opacity-30" />
            <p className="text-[12px]">Cart is empty</p>
            <p className="text-[10px] mt-1">Search and add medicines on the left</p>
          </div>
        ) : (
          <div>
            {items.map(item => (
              <CartItemRow key={item.id} item={item} maxDiscountPct={maxDiscountPct} />
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      {(items.length > 0 || returnCredit) && (
        <div className="mt-2">
          <CartTotals serviceFeeEnabled={serviceFeeEnabled} returnCredit={returnCredit} />
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="secondary"
          icon={<RotateCcw size={14} />}
          onClick={onReturns}
          disabled={!shiftOpen}
          title={!shiftOpen ? 'Open a shift first' : undefined}
          className="w-full"
        >
          Returns
          <KbdBadge label="F6" />
        </Button>
        <Button
          variant="secondary"
          icon={<ArrowRightLeft size={14} />}
          onClick={() => setLendModalOpen(true)}
          className="w-full"
        >
          Lend to Pharmacy
        </Button>
        <Button
          variant="secondary"
          icon={<PauseCircle size={14} />}
          onClick={onHold}
          disabled={items.length === 0}
          className="w-full"
        >
          Hold Sale
          <KbdBadge label="F4" />
        </Button>
        <Button
          icon={<CheckCircle size={14} />}
          onClick={onCheckout}
          disabled={items.length === 0 || !shiftOpen}
          title={!shiftOpen ? 'Open a shift first' : undefined}
          className="w-full"
        >
          Complete Sale →
          <KbdBadge label="F5" light />
        </Button>
      </div>
      <LendToPharmacyModal
        open={lendModalOpen}
        onClose={() => setLendModalOpen(false)}
      />
    </div>
  )
}
