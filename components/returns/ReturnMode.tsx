'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, CheckCircle, Clock, X } from 'lucide-react'
import { SaleLookup }         from './SaleLookup'
import { ReturnItemSelector } from './ReturnItemSelector'
import { ReturnSummary }      from './ReturnSummary'
import {
  evaluateReturnPolicy,
  initiateReturn,
  type SaleForReturn,
  type PolicyEvalResult,
} from '@/app/actions/returns'
import type { ReturnCredit } from '@/lib/pos-types'

interface Props {
  onExit:           () => void
  cashierId:        string
  onExchangeStart:  (credit: ReturnCredit) => void
}

const REASONS = [
  { value: 'Customer changed mind', label: 'Customer changed mind' },
  { value: 'Wrong medicine',        label: 'Wrong medicine' },
  { value: 'Side effects',          label: 'Side effects' },
  { value: 'Expired or damaged',    label: 'Expired / damaged' },
  { value: 'other',                 label: 'Other' },
]

function fmtPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Submitted screen ───────────────────────────────────────────────────────────

function SubmittedScreen({
  result, isExchange, onNewReturn, onExit,
}: {
  result:      { returnNo: string; status: string; netAmount: number }
  isExchange:  boolean
  onNewReturn: () => void
  onExit:      () => void
}) {
  const isApproved = result.status === 'auto_approved' || result.status === 'completed'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', gap: 20, padding: 40 }}>
      {isApproved
        ? <CheckCircle size={48} style={{ color: '#16A34A' }} />
        : <Clock size={48} style={{ color: '#D97706' }} />
      }
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
          {isApproved ? 'Return processed' : 'Sent for approval'}
        </p>
        <p style={{ fontSize: 13, color: '#6b7280', fontFamily: 'monospace' }}>{result.returnNo}</p>
      </div>

      {isApproved ? (
        <div style={{ borderRadius: 10, background: '#DCFCE7', border: '1px solid #86EFAC', padding: '16px 28px', minWidth: 200 }}>
          <p style={{ fontSize: 11, color: '#166534', marginBottom: 4 }}>Refund issued</p>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#166534' }}>{fmtPKR(result.netAmount)}</p>
        </div>
      ) : (
        <div style={{ borderRadius: 10, background: '#FEF3C7', border: '1px solid #FDE68A', padding: '14px 24px', maxWidth: 320 }}>
          <p style={{ fontSize: 12, color: '#92400E' }}>
            Superadmin will review this return. No funds transferred yet.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
        <button type="button" onClick={onNewReturn}
          style={{ height: 36, borderRadius: 7, border: '1.5px solid #0F6E56', background: 'transparent', color: '#0F6E56', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {isExchange ? 'New Return' : 'New Return'}
        </button>
        <button type="button" onClick={onExit}
          style={{ height: 36, borderRadius: 7, border: '1.5px solid rgba(0,0,0,0.15)', background: 'transparent', color: '#374151', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >
          Back to POS
        </button>
      </div>
    </div>
  )
}

// ── ReturnMode (overlay modal) ─────────────────────────────────────────────────

export function ReturnMode({ onExit, cashierId: _cashierId, onExchangeStart }: Props) {
  const [sale,          setSale]          = useState<SaleForReturn | null>(null)
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map())
  const [reason,        setReason]        = useState('Customer changed mind')
  const [reasonOther,   setReasonOther]   = useState('')
  const [packOpened,    setPackOpened]    = useState(false)
  const [isExchange,    setIsExchange]    = useState(false)
  const [policy,        setPolicy]        = useState<PolicyEvalResult | null>(null)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [submitError,   setSubmitError]   = useState<string | null>(null)
  const [submitted,     setSubmitted]     = useState<{ returnNo: string; status: string; netAmount: number } | null>(null)

  const policyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Policy evaluation ──────────────────────────────────────────────────────

  const evalPolicy = useCallback(async () => {
    if (!sale || selectedItems.size === 0) { setPolicy(null); return }
    const items = Array.from(selectedItems.entries())
      .filter(([, qty]) => qty > 0)
      .map(([sale_item_id, quantity_returned]) => ({ sale_item_id, quantity_returned }))
    if (items.length === 0) { setPolicy(null); return }
    setPolicyLoading(true)
    const res = await evaluateReturnPolicy(sale.id, items, packOpened)
    setPolicyLoading(false)
    if (res.data) setPolicy(res.data)
    else setPolicy(null)
  }, [sale, selectedItems, packOpened])

  useEffect(() => {
    if (policyTimer.current) clearTimeout(policyTimer.current)
    policyTimer.current = setTimeout(evalPolicy, 400)
    return () => { if (policyTimer.current) clearTimeout(policyTimer.current) }
  }, [evalPolicy])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function resetAll() {
    setSale(null)
    setSelectedItems(new Map())
    setIsExchange(false)
    setPolicy(null)
    setSubmitted(null)
    setSubmitError(null)
    setReason('Customer changed mind')
    setReasonOther('')
    setPackOpened(false)
  }

  function handleSaleFound(newSale: SaleForReturn) {
    setSale(newSale)
    setSelectedItems(new Map())
    setIsExchange(false)
    setPolicy(null)
    setSubmitted(null)
    setSubmitError(null)
    setReason('Customer changed mind')
    setReasonOther('')
    setPackOpened(false)
  }

  async function handleSubmit() {
    if (!sale) return

    const returnItems = Array.from(selectedItems.entries())
      .filter(([, qty]) => qty > 0)
      .map(([sale_item_id, quantity_returned]) => ({ sale_item_id, quantity_returned }))
    if (returnItems.length === 0) { setSubmitError('Select at least one item to return'); return }

    const finalReason = reason === 'other' ? reasonOther.trim() : reason
    if (reason === 'other' && !reasonOther.trim()) { setSubmitError('Enter a reason for the return'); return }

    setSubmitting(true)
    setSubmitError(null)

    const res = await initiateReturn({
      originalSaleId: sale.id,
      returnItems,
      reason:         finalReason,
      packOpened,
    })

    setSubmitting(false)

    if (res.error || !res.data) {
      setSubmitError(res.error ?? 'Submission failed — please try again')
      return
    }

    const totalRefund = returnItems.reduce((sum, ri) => {
      const item = sale.items.find(i => i.id === ri.sale_item_id)
      return sum + (item ? ri.quantity_returned * item.unit_price : 0)
    }, 0)

    if (isExchange) {
      // Close overlay and open exchange sale with credit applied
      onExchangeStart({
        returnId: res.data.returnId,
        returnNo: res.data.returnNo,
        amount:   totalRefund,
      })
    } else {
      setSubmitted({
        returnNo:  res.data.returnNo,
        status:    res.data.status,
        netAmount: totalRefund,
      })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onExit}
    >
      <div
        style={{
          width: '100%', maxWidth: 1100,
          maxHeight: '90vh',
          borderRadius: 12,
          background: 'white',
          boxShadow: '0 25px 80px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal header ── */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          background: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={14} style={{ color: '#D97706' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              {isExchange ? 'Return & Exchange' : 'Return'}
            </span>
            {sale && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 5, padding: '2px 8px', fontFamily: 'monospace' }}>
                {sale.receipt_no}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onExit}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 500, color: '#374151',
              background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            <X size={13} />
            Close
            <kbd style={{ fontSize: 10, fontFamily: 'monospace', background: 'white', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3, padding: '0 4px', color: '#9ca3af' }}>
              Esc
            </kbd>
          </button>
        </div>

        {/* ── Modal body ── */}
        {submitted ? (
          <SubmittedScreen
            result={submitted}
            isExchange={isExchange}
            onNewReturn={resetAll}
            onExit={onExit}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* ── LEFT: return items ── */}
            <div style={{
              overflowY: 'auto', padding: '20px',
              borderRight: '1px solid rgba(0,0,0,0.08)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', flexShrink: 0 }}>
                Returning
              </p>

              <SaleLookup currentSale={sale} onSaleFound={handleSaleFound} />

              {sale && (
                <>
                  <ReturnItemSelector
                    items={sale.items}
                    selected={selectedItems}
                    onChange={setSelectedItems}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <select
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      style={{ width: '100%', height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, color: '#111827', background: 'white', outline: 'none' }}
                    >
                      {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    {reason === 'other' && (
                      <input
                        type="text"
                        placeholder="Describe the reason…"
                        value={reasonOther}
                        onChange={e => setReasonOther(e.target.value)}
                        style={{ width: '100%', height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 12, color: '#111827', background: 'white', outline: 'none' }}
                      />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Pack opened?</span>
                      {[false, true].map(val => (
                        <label key={String(val)} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="pack_opened" checked={packOpened === val} onChange={() => setPackOpened(val)} />
                          <span style={{ fontSize: 12, color: '#374151' }}>{val ? 'Yes' : 'No'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── RIGHT: summary ── */}
            <div style={{ overflowY: 'auto', padding: '20px' }}>
              <ReturnSummary
                sale={sale}
                selectedItems={selectedItems}
                isExchange={isExchange}
                onToggleExchange={setIsExchange}
                policy={policy}
                policyLoading={policyLoading}
                submitting={submitting}
                submitError={submitError}
                onSubmit={handleSubmit}
                onExit={onExit}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
