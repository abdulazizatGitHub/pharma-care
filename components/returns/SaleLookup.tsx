'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { getSaleForReturn, type SaleForReturn } from '@/app/actions/returns'

interface Props {
  currentSale:  SaleForReturn | null
  onSaleFound:  (sale: SaleForReturn) => void
}

function fmtPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function SaleLookup({ currentSale, onSaleFound }: Props) {
  const [receiptNo, setReceiptNo] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleLookup() {
    const val = receiptNo.trim()
    if (!val) { setError('Enter a receipt number'); return }
    setLoading(true)
    setError(null)
    const res = await getSaleForReturn(val)
    setLoading(false)
    if (res.error || !res.data) {
      setError(res.error ?? 'Sale not found')
      return
    }
    onSaleFound(res.data)
    setReceiptNo('')
  }

  return (
    <div className="space-y-3 shrink-0">
      {/* Search row */}
      <div>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6,
        }}>
          Find sale
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-[9px] text-[#9ca3af] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={receiptNo}
              onChange={e => { setReceiptNo(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="Receipt number (e.g. RCP-20260616-0001)"
              className="w-full h-8 pl-8 pr-3 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            />
          </div>
          <button
            type="button"
            onClick={handleLookup}
            disabled={loading}
            style={{
              height: 32, padding: '0 14px',
              borderRadius: 6,
              background: loading ? '#d1d5db' : '#0F6E56',
              color: '#fff', fontSize: 12, fontWeight: 500,
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {loading ? '…' : 'Look Up'}
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#DC2626]">
            <AlertTriangle size={11} />
            {error}
          </div>
        )}
      </div>

      {/* Sale details card */}
      {currentSale && (
        <div className="rounded-lg border border-[rgba(0,0,0,0.09)] bg-white overflow-hidden shrink-0">
          <div className="flex items-center justify-between px-3 py-2 bg-[#f8f9fb] border-b border-[rgba(0,0,0,0.07)]">
            <p style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Sale found</p>
            {currentSale.return_status === 'partial' && (
              <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-[#FEF3C7] text-[#92400E]">
                Partially returned
              </span>
            )}
          </div>
          <div className="px-3 py-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div>
              <p className="text-[10px] text-[#9ca3af]">Receipt</p>
              <p className="text-[12px] font-semibold text-[#111827]">{currentSale.receipt_no}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9ca3af]">Sale total</p>
              <p className="text-[12px] font-semibold text-[#111827]">{fmtPKR(currentSale.total_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9ca3af]">Date</p>
              <p className="text-[12px] text-[#374151]">{fmtDate(currentSale.created_at)}</p>
            </div>
            {currentSale.returned_amount > 0 && (
              <div>
                <p className="text-[10px] text-[#9ca3af]">Already returned</p>
                <p className="text-[12px] text-[#D97706]">{fmtPKR(currentSale.returned_amount)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
