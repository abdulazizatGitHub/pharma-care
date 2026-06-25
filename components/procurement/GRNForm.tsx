'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Package, Lock, ChevronDown } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT, FONT, PAGE } from '@/lib/design-tokens'
import { createGRN } from '@/app/actions/procurement'
import { getBatchesForMedicine, getNextBatchNumber } from '@/app/actions/stock'
import type { GRNItemInput } from '@/app/actions/procurement'
import type { BatchForDropdown } from '@/app/actions/stock'

export interface GRNLineItem {
  poItemId:      string
  medicineId:    string
  medicineName:  string
  orderedQty:    number
  unitPrice:     number
}

interface GRNFormProps {
  poId:      string
  lineItems: GRNLineItem[]
  onClose:   () => void
}

type BatchMode = 'none' | 'existing' | 'new'

interface RowData {
  batchMode:       BatchMode
  selectedBatchId: string | null
  batchNo:         string
  expiryDate:      string
  receivedQty:     string
  unitPrice:       string
  batches:         BatchForDropdown[]
  loaded:          boolean
}

function computeBatchNo(base: number, offset: number): string {
  const year = new Date().getFullYear()
  return `BTH-${year}-${String(base + offset).padStart(4, '0')}`
}

function recomputeNewBatchNos(rows: RowData[], base: number): RowData[] {
  let offset = 0
  return rows.map(row => {
    if (row.batchMode !== 'new') return row
    const batchNo = computeBatchNo(base, offset)
    offset++
    return { ...row, batchNo }
  })
}

function fmtExpiry(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' })
}

const lockedField = (value: string): React.ReactNode => (
  <div style={{
    height: 36, display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 10px', borderRadius: 6,
    background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.1)',
    fontSize: 12, color: '#374151',
  }}>
    <Lock size={11} style={{ color: '#9ca3af', flexShrink: 0 }} />
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
  </div>
)

