'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { getBorrowingPharmacies, lendToPharmacy } from '@/app/actions/borrowing'
import { searchMedicinesForPOS } from '@/app/actions/sales'
import type { POSMedicineResult, POSBatchOption } from '@/lib/pos-types'

interface PharmacyOption {
  id:             string
  name:           string
  currentBalance: number
}

interface Props {
  open:    boolean
  onClose: () => void
}

export function LendToPharmacyModal({ open, onClose }: Props) {
  const [pharmacies,    setPharmacies]    = useState<PharmacyOption[]>([])
  const [pharmacyId,    setPharmacyId]    = useState('')
  const [loadingPharm,  setLoadingPharm]  = useState(false)

  const [medQuery,      setMedQuery]      = useState('')
  const [medResults,    setMedResults]    = useState<POSMedicineResult[]>([])
  const [searching,     setSearching]     = useState(false)
  const [selectedMed,   setSelectedMed]   = useState<POSMedicineResult | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<POSBatchOption | null>(null)

  const [qtyStr,        setQtyStr]        = useState('1')
  const [priceStr,      setPriceStr]      = useState('')
  const [notes,         setNotes]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState<string | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset and load pharmacies on open
  useEffect(() => {
    if (!open) return
    setPharmacyId('')
    setMedQuery('')
    setMedResults([])
    setSelectedMed(null)
    setSelectedBatch(null)
    setQtyStr('1')
    setPriceStr('')
    setNotes('')
    setError(null)
    setSuccess(null)

    setLoadingPharm(true)
    getBorrowingPharmacies().then(res => {
      setLoadingPharm(false)
      if (res.data) setPharmacies(res.data)
    })
  }, [open])

  // Debounced medicine search — only in-stock results
  function handleMedQuery(q: string) {
    setMedQuery(q)
    setSelectedMed(null)
    setSelectedBatch(null)
    setPriceStr('')

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (q.trim().length < 1) { setMedResults([]); return }

    debounceTimer.current = setTimeout(async () => {
      setSearching(true)
      const res = await searchMedicinesForPOS(q.trim())
      setSearching(false)
      if (res.data) {
        // Only show in-stock medicines for lending
        setMedResults(res.data.filter(m => !m.isOutOfStock))
      }
    }, 150)
  }

  function selectMedicine(med: POSMedicineResult) {
    setSelectedMed(med)
    setMedResults([])
    setMedQuery(med.medicineName)
    const batch = med.batches[0] ?? null
    setSelectedBatch(batch)
    setPriceStr(batch?.purchasePrice != null ? batch.purchasePrice.toFixed(2) : '')
    setQtyStr('1')
    setError(null)
  }

  function selectBatch(batch: POSBatchOption) {
    setSelectedBatch(batch)
    setPriceStr(batch.purchasePrice != null ? batch.purchasePrice.toFixed(2) : '')
    setError(null)
  }

  const qty      = Math.max(1, parseInt(qtyStr, 10) || 1)
  const price    = parseFloat(priceStr) || 0
  const total    = qty * price
  const maxQty   = selectedBatch?.quantity ?? 0

  const canSubmit = pharmacyId && selectedMed && selectedBatch && price > 0 && qty > 0 && qty <= maxQty

  async function handleRecord() {
    if (!canSubmit || !selectedMed || !selectedBatch) return
    setError(null)
    setSuccess(null)
    setLoading(true)

    const res = await lendToPharmacy({
      pharmacyId,
      medicineId:   selectedMed.medicineId,
      batchId:      selectedBatch.batchId,
      quantity:     qty,
      pricePerUnit: price,
      notes:        notes.trim() || undefined,
    })

    setLoading(false)

    if (res.error) {
      setError(res.error)
      return
    }

    const pharmacyName = pharmacies.find(p => p.id === pharmacyId)?.name ?? 'Pharmacy'
    setSuccess(`Lent to ${pharmacyName} — Rs ${total.toFixed(2)} recorded`)

    // Reset form fields but keep modal open so pharmacist can do another
    setSelectedMed(null)
    setSelectedBatch(null)
    setMedQuery('')
    setQtyStr('1')
    setPriceStr('')
    setNotes('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Lend to Pharmacy" size="sm">
      <div className="flex flex-col gap-4">

        {/* Pharmacy selector */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">Pharmacy</label>
          {loadingPharm ? (
            <p className="text-[11px] text-[#9ca3af]">Loading…</p>
          ) : (
            <select
              value={pharmacyId}
              onChange={e => { setPharmacyId(e.target.value); setError(null) }}
              className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            >
              <option value="">Select pharmacy…</option>
              {pharmacies.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Medicine search */}
        <div className="relative">
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">Medicine</label>
          <input
            type="text"
            value={medQuery}
            onChange={e => handleMedQuery(e.target.value)}
            placeholder="Search our inventory…"
            className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#d1d5db] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
          {(searching || medResults.length > 0) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[rgba(0,0,0,0.12)] rounded-md shadow-lg max-h-40 overflow-y-auto">
              {searching && (
                <p className="text-[11px] text-[#9ca3af] px-3 py-2">Searching…</p>
              )}
              {!searching && medResults.map(med => (
                <button
                  key={med.medicineId}
                  type="button"
                  onClick={() => selectMedicine(med)}
                  className="w-full text-left px-3 py-2 hover:bg-[#f0fdf7] text-[12px] text-[#111827] border-b border-[rgba(0,0,0,0.05)] last:border-0"
                >
                  <span className="font-medium">{med.medicineName}</span>
                  <span className="text-[#9ca3af] ml-2">({med.totalStock} units)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Batch selector (when multiple batches) */}
        {selectedMed && selectedMed.batches.length > 1 && (
          <div>
            <label className="text-[11px] font-medium text-[#6b7280] block mb-1">Batch</label>
            <select
              value={selectedBatch?.batchId ?? ''}
              onChange={e => {
                const b = selectedMed.batches.find(b => b.batchId === e.target.value)
                if (b) selectBatch(b)
              }}
              className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            >
              {selectedMed.batches.map(b => (
                <option key={b.batchId} value={b.batchId}>
                  {b.batchNo} · Exp {new Date(b.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · {b.quantity} units
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedBatch && (
          <p className="text-[10px] text-[#6b7280] -mt-2">
            Available: <span className="font-semibold text-[#111827]">{selectedBatch.quantity} units</span>
          </p>
        )}

        {/* Quantity */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            max={maxQty || undefined}
            value={qtyStr}
            onChange={e => { setQtyStr(e.target.value); setError(null) }}
            className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
          {selectedBatch && qty > maxQty && (
            <p className="text-[10px] text-[#A32D2D] mt-0.5">Exceeds available stock ({maxQty})</p>
          )}
        </div>

        {/* Price per unit */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
            Our price to them (Rs per unit)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceStr}
            onChange={e => { setPriceStr(e.target.value); setError(null) }}
            placeholder="Price we charge them"
            className="w-full h-9 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#d1d5db] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
          />
        </div>

        {/* Total */}
        {price > 0 && qty > 0 && (
          <div className="flex justify-between items-center rounded-md bg-[#f0fdf4] border border-[#86efac] px-3 py-2">
            <span className="text-[11px] text-[#6b7280]">Total receivable</span>
            <span className="text-[13px] font-bold text-[#0F6E56]">Rs {total.toFixed(2)}</span>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[11px] font-medium text-[#6b7280] block mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any remarks…"
            className="w-full px-2.5 py-2 rounded-md border border-[rgba(0,0,0,0.12)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-[#0F6E56] resize-none"
          />
        </div>

        {error   && <p className="text-[11px] text-[#A32D2D]">⚠ {error}</p>}
        {success && <p className="text-[11px] text-[#0F6E56] font-medium">✓ {success}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
            Close
          </Button>
          <Button
            onClick={handleRecord}
            loading={loading}
            disabled={!canSubmit || loading}
            className="flex-1"
          >
            Record Lending
          </Button>
        </div>
      </div>
    </Modal>
  )
}
