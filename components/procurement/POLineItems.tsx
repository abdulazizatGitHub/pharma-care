'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Search, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FONT, TEXT, PAGE } from '@/lib/design-tokens'
import { addPOItem, removePOItem, updatePOItem } from '@/app/actions/procurement'
import type { POStatus } from '@/lib/db-types'
import type { POItemWithReceipt } from '@/app/actions/procurement'

// ─── Public types (used by server pages) ────────────────────────────────────

export interface POItemRow {
  id:           string
  medicineId:   string
  medicineName: string
  medicineCode: string | null
  quantity:     number
  unitPrice:    number
  totalPrice:   number
}

export interface MedicineLookup {
  id:   string
  name: string
  code: string | null
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface LocalItem extends POItemRow {
  isOptimistic?: boolean
  isRemoving?:   boolean
  draftQty?:     string
  draftPrice?:   string
}

interface POLineItemsProps {
  poId:                string
  status:              POStatus
  items:               POItemRow[]
  medicines:           MedicineLookup[]
  canWrite:            boolean
  receivedItems?:      POItemWithReceipt[]
  receivedItemsLoading?: boolean
}

const EDITABLE_STATUSES: POStatus[] = ['draft', 'pending_approval', 'confirmed']
const RECEIPT_STATUS_STATES: POStatus[] = ['partially_received', 'received', 'closed_short']

// ─── Add Item Form ───────────────────────────────────────────────────────────

function AddItemForm({
  poId,
  medicines,
  existingMedicineIds,
  onItemAdded,
  onDismiss,
}: {
  poId:                string
  medicines:           MedicineLookup[]
  existingMedicineIds: string[]
  onItemAdded:         (tempId: string, medicine: MedicineLookup, qty: number, price: number) => void
  onDismiss:           () => void
}) {
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<MedicineLookup | null>(null)
  const [showDrop,     setShowDrop]     = useState(false)
  const [qtyStr,       setQtyStr]       = useState('')
  const [priceStr,     setPriceStr]     = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)

  const filtered = search.trim().length >= 1
    ? medicines
        .filter(m =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          (m.code ?? '').toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 8)
    : []

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectMedicine(m: MedicineLookup) {
    setSelected(m)
    setSearch(m.name)
    setShowDrop(false)
  }

  async function handleAdd() {
    setError(null)
    if (!selected) { setError('Select a medicine first'); return }

    if (existingMedicineIds.includes(selected.id)) {
      setError('This medicine is already in the order')
      return
    }

    const qty   = parseInt(qtyStr, 10)
    const price = parseFloat(priceStr)
    if (isNaN(qty) || qty <= 0)     { setError('Quantity must be a positive integer'); return }
    if (isNaN(price) || price <= 0) { setError('Unit price must be positive'); return }

    const tempId  = `temp-${Date.now()}`
    const medicine = selected

    onItemAdded(tempId, medicine, qty, price)

    setSelected(null)
    setSearch('')
    setQtyStr('')
    setPriceStr('')
    setIsSubmitting(true)

    setTimeout(() => searchRef.current?.focus(), 50)

    addPOItem(poId, medicine.id, qty, price).then(result => {
      setIsSubmitting(false)
      if (result.error) {
        onItemAdded(`rollback:${tempId}`, medicine, qty, price)
        setError(result.error)
      } else if (result.data?.id) {
        onItemAdded(`confirm:${tempId}:${result.data.id}`, medicine, qty, price)
      }
    })
  }

