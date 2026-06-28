'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, CheckCircle, PauseCircle, RotateCcw, FlaskConical, ArrowRightLeft } from 'lucide-react'
import { MedicineSearchInput }   from '@/components/pos/MedicineSearchInput'
import { CartTotals }            from '@/components/pos/CartTotals'
import { BatchPicker }           from '@/components/pos/BatchPicker'
import { BatchItemSelector }     from '@/components/pos/BatchItemSelector'
import { Button }                from '@/components/ui/Button'
import { useToast }              from '@/components/ui/Toast'
import { searchMedicinesForPOS } from '@/app/actions/sales'
import { getBatchesForMedicine } from '@/app/actions/stock'
import { useCart }               from '@/lib/pos-context'
import { focusNextQtyInput, focusLastQtyInput } from '@/lib/pos-shortcuts'
import type { BatchForDropdown } from '@/app/actions/stock'
import type { POSMedicineResult, ParkedSale, ReturnCredit, CartItem as CartItemType } from '@/lib/pos-types'

interface Props {
  // Passed for interface consistency with CardLayout; not rendered in table view
  initialMedicines:  POSMedicineResult[]
  parkedSales:       ParkedSale[]
  onResume:          (saleId: string) => void
  // Cart / checkout — same names as CartPanel
  maxDiscountPct:    number
  serviceFeeEnabled: boolean
  shiftOpen:         boolean
  onHold:            () => void
  onCheckout:        () => void
  onReturns:         () => void
  onCompareGenerics: () => void
  onLend:            () => void
  returnCredit?:     ReturnCredit | null
}

function flattenPerBatch(meds: POSMedicineResult[]): POSMedicineResult[] {
  return meds.flatMap(med =>
    med.batches.length > 0
      ? med.batches.map(batch => ({ ...med, batches: [batch] }))
      : [med]
  )
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
  { label: '#',           width: 32,      align: 'center' },
  { label: 'Product',     width: undefined, align: 'left'  },
  { label: 'Price',       width: 76,      align: 'right'  },
  { label: 'Qty',         width: 68,      align: 'center' },
  { label: 'Gross (MRP)', width: 90,      align: 'right'  },
  { label: 'Net',         width: 90,      align: 'right'  },
  { label: 'Batch',       width: 84,      align: 'left'   },
  { label: '',            width: 32,      align: 'center' },
] as const

