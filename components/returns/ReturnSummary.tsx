'use client'

import React from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { PolicyCheckCard } from './PolicyCheckCard'
import type { SaleForReturn, SaleItemForReturn, PolicyEvalResult } from '@/app/actions/returns'

interface Props {
  sale:             SaleForReturn | null
  selectedItems:    Map<string, number>
  isExchange:       boolean
  onToggleExchange: (v: boolean) => void
  policy:           PolicyEvalResult | null
  policyLoading:    boolean
  submitting:       boolean
  submitError:      string | null
  onSubmit:         () => void
  onExit:           () => void
}

function fmtPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ReturnSummary({
  sale,
  selectedItems,
  isExchange,
  onToggleExchange,
  policy,
  policyLoading,
  submitting,
  submitError,
  onSubmit,
  onExit,
}: Props) {

  if (!sale) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle size={20} style={{ color: '#d1d5db' }} />
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Look up a receipt to begin</p>
      </div>
    )
  }

  const selectedDetails: Array<{ item: SaleItemForReturn; qty: number; lineTotal: number }> = []
  for (const [itemId, qty] of Array.from(selectedItems.entries())) {
    if (qty === 0) continue
    const item = sale.items.find(i => i.id === itemId)
    if (item) selectedDetails.push({ item, qty, lineTotal: qty * item.unit_price })
  }

  const totalRefund   = selectedDetails.reduce((s, d) => s + d.lineTotal, 0)
  const hasControlled = !!(policy?.controlledItems && policy.controlledItems.length > 0)
  const hasItems      = selectedDetails.length > 0
  const canSubmit     = hasItems && !hasControlled && !submitting

  let btnText: string
  if (!hasItems) {
    btnText = 'Select items to return'
  } else if (isExchange) {
    btnText = `Process Return & Start Exchange  (credit: ${fmtPKR(totalRefund)})`
  } else {
    btnText = `Process Return — Refund ${fmtPKR(totalRefund)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Section label */}
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280' }}>
        Return Summary
      </p>

      {/* Items list */}
      <div style={{ borderRadius: 7, border: '1px solid rgba(0,0,0,0.09)', background: 'white', overflow: 'hidden' }}>
        {!hasItems ? (
          <p style={{ padding: '14px 12px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            No items selected yet
          </p>
        ) : (
          <>
            {selectedDetails.map(({ item, qty, lineTotal }) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{item.medicine_name}</p>
                  <p style={{ fontSize: 10, color: '#9ca3af' }}>×{qty} @ {fmtPKR(item.unit_price)}</p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#DC2626', marginLeft: 8, flexShrink: 0 }}>
                  − {fmtPKR(lineTotal)}
                </span>
              </div>
            ))}
            <div style={{ padding: '8px 12px', background: '#f8f9fb', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>Return total</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}>− {fmtPKR(totalRefund)}</span>
            </div>
          </>
        )}
      </div>

      {/* Policy check */}
      {hasItems && (
        <PolicyCheckCard policy={policy} loading={policyLoading} packOpened={false} compact />
      )}

      {/* Exchange checkbox */}
      {hasItems && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '10px 12px', borderRadius: 7, background: isExchange ? '#F0FDF8' : '#f9fafb', border: `1px solid ${isExchange ? '#0F6E56' : 'rgba(0,0,0,0.09)'}`, transition: 'all 0.12s' }}>
          <input
            type="checkbox"
            checked={isExchange}
            onChange={e => onToggleExchange(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: '#0F6E56', marginTop: 1, flexShrink: 0 }}
          />
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 2 }}>This is an exchange</p>
            <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
              After processing, a new sale opens with{' '}
              <strong style={{ color: '#0F6E56' }}>{fmtPKR(totalRefund)} credit</strong>{' '}
              applied automatically
            </p>
          </div>
        </label>
      )}

      {/* Action */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {submitError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#DC2626' }}>
            <AlertTriangle size={11} />
            {submitError}
          </div>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%', height: 42, borderRadius: 8,
            background: canSubmit ? (isExchange ? '#0F6E56' : '#1a1a1a') : '#d1d5db',
            color: canSubmit ? '#fff' : '#9ca3af',
            fontSize: 13, fontWeight: 600,
            border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
            paddingLeft: 12, paddingRight: 12,
          }}
        >
          {submitting ? 'Processing…' : btnText}
        </button>
        <button
          type="button"
          onClick={onExit}
          style={{ width: '100%', fontSize: 11, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 0', textAlign: 'center' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
