'use client'

import React, { useState } from 'react'
import { Clock } from 'lucide-react'
import { resumeHeldSale } from '@/app/actions/sales'
import { useCart } from '@/lib/pos-context'
import type { ParkedSale } from '@/lib/pos-types'

const MAX_PARKED = 5

interface Props {
  parkedSales: ParkedSale[]
  onResume:    (saleId: string) => void
}

export function ParkedSalesList({ parkedSales, onResume }: Props) {
  const { items, loadCart } = useCart()
  const [loading,  setLoading]  = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [confirm,  setConfirm]  = useState<string | null>(null)   // saleId pending confirmation

  if (parkedSales.length === 0) return null

  async function doResume(saleId: string) {
    setError(null)
    setLoading(saleId)
    const result = await resumeHeldSale(saleId)
    setLoading(null)
    setConfirm(null)
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to resume sale')
      return
    }
    loadCart(result.data.cart, saleId)
    onResume(saleId)
  }

  function handleClick(sale: ParkedSale) {
    if (items.length > 0) {
      setConfirm(sale.saleId)
      return
    }
    doResume(sale.saleId)
  }

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Clock size={11} />
        Parked ({parkedSales.length}/{MAX_PARKED})
      </p>

      {error && (
        <p className="text-[11px] text-[#A32D2D] mb-2">⚠ {error}</p>
      )}

      {confirm && (
        <div className="mb-2 p-2 rounded-lg bg-[#FAEEDA] border border-[#f3c98a] text-[11px] text-[#854F0B]">
          <p className="mb-2">Current cart has items. Resume this sale anyway? (Current cart will be lost.)</p>
          <div className="flex gap-2">
            <button
              onClick={() => doResume(confirm)}
              className="px-2 py-1 rounded bg-[#854F0B] text-white text-[10px] font-medium hover:bg-[#6b4007]"
            >
              Resume anyway
            </button>
            <button
              onClick={() => setConfirm(null)}
              className="px-2 py-1 rounded border border-[#f3c98a] text-[10px] font-medium hover:bg-[#fdf3e3]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {parkedSales.map(sale => (
          <button
            key={sale.saleId}
            onClick={() => handleClick(sale)}
            disabled={loading === sale.saleId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[rgba(0,0,0,0.12)] bg-white hover:border-[#0F6E56] hover:bg-[#E1F5EE] transition-colors disabled:opacity-50 text-left"
          >
            <div>
              <p className="text-[11px] font-medium text-[#111827]">{sale.holdLabel}</p>
              <p className="text-[10px] text-[#9ca3af]">
                Rs {sale.total.toFixed(2)} · {sale.itemCount} item{sale.itemCount !== 1 ? 's' : ''}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
