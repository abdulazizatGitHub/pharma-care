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
import GenericComparisonWizard       from '@/components/pos/generics/GenericComparisonWizard'
import CardBatchFlow                 from '@/components/pos/CardBatchFlow'
import CardRemoveFlow                from '@/components/pos/CardRemoveFlow'
import { LendToPharmacyModal }       from '@/components/pos/LendToPharmacyModal'
import { getShortcutsByCategory }    from '@/lib/pos-shortcuts'

interface Props {
  cashierId:               string
  cashierName:             string
  pharmacyName:            string
  pharmacyAddress:         string
  headerNote:              string
  receiptFooter:           string
  returnPolicy:            string
  showCashierName:         boolean
  showReceiptNo:           boolean
  maxDiscountPct:          number
  serviceFeeEnabled:       boolean
  serviceFeeAmount:        number
  serviceFeeLabel:         string
  initialParkedSales:      ParkedSale[]
  initialMedicines:        POSMedicineResult[]
  currentShift:            ShiftRow | null
  specialDiscountEnabled:  boolean
  specialDiscountType:     'percentage' | 'fixed'
  specialDiscountTiers:    number[]
  specialDiscountMaxTier:  number | null
}

type POSMode = 'sale' | 'return'

const CATEGORY_LABELS: Record<string, string> = {
  sale:       'Sale Actions',
  navigation: 'Navigation',
  cart:       'Cart & Quantities',
}
const CATEGORY_ORDER = ['sale', 'navigation', 'cart']

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
  specialDiscountEnabled,
  specialDiscountType,
  specialDiscountTiers,
  specialDiscountMaxTier,
}: Props) {
  const [parkedSales,   setParkedSales]   = useState<ParkedSale[]>(initialParkedSales)
  const [holdModalOpen,  setHoldModalOpen]  = useState(false)
  const [lendModalOpen,  setLendModalOpen]  = useState(false)
  const [wizardOpen,     setWizardOpen]     = useState(false)
  const [checkoutOpen,   setCheckoutOpen]   = useState(false)
  const [cardBatchOpen,  setCardBatchOpen]  = useState(false)
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
      if (wizardOpen) return
      if (showHelp) { setShowHelp(false); return }

      if (e.key === 'Escape' && mode === 'return') {
        e.preventDefault()
        setMode('sale')
        return
      }

      if (e.key === 'F2') {
        e.preventDefault()
        if (layout === 'card') {
          cardRef.current?.focusSearch()
        }
        // Table and Mixed layouts handle F2 internally
        return
      }

      if (mode === 'sale') {
        if (e.key === 'F3') { e.preventDefault(); setWizardOpen(true) }
        if (e.key === 'F4') { e.preventDefault(); setHoldModalOpen(true) }
        if (e.key === 'F5') { e.preventDefault(); setHoldModalOpen(true) }
        if (e.key === 'F8') { e.preventDefault(); setLendModalOpen(true) }
        if (e.key === 'F9') { e.preventDefault(); setCheckoutOpen(true) }
        if (e.key === 'F6') { e.preventDefault(); if (currentShift) setMode('return') }
        if (e.key === '?')  { e.preventDefault(); setShowHelp(true) }
        if (e.key === 'b' || e.key === 'B') {
          const focused = document.activeElement
          const hasFocusedQty = focused?.getAttribute('data-qty-input') != null
          if (hasFocusedQty) return
          // Table/Mixed handle B in their own keyboard handlers when a qty input is focused
          if (layout === 'card') {
            e.preventDefault()
            setCardBatchOpen(true)
          }
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, currentShift, showHelp, layout, wizardOpen])

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
    onHold:              () => setHoldModalOpen(true),
    onCheckout:          () => setCheckoutOpen(true),
    onReturns:           () => { if (currentShift) setMode('return') },
    onCompareGenerics:   () => setWizardOpen(true),
    onLend:              () => setLendModalOpen(true),
    returnCredit:        returnCredit,
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
                  onCompareGenerics={() => setWizardOpen(true)}
                  onLend={() => setLendModalOpen(true)}
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

        {/* Generic Alternatives wizard — rendered above layouts, inside CartProvider */}
        {wizardOpen && (
          <GenericComparisonWizard onClose={() => setWizardOpen(false)} />
        )}

        {/* Batch change flow for card layout — rendered inside CartProvider to access useCart() */}
        {layout === 'card' && cardBatchOpen && (
          <CardBatchFlow
            open={cardBatchOpen}
            onClose={() => setCardBatchOpen(false)}
          />
        )}

        {/* Delete/Backspace-undo for card layout — Table/Mixed handle their own */}
        {layout === 'card' && <CardRemoveFlow />}

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
      {showHelp && (() => {
        const grouped = getShortcutsByCategory(['pos', 'all'])

        function renderCategory(cat: string) {
          const shortcuts = grouped[cat]
          if (!shortcuts?.length) return null
          return (
            <div style={{ marginTop: 16 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 6,
              }}>
                {CATEGORY_LABELS[cat]}
              </p>
              {shortcuts.map((s, i) => (
                <div key={`${s.key}-${i}`} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4,
                }}>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 600, fontSize: 11,
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    padding: '2px 8px', background: '#f3f4f6',
                    minWidth: 32, textAlign: 'center', flexShrink: 0,
                  }}>
                    {s.displayKey}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#111827', flexShrink: 0 }}>
                    {s.label}
                  </span>
                  <span style={{ color: '#d1d5db', fontSize: 10, flexShrink: 0 }}>—</span>
                  <span style={{ fontSize: 10, color: '#6b7280' }} title={s.description}>
                    {s.description}
                  </span>
                </div>
              ))}
            </div>
          )
        }

        return (
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
                padding: '20px 24px', minWidth: 560, maxWidth: 720,
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                maxHeight: '80vh', overflowY: 'auto',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>
                  Keyboard Shortcuts
                </p>
                <button
                  onClick={() => setShowHelp(false)}
                  style={{
                    fontSize: 16, color: '#9ca3af', cursor: 'pointer',
                    background: 'none', border: 'none', lineHeight: 1, padding: '0 2px',
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Two-column grid: Sale Actions left, Navigation + Cart right */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0 32px',
                alignItems: 'start',
                marginTop: 4,
              }}>
                <div>
                  {renderCategory('sale')}
                </div>
                <div>
                  {renderCategory('navigation')}
                  {renderCategory('cart')}
                </div>
              </div>

              <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>
                Press any key or click ✕ to dismiss
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Modals ── */}
      <LendToPharmacyModal
        open={lendModalOpen}
        onClose={() => setLendModalOpen(false)}
      />
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
        specialDiscountEnabled={specialDiscountEnabled}
        specialDiscountType={specialDiscountType}
        specialDiscountTiers={specialDiscountTiers}
        specialDiscountMaxTier={specialDiscountMaxTier}
      />
    </CartProvider>
  )
}
