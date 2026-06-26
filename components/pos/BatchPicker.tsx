'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { BatchForDropdown } from '@/app/actions/stock'

interface Props {
  medicineName: string
  medicineId:   string   // passed through for caller context; not used internally
  batches:      BatchForDropdown[]
  onSelect:     (batch: BatchForDropdown) => void
  onClose:      () => void
}

function formatExpiry(expiry: string): string {
  if (!expiry) return '—'
  return new Date(expiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function expiryColor(expiry: string): string {
  if (!expiry) return 'inherit'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expiry)
  if (exp < today) return '#dc2626'
  const ninetyDays = new Date(today)
  ninetyDays.setDate(today.getDate() + 90)
  if (exp <= ninetyDays) return '#d97706'
  return 'inherit'
}

function batchDiscountLabel(batch: BatchForDropdown): string {
  if (
    batch.mrp != null &&
    batch.sale_price != null &&
    batch.mrp > batch.sale_price &&
    batch.mrp > 0
  ) {
    return Math.round(((batch.mrp - batch.sale_price) / batch.mrp) * 100) + '%'
  }
  return '—'
}

export function BatchPicker({
  medicineName,
  medicineId:   _medicineId,
  batches,
  onSelect,
  onClose,
}: Props) {
  const firstSelectable = batches.findIndex(b => b.quantity > 0)
  const [selectedIdx, setSelectedIdx] = useState(firstSelectable >= 0 ? firstSelectable : 0)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const b = batches[selectedIdx]
        if (b && b.quantity > 0) onSelect(b)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(prev => {
          let next = prev + 1
          while (next < batches.length && batches[next].quantity === 0) next++
          return next < batches.length ? next : prev
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(prev => {
          let next = prev - 1
          while (next >= 0 && batches[next].quantity === 0) next--
          return next >= 0 ? next : prev
        })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [batches, selectedIdx, onSelect, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Picker card */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: 'white',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          minWidth: 480,
          maxWidth: '90vw',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>
            Change Batch —{' '}
            <span style={{ color: '#0F6E56' }}>{medicineName}</span>
          </p>
          <button
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#6b7280',
            }}
            aria-label="Close batch picker"
          >
            <X size={14} />
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', maxHeight: '50vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                {(['Batch No', 'Expiry', 'Qty', 'Sale Price', 'MRP', 'Discount %'] as const).map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '7px 12px',
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, idx) => {
                const selectable    = batch.quantity > 0
                const isHighlighted = idx === selectedIdx && selectable

                return (
                  <tr
                    key={batch.id}
                    onClick={() => { if (selectable) onSelect(batch) }}
                    style={{
                      opacity:       selectable ? 1 : 0.4,
                      cursor:        selectable ? 'pointer' : 'not-allowed',
                      pointerEvents: selectable ? 'auto' : 'none',
                      background:    isHighlighted ? '#f0fdf4' : 'white',
                      borderBottom:  '1px solid rgba(0,0,0,0.05)',
                      outline:       isHighlighted ? '2px solid #5DCAA5' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                      {batch.batch_no}
                    </td>
                    <td style={{ padding: '9px 12px', color: expiryColor(batch.expiry_date), whiteSpace: 'nowrap' }}>
                      {formatExpiry(batch.expiry_date)}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#374151' }}>
                      {batch.quantity}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#0F6E56', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {batch.sale_price != null ? `Rs ${batch.sale_price.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {batch.mrp != null ? `Rs ${batch.mrp.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#374151' }}>
                      {batchDiscountLabel(batch)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            background: '#f9fafb',
          }}
        >
          <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, textAlign: 'center' }}>
            ↑↓ navigate · Enter to select · Esc to cancel
          </p>
        </div>
      </div>
    </>
  )
}
