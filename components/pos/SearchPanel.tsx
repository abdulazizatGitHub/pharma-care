'use client'

import React, { useState, useRef, useCallback } from 'react'
import { MedicineSearchInput } from './MedicineSearchInput'
import { MedicineResultCard } from './MedicineResultCard'
import { ParkedSalesList } from './ParkedSalesList'
import { searchMedicinesForPOS } from '@/app/actions/sales'
import { useCart } from '@/lib/pos-context'
import { focusLastQtyInput } from '@/lib/pos-shortcuts'
import type { POSMedicineResult, ParkedSale } from '@/lib/pos-types'

interface Props {
  initialMedicines: POSMedicineResult[]
  parkedSales:      ParkedSale[]
  onResume:         (saleId: string) => void
  searchRef:        React.RefObject<HTMLInputElement | null>
}

// Flatten so each batch is its own card. MedicineResultCard always receives one batch.
// Out-of-stock medicines (batches=[]) are included as a single card with empty batches.
function flattenPerBatch(meds: POSMedicineResult[]): POSMedicineResult[] {
  return meds.flatMap(med =>
    med.batches.length > 0
      ? med.batches.map(batch => ({ ...med, batches: [batch] }))
      : [med]
  )
}

export function SearchPanel({ initialMedicines, parkedSales, onResume, searchRef }: Props) {
  const { addItem } = useCart()
  const [query,          setQuery]          = useState('')
  const [results,        setResults]        = useState<POSMedicineResult[]>([])
  const [searching,      setSearching]      = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setResults([]); return }
    setSearching(true)
    const res = await searchMedicinesForPOS(q.trim())
    setSearching(false)
    if (res.data) setResults(res.data)
  }, [])

  function handleQueryChange(q: string) {
    setQuery(q)
    setHighlightedIdx(-1)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => runSearch(q), 100)
  }

  function handleBarcodeDetected(barcode: string) {
    setQuery(barcode)
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
      if (!result.isOutOfStock && result.batches[0]) {
        const batch = result.batches[0]
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
    }
  }

  const isSearching      = query.trim().length >= 1
  const displayMedicines = isSearching ? results : initialMedicines
  const flatCards        = flattenPerBatch(displayMedicines)

  // Count how many cards share the same medicineId — used to show batch label on cards
  // when the same medicine appears as multiple batch cards.
  const medicineIdCounts = new Map<string, number>()
  flatCards.forEach(c => medicineIdCounts.set(c.medicineId, (medicineIdCounts.get(c.medicineId) ?? 0) + 1))

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <MedicineSearchInput
          value={query}
          onChange={handleQueryChange}
          onBarcodeDetected={handleBarcodeDetected}
          inputRef={searchRef}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {searching && (
          <p className="text-[12px] text-[#9ca3af] text-center pt-6">Searching…</p>
        )}

        {!searching && isSearching && flatCards.length === 0 && (
          <p className="text-[12px] text-[#9ca3af] text-center pt-6">
            No medicines found for &ldquo;{query}&rdquo;
          </p>
        )}

        {!searching && !isSearching && flatCards.length === 0 && (
          <p className="text-[12px] text-[#9ca3af] text-center pt-10">
            Search for a medicine to begin
          </p>
        )}

        {!searching && flatCards.length > 0 && (
          <>
            <p className="text-[10px] text-[#9ca3af] mb-2">
              {isSearching ? 'Search results' : 'Popular medicines'}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {flatCards.map((result, idx) => (
                <MedicineResultCard
                  key={`${result.medicineId}-${result.batches[0]?.batchId ?? idx}`}
                  result={result}
                  showBatchLabel={(medicineIdCounts.get(result.medicineId) ?? 0) > 1}
                  onAdded={handleAdded}
                  highlighted={idx === highlightedIdx}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-auto pt-2 border-t border-[rgba(0,0,0,0.06)]">
        <ParkedSalesList parkedSales={parkedSales} onResume={onResume} />
      </div>
    </div>
  )
}
