'use client'

import React, { useEffect } from 'react'
import type { CartItem } from '@/lib/pos-types'

interface Props {
  items:        CartItem[]
  onSelect:     (item: CartItem) => void
  onClose:      () => void
  title?:       string
  actionLabel?: string
}

export function BatchItemSelector({ items, onSelect, onClose, title, actionLabel }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      const n = parseInt(e.key, 10)
      if (!isNaN(n) && n >= 1 && n <= items.length) {
        e.preventDefault()
        onSelect(items[n - 1])
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items, onSelect, onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 1050,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 8,
          minWidth: 280, maxWidth: 360,
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px 8px',
          borderBottom: '1px solid #f3f4f6',
        }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#111827' }}>
            {title ?? 'Select Item'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>
            Press number or click to select
          </p>
        </div>

        {/* Item list */}
        <div style={{ padding: '6px 0' }}>
          {items.map((item, idx) => {
            const expiryStr = item.expiryDate
              ? new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
              : null

            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', textAlign: 'left',
                  padding: '7px 16px',
                  border: 'none', background: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {/* Number badge */}
                <span style={{
                  flexShrink: 0,
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4,
                  background: '#0F6E56', color: 'white',
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                }}>
                  {idx + 1}
                </span>

                {/* Name + batch info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontWeight: 600, fontSize: 12, color: '#111827',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.medicineName}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: '#9ca3af' }}>
                    {item.batchNo}
                    {expiryStr ? ` · ${expiryStr}` : ''}
                  </p>
                </div>

                {/* Action label */}
                <span style={{ flexShrink: 0, fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>
                  {actionLabel ?? 'Select'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid #f3f4f6',
          textAlign: 'center',
          fontSize: 10, color: '#9ca3af',
        }}>
          Esc to cancel
        </div>
      </div>
    </div>
  )
}