export function TableLayout({
  initialMedicines:  _initialMedicines,
  parkedSales:       _parkedSales,
  onResume:          _onResume,
  maxDiscountPct:    _maxDiscountPct,
  serviceFeeEnabled,
  shiftOpen,
  onHold,
  onCheckout,
  onReturns,
  onCompareGenerics,
  onLend,
  returnCredit,
}: Props) {
  const { items, addItem, updateQuantity, removeItem, replaceItemBatch } = useCart()

  const searchRef = useRef<HTMLInputElement | null>(null)

  const { toast } = useToast()

  const [batchPickerItem,    setBatchPickerItem]    = useState<CartItemType | null>(null)
  const [batchPickerBatches, setBatchPickerBatches] = useState<BatchForDropdown[]>([])
  const [batchPickerLoading, setBatchPickerLoading] = useState(false)
  const [batchSelectorOpen,  setBatchSelectorOpen]  = useState(false)
  const [lastRemoved,        setLastRemoved]        = useState<CartItemType | null>(null)
  const [undoTimer,          setUndoTimer]          = useState<ReturnType<typeof setTimeout> | null>(null)
  const [deleteSelectorOpen, setDeleteSelectorOpen] = useState(false)

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

  const [query,          setQuery]          = useState('')
  const [results,        setResults]        = useState<POSMedicineResult[]>([])
  const [searching,      setSearching]      = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setResults([]); setHighlightedIdx(-1); return }
    setSearching(true)
    const res = await searchMedicinesForPOS(q.trim())
    setSearching(false)
    if (res.data) { setResults(res.data); setHighlightedIdx(-1) }
  }, [])

  function handleQueryChange(q: string) {
    setQuery(q)
    setHighlightedIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 100)
  }

  function handleBarcodeDetected(barcode: string) {
    setQuery(barcode)
    setHighlightedIdx(-1)
    runSearch(barcode)
  }

  function handleAdded() {
    setQuery('')
    setResults([])
    setHighlightedIdx(-1)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flatCards.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIdx(prev => Math.min(prev + 1, flatCards.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault()
      const result = flatCards[highlightedIdx]
      const batch  = result.batches[0]
      const isOOS  = result.isOutOfStock || !batch || batch.quantity === 0
      if (!isOOS) handleAddFromList(result)
    }
  }

  function handleAddFromList(result: POSMedicineResult) {
    const batch = result.batches[0]
    if (!batch) return
    addItem({
      id:                 crypto.randomUUID(),
      medicineId:         result.medicineId,
      medicineName:       result.medicineName,
      batchId:            batch.batchId,
      batchNo:            batch.batchNo,
      expiryDate:         batch.expiryDate,
      quantity:           1,
      unitPrice:          batch.salePrice,
      mrp:                batch.mrp,
      specialDiscountPct: 0,
      discountPct:        0,
      totalPrice:         batch.salePrice,
      isControlled:       result.schedule === 'controlled',
      isPrescription:     result.schedule === 'prescription',
    })
    focusLastQtyInput()
    handleAdded()
  }

  const isSearching = query.trim().length >= 1
  const flatCards   = flattenPerBatch(isSearching ? results : [])

  function doRemove(item: CartItemType) {
    removeItem(item.id)
    setLastRemoved(item)
    if (undoTimer) clearTimeout(undoTimer)
    const timer = setTimeout(() => setLastRemoved(null), 5000)
    setUndoTimer(timer)
    toast(`${item.medicineName} removed — press Backspace to undo`, 'info')
  }

  function doUndo() {
    if (!lastRemoved) return
    addItem(lastRemoved)
    const name = lastRemoved.medicineName
    setLastRemoved(null)
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(null)
    toast(`${name} restored`, 'success')
  }

  useEffect(() => {
    return () => { if (undoTimer) clearTimeout(undoTimer) }
  }, [undoTimer])

  // Single keyboard handler for all table-layout shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape' && isSearching) {
        e.preventDefault()
        setQuery('')
        setResults([])
        return
      }
      if (e.key === 'F4') { e.preventDefault(); onHold();     return }
      if (e.key === 'F5') { e.preventDefault(); onHold();     return } // show hold modal to resume
      if (e.key === 'F6') { e.preventDefault(); onReturns();  return }
      if (e.key === 'F9') { e.preventDefault(); onCheckout(); return }
      if (e.key === 'Delete') {
        const focused = document.activeElement as HTMLElement
        const focusedItemId = focused?.getAttribute('data-qty-input')

        if (focusedItemId) {
          const input = focused as HTMLInputElement
          const qty = parseInt(input.value, 10) || 0
          if (qty <= 1) {
            e.preventDefault()
            const item = items.find(i => i.id === focusedItemId)
            if (item) {
              doRemove(item)
              const all = Array.from(
                document.querySelectorAll<HTMLInputElement>('[data-qty-input]')
              )
              const idx = all.indexOf(input)
              const target = all[idx - 1] ?? all[0]
              if (target && target !== input) {
                setTimeout(() => { target.focus(); target.select() }, 50)
              }
            }
          }
          return
        }

        e.preventDefault()
        const nonBorrowed = items.filter(i => !i.isBorrowed)
        if (nonBorrowed.length === 0) return
        if (nonBorrowed.length === 1) {
          doRemove(nonBorrowed[0])
          return
        }
        setDeleteSelectorOpen(true)
      }
      if (e.key === 'Backspace') {
        const focused = document.activeElement
        const isInput = focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement
        if (isInput) return
        if (lastRemoved) {
          e.preventDefault()
          doUndo()
        }
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        const nonBorrowed = items.filter(i => !i.isBorrowed)
        if (nonBorrowed.length === 0) return
        if (nonBorrowed.length === 1) {
          handleChangeBatch(nonBorrowed[0])
          return
        }
        setBatchSelectorOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isSearching, items, onHold, onCheckout, onReturns, removeItem, lastRemoved])

  return (
    <>
    <div className="flex flex-col h-full">

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

      {/* Search bar — full width */}
      <div style={{ position: 'relative', flexShrink: 0, marginBottom: 10 }}>
        <MedicineSearchInput
          value={query}
          onChange={handleQueryChange}
          onBarcodeDetected={handleBarcodeDetected}
          inputRef={searchRef}
          onKeyDown={handleSearchKeyDown}
        />

        {/* Search results — compact dropdown list */}
        {isSearching && (
          <div style={{
            position:  'absolute',
            top:       'calc(100% + 4px)',
            left:      0,
            right:     0,
            zIndex:    50,
            background: 'white',
            border:    '1px solid rgba(0,0,0,0.1)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            maxHeight: 300,
            overflowY: 'auto',
          }}>
            {searching && (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: 0, padding: '12px 0' }}>
                Searching…
              </p>
            )}
            {!searching && flatCards.length === 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: 0, padding: '12px 0' }}>
                No medicines found for &ldquo;{query}&rdquo;
              </p>
            )}
            {!searching && flatCards.map((result, idx) => {
              const batch  = result.batches[0]
              const isOOS  = result.isOutOfStock || !batch || batch.quantity === 0
              const expiry = batch?.expiryDate
                ? new Date(batch.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                : null

              return (
                <div
                  key={`${result.medicineId}-${batch?.batchId ?? idx}`}
                  onClick={() => { if (!isOOS) handleAddFromList(result) }}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    padding:       '8px 12px',
                    borderBottom:  idx < flatCards.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    cursor:        isOOS ? 'default' : 'pointer',
                    opacity:       isOOS ? 0.45 : 1,
                    background:    idx === highlightedIdx ? '#f0fdf4' : 'white',
                    transition:    'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isOOS) (e.currentTarget as HTMLDivElement).style.background = '#f0fdf4' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = idx === highlightedIdx ? '#f0fdf4' : 'white' }}
                >
                  {/* Left: name + batch meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>
                      {result.medicineName}
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 6 }}>
                      {batch ? batch.batchNo : 'No batch'}
                      {expiry        ? ` · ${expiry}`          : ''}
                      {batch         ? ` · qty ${batch.quantity}` : ''}
                      {isOOS         ? ' · Out of stock'        : ''}
                    </span>
                  </div>
                  {/* Right: sale price */}
                  <span style={{ fontWeight: 700, color: '#0F6E56', fontSize: 12, marginLeft: 12, flexShrink: 0 }}>
                    {batch ? `Rs ${batch.salePrice.toFixed(2)}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Main area: cart table (65%) + right panel (35%) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 0 }}>

        {/* Cart table */}
        <div style={{ flex: '0 0 65%', display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {THEAD_COLS.map(col => (
                  <th
                    key={col.label}
                    style={{
                      width:          col.width,
                      textAlign:      col.align,
                      padding:        '6px 8px',
                      fontSize:       10,
                      fontWeight:     700,
                      color:          '#6b7280',
                      textTransform:  'uppercase',
                      letterSpacing:  '0.04em',
                      borderBottom:   '1px solid rgba(0,0,0,0.08)',
                      whiteSpace:     'nowrap',
                      position:       'sticky',
                      top:            0,
                      background:     '#f9fafb',
                      zIndex:         1,
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
                    style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 12 }}
                  >
                    Cart is empty — press F2 or type to search
                  </td>
                </tr>
              )}

              {items.map((item, idx) => {
                const gross = item.mrp * item.quantity
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    {/* # */}
                    <td style={{ textAlign: 'center', padding: '6px 8px', color: '#9ca3af', fontSize: 11 }}>
                      {idx + 1}
                    </td>

                    {/* Product name */}
                    <td style={{ padding: '6px 8px' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{item.medicineName}</span>
                        {item.isBorrowed && (
                          <span style={{
                            marginLeft: 5, fontSize: 9, fontWeight: 700,
                            background: '#FEF3C7', color: '#92400E',
                            borderRadius: 3, padding: '1px 4px',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            Borrowed
                          </span>
                        )}
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

                    {/* Sale price */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#0F6E56', fontWeight: 600 }}>
                      {item.unitPrice.toFixed(2)}
                    </td>

                    {/* Qty — editable */}
                    <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        data-qty-input={item.id}
                        onChange={e => updateQuantity(item.id, Number(e.target.value))}
                        onBlur={e => { if (Number(e.target.value) < 1) updateQuantity(item.id, 1) }}
                        onFocus={e => e.currentTarget.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusNextQtyInput(e.currentTarget as HTMLInputElement)
                          }
                        }}
                        style={{
                          width: 56, textAlign: 'center',
                          border: '1px solid #e5e7eb', borderRadius: 5,
                          padding: '3px 4px', fontSize: 12, outline: 'none',
                        }}
                      />
                    </td>

                    {/* Gross at MRP */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280' }}>
                      {gross.toFixed(2)}
                    </td>

                    {/* Net (after discounts) */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: '#111827' }}>
                      {item.totalPrice.toFixed(2)}
                    </td>

                    {/* Batch */}
                    <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {item.batchNo}
                    </td>

                    {/* Delete */}
                    <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                      <button
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.medicineName}`}
                        tabIndex={-1}
                        style={{
                          width: 24, height: 24,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 4, border: 'none', background: 'transparent',
                          cursor: 'pointer', color: '#ef4444',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* + Add medicine row */}
              <tr>
                <td colSpan={THEAD_COLS.length} style={{ padding: '6px 8px' }}>
                  <button
                    onClick={() => searchRef.current?.focus()}
                    tabIndex={-1}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#0F6E56', fontSize: 12, fontWeight: 500, padding: '2px 0',
                    }}
                  >
                    <Plus size={13} />
                    Add medicine
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right panel: totals + action buttons */}
        <div style={{
          flex: '0 0 35%',
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 14,
          borderLeft: '1px solid rgba(0,0,0,0.07)',
          minWidth: 0,
          overflowY: 'auto',
        }}>
          {(items.length > 0 || returnCredit) && (
            <CartTotals serviceFeeEnabled={serviceFeeEnabled} returnCredit={returnCredit} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto', paddingTop: 12 }}>
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
              onClick={onCompareGenerics}
              disabled={items.length === 0}
              tabIndex={-1}
              className="w-full"
            >
              Generics
              <KbdBadge label="F3" />
            </Button>
            <Button
              variant="secondary"
              icon={<ArrowRightLeft size={14} />}
              onClick={onLend}
              tabIndex={-1}
              className="w-full"
            >
              Lend to Pharmacy
              <KbdBadge label="F8" />
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
    {batchSelectorOpen && (
      <BatchItemSelector
        items={items.filter(i => !i.isBorrowed)}
        onSelect={(item) => {
          setBatchSelectorOpen(false)
          handleChangeBatch(item)
        }}
        onClose={() => setBatchSelectorOpen(false)}
        title="Change Batch"
        actionLabel="Change"
      />
    )}
    {deleteSelectorOpen && (
      <BatchItemSelector
        items={items.filter(i => !i.isBorrowed)}
        onSelect={(item) => {
          setDeleteSelectorOpen(false)
          doRemove(item)
        }}
        onClose={() => setDeleteSelectorOpen(false)}
        title="Remove Item"
        actionLabel="Remove"
      />
    )}
    </>
  )
}
