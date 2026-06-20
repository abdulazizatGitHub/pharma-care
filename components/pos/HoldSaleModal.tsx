'use client'

import React, { useState } from 'react'
import { PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { holdSale } from '@/app/actions/sales'
import { useCart } from '@/lib/pos-context'
import type { ParkedSale } from '@/lib/pos-types'

interface Props {
  open:    boolean
  onClose: () => void
  onHeld:  (sale: ParkedSale) => void
}

export function HoldSaleModal({ open, onClose, onHeld }: Props) {
  const { items, customerId, notes, serviceFee, discountAmount, total, clearCart } = useCart()

  const defaultLabel = `Held at ${new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`
  const [label,   setLabel]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleHold() {
    if (items.length === 0) { setError('Cart is empty'); return }
    setError(null)
    setLoading(true)

    const result = await holdSale(
      items,
      label.trim() || defaultLabel,
      customerId,
      notes,
      serviceFee,
      discountAmount,
    )

    setLoading(false)

    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to hold sale')
      return
    }

    onHeld({
      saleId:    result.data.saleId,
      holdLabel: label.trim() || defaultLabel,
      itemCount: items.length,
      total,
      heldAt:    new Date().toISOString(),
    })

    clearCart()
    setLabel('')
    onClose()
  }

  function handleClose() {
    setLabel('')
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Hold Sale" size="sm">
      <div className="space-y-4">
        <p className="text-[12px] text-[#6b7280]">
          Park this sale and start a new one. The held sale can be resumed any time.
        </p>

        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
            Label (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={defaultLabel}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleHold() }}
            className="w-full h-8 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
        </div>

        <div className="flex items-center justify-between text-[12px] p-3 rounded-lg bg-[#f9fafb] border border-[rgba(0,0,0,0.06)]">
          <span className="text-[#6b7280]">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-[#0F6E56]">
            Rs {total.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {error && <p className="text-[11px] text-[#A32D2D]">⚠ {error}</p>}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleHold}
            loading={loading}
            icon={<PauseCircle size={13} />}
            className="flex-1"
          >
            Hold Sale
          </Button>
          <Button size="sm" variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
