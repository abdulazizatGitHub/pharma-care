'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Trash2, CheckCircle, PauseCircle, RotateCcw, FlaskConical, ArrowRightLeft } from 'lucide-react'
import { CardLayout }          from '@/components/pos/layouts/CardLayout'
import { CartTotals }          from '@/components/pos/CartTotals'
import { BatchPicker }         from '@/components/pos/BatchPicker'
import { LendToPharmacyModal } from '@/components/pos/LendToPharmacyModal'
import { Button }              from '@/components/ui/Button'
import { getBatchesForMedicine } from '@/app/actions/stock'
import { useCart }       from '@/lib/pos-context'
import type { CardLayoutHandle } from '@/components/pos/layouts/CardLayout'
import type { BatchForDropdown } from '@/app/actions/stock'
import type { POSMedicineResult, ParkedSale, ReturnCredit, CartItem as CartItemType } from '@/lib/pos-types'

interface Props {
  initialMedicines:  POSMedicineResult[]
  parkedSales:       ParkedSale[]
  onResume:          (saleId: string) => void
  maxDiscountPct:    number
  serviceFeeEnabled: boolean
  shiftOpen:         boolean
  onHold:            () => void
  onCheckout:        () => void
  onReturns:         () => void
  returnCredit?:     ReturnCredit | null
}

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

const THEAD_COLS = [
  { label: '#',    width: 28,        align: 'center' },
  { label: 'Name', width: undefined, align: 'left'   },
  { label: 'Qty',  width: 60,        align: 'center' },
  { label: 'Net',  width: 84,        align: 'right'  },
  { label: '',     width: 28,        align: 'center' },
] as const

