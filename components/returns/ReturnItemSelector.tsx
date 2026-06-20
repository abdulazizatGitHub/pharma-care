'use client'

import React from 'react'
import { Lock } from 'lucide-react'
import type { SaleItemForReturn } from '@/app/actions/returns'

interface Props {
  items:    SaleItemForReturn[]
  selected: Map<string, number>   // saleItemId → qty (0 = deselected)
  onChange: (next: Map<string, number>) => void
}

function fmtPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ReturnItemSelector({ items, selected, onChange }: Props) {
  function setQty(itemId: string, qty: number) {
    const next = new Map(selected)
    if (qty === 0) next.delete(itemId)
    else           next.set(itemId, qty)
    onChange(next)
  }

  function toggleRow(item: SaleItemForReturn) {
    if (item.medicine_schedule === 'controlled' || item.available_to_return === 0) return
    const next = new Map(selected)
    if (next.has(item.id)) next.delete(item.id)
    else                   next.set(item.id, item.available_to_return)
    onChange(next)
  }

  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: '#6b7280', marginBottom: 8,
      }}>
        Items in this sale
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(item => {
          const isControlled  = item.medicine_schedule === 'controlled'
          const fullyReturned = item.available_to_return === 0
          const isDisabled    = isControlled || fullyReturned
          const isChecked     = selected.has(item.id)
          const currentQty    = selected.get(item.id) ?? 0

          return (
            <div
              key={item.id}
              onClick={() => !isDisabled && toggleRow(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px',
                borderRadius: 7,
                border: isDisabled
                  ? '1px solid rgba(0,0,0,0.06)'
                  : isChecked
                    ? '1.5px solid #0F6E56'
                    : '1px solid rgba(0,0,0,0.09)',
                background: isDisabled
                  ? '#f8f9fb'
                  : isChecked
                    ? '#F0FDF8'
                    : 'white',
                cursor: isDisabled ? 'default' : 'pointer',
                transition: 'border-color 0.12s, background 0.12s',
                userSelect: 'none',
              }}
            >
              {/* Checkbox / lock indicator */}
              {isControlled ? (
                <Lock
                  size={13}
                  style={{ color: '#DC2626', flexShrink: 0 }}
                  aria-label="Cannot return controlled medicines"
                />
              ) : (
                <div
                  style={{
                    width: 15, height: 15, flexShrink: 0,
                    borderRadius: 3,
                    border: isChecked ? 'none' : '1.5px solid #d1d5db',
                    background: isChecked ? '#0F6E56' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isChecked && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )}

              {/* Medicine info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: isDisabled ? '#9ca3af' : '#111827', marginBottom: 1 }}>
                  {item.medicine_name}
                </p>
                <p style={{ fontSize: 10, color: '#9ca3af' }}>
                  {item.quantity} sold
                  {item.already_returned > 0 && ` · ${item.already_returned} returned`}
                  {' · '}{fmtPKR(item.unit_price)}/unit
                  {isControlled   && <span style={{ marginLeft: 6, color: '#DC2626', fontWeight: 500 }}> Controlled — cannot return</span>}
                  {fullyReturned && !isControlled && <span style={{ marginLeft: 6, fontWeight: 500 }}> Fully returned</span>}
                </p>
              </div>

              {/* Qty dropdown + line total — only when selected */}
              {isChecked && !isDisabled && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                >
                  <select
                    value={currentQty}
                    onChange={e => setQty(item.id, Number(e.target.value))}
                    style={{
                      height: 28, padding: '0 6px',
                      borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: 11, color: '#111827', background: 'white',
                      minWidth: 50,
                    }}
                  >
                    {Array.from({ length: item.available_to_return + 1 }, (_, i) => (
                      <option key={i} value={i}>{i === 0 ? '—' : i}</option>
                    ))}
                  </select>
                  {currentQty > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', minWidth: 60, textAlign: 'right' }}>
                      {fmtPKR(currentQty * item.unit_price)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
