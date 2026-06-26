'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { CartProvider }              from '@/lib/pos-context'
import { CardLayout }                from './layouts/CardLayout'
import type { CardLayoutHandle }     from './layouts/CardLayout'
import { TableLayout }               from './layouts/TableLayout'
import { MixedLayout }               from './layouts/MixedLayout'
import { CartPanel }                 from './CartPanel'
import { HoldSaleModal }             from './HoldSaleModal'
import { CheckoutModal }             from './CheckoutModal'
import { ReturnMode }                from '@/components/returns/ReturnMode'
import { usePOSHeader }              from '@/lib/pos-header-context'
import type { ParkedSale, POSMedicineResult, ReturnCredit } from '@/lib/pos-types'
import type { ShiftRow }             from '@/app/actions/shifts'

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
  { key: '/',   label: 'Focus medicine search' },
  { key: 'F4',  label: 'Hold current sale' },
  { key: 'F5',  label: 'Complete sale / checkout (card layout)' },
  { key: 'F9',  label: 'Complete sale (table / mixed layout)' },
  { key: 'F6',  label: 'Enter return mode' },
  { key: 'Esc', label: 'Exit current mode / close modal' },
  { key: '?',   label: 'Show this help' },
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

  // Ref for card layout — allows programmatic focus of the search input via F2
  const cardRef = useRef<CardLayoutHandle | null>(null)

  // ── POS header context ───────────────────────────────────────────────────

  const { setShift, setPosMode, setExitFn, layout, setLayout } = usePOSHeader()

  useEffect(() => { setShift(currentShift) }, [currentShift, setShift])

  useEffect(() => {
    setPosMode(mode === 'sale' ? 'sale' : 'return')
  }, [mode, setPosMode])

  const exitReturn = useCallback(() => { setMode('sale') }, [])

  const handleExchangeStart = useCallback((credit: ReturnCredit) => {
    setMode('sale')
    setReturnCredit(credit)
  }, [])

  useEffect(() => {
    setExitFn(exitReturn)
    return () => setExitFn(null)
  }, [exitReturn, setExitFn])

  // ── Layout persistence ───────────────────────────────────────────────────

  // Read saved layout on mount; cashierId and setLayout never change after mount
  useEffect(() => {
    const saved = localStorage.getItem(`pos_layout_${cashierId}`)
    if (saved === 'card' || saved === 'table' || saved === 'mixed') {
      setLayout(saved)
    }
  }, [cashierId, setLayout])

  // Write whenever layout changes
  useEffect(() => {
    localStorage.setItem(`pos_layout_${cashierId}`, layout)
  }, [layout, cashierId])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (showHelp) { setShowHelp(false); return }

      if (e.key === 'Escape' && mode === 'return') {
        e.preventDefault()
        setMode('sale')
        return
      }

      if (mode === 'sale') {
        if (e.key === 'F4') { e.preventDefault(); setHoldModalOpen(true) }
        // F5 = checkout only in card layout; table/mixed use F9 and handle it internally.
        // Without this guard, pressing F5 in table/mixed would open both checkout AND hold modals.
        if (e.key === 'F5' && layout === 'card') { e.preventDefault(); setCheckoutOpen(true) }
        if (e.key === 'F6') { e.preventDefault(); if (currentShift) setMode('return') }
        if (e.key === '?')  { e.preventDefault(); setShowHelp(true) }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, currentShift, showHelp, layout])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaleHeld(sale: ParkedSale) {
    setParkedSales(prev => [...prev, sale])
  }

  function handleResume(saleId: string) {
    setParkedSales(prev => prev.filter(p => p.saleId !== saleId))
  }

  // Shared props for table + mixed layouts (card uses CardLayout+CartPanel directly)
  const sharedLayoutProps = {
    initialMedicines:  initialMedicines,
    parkedSales:       parkedSales,
    onResume:          handleResume,
    maxDiscountPct:    maxDiscountPct,
    serviceFeeEnabled: serviceFeeEnabled,
    shiftOpen:         !!currentShift,
    onHold:            () => setHoldModalOpen(true),
    onCheckout:        () => setCheckoutOpen(true),
    onReturns:         () => { if (currentShift) setMode('return') },
    returnCredit:      returnCredit,
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CartProvider
      initialServiceFee={serviceFeeEnabled ? serviceFeeAmount : 0}
      initialServiceFeeLabel={serviceFeeLabel}
      initialServiceFeeEnabled={serviceFeeEnabled}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* ── Card layout: original 55/45 split — identical to pre-Phase-5B ── */}
          {layout === 'card' && (
            <div className="flex h-full gap-0 overflow-hidden" style={{ minHeight: 0 }}>
              <div
                className="flex flex-col border-r border-[rgba(0,0,0,0.08)] overflow-hidden"
                style={{ flex: '0 0 55%', padding: '16px 14px 16px 16px' }}
              >
                <CardLayout
                  ref={cardRef}
                  initialMedicines={initialMedicines}
                  parkedSales={parkedSales}
                  onResume={handleResume}
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
          )}

          {/* ── Table layout: full-width with top search bar ── */}
          {layout === 'table' && (
            <div className="h-full overflow-hidden" style={{ padding: '16px' }}>
              <TableLayout {...sharedLayoutProps} />
            </div>
          )}

          {/* ── Mixed layout: CardLayout left (60%) + compact cart right (40%) ── */}
          {layout === 'mixed' && (
            <div className="h-full overflow-hidden" style={{ padding: '16px' }}>
              <MixedLayout {...sharedLayoutProps} />
            </div>
          )}

        </div>

        {/* Return / exchange overlay — rendered above all layout variants */}
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
              background: 'white', borderRadius: 12,
              padding: '20px 24px', minWidth: 280,
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

      {/* ── Modals ── */}
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
