'use client'

import React, { useState, useEffect } from 'react'
import { useCart }                     from '@/lib/pos-context'
import { useToast }                    from '@/components/ui/Toast'
import { getGenericAlternatives }      from '@/app/actions/item-report'
import { getShortcuts }               from '@/lib/pos-shortcuts'
import type { GenericAlternative }     from '@/app/actions/item-report'
import type { CartItem }               from '@/lib/pos-types'

// ─── Exported interface ───────────────────────────────────────────────────────

export interface MedicineReplacement {
  originalCartItemId: string
  newMedicineId:      string
  newMedicineName:    string
  newBatchId:         string
  newBatchNo:         string
  newExpiryDate:      string | null
  newSalePrice:       number
  newMrp:             number
  quantity:           number
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface WizardGroup {
  cartItem:   CartItem
  hasGeneric: boolean
  options:    GenericAlternative[]
}

interface ColTotals {
  gross:    number
  discount: number
  net:      number
}

interface Props {
  onClose: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_COLS  = 4
const SEL_GREEN = '#166534'   // selected-state accent — dark text on #f0fdf4 bg

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const neutralBtnStyle: React.CSSProperties = {
  border: '1px solid #dee2e6', background: '#fff',
  padding: '6px 14px', fontSize: 12, borderRadius: 4,
  cursor: 'pointer', color: '#374151',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenericComparisonWizard({ onClose }: Props) {
  const { items, removeItem, addItem } = useCart()
  const { toast } = useToast()

  const [groups,     setGroups]     = useState<WizardGroup[]>([])
  const [selections, setSelections] = useState<Record<string, number | null>>({})
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  // ── Load alternatives — snapshot at open time ─────────────────────────────

  useEffect(() => {
    const eligible = items.filter(i => !i.isBorrowed)

    if (eligible.length === 0) {
      setGroups([])
      setLoading(false)
      return
    }

    const medicineIds = [...new Set(eligible.map(i => i.medicineId))]

    getGenericAlternatives(medicineIds).then(result => {
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      const rows  = result.data ?? []
      const built: WizardGroup[] = eligible.map(cartItem => {
        const opts = rows
          .filter(r => r.originalMedId === cartItem.medicineId)
          .sort((a, b) => a.optionIndex - b.optionIndex)
          .slice(0, MAX_COLS)
        return { cartItem, hasGeneric: opts.length > 1, options: opts }
      })

      setGroups(built)
      setSelections(Object.fromEntries(built.map(g => [g.cartItem.id, null])))
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────

  const maxOptions = Math.min(MAX_COLS, Math.max(...groups.map(g => g.options.length), 1))

  const wizardShortcuts = getShortcuts('wizard')
    .filter((s, idx, arr) =>
      s.key !== 'Enter' ||
      arr.findIndex(x => x.key === 'Enter') === idx
    )

  const changeCount = groups.filter(g => {
    if (!g.hasGeneric) return false
    const sel = selections[g.cartItem.id]
    return sel !== null && sel !== undefined && sel !== 1
  }).length

  const hasChanges = changeCount > 0

  // ── Panel "selected" check ────────────────────────────────────────────────
  // A panel is selected when all relevant groups have this column's option chosen.

  function isPanelSelected(slotNum: number): boolean {
    const relevant = groups.filter(g => {
      if (!g.hasGeneric) return false
      return slotNum === 1 || g.options.some(o => o.optionIndex === slotNum)
    })
    if (relevant.length === 0) return false
    return relevant.every(g => {
      const raw = selections[g.cartItem.id]
      const eff = (raw === null || raw === undefined) ? 1 : raw
      return eff === slotNum
    })
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  function selectAll(slotNum: number) {
    setSelections(prev => {
      const next = { ...prev }
      groups.forEach(g => {
        if (!g.hasGeneric) return
        if (slotNum === 1) { next[g.cartItem.id] = null; return }
        const hasSlot = g.options.some(o => o.optionIndex === slotNum)
        if (hasSlot) next[g.cartItem.id] = slotNum
      })
      return next
    })
  }

  function selectLowest() {
    setSelections(prev => {
      const next = { ...prev }
      groups.forEach(g => {
        if (!g.hasGeneric) return
        let bestIdx: number | null = null
        let bestPrice = Infinity
        g.options.forEach(o => {
          if (o.salePrice < bestPrice) {
            bestPrice = o.salePrice
            bestIdx   = o.optionIndex === 1 ? null : o.optionIndex
          }
        })
        next[g.cartItem.id] = bestIdx
      })
      return next
    })
  }

  // ── Checkbox / Select handler ─────────────────────────────────────────────

  function handleCheckboxChange(cartItemId: string, slotNum: number, currentlySelected: boolean) {
    setSelections(prev => {
      if (currentlySelected && slotNum !== 1) {
        return { ...prev, [cartItemId]: null }         // uncheck → revert to original
      }
      if (!currentlySelected) {
        return { ...prev, [cartItemId]: slotNum === 1 ? null : slotNum }
      }
      return prev                                       // can't uncheck Original
    })
  }

  // ── Apply logic ───────────────────────────────────────────────────────────

  function buildReplacements(sels: Record<string, number | null>): {
    replacements: MedicineReplacement[]
    warnings:     string[]
  } {
    const warnings:     string[]              = []
    const replacements: MedicineReplacement[] = []

    groups.forEach(g => {
      if (!g.hasGeneric) return
      const selectedIdx = sels[g.cartItem.id]
      if (selectedIdx === null || selectedIdx === undefined || selectedIdx === 1) return
      const alt = g.options.find(o => o.optionIndex === selectedIdx)
      if (!alt) return

      const qty = Math.min(g.cartItem.quantity, alt.availableQty)
      if (qty < g.cartItem.quantity) {
        warnings.push(`${alt.medicineName}: qty capped at ${qty}`)
      }
      replacements.push({
        originalCartItemId: g.cartItem.id,
        newMedicineId:      alt.medicineId,
        newMedicineName:    alt.medicineName,
        newBatchId:         alt.batchId,
        newBatchNo:         alt.batchNo,
        newExpiryDate:      alt.expiryDate,
        newSalePrice:       alt.salePrice,
        newMrp:             alt.mrp,
        quantity:           qty,
      })
    })

    return { replacements, warnings }
  }

  function executeReplacements(replacements: MedicineReplacement[], warnings: string[]) {
    replacements.forEach(r => {
      removeItem(r.originalCartItemId)
      addItem({
        id:                 crypto.randomUUID(),
        medicineId:         r.newMedicineId,
        medicineName:       r.newMedicineName,
        batchId:            r.newBatchId,
        batchNo:            r.newBatchNo,
        expiryDate:         r.newExpiryDate,
        unitPrice:          r.newSalePrice,
        mrp:                r.newMrp,
        quantity:           r.quantity,
        discountPct:        0,
        specialDiscountPct: 0,
        totalPrice:         r.newSalePrice * r.quantity,
        isControlled:       false,
        isPrescription:     false,
        isBorrowed:         false,
      })
    })

    warnings.forEach(w => toast(w, 'error'))
    if (replacements.length > 0) {
      toast(`Cart updated with ${replacements.length} alternative(s)`, 'success')
    }
    onClose()
  }

  function handleApply() {
    const { replacements, warnings } = buildReplacements(selections)
    executeReplacements(replacements, warnings)
  }

  // Double-click header: compute effective selections without waiting for setState,
  // then apply immediately and close.
  function handleHeaderDoubleClick(slotNum: number) {
    const effectiveSels: Record<string, number | null> = { ...selections }
    groups.forEach(g => {
      if (!g.hasGeneric) return
      if (slotNum === 1) {
        effectiveSels[g.cartItem.id] = null
      } else {
        const hasSlot = g.options.some(o => o.optionIndex === slotNum)
        if (hasSlot) effectiveSels[g.cartItem.id] = slotNum
      }
    })
    const { replacements, warnings } = buildReplacements(effectiveSels)
    executeReplacements(replacements, warnings)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Skip when target is an interactive element (checkbox, button).
  // selectAll/selectLowest/handleApply close over groups (set once on mount).

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (loading || error) return

      if (e.key === '1') { e.preventDefault(); selectAll(1); return }
      if (e.key === '2' && maxOptions >= 2) { e.preventDefault(); selectAll(2); return }
      if (e.key === '3' && maxOptions >= 3) { e.preventDefault(); selectAll(3); return }
      if (e.key === '4' && maxOptions >= 4) { e.preventDefault(); selectAll(4); return }
      if (e.key === 'l' || e.key === 'L')   { e.preventDefault(); selectLowest(); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (hasChanges) handleApply()
        else onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, maxOptions, hasChanges, loading, error])

  // ── Column totals ─────────────────────────────────────────────────────────

  function computeColTotals(slotNum: number): ColTotals {
    let gross = 0, discount = 0, net = 0
    groups.forEach(g => {
      const qty = g.cartItem.quantity
      if (!g.hasGeneric) {
        gross    += g.cartItem.mrp * qty
        net      += g.cartItem.unitPrice * qty
        discount += (g.cartItem.mrp - g.cartItem.unitPrice) * qty
        return
      }
      const opt = g.options.find(o => o.optionIndex === slotNum)
      const ref = opt ?? g.options[0]
      if (ref) {
        gross    += ref.mrp * qty
        net      += ref.salePrice * qty
        discount += (ref.mrp - ref.salePrice) * qty
      }
    })
    return { gross, discount, net }
  }

  const allColTotals = Array.from({ length: maxOptions }, (_, i) => computeColTotals(i + 1))
  const minNet       = Math.min(...allColTotals.map(t => t.net))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#fff', display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Header bar ── */}
      <div style={{
        height: 50, background: '#f8f9fa',
        borderBottom: '1px solid #dee2e6', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
          Generic Alternatives Comparison
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Instruction line ── */}
      <div style={{
        padding: '6px 24px', background: '#fff',
        borderBottom: '1px solid #e5e7eb', flexShrink: 0,
      }}>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          Select items using checkboxes · Click [Select] to apply a full column · Double-click a column header to apply all items from that column immediately
        </p>
      </div>

      {/* ── Keyboard hints strip ── */}
      {!loading && !error && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12,
          padding: '6px 24px', background: '#f8f9fa',
          borderBottom: '1px solid #e5e7eb', flexShrink: 0,
          fontSize: 11, color: '#6b7280',
        }}>
          {wizardShortcuts.map((s, i) => (
            <span key={`${s.key}-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 600, fontSize: 11,
                border: '1px solid #e5e7eb', borderRadius: 4,
                padding: '2px 8px', background: '#f3f4f6',
                marginRight: 4,
              }}>
                {s.displayKey}
              </span>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {loading && (
          <div style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#6b7280',
          }}>
            Loading alternatives...
          </div>
        )}

        {error && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
            <button onClick={onClose} style={neutralBtnStyle}>Close</button>
          </div>
        )}

        {!loading && !error && (
          <div style={{ flex: 1, display: 'flex', overflowX: 'auto' }}>

            {Array.from({ length: maxOptions }, (_, colIdx) => {
              const slotNum  = colIdx + 1
              const label    = slotNum === 1 ? 'ORIGINAL PRESCRIPTION' : `GENERIC OPTION ${slotNum - 1}`
              const panelSel = isPanelSelected(slotNum)
              const totals   = allColTotals[colIdx]
              const isLowest = totals.net === minNet

              return (
                <div
                  key={slotNum}
                  style={{
                    flex: 1, minWidth: 240,
                    display: 'flex', flexDirection: 'column',
                    borderRight: colIdx < maxOptions - 1 ? '1px solid #dee2e6' : 'none',
                    borderLeft:  panelSel ? `2px solid ${SEL_GREEN}` : 'none',
                  }}
                >

                  {/* Panel header */}
                  <div
                    style={{
                      padding: '10px 16px', flexShrink: 0,
                      background:   panelSel ? '#f0fdf4' : '#f0f0f0',
                      borderBottom: panelSel ? `2px solid ${SEL_GREEN}` : '2px solid #dee2e6',
                      cursor: 'pointer', userSelect: 'none',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                    onClick={() => selectAll(slotNum)}
                    onDoubleClick={() => handleHeaderDoubleClick(slotNum)}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: panelSel ? SEL_GREEN : '#111827',
                    }}>
                      {label}
                      <span style={{
                        opacity: 0.55, fontWeight: 400, marginLeft: 6,
                        fontSize: 10, textTransform: 'none',
                      }}>
                        [{slotNum}]
                      </span>
                    </span>
                    {panelSel && (
                      <span style={{ fontSize: 10, color: SEL_GREEN }}>✓ Selected</span>
                    )}
                  </div>

                  {/* Panel body */}
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {groups.map((g, gi) => {
                      const isLast    = gi === groups.length - 1
                      const rowBorder = isLast ? 'none' : '1px solid #e5e7eb'

                      // ── No-generic row ──
                      if (!g.hasGeneric) {
                        if (slotNum === 1) {
                          return (
                            <div key={g.cartItem.id} style={{
                              padding: '12px 16px', minHeight: 80,
                              borderBottom: rowBorder, background: '#fff',
                            }}>
                              <p style={{ fontWeight: 700, fontSize: 13, color: '#111827', margin: 0 }}>
                                {g.cartItem.medicineName}
                              </p>
                              <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
                                Rs {fmt(g.cartItem.unitPrice)} · In cart
                              </p>
                            </div>
                          )
                        }
                        return (
                          <div key={g.cartItem.id} style={{
                            minHeight: 80, borderBottom: rowBorder,
                            background: '#f5f5f5',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                            <span style={{ color: '#9ca3af', fontSize: 18 }}>—</span>
                            <span style={{ color: '#9ca3af', fontSize: 10 }}>No generic</span>
                          </div>
                        )
                      }

                      // ── Generic row ──
                      const opt = g.options.find(o => o.optionIndex === slotNum)

                      // No option at this slot for this group
                      if (!opt) {
                        return (
                          <div key={g.cartItem.id} style={{
                            minHeight: 80, borderBottom: rowBorder,
                            background: '#f5f5f5',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                            <span style={{ color: '#9ca3af', fontSize: 18 }}>—</span>
                            <span style={{ color: '#9ca3af', fontSize: 10 }}>No generic</span>
                          </div>
                        )
                      }

                      const rawSel  = selections[g.cartItem.id]
                      const effSel  = (rawSel === null || rawSel === undefined) ? 1 : rawSel
                      const rowSel  = effSel === slotNum
                      const qtyWarn = opt.availableQty < g.cartItem.quantity

                      return (
                        <div key={g.cartItem.id} style={{
                          padding: '12px 16px', borderBottom: rowBorder,
                          minHeight: 80, background: '#fff',
                          display: 'flex', gap: 10,
                        }}>
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={rowSel}
                            onChange={() => handleCheckboxChange(g.cartItem.id, slotNum, rowSel)}
                            style={{
                              width: 16, height: 16,
                              accentColor: SEL_GREEN,
                              flexShrink: 0, marginTop: 2, cursor: 'pointer',
                            }}
                          />

                          {/* Content + Select button */}
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>

                              {/* Medicine info */}
                              <div style={{ flex: 1 }}>
                                <p style={{ fontWeight: 700, fontSize: 13, color: '#111827', margin: 0 }}>
                                  {opt.medicineName}
                                </p>
                                {opt.manufacturer && (
                                  <p style={{ fontSize: 12, color: '#6b7280', margin: '1px 0 0' }}>
                                    {opt.manufacturer}
                                  </p>
                                )}

                                <div style={{ marginTop: 8 }}>
                                  <span style={{ fontSize: 10, color: '#6b7280' }}>Price: </span>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                                    Rs {opt.salePrice.toFixed(2)}
                                  </span>
                                </div>

                                {opt.mrp > opt.salePrice && (
                                  <div>
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>MRP: </span>
                                    <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>
                                      Rs {opt.mrp.toFixed(2)}
                                    </span>
                                  </div>
                                )}

                                {opt.discountPct > 0 && (
                                  <p style={{ fontSize: 11, color: SEL_GREEN, fontWeight: 600, margin: '2px 0 0' }}>
                                    {opt.discountPct}% patient discount
                                  </p>
                                )}

                                <p style={{ fontSize: 11, color: '#374151', margin: '6px 0 0' }}>
                                  {g.cartItem.quantity} units × Rs {opt.salePrice.toFixed(2)} = Rs {(g.cartItem.quantity * opt.salePrice).toFixed(2)}
                                </p>

                                {qtyWarn && (
                                  <p style={{ fontSize: 11, color: '#b45309', fontWeight: 500, margin: '2px 0 0' }}>
                                    ⚠ Only {opt.availableQty} units available
                                  </p>
                                )}
                              </div>

                              {/* Select button */}
                              <button
                                onClick={() => setSelections(prev => ({
                                  ...prev,
                                  [g.cartItem.id]: slotNum === 1 ? null : slotNum,
                                }))}
                                style={rowSel
                                  ? { background: SEL_GREEN, color: '#fff', border: 'none', padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }
                                  : { background: '#fff', color: '#374151', border: '1px solid #dee2e6', padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }
                                }
                              >
                                {rowSel ? '✓ Selected' : 'Select'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Panel footer */}
                  <div style={{
                    padding: '12px 16px', flexShrink: 0,
                    borderTop: panelSel ? `2px solid ${SEL_GREEN}` : '2px solid #dee2e6',
                    background: panelSel ? '#f0fdf4' : '#f8f9fa',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{
                        fontSize: 10, textTransform: 'uppercase',
                        color: panelSel ? SEL_GREEN : '#6b7280',
                      }}>
                        Gross Value
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        Rs {fmt(totals.gross)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10, textTransform: 'uppercase',
                        color: panelSel ? SEL_GREEN : '#6b7280',
                      }}>
                        Discount
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: panelSel ? '#111827' : SEL_GREEN }}>
                        −Rs {fmt(totals.discount)}
                      </span>
                    </div>

                    <div style={{ borderTop: `1px solid ${panelSel ? '#bbf7d0' : '#dee2e6'}`, paddingTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{
                          fontSize: 11, textTransform: 'uppercase', fontWeight: 700,
                          color: panelSel ? SEL_GREEN : '#374151',
                        }}>
                          Balance
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
                          Rs {fmt(totals.net)}
                        </span>
                      </div>
                      {isLowest && (
                        <p style={{ fontSize: 10, fontWeight: 700, margin: '4px 0 0', color: SEL_GREEN }}>
                          ★ LOWEST
                        </p>
                      )}
                    </div>
                  </div>

                </div>
              )
            })}

          </div>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      {!loading && !error && (
        <div style={{
          height: 52, background: '#f8f9fa',
          borderTop: '2px solid #dee2e6', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {/* Bulk action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => selectAll(1)} style={neutralBtnStyle}>
              All Original
            </button>
            {maxOptions >= 2 && (
              <button onClick={() => selectAll(2)} style={neutralBtnStyle}>
                All Option 2
              </button>
            )}
            {maxOptions >= 3 && (
              <button onClick={() => selectAll(3)} style={neutralBtnStyle}>
                All Option 3
              </button>
            )}
            {maxOptions >= 4 && (
              <button onClick={() => selectAll(4)} style={neutralBtnStyle}>
                All Option 4
              </button>
            )}
            <button onClick={selectLowest} style={neutralBtnStyle}>
              ★ Lowest
            </button>
          </div>

          {/* Cancel / Apply */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onClose} style={neutralBtnStyle}>
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!hasChanges}
              style={{
                background:   hasChanges ? SEL_GREEN : '#9ca3af',
                color:        '#fff',
                padding:      '8px 20px',
                fontSize:     13,
                fontWeight:   600,
                borderRadius: 4,
                border:       'none',
                cursor:       hasChanges ? 'pointer' : 'not-allowed',
              }}
            >
              {hasChanges
                ? `Apply (${changeCount} change${changeCount > 1 ? 's' : ''})`
                : 'No Changes'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