export function MixedLayout({
  initialMedicines,
  parkedSales,
  onResume,
  maxDiscountPct:    _maxDiscountPct,
  serviceFeeEnabled,
  shiftOpen,
  onHold,
  onCheckout,
  onReturns,
  returnCredit,
}: Props) {
  const { items, updateQuantity, removeItem, replaceItemBatch } = useCart()
  const cardRef = useRef<CardLayoutHandle | null>(null)

  const [batchPickerItem,    setBatchPickerItem]    = useState<CartItemType | null>(null)
  const [batchPickerBatches, setBatchPickerBatches] = useState<BatchForDropdown[]>([])
  const [batchPickerLoading, setBatchPickerLoading] = useState(false)
  const [lendModalOpen,      setLendModalOpen]      = useState(false)

  async function handleChangeBatch(item: CartItemType) {
    setBatchPickerLoading(true)
    const { data } = await getBatchesForMedicine(item.medicineId)
    setBatchPickerLoading(false)
    if (!data || data.length === 0) return
    setBatchPickerBatches(data)
    setBatchPickerItem(item)
  }

  function handleBatchSelected(batch: BatchForDropdown) {
    if (!batchPickerItem) return
    replaceItemBatch(batchPickerItem.id, {
      batchId:      batch.id,
      batchNo:      batch.batch_no,
      expiryDate:   batch.expiry_date,
      mrp:          batch.mrp ?? batchPickerItem.mrp,
      unitPrice:    batch.sale_price ?? batchPickerItem.unitPrice,
      availableQty: batch.quantity,
    })
    setBatchPickerItem(null)
    setBatchPickerBatches([])
  }

  function closeBatchPicker() {
    setBatchPickerItem(null)
    setBatchPickerBatches([])
  }

  // Keyboard shortcuts — F2 focuses the search inside CardLayout
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); cardRef.current?.focusSearch(); return }
      if (e.key === 'F4') { e.preventDefault(); onHold();     return }
      if (e.key === 'F5') { e.preventDefault(); onHold();     return }
      if (e.key === 'F6') { e.preventDefault(); onReturns();  return }
      if (e.key === 'F9') { e.preventDefault(); onCheckout(); return }
      if (e.key === 'Delete') {
        const active = document.activeElement as HTMLInputElement | null
        const itemId = active?.dataset.qtyInput
        if (itemId) {
          const item = items.find(i => i.id === itemId)
          if (item && item.quantity <= 1) {
            e.preventDefault()
            removeItem(itemId)
          }
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items, onHold, onCheckout, onReturns, removeItem])

  return (
    <>
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>

      {/* Left 60%: CardLayout — card grid + search */}
      <div style={{ flex: '0 0 60%', minWidth: 0, overflow: 'hidden' }}>
        <CardLayout
          ref={cardRef}
          initialMedicines={initialMedicines}
          parkedSales={parkedSales}
          onResume={onResume}
        />
      </div>

      {/* Right 40%: compact cart + totals + buttons */}
      <div style={{
        flex: '0 0 40%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
        paddingLeft: 12,
        minWidth: 0,
        minHeight: 0,
      }}>

        {/* Return credit banner */}
        {returnCredit && (
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', marginBottom: 8,
            borderRadius: 6,
            background: '#FFFBEB', border: '1px solid #FCD34D',
          }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Return credit</p>
              <p style={{ fontSize: 10, color: '#92400E', fontFamily: 'monospace' }}>{returnCredit.returnNo}</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginLeft: 8 }}>
              -Rs {returnCredit.amount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* TOP: compact cart table — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {THEAD_COLS.map(col => (
                  <th
                    key={col.label}
                    style={{
                      width:         col.width,
                      textAlign:     col.align,
                      padding:       '5px 6px',
                      fontSize:      9,
                      fontWeight:    700,
                      color:         '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom:  '1px solid rgba(0,0,0,0.08)',
                      whiteSpace:    'nowrap',
                      position:      'sticky',
                      top:           0,
                      background:    '#f9fafb',
                      zIndex:        1,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={THEAD_COLS.length}
                    style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 11 }}
                  >
                    Cart is empty
                  </td>
                </tr>
              )}

              {items.map((item, idx) => {
                const expiryStr = item.expiryDate
                  ? new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                  : null

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    {/* # */}
                    <td style={{ textAlign: 'center', padding: '5px 6px', color: '#9ca3af', fontSize: 10 }}>
                      {idx + 1}
                    </td>

                    {/* Name — two lines + change batch */}
                    <td style={{ padding: '5px 6px', maxWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: '#111827', fontSize: 11 }}>
                        {item.medicineName}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.batchNo}
                        {expiryStr ? ` · ${expiryStr}` : ''}
                      </div>
                      {!item.isBorrowed && (
                        <button
                          onClick={() => handleChangeBatch(item)}
                          disabled={batchPickerLoading}
                          tabIndex={-1}
                          style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            border: '1px solid #0F6E56', color: '#0F6E56',
                            background: 'transparent', cursor: 'pointer', marginTop: 2,
                          }}
                        >
                          Change batch
                        </button>
                      )}
                    </td>

                    {/* Qty — editable */}
                    <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        data-qty-input={item.id}
                        onChange={e => updateQuantity(item.id, Number(e.target.value))}
                        onBlur={e => { if (Number(e.target.value) < 1) updateQuantity(item.id, 1) }}
                        onFocus={e => e.currentTarget.select()}
                        style={{
                          width: 44, textAlign: 'center',
                          border: '1px solid #e5e7eb', borderRadius: 4,
                          padding: '2px 3px', fontSize: 11, outline: 'none',
                        }}
                      />
                    </td>

                    {/* Net */}
                    <td style={{ textAlign: 'right', padding: '5px 6px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                      Rs {item.totalPrice.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Trash */}
                    <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                      <button
                        onClick={() => removeItem(item.id)}
                        tabIndex={-1}
                        aria-label={`Remove ${item.medicineName}`}
                        style={{
                          width: 22, height: 22,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 4, border: 'none', background: 'transparent',
                          cursor: 'pointer', color: '#ef4444',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* BOTTOM: CartTotals + action buttons */}
        <div style={{ flexShrink: 0, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          {(items.length > 0 || returnCredit) && (
            <CartTotals serviceFeeEnabled={serviceFeeEnabled} returnCredit={returnCredit} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
            <Button
              icon={<CheckCircle size={14} />}
              onClick={onCheckout}
              disabled={items.length === 0 || !shiftOpen}
              title={!shiftOpen ? 'Open a shift first' : undefined}
              tabIndex={-1}
              className="w-full"
            >
              Complete Sale
              <KbdBadge label="F9" light />
            </Button>
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              onClick={onReturns}
              disabled={!shiftOpen}
              title={!shiftOpen ? 'Open a shift first' : undefined}
              tabIndex={-1}
              className="w-full"
            >
              Returns
              <KbdBadge label="F6" />
            </Button>
            <Button
              variant="secondary"
              icon={<FlaskConical size={14} />}
              onClick={() => {}}
              disabled
              tabIndex={-1}
              className="w-full"
            >
              Generics
              <KbdBadge label="F3" />
            </Button>
            <Button
              variant="secondary"
              icon={<ArrowRightLeft size={14} />}
              onClick={() => setLendModalOpen(true)}
              tabIndex={-1}
              className="w-full"
            >
              Lend to Pharmacy
            </Button>
            <Button
              variant="secondary"
              icon={<PauseCircle size={14} />}
              onClick={onHold}
              disabled={items.length === 0}
              tabIndex={-1}
              className="w-full"
            >
              Hold Sale
              <KbdBadge label="F4" />
            </Button>
          </div>
        </div>

      </div>
    </div>

    {batchPickerItem && (
      <BatchPicker
        medicineName={batchPickerItem.medicineName}
        medicineId={batchPickerItem.medicineId}
        batches={batchPickerBatches}
        onSelect={handleBatchSelected}
        onClose={closeBatchPicker}
      />
    )}
    <LendToPharmacyModal
      open={lendModalOpen}
      onClose={() => setLendModalOpen(false)}
    />
    </>
  )
}