export function GRNForm({ poId, lineItems, onClose }: GRNFormProps) {
  const router = useRouter()

  const initRow = (): RowData => ({
    batchMode: 'none', selectedBatchId: null,
    batchNo: '', expiryDate: '', receivedQty: '', unitPrice: '',
    batches: [], loaded: false,
  })

  const [rows,             setRows]             = useState<RowData[]>(() => lineItems.map(initRow))
  const [nextBatchBase,    setNextBatchBase]    = useState<number>(0)
  const [batchBaseLoading, setBatchBaseLoading] = useState(true)
  const [openDropIndex,    setOpenDropIndex]    = useState<number | null>(null)
  const [isPartial,        setIsPartial]        = useState(false)
  const [notes,            setNotes]            = useState('')
  const [error,            setError]            = useState<string | null>(null)
  const [isPending,        startTransition]     = useTransition()

  // Fetch next available batch number once — shared across all line items
  useEffect(() => {
    getNextBatchNumber().then(({ data }) => {
      const parts = (data ?? '').split('-')
      const num = parseInt(parts[parts.length - 1], 10)
      setNextBatchBase(isNaN(num) ? 1 : num)
      setBatchBaseLoading(false)
    })
  }, [])

  // Load existing batch options for every line item on mount
  useEffect(() => {
    async function loadAll() {
      const results = await Promise.all(
        lineItems.map(line => getBatchesForMedicine(line.medicineId)),
      )
      setRows(prev => prev.map((row, i) => ({
        ...row,
        batches:     results[i].data,
        receivedQty: String(lineItems[i].orderedQty),
        unitPrice:   lineItems[i].unitPrice > 0 ? String(lineItems[i].unitPrice) : '',
        loaded:      true,
      })))
    }
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close open dropdown on outside click
  useEffect(() => {
    if (openDropIndex === null) return
    function handler(e: MouseEvent) {
      const el = document.getElementById(`grn-batch-drop-${openDropIndex}`)
      if (el && !el.contains(e.target as Node)) setOpenDropIndex(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openDropIndex])

  function selectExisting(index: number, batch: BatchForDropdown) {
    setRows(prev => {
      const updated = prev.map((r, i) => i !== index ? r : {
        ...r,
        batchMode:       'existing' as BatchMode,
        selectedBatchId: batch.id,
        batchNo:         batch.batch_no,
        expiryDate:      batch.expiry_date.substring(0, 10),
        unitPrice:       String(batch.purchase_price != null ? batch.purchase_price : lineItems[index].unitPrice),
      })
      return recomputeNewBatchNos(updated, nextBatchBase)
    })
    setOpenDropIndex(null)
  }

  function selectNew(index: number) {
    setRows(prev => {
      const updated = prev.map((r, i) => i !== index ? r : {
        ...r,
        batchMode:       'new' as BatchMode,
        selectedBatchId: null,
        batchNo:         '',
        expiryDate:      '',
        unitPrice:       lineItems[index].unitPrice > 0 ? String(lineItems[index].unitPrice) : '',
      })
      return recomputeNewBatchNos(updated, nextBatchBase)
    })
    setOpenDropIndex(null)
  }

  function updateRow(index: number, patch: Partial<Pick<RowData, 'expiryDate' | 'receivedQty' | 'unitPrice'>>) {
    setRows(prev => prev.map((r, i) => i !== index ? r : { ...r, ...patch }))
  }

  function handleSubmit() {
    setError(null)
    const items: GRNItemInput[] = []

    for (let i = 0; i < lineItems.length; i++) {
      const row  = rows[i]
      const line = lineItems[i]

      if (row.batchMode === 'none') { setError(`Row ${i + 1} (${line.medicineName}): Please select a batch`); return }
      if (!row.expiryDate)          { setError(`Row ${i + 1} (${line.medicineName}): Expiry date is required`); return }

      const qty = parseInt(row.receivedQty, 10)
      const up  = parseFloat(row.unitPrice)

      if (isNaN(qty) || qty <= 0) { setError(`Row ${i + 1} (${line.medicineName}): Received qty must be positive`); return }
      if (isNaN(up)  || up  <= 0) { setError(`Row ${i + 1} (${line.medicineName}): Unit price must be positive`); return }

      items.push({
        medicine_id: line.medicineId,
        batch_no:    row.batchNo,
        expiry_date: row.expiryDate,
        quantity:    qty,
        unit_price:  up,
      })
    }

    startTransition(async () => {
      const result = await createGRN(poId, items, notes.trim() || undefined, isPartial)
      if (result.error) { setError(result.error); return }
      router.refresh()
      onClose()
    })
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: TEXT.secondary,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${PAGE.border}`,
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          className="bg-white rounded-xl shadow-2xl flex flex-col"
          style={{ width: '100%', maxWidth: 700, maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-[#0F6E56]" />
              <h2 className="text-[14px] font-medium text-[#111827]">Record Goods Receipt (GRN)</h2>
            </div>
            <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <p style={sectionHead}>Line Items — Select batch and enter received quantities</p>

            {lineItems.map((line, i) => {
              const row   = rows[i]
              const ready = row.loaded && !batchBaseLoading

              // Batch number this row would get if switched to 'new'
              const wouldBeOffset     = rows.slice(0, i).filter(r => r.batchMode === 'new').length
              const wouldBeNewBatchNo = batchBaseLoading ? '…' : computeBatchNo(nextBatchBase, wouldBeOffset)

              const triggerLabel = !ready
                ? 'Loading…'
                : row.batchMode === 'none'
                  ? '— Select batch —'
                  : row.batchMode === 'existing'
                    ? `${row.batchNo} · ${row.expiryDate ? fmtExpiry(row.expiryDate) : '?'}`
                    : `New · ${row.batchNo}`

              return (
                <div
                  key={line.poItemId}
                  className="rounded-lg border border-[rgba(0,0,0,0.08)] p-4 space-y-3"
                  style={{ background: '#fafafa' }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-[#111827]">{line.medicineName}</p>
                    <span className="text-[11px] text-[#6b7280]">Ordered: {line.orderedQty} units</span>
                  </div>

                  {/* Batch selector */}
                  <div>
                    <p className="text-[11px] font-medium text-[#374151] mb-1">
                      Batch <span className="text-[#A32D2D]">*</span>
                    </p>
                    <div className="relative" id={`grn-batch-drop-${i}`}>
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => setOpenDropIndex(openDropIndex === i ? null : i)}
                        className="h-9 w-full flex items-center justify-between gap-2 rounded-md border border-[rgba(0,0,0,0.15)] bg-white px-3 text-left text-[12px] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
                        style={{
                          color:  row.batchMode === 'none' ? '#9ca3af' : '#111827',
                          cursor: ready ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {triggerLabel}
                        </span>
                        <ChevronDown size={13} style={{ flexShrink: 0, color: '#9ca3af' }} />
                      </button>

                      {openDropIndex === i && ready && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[rgba(0,0,0,0.12)] rounded-lg shadow-lg z-10 overflow-hidden">
                          {/* Existing batches */}
                          {row.batches.length > 0 && (
                            <>
                              <p className="px-3 py-1.5 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider bg-[#f9fafb] border-b border-[rgba(0,0,0,0.06)]">
                                Existing Batches
                              </p>
                              {row.batches.map(batch => (
                                <button
                                  key={batch.id}
                                  type="button"
                                  onMouseDown={e => { e.preventDefault(); selectExisting(i, batch) }}
                                  className="w-full text-left px-3 py-2 hover:bg-[#f0fdf4] transition-colors flex items-center justify-between gap-3"
                                >
                                  <div>
                                    <p className="text-[12px] font-medium text-[#111827] font-mono">{batch.batch_no}</p>
                                    <p className="text-[10px] text-[#6b7280]">
                                      Exp: {fmtExpiry(batch.expiry_date)} · Qty: {batch.quantity}
                                    </p>
                                  </div>
                                  {batch.purchase_price != null && (
                                    <span className="text-[11px] text-[#6b7280] whitespace-nowrap">
                                      Rs {batch.purchase_price.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </button>
                              ))}
                              <div className="border-t border-[rgba(0,0,0,0.06)]" />
                            </>
                          )}

                          {/* New batch option */}
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); selectNew(i) }}
                            className="w-full text-left px-3 py-2.5 hover:bg-[#f0fdf4] transition-colors flex items-center gap-2"
                          >
                            <span className="text-[12px] font-medium text-[#0F6E56]">+ New batch</span>
                            <span className="text-[11px] text-[#6b7280] font-mono">{wouldBeNewBatchNo}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Existing batch: only qty is editable; expiry + price are locked */}
                  {row.batchMode === 'existing' && (
                    <>
                      <div className="px-3 py-2 rounded-lg bg-[#E6F1FB] border border-[#B8D6F5] text-[11px] text-[#185FA5]">
                        Adding to existing batch — only received quantity can be changed.
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[11px] font-medium text-[#374151] mb-1">Expiry date</p>
                          {lockedField(row.expiryDate ? fmtExpiry(row.expiryDate) : '')}
                        </div>
                        <Input
                          label="Received qty *"
                          type="number" min="1" step="1"
                          value={row.receivedQty}
                          onChange={e => updateRow(i, { receivedQty: e.target.value })}
                        />
                        <div>
                          <p className="text-[11px] font-medium text-[#374151] mb-1">Unit price (Rs)</p>
                          {lockedField(row.unitPrice ? `Rs ${parseFloat(row.unitPrice).toLocaleString('en-PK', { minimumFractionDigits: 2 })}` : '')}
                        </div>
                      </div>
                    </>
                  )}

                  {/* New batch: auto-generated batch_no locked; expiry + price editable */}
                  {row.batchMode === 'new' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] font-medium text-[#374151] mb-1">Batch number</p>
                        {lockedField(row.batchNo)}
                      </div>
                      <Input
                        label="Expiry date *"
                        type="date"
                        value={row.expiryDate}
                        onChange={e => updateRow(i, { expiryDate: e.target.value })}
                      />
                      <Input
                        label="Received qty *"
                        type="number" min="1" step="1"
                        value={row.receivedQty}
                        onChange={e => updateRow(i, { receivedQty: e.target.value })}
                      />
                      <Input
                        label="Unit price (Rs) *"
                        type="number" min="0.01" step="0.01"
                        value={row.unitPrice}
                        onChange={e => updateRow(i, { unitPrice: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Partial receive toggle */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
              <input
                id="is-partial"
                type="checkbox"
                checked={isPartial}
                onChange={e => setIsPartial(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[rgba(0,0,0,0.2)] accent-[#0F6E56] cursor-pointer"
              />
              <label htmlFor="is-partial" className="cursor-pointer">
                <p className="text-[12px] font-medium text-[#111827]">Mark as partial receipt</p>
                <p className="text-[11px] text-[#6b7280]">More deliveries are expected for this PO. It will remain open for additional GRNs.</p>
              </label>
            </div>

            <div>
              <p style={sectionHead}>GRN Notes</p>
              <Textarea
                label="Notes"
                placeholder="Optional — any GRN-level notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

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
            <Button className="flex-1" loading={isPending} onClick={handleSubmit}>
              {isPartial ? 'Save Partial Receipt' : 'Complete GRN'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
