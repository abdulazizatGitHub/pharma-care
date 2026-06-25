'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle, ChevronDown, Plus, Lock, Loader2 } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT, PAGE } from '@/lib/design-tokens'
import { addStockBatch, getBatchesForMedicine, getNextBatchNumber } from '@/app/actions/stock'
import type { BatchForDropdown } from '@/app/actions/stock'
import type { MedicineRow, Supplier } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchMode = 'none' | 'existing' | 'new'

interface AddBatchFormProps {
  medicine:  MedicineRow
  suppliers: Supplier[]
  onClose:   () => void
  onDone:    () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtExpiry(date: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m] = date.split('-')
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function batchLabel(b: BatchForDropdown): string {
  const parts: string[] = [b.batch_no]
  parts.push(fmtExpiry(b.expiry_date))
  if (b.purchase_price != null) parts.push(`Rs ${b.purchase_price.toFixed(2)}`)
  parts.push(`${b.quantity} units`)
  return parts.join(' · ')
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddBatchForm({ medicine, suppliers, onClose, onDone }: AddBatchFormProps) {
  const router = useRouter()

  // ── Batch selector state ─────────────────────────────────────────────────
  const [mode,          setMode]          = useState<BatchMode>('none')
  const [batches,       setBatches]       = useState<BatchForDropdown[]>([])
  const [nextBatchNo,   setNextBatchNo]   = useState('')
  const [batchLoading,  setBatchLoading]  = useState(true)
  const [dropdownOpen,  setDropdownOpen]  = useState(false)
  const [batchQuery,    setBatchQuery]    = useState('')
  const dropdownRef                       = useRef<HTMLDivElement>(null)

  // ── Form fields ──────────────────────────────────────────────────────────
  const [batchNo,       setBatchNo]       = useState('')
  const [expiryDate,    setExpiryDate]    = useState('')
  const [qtyStr,        setQtyStr]        = useState('')
  const [purchasePrStr, setPurchasePrStr] = useState('')
  const [salePrStr,     setSalePrStr]     = useState('')
  const [mrpStr,        setMrpStr]        = useState(String(medicine.mrp))
  const [supplierId,    setSupplierId]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [warning,       setWarning]       = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()

  // ── Load batches + next number on mount ──────────────────────────────────
  useEffect(() => {
    let mounted = true
    async function load() {
      const [batchesRes, nextRes] = await Promise.all([
        getBatchesForMedicine(medicine.id),
        getNextBatchNumber(),
      ])
      if (!mounted) return
      setBatches(batchesRes.data)
      setNextBatchNo(nextRes.data)
      setBatchLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [medicine.id])

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Batch selection handlers ──────────────────────────────────────────────
  function selectExistingBatch(b: BatchForDropdown) {
    setMode('existing')
    setBatchNo(b.batch_no)
    setExpiryDate(b.expiry_date)
    setPurchasePrStr(b.purchase_price != null ? String(b.purchase_price) : '')
    setSalePrStr(b.sale_price != null ? String(b.sale_price) : '')
    setMrpStr(b.mrp != null ? String(b.mrp) : String(medicine.mrp))
    setSupplierId(b.supplier_id ?? '')
    setDropdownOpen(false)
    setBatchQuery('')
    setError(null)
    setWarning(null)
  }

  function selectNewBatch() {
    setMode('new')
    setBatchNo(nextBatchNo)
    setExpiryDate('')
    setPurchasePrStr('')
    setSalePrStr('')
    setMrpStr(String(medicine.mrp))
    setSupplierId('')
    setDropdownOpen(false)
    setBatchQuery('')
    setError(null)
    setWarning(null)
  }

  const filteredBatches = batches.filter(b =>
    b.batch_no.toLowerCase().includes(batchQuery.toLowerCase()),
  )

  const locked = mode === 'existing'

  // ── Styles ───────────────────────────────────────────────────────────────
  const sectionHead: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: `1px solid ${PAGE.border}`,
  }

  const lockedInput: React.CSSProperties = {
    height: 32,
    width: '100%',
    borderRadius: 6,
    padding: '0 10px',
    fontSize: 12,
    color: TEXT.secondary,
    background: '#f9fafb',
    border: '1px solid rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }

  // ── Validation ───────────────────────────────────────────────────────────
  function validate(): boolean {
    setError(null)
    setWarning(null)

    if (!batchNo) { setError('Please select a batch or create a new one'); return false }

    const qty = parseInt(qtyStr, 10)
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive integer'); return false }

    if (mode === 'new') {
      if (!expiryDate) { setError('Expiry date is required'); return false }

      const pp  = parseFloat(purchasePrStr)
      const sp  = parseFloat(salePrStr)
      const mrp = parseFloat(mrpStr)

      if (isNaN(pp) || pp <= 0)  { setError('Purchase price must be a positive number'); return false }
      if (isNaN(sp) || sp <= 0)  { setError('Sale price must be a positive number'); return false }
      if (isNaN(mrp) || mrp <= 0) { setError('MRP must be a positive number'); return false }

      const resolvedMrp = isNaN(mrp) ? medicine.mrp : mrp
      if (sp > resolvedMrp) {
        setError(`Sale price (${sp}) cannot exceed MRP (${resolvedMrp})`)
        return false
      }
      if (sp < pp) {
        setWarning(`Sale price (${sp}) is below purchase price (${pp}) — proceed with caution`)
      }
    }

    return true
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!validate()) return

    const qty = parseInt(qtyStr, 10)
    const pp  = mode === 'new' ? parseFloat(purchasePrStr) : undefined
    const sp  = mode === 'new' ? parseFloat(salePrStr)     : undefined
    const mrp = parseFloat(mrpStr)

    startTransition(async () => {
      const result = await addStockBatch({
        medicine_id:    medicine.id,
        batch_no:       batchNo,
        expiry_date:    expiryDate,
        quantity:       qty,
        purchase_price: pp,
        sale_price:     sp,
        mrp:            isNaN(mrp) ? undefined : mrp,
        supplier_id:    supplierId || undefined,
        notes:          notes.trim() || undefined,
        is_new_batch:   mode === 'new',
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onDone()
      onClose()
    })
  }

  // ── Batch selector trigger label ──────────────────────────────────────────
  const triggerLabel = mode === 'none'
    ? null
    : mode === 'new'
      ? `New batch — ${batchNo}`
      : batchLabel(batches.find(b => b.batch_no === batchNo) ?? batches[0])

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/20" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full z-70 bg-white shadow-2xl flex flex-col"
        style={{ width: 440 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div>
            <h2 className="text-[14px] font-medium text-[#111827]">Add Stock Batch</h2>
            <p className="text-[11px] text-[#6b7280] mt-0.5">{medicine.name}</p>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Section 1 — Batch */}
          <div>
            <p style={sectionHead}>Batch Details</p>
            <div className="space-y-3">

              {/* ── Batch Selector ── */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#6b7280]">
                  Batch number <span className="text-[#E24B4A]">*</span>
                </label>
                <div ref={dropdownRef} className="relative">
                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(o => !o)}
                    className="h-8 w-full rounded-md px-2.5 text-left text-[12px] bg-white border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] flex items-center justify-between"
                  >
                    {batchLoading ? (
                      <span className="flex items-center gap-2 text-[#9ca3af]">
                        <Loader2 size={11} className="animate-spin" /> Loading batches…
                      </span>
                    ) : mode === 'none' ? (
                      <span className="text-[#9ca3af]">Select existing batch or create new…</span>
                    ) : (
                      <span className={mode === 'new' ? 'text-[#0F6E56] font-medium' : 'text-[#111827] font-mono'}>
                        {triggerLabel}
                      </span>
                    )}
                    <ChevronDown size={12} className="text-[#9ca3af] shrink-0 ml-2" />
                  </button>

                  {/* Dropdown */}
                  {dropdownOpen && !batchLoading && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-[rgba(0,0,0,0.12)] rounded-md shadow-lg overflow-hidden">
                      {/* Search */}
                      {batches.length > 4 && (
                        <div className="p-2 border-b border-[rgba(0,0,0,0.06)]">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search batch…"
                            value={batchQuery}
                            onChange={e => setBatchQuery(e.target.value)}
                            className="h-7 w-full rounded px-2 text-[12px] bg-[#f9fafb] border border-[rgba(0,0,0,0.10)] focus:outline-none focus:ring-1 focus:ring-[#0F6E56]"
                          />
                        </div>
                      )}

                      {/* Existing batch options */}
                      <div className="max-h-48 overflow-y-auto">
                        {filteredBatches.length === 0 && (
                          <p className="px-3 py-2 text-[12px] text-[#9ca3af]">No batches found</p>
                        )}
                        {filteredBatches.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => selectExistingBatch(b)}
                            className="w-full text-left px-3 py-2 hover:bg-[#f3f4f6] border-b border-[rgba(0,0,0,0.04)] last:border-0"
                          >
                            <div className="font-mono text-[12px] text-[#111827] font-medium">{b.batch_no}</div>
                            <div className="text-[11px] text-[#6b7280] mt-0.5">
                              Exp {fmtExpiry(b.expiry_date)}
                              {b.purchase_price != null && ` · Rs ${b.purchase_price.toFixed(2)}`}
                              {` · ${b.quantity} units`}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* New batch option */}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={selectNewBatch}
                        disabled={!nextBatchNo}
                        className="w-full text-left px-3 py-2 border-t border-[rgba(0,0,0,0.08)] bg-[#f0fdf4] hover:bg-[#dcfce7] flex items-center gap-2"
                      >
                        <Plus size={12} className="text-[#0F6E56] shrink-0" />
                        <div>
                          <div className="text-[12px] text-[#0F6E56] font-medium">New batch</div>
                          <div className="text-[11px] text-[#6b7280]">{nextBatchNo} — auto-generated</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode indicator when existing batch is selected */}
              {mode === 'existing' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#EFF6FF] border border-[#BFDBFE]">
                  <Lock size={11} className="text-[#3B82F6] shrink-0" />
                  <p className="text-[11px] text-[#1D4ED8]">
                    Adding to existing batch. Only quantity can be changed.
                  </p>
                </div>
              )}

              {/* Batch number display when new (read-only) */}
              {mode === 'new' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#6b7280]">Generated batch number</span>
                  <div style={lockedInput}>
                    <Lock size={11} className="text-[#9ca3af] shrink-0" />
                    <span className="font-mono text-[11px]">{batchNo}</span>
                  </div>
                </div>
              )}

              <div className={`grid gap-3 ${mode === 'existing' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {/* Expiry — locked for existing */}
                {mode !== 'existing' ? (
                  <Input
                    label="Expiry date"
                    required
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    disabled={locked}
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[#6b7280]">Expiry date</span>
                    <div style={lockedInput}>
                      <Lock size={11} className="text-[#9ca3af] shrink-0" />
                      <span className="text-[12px]">{fmtExpiry(expiryDate)}</span>
                    </div>
                  </div>
                )}

                {mode !== 'none' && (
                  <Input
                    label="Quantity to add"
                    required
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={qtyStr}
                    onChange={e => setQtyStr(e.target.value)}
                  />
                )}
              </div>

              {/* Quantity on its own row when mode=existing (expiry takes the other slot) */}
              {mode === 'none' && (
                <Input
                  label="Quantity to add"
                  required
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  value={qtyStr}
                  onChange={e => setQtyStr(e.target.value)}
                  disabled
                />
              )}
            </div>
          </div>

          {/* Section 2 — Pricing */}
          {mode !== 'none' && (
            <div>
              <p style={sectionHead}>Pricing</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {locked ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-[#6b7280]">Purchase price (Rs)</span>
                        <div style={lockedInput}>
                          <Lock size={11} className="text-[#9ca3af] shrink-0" />
                          <span>{purchasePrStr || '—'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-[#6b7280]">Sale price (Rs)</span>
                        <div style={lockedInput}>
                          <Lock size={11} className="text-[#9ca3af] shrink-0" />
                          <span>{salePrStr || '—'}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        label="Purchase price (Rs)"
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={purchasePrStr}
                        onChange={e => setPurchasePrStr(e.target.value)}
                      />
                      <Input
                        label="Sale price (Rs)"
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={salePrStr}
                        onChange={e => setSalePrStr(e.target.value)}
                      />
                    </>
                  )}
                </div>
                {locked ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[#6b7280]">MRP (Rs)</span>
                    <div style={lockedInput}>
                      <Lock size={11} className="text-[#9ca3af] shrink-0" />
                      <span>{mrpStr || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <Input
                    label="MRP (Rs)"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Default: ${medicine.mrp}`}
                    value={mrpStr}
                    onChange={e => setMrpStr(e.target.value)}
                    hint="Leave unchanged to use medicine master MRP as the legal price ceiling."
                  />
                )}
              </div>
            </div>
          )}

          {/* Section 3 — Supplier & Notes */}
          {mode !== 'none' && (
            <div>
              <p style={sectionHead}>Supplier & Notes</p>
              <div className="space-y-3">
                {locked ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[#6b7280]">Supplier</span>
                    <div style={lockedInput}>
                      <Lock size={11} className="text-[#9ca3af] shrink-0" />
                      <span>
                        {supplierId
                          ? (suppliers.find(s => s.id === supplierId)?.name ?? supplierId)
                          : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Select
                    label="Supplier"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                  >
                    <option value="">— Optional —</option>
                    {suppliers.length === 0 ? (
                      <option disabled>No suppliers yet — add one first</option>
                    ) : (
                      suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    )}
                  </Select>
                )}
                <Textarea
                  label="Notes"
                  placeholder="Optional — any batch-level notes"
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {warning && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FAEEDA] border border-[#F5CC8A]">
              <AlertTriangle size={13} className="text-[#854F0B] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#854F0B]">{warning}</p>
            </div>
          )}

          {error && (
            <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            loading={isPending}
            onClick={handleSave}
            disabled={mode === 'none' || batchLoading}
          >
            {mode === 'existing' ? 'Add to Batch' : 'Add Batch'}
          </Button>
        </div>
      </div>
    </>
  )
}