  return (
    <div
      className="rounded-lg border border-dashed border-[rgba(0,0,0,0.15)] p-4 mt-3"
      style={{ background: '#fafafa' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide">Add Line Item</p>
        <button
          onClick={onDismiss}
          className="text-[11px] font-medium text-[#0F6E56] hover:underline flex items-center gap-1"
        >
          <CheckCircle2 size={12} />
          Done adding items
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative" ref={dropRef}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); setShowDrop(true) }}
              onFocus={() => search.trim() && setShowDrop(true)}
              placeholder="Search medicine name or code…"
              autoFocus
              className="h-8 w-full pl-8 pr-3 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent bg-white"
            />
          </div>
          {showDrop && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[rgba(0,0,0,0.12)] rounded-lg shadow-lg z-10 overflow-hidden">
              {filtered.map(m => (
                <button
                  key={m.id}
                  onMouseDown={e => { e.preventDefault(); selectMedicine(m) }}
                  className="w-full text-left px-3 py-2 hover:bg-[#f0fdf4] transition-colors flex items-center gap-2"
                >
                  <span className="text-[12px] text-[#111827]">{m.name}</span>
                  {m.code && <span className="text-[10px] text-[#9ca3af] font-mono">{m.code}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantity"
            type="number" min="1" step="1"
            placeholder="0"
            value={qtyStr}
            onChange={e => setQtyStr(e.target.value)}
          />
          <Input
            label="Unit price (Rs)"
            type="number" min="0" step="0.01"
            placeholder="0.00"
            value={priceStr}
            onChange={e => setPriceStr(e.target.value)}
          />
        </div>

        {error && <p className="text-[11px] text-[#A32D2D]">{error}</p>}

        <Button
          size="sm"
          icon={<Plus size={12} />}
          disabled={isSubmitting}
          onClick={handleAdd}
        >
          Add Item
        </Button>
      </div>
    </div>
  )
}

// ─── Receipt status badge ────────────────────────────────────────────────────

function ReceiptBadge({ orderedQty, receivedQty }: { orderedQty: number; receivedQty: number }) {
  if (receivedQty >= orderedQty) {
    return (
      <span
        className="inline-flex items-center rounded-full font-medium whitespace-nowrap"
        style={{ background: '#E1F5EE', color: '#0F6E56', fontSize: 10, padding: '2px 8px' }}
      >
        ✓ Fully Received
      </span>
    )
  }
  if (receivedQty > 0) {
    return (
      <span
        className="inline-flex items-center rounded-full font-medium whitespace-nowrap"
        style={{ background: '#FFF3E0', color: '#B45309', fontSize: 10, padding: '2px 8px' }}
      >
        ⚠ Partial ({receivedQty}/{orderedQty})
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-full font-medium whitespace-nowrap"
      style={{ background: '#FCEBEB', color: '#A32D2D', fontSize: 10, padding: '2px 8px' }}
    >
      ✗ Not Received
    </span>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

function toLocal(item: POItemRow): LocalItem {
  return { ...item, draftQty: String(item.quantity), draftPrice: String(item.unitPrice) }
}

export function POLineItems({
  poId,
  status,
  items,
  medicines,
  canWrite,
  receivedItems,
  receivedItemsLoading = false,
}: POLineItemsProps) {
  const [localItems,  setLocalItems]  = useState<LocalItem[]>(() => items.map(toLocal))
  const [showAddForm, setShowAddForm] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    setLocalItems(items.map(toLocal))
  }, [items])

  const isEditable      = EDITABLE_STATUSES.includes(status)
  const showReceiptMode = RECEIPT_STATUS_STATES.includes(status)

  const existingMedicineIds = localItems.map(i => i.medicineId)

  // ── Draft input helpers ──────────────────────────────────────────────────

  function setDraftQty(itemId: string, value: string) {
    setLocalItems(prev => prev.map(i => i.id !== itemId ? i : { ...i, draftQty: value }))
  }

  function setDraftPrice(itemId: string, value: string) {
    setLocalItems(prev => prev.map(i => i.id !== itemId ? i : { ...i, draftPrice: value }))
  }

  function commitQty(item: LocalItem) {
    const val = Math.round(parseFloat(item.draftQty ?? ''))
    if (!Number.isFinite(val) || val <= 0) {
      setDraftQty(item.id, String(item.quantity))
      return
    }
    if (val === item.quantity) return

    setLocalItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i, quantity: val, totalPrice: val * i.unitPrice, draftQty: String(val),
    }))
    updatePOItem(item.id, val, item.unitPrice).then(result => {
      if (result.error) {
        setLocalItems(prev => prev.map(i => i.id !== item.id ? i : {
          ...i, quantity: item.quantity, totalPrice: item.quantity * item.unitPrice, draftQty: String(item.quantity),
        }))
        setRemoveError(result.error)
      }
    })
  }

  function commitPrice(item: LocalItem) {
    const val = parseFloat(item.draftPrice ?? '')
    if (!Number.isFinite(val) || val <= 0) {
      setDraftPrice(item.id, String(item.unitPrice))
      return
    }
    if (val === item.unitPrice) return

    setLocalItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i, unitPrice: val, totalPrice: i.quantity * val, draftPrice: String(val),
    }))
    updatePOItem(item.id, item.quantity, val).then(result => {
      if (result.error) {
        setLocalItems(prev => prev.map(i => i.id !== item.id ? i : {
          ...i, unitPrice: item.unitPrice, totalPrice: item.quantity * item.unitPrice, draftPrice: String(item.unitPrice),
        }))
        setRemoveError(result.error)
      }
    })
  }

  // ── Optimistic add/remove callbacks ─────────────────────────────────────

  function handleItemMessage(signal: string, medicine: MedicineLookup, qty: number, price: number) {
    if (signal.startsWith('rollback:')) {
      const tempId = signal.slice('rollback:'.length)
      setLocalItems(prev => prev.filter(i => i.id !== tempId))
      return
    }
    if (signal.startsWith('confirm:')) {
      const parts  = signal.split(':')
      const tempId = parts[1]
      const realId = parts[2]
      setLocalItems(prev =>
        prev.map(i => i.id === tempId ? { ...i, id: realId, isOptimistic: false } : i),
      )
      return
    }
    const tempId = signal
    const newItem: LocalItem = {
      id:           tempId,
      medicineId:   medicine.id,
      medicineName: medicine.name,
      medicineCode: medicine.code,
      quantity:     qty,
      unitPrice:    price,
      totalPrice:   qty * price,
      isOptimistic: true,
    }
    setLocalItems(prev => [...prev, newItem])
  }

  function handleRemove(item: LocalItem) {
    if (item.isOptimistic) return
    setRemoveError(null)

    setLocalItems(prev => prev.filter(i => i.id !== item.id))

    removePOItem(item.id).then(result => {
      if (result.error) {
        setLocalItems(prev => {
          if (prev.find(i => i.id === item.id)) return prev
          return [...prev, item]
        })
        setRemoveError(result.error)
      }
    })
  }

  // ── Table styles ─────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    fontSize: FONT.tableHeader, fontWeight: 600, color: TEXT.secondary,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '7px 12px', textAlign: 'left', borderBottom: `1px solid ${PAGE.border}`,
    whiteSpace: 'nowrap', background: '#f9fafb',
  }

  const tdStyle: React.CSSProperties = {
    fontSize: FONT.tableCell, color: TEXT.primary,
    padding: '9px 12px', borderBottom: `1px solid ${PAGE.border}`,
    verticalAlign: 'middle',
  }

  // ── Receipt status table (partially_received / received / closed_short) ──

  if (showReceiptMode) {
    const displayItems = receivedItems ?? []
    const total = displayItems.reduce((sum, i) => sum + i.total_price, 0)

    return (
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 12 }}>Line Items</p>

        {receivedItemsLoading || displayItems.length === 0 ? (
          <div
            className="text-center rounded-lg border border-dashed border-[rgba(0,0,0,0.12)]"
            style={{ padding: '32px 16px', color: TEXT.secondary, fontSize: FONT.tableCell }}
          >
            {receivedItemsLoading ? 'Loading receipt data…' : 'No line items.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Medicine</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ordered</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Received</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td style={tdStyle}>
                      <p className="font-medium">{item.medicine_name}</p>
                      {item.medicine_code && (
                        <p className="text-[10px] text-[#9ca3af] font-mono">{item.medicine_code}</p>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{item.ordered_qty}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{item.received_qty}</td>
                    <td style={tdStyle}>
                      <ReceiptBadge orderedQty={item.ordered_qty} receivedQty={item.received_qty} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      Rs {item.unit_price.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                      Rs {item.total_price.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#f9fafb' }}>
                  <td
                    colSpan={5}
                    style={{ ...tdStyle, fontWeight: 600, textAlign: 'right', borderBottom: 'none' }}
                  >
                    Total
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right', borderBottom: 'none', fontSize: 13, color: '#0F6E56' }}>
                    Rs {total.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Editable / read-only table ────────────────────────────────────────────

  const total = localItems.reduce((sum, i) => sum + i.totalPrice, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary }}>Line Items</p>
        {isEditable && canWrite && !showAddForm && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={12} />}
            onClick={() => setShowAddForm(true)}
          >
            Add Item
          </Button>
        )}
      </div>

      {removeError && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {removeError}
        </p>
      )}

      {localItems.length === 0 ? (
        <div
          className="text-center rounded-lg border border-dashed border-[rgba(0,0,0,0.12)]"
          style={{ padding: '32px 16px', color: TEXT.secondary, fontSize: FONT.tableCell }}
        >
          No line items yet.{isEditable && canWrite ? ' Use "Add Item" above.' : ''}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Medicine</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Unit Price</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                {isEditable && canWrite && <th style={{ ...thStyle, textAlign: 'right' }}>Remove</th>}
              </tr>
            </thead>
            <tbody>
              {localItems.map(item => (
                <tr
                  key={item.id}
                  className="transition-colors"
                  style={{
                    background: item.isOptimistic ? '#f0fdf4' : undefined,
                    opacity:    item.isRemoving   ? 0.4 : 1,
                  }}
                >
                  <td style={tdStyle}>
                    <p className="font-medium">{item.medicineName}</p>
                    {item.medicineCode && (
                      <p className="text-[10px] text-[#9ca3af] font-mono">{item.medicineCode}</p>
                    )}
                    {item.isOptimistic && (
                      <p className="text-[10px] text-[#0F6E56]">Saving…</p>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {isEditable && canWrite && !item.isOptimistic ? (
                      <input
                        type="number" min="1" step="1"
                        value={item.draftQty ?? String(item.quantity)}
                        onChange={e => setDraftQty(item.id, e.target.value)}
                        onBlur={() => commitQty(item)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        style={{
                          width: 70, textAlign: 'right', fontSize: 12,
                          padding: '3px 6px', borderRadius: 5, outline: 'none',
                          border: '1px solid rgba(0,0,0,0.18)', background: '#fff',
                        }}
                        className="focus:border-[#0F6E56] focus:ring-1 focus:ring-[#0F6E56]"
                      />
                    ) : (
                      <span>{item.quantity}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {isEditable && canWrite && !item.isOptimistic ? (
                      <input
                        type="number" min="0.01" step="0.01"
                        value={item.draftPrice ?? String(item.unitPrice)}
                        onChange={e => setDraftPrice(item.id, e.target.value)}
                        onBlur={() => commitPrice(item)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        style={{
                          width: 88, textAlign: 'right', fontSize: 12,
                          padding: '3px 6px', borderRadius: 5, outline: 'none',
                          border: '1px solid rgba(0,0,0,0.18)', background: '#fff',
                        }}
                        className="focus:border-[#0F6E56] focus:ring-1 focus:ring-[#0F6E56]"
                      />
                    ) : (
                      <span>Rs {item.unitPrice.toLocaleString('en-PK', { minimumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                    Rs {item.totalPrice.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                  </td>
                  {isEditable && canWrite && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {!item.isOptimistic && (
                        <button
                          onClick={() => handleRemove(item)}
                          className="text-[#9ca3af] hover:text-[#A32D2D] transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}

              <tr style={{ background: '#f9fafb' }}>
                <td
                  colSpan={3}
                  style={{ ...tdStyle, fontWeight: 600, textAlign: 'right', borderBottom: 'none' }}
                >
                  Total
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right', borderBottom: 'none', fontSize: 13, color: '#0F6E56' }}>
                  Rs {total.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                </td>
                {isEditable && canWrite && <td style={{ ...tdStyle, borderBottom: 'none' }} />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {isEditable && canWrite && showAddForm && (
        <AddItemForm
          poId={poId}
          medicines={medicines}
          existingMedicineIds={existingMedicineIds}
          onItemAdded={handleItemMessage}
          onDismiss={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
