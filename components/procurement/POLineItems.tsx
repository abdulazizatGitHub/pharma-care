'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Search, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FONT, TEXT, PAGE } from '@/lib/design-tokens'
import { addPOItem, removePOItem } from '@/app/actions/procurement'
import type { POStatus } from '@/lib/db-types'

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
  isOptimistic?: boolean   // pending server confirmation
  isRemoving?:   boolean   // pending server removal
}

interface POLineItemsProps {
  poId:      string
  status:    POStatus
  items:     POItemRow[]
  medicines: MedicineLookup[]
  canWrite:  boolean
}

// ─── Add Item Form ───────────────────────────────────────────────────────────

function AddItemForm({
  poId,
  medicines,
  onItemAdded,
  onDismiss,
}: {
  poId:        string
  medicines:   MedicineLookup[]
  onItemAdded: (tempId: string, medicine: MedicineLookup, qty: number, price: number) => void
  onDismiss:   () => void
}) {
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState<MedicineLookup | null>(null)
  const [showDrop,    setShowDrop]    = useState(false)
  const [qtyStr,      setQtyStr]      = useState('')
  const [priceStr,    setPriceStr]    = useState('')
  const [error,       setError]       = useState<string | null>(null)
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

  // Close dropdown on outside click
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

    const qty   = parseInt(qtyStr, 10)
    const price = parseFloat(priceStr)
    if (isNaN(qty) || qty <= 0)     { setError('Quantity must be a positive integer'); return }
    if (isNaN(price) || price <= 0) { setError('Unit price must be positive'); return }

    const tempId = `temp-${Date.now()}`
    const medicine = selected

    // 1. Notify parent immediately — optimistic insert
    onItemAdded(tempId, medicine, qty, price)

    // 2. Clear form right away
    setSelected(null)
    setSearch('')
    setQtyStr('')
    setPriceStr('')
    setIsSubmitting(true)

    // 3. Auto-focus search for next item
    setTimeout(() => searchRef.current?.focus(), 50)

    // 4. Fire server action in background (no await at call site)
    addPOItem(poId, medicine.id, qty, price).then(result => {
      setIsSubmitting(false)
      if (result.error) {
        // Parent will roll back the optimistic item
        onItemAdded(`rollback:${tempId}`, medicine, qty, price)
        setError(result.error)
      } else if (result.data?.id) {
        // Replace temp ID with real server ID
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
        {/* Medicine typeahead */}
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function POLineItems({ poId, status, items, medicines, canWrite }: POLineItemsProps) {
  // Optimistic local state — initialized from server items prop.
  // Syncs to fresh server data only when `items` reference changes
  // (i.e. after router.refresh() from confirmPO / cancelPO / createGRN).
  const [localItems,   setLocalItems]   = useState<LocalItem[]>(items)
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [removeError,  setRemoveError]  = useState<string | null>(null)

  // Sync from server whenever parent refreshes
  useEffect(() => {
    setLocalItems(items)
  }, [items])

  const isDraft = status === 'draft'

  // ── Optimistic add callback from AddItemForm ─────────────────────────────
  //
  // The form passes 3 kinds of messages via the same callback:
  //   tempId starting with "rollback:" → remove the item that failed
  //   tempId starting with "confirm:"  → replace temp ID with real ID
  //   plain tempId                     → insert a new optimistic item
  function handleItemMessage(
    signal:   string,
    medicine: MedicineLookup,
    qty:      number,
    price:    number,
  ) {
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

    // Plain tempId — insert optimistic item
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

  // ── Optimistic remove ────────────────────────────────────────────────────

  function handleRemove(item: LocalItem) {
    if (item.isOptimistic) return  // can't remove a not-yet-confirmed item
    setRemoveError(null)

    // Immediately remove from local state
    setLocalItems(prev => prev.filter(i => i.id !== item.id))

    // Fire server action in background
    removePOItem(item.id).then(result => {
      if (result.error) {
        // Restore the item on failure
        setLocalItems(prev => {
          // Avoid double-insert if somehow it's already back
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

  const total = localItems.reduce((sum, i) => sum + i.totalPrice, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary }}>Line Items</p>
        {isDraft && canWrite && !showAddForm && (
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
          No line items yet.{isDraft && canWrite ? ' Use "Add Item" above.' : ''}
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
                {isDraft && canWrite && <th style={{ ...thStyle, textAlign: 'right' }}>Remove</th>}
              </tr>
            </thead>
            <tbody>
              {localItems.map(item => (
                <tr
                  key={item.id}
                  className="transition-colors"
                  style={{
                    background:   item.isOptimistic ? '#f0fdf4' : undefined,
                    opacity:      item.isRemoving   ? 0.4 : 1,
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
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    Rs {item.unitPrice.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                    Rs {item.totalPrice.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                  </td>
                  {isDraft && canWrite && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {/* Can't remove an unconfirmed optimistic item */}
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

              {/* Running total */}
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
                {isDraft && canWrite && <td style={{ ...tdStyle, borderBottom: 'none' }} />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {isDraft && canWrite && showAddForm && (
        <AddItemForm
          poId={poId}
          medicines={medicines}
          onItemAdded={handleItemMessage}
          onDismiss={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
