'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { CartProvider } from '@/lib/pos-context'
import { SearchPanel }    from './SearchPanel'
import { CartPanel }      from './CartPanel'
import { HoldSaleModal }  from './HoldSaleModal'
import { CheckoutModal }  from './CheckoutModal'
import { ReturnMode }     from '@/components/returns/ReturnMode'
import { usePOSHeader }   from '@/lib/pos-header-context'
import type { ParkedSale, POSMedicineResult, ReturnCredit } from '@/lib/pos-types'
import type { ShiftRow } from '@/app/actions/shifts'

interface Props {
  cashierId:          string
  cashierName:        string
  pharmacyName:       string
  pharmacyAddress:    string
  headerNote:         string
  receiptFooter:      string
  returnPolicy:       string
  showCashierName:    boolean
  showReceiptNo:      boolean
  maxDiscountPct:     number
  serviceFeeEnabled:  boolean
  serviceFeeAmount:   number
  serviceFeeLabel:    string
  initialParkedSales: ParkedSale[]
  initialMedicines:   POSMedicineResult[]
  currentShift:       ShiftRow | null
}

type POSMode = 'sale' | 'return'

const SHORTCUTS = [
  { key: '/',     label: 'Focus medicine search' },
  { key: 'F4',    label: 'Hold current sale' },
  { key: 'F5',    label: 'Complete sale / checkout' },
  { key: 'F6',    label: 'Enter return mode' },
  { key: 'Esc',   label: 'Exit current mode / close modal' },
  { key: '? ',    label: 'Show this help' },
]

export function POSPage({
  cashierId,
  cashierName,
  pharmacyName,
  pharmacyAddress,
  headerNote,
  receiptFooter,
  returnPolicy,
  showCashierName,
  showReceiptNo,
  maxDiscountPct,
  serviceFeeEnabled,
  serviceFeeAmount,
  serviceFeeLabel,
  initialParkedSales,
  initialMedicines,
  currentShift,
}: Props) {
  const [parkedSales,   setParkedSales]   = useState<ParkedSale[]>(initialParkedSales)
  const [holdModalOpen, setHoldModalOpen] = useState(false)
  const [checkoutOpen,  setCheckoutOpen]  = useState(false)
  const [mode,          setMode]          = useState<POSMode>('sale')
  const [showHelp,      setShowHelp]      = useState(false)
  const [returnCredit,  setReturnCredit]  = useState<ReturnCredit | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── POS header context ───────────────────────────────────────────────────

  const { setShift, setPosMode, setExitFn } = usePOSHeader()

  // Sync shift to header
  useEffect(() => { setShift(currentShift) }, [currentShift, setShift])

  // Sync mode to header
  useEffect(() => {
    setPosMode(mode === 'sale' ? 'sale' : 'return')
  }, [mode, setPosMode])

  // Exit return overlay
  const exitReturn = useCallback(() => {
    setMode('sale')
  }, [])

  // Exchange start: close return overlay, apply return credit to cart
  const handleExchangeStart = useCallback((credit: ReturnCredit) => {
    setMode('sale')
    setReturnCredit(credit)
  }, [])

  useEffect(() => {
    setExitFn(exitReturn)
    return () => setExitFn(null)
  }, [exitReturn, setExitFn])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Dismiss help overlay on any key
      if (showHelp) { setShowHelp(false); return }

      // Return overlay: Escape closes
      if (e.key === 'Escape' && mode === 'return') {
        e.preventDefault()
        setMode('sale')
        return
      }

      // Sale mode shortcuts
      if (mode === 'sale') {
        if (e.key === 'F4') { e.preventDefault(); setHoldModalOpen(true) }
        if (e.key === 'F5') { e.preventDefault(); setCheckoutOpen(true) }
        if (e.key === 'F6') { e.preventDefault(); if (currentShift) setMode('return') }
        if (e.key === '?')  { e.preventDefault(); setShowHelp(true) }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, currentShift, showHelp])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaleHeld(sale: ParkedSale) {
    setParkedSales(prev => [...prev, sale])
  }

  function handleResume(saleId: string) {
    setParkedSales(prev => prev.filter(p => p.saleId !== saleId))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CartProvider
      initialServiceFee={serviceFeeEnabled ? serviceFeeAmount : 0}
      initialServiceFeeLabel={serviceFeeLabel}
      initialServiceFeeEnabled={serviceFeeEnabled}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        {/* POS content — always rendered */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="flex h-full gap-0 overflow-hidden" style={{ minHeight: 0 }}>
            <div
              className="flex flex-col border-r border-[rgba(0,0,0,0.08)] overflow-hidden"
              style={{ flex: '0 0 55%', padding: '16px 14px 16px 16px' }}
            >
              <SearchPanel
                initialMedicines={initialMedicines}
                parkedSales={parkedSales}
                onResume={handleResume}
                searchRef={searchInputRef}
              />
            </div>
            <div
              className="flex flex-col overflow-hidden"
              style={{ flex: '0 0 45%', padding: '16px 16px 16px 14px' }}
            >
              <CartPanel
                maxDiscountPct={maxDiscountPct}
                serviceFeeEnabled={serviceFeeEnabled}
                shiftOpen={!!currentShift}
                onHold={() => setHoldModalOpen(true)}
                onCheckout={() => setCheckoutOpen(true)}
                onReturns={() => { if (currentShift) setMode('return') }}
                returnCredit={returnCredit}
              />
            </div>
          </div>
        </div>

        {/* Return / exchange overlay */}
        {mode === 'return' && (
          <ReturnMode
            onExit={exitReturn}
            cashierId={cashierId}
            onExchangeStart={handleExchangeStart}
          />
        )}
      </div>

      {/* ── Help overlay ── */}
      {showHelp && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: '20px 24px',
              minWidth: 280,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14 }}>
              Keyboard Shortcuts
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SHORTCUTS.map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    display: 'inline-block',
                    background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 5, padding: '2px 7px',
                    fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                    color: '#374151', minWidth: 36, textAlign: 'center',
                  }}>
                    {key}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 14, textAlign: 'center' }}>
              Press any key to dismiss
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      <HoldSaleModal
        open={holdModalOpen}
        onClose={() => setHoldModalOpen(false)}
        onHeld={handleSaleHeld}
      />
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        pharmacyName={pharmacyName}
        pharmacyAddress={pharmacyAddress}
        headerNote={headerNote}
        cashierName={cashierName}
        receiptFooter={receiptFooter}
        returnPolicy={returnPolicy}
        showCashierName={showCashierName}
        showReceiptNo={showReceiptNo}
        cashierId={cashierId}
        onSaleComplete={() => setCheckoutOpen(false)}
        returnCredit={returnCredit}
        onExchangeComplete={() => setReturnCredit(null)}
      />
    </CartProvider>
  )
}
