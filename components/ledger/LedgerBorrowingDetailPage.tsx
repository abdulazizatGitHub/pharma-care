'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BorrowingTransactionModal } from '@/components/ledger/BorrowingTransactionModal'
import { processSettlement, updatePharmacySettlement } from '@/app/actions/borrowing'
import type { BorrowingPharmacy, BorrowingTransaction } from '@/lib/db-types'

interface Props {
  pharmacy:     BorrowingPharmacy
  transactions: BorrowingTransaction[]
}

const fmt = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TX_LABELS: Record<string, string> = {
  borrow_out:  'Borrow Out',
  borrow_in:   'Borrow In',
  payment_in:  'Payment In',
  payment_out: 'Payment Out',
}

const TX_COLORS: Record<string, string> = {
  borrow_out:  '#185FA5',
  borrow_in:   '#854F0B',
  payment_in:  '#0F6E56',
  payment_out: '#A32D2D',
}

const CADENCE_LABELS: Record<string, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  custom:  'Custom (manual)',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function LedgerBorrowingDetailPage({ pharmacy, transactions }: Props) {
  const [txOpen,    setTxOpen]    = useState(false)
  const balance = Number(pharmacy.current_balance)

  // ── Settlement Settings state
  const [cadence,      setCadence]      = useState<string>(pharmacy.settlement_cadence ?? 'daily')
  const [settDay,      setSettDay]      = useState<string>(pharmacy.settlement_day != null ? String(pharmacy.settlement_day) : '')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg,  setSettingsMsg]  = useState<string | null>(null)
  const [settingsErr,  setSettingsErr]  = useState<string | null>(null)

  // ── Settlement Action state
  const [amount,      setAmount]      = useState('')
  const [method,      setMethod]      = useState<'cash' | 'bank_transfer' | 'cheque'>('cash')
  const [settNotes,   setSettNotes]   = useState('')
  const [settling,    setSettling]    = useState(false)
  const [settleMsg,   setSettleMsg]   = useState<string | null>(null)
  const [settleErr,   setSettleErr]   = useState<string | null>(null)

  async function handleSaveSettings() {
    setSavingSettings(true)
    setSettingsMsg(null)
    setSettingsErr(null)
    const dayVal = settDay !== '' ? parseInt(settDay, 10) : undefined
    const res = await updatePharmacySettlement(pharmacy.id, cadence as never, dayVal)
    setSavingSettings(false)
    if (res.error) { setSettingsErr(res.error); return }
    setSettingsMsg('Settings saved')
  }

  async function handleSettle() {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) { setSettleErr('Enter a valid amount'); return }
    setSettling(true)
    setSettleMsg(null)
    setSettleErr(null)
    const res = await processSettlement(pharmacy.id, amountNum, method, settNotes.trim() || undefined)
    setSettling(false)
    if (res.error) { setSettleErr(res.error); return }
    setAmount('')
    setSettNotes('')
    setSettleMsg('Settlement recorded — reload to see updated balance')
  }

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Back link */}
      <Link
        href="/superadmin/ledger/borrowing"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={13} /> Back to Borrowing Pharmacies
      </Link>

      {/* Header */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{pharmacy.name}</h1>
          {pharmacy.contact_person && (
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{pharmacy.contact_person}</p>
          )}
          {pharmacy.phone && (
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{pharmacy.phone}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Current Balance</p>
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                margin: 0,
                fontFamily: 'monospace',
                color: balance > 0.005 ? '#0F6E56' : balance < -0.005 ? '#854F0B' : '#6b7280',
              }}
            >
              {Math.abs(balance) > 0.005 ? fmt(balance) : '—'}
            </p>
            {Math.abs(balance) > 0.005 && (
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                {balance > 0 ? 'They owe us' : 'We owe them'}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => setTxOpen(true)}
            disabled={!pharmacy.is_active}
          >
            New Transaction
          </Button>
        </div>
      </div>

      {/* ── Settlement row: Settings + Action ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Settlement Settings */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: '0 0 12px' }}>
            Settlement Settings
          </p>

          {pharmacy.last_settled_at && (
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              Last settled:{' '}
              <span style={{ fontWeight: 500, color: '#374151' }}>
                {new Date(pharmacy.last_settled_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Cadence</label>
              <select
                value={cadence}
                onChange={e => { setCadence(e.target.value); setSettingsMsg(null) }}
                style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff' }}
              >
                {Object.entries(CADENCE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {cadence === 'weekly' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Settlement Day</label>
                <select
                  value={settDay}
                  onChange={e => setSettDay(e.target.value)}
                  style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff' }}
                >
                  <option value="">Select day…</option>
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}

            {cadence === 'monthly' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Day of Month (1–28)</label>
                <input
                  type="number" min="1" max="28"
                  value={settDay}
                  onChange={e => setSettDay(e.target.value)}
                  placeholder="e.g. 1"
                  style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, boxSizing: 'border-box' }}
                />
              </div>
            )}

            {settingsMsg && <p style={{ fontSize: 11, color: '#0F6E56', margin: 0 }}>✓ {settingsMsg}</p>}
            {settingsErr && <p style={{ fontSize: 11, color: '#dc2626', margin: 0 }}>⚠ {settingsErr}</p>}

            <Button size="sm" variant="secondary" onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </div>

        {/* Settlement Action */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: '0 0 12px' }}>
            Process Settlement
          </p>

          {Math.abs(balance) < 0.005 ? (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>Balance is settled — nothing to pay.</p>
          ) : (
            <p style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
              {balance < -0.005
                ? `We owe ${pharmacy.name} ${fmt(balance)} — record a payment out.`
                : `${pharmacy.name} owes us ${fmt(balance)} — record a payment in.`}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Amount (Rs)</label>
              <input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setSettleMsg(null); setSettleErr(null) }}
                placeholder="0.00"
                style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Payment Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as typeof method)}
                style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff' }}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes (optional)</label>
              <input
                type="text"
                value={settNotes}
                onChange={e => setSettNotes(e.target.value)}
                placeholder="Reference or remarks…"
                style={{ width: '100%', height: 34, padding: '0 8px', fontSize: 12, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>

            {settleMsg && <p style={{ fontSize: 11, color: '#0F6E56', margin: 0 }}>✓ {settleMsg}</p>}
            {settleErr && <p style={{ fontSize: 11, color: '#dc2626', margin: 0 }}>⚠ {settleErr}</p>}

            <Button
              size="sm"
              onClick={handleSettle}
              disabled={settling || !amount || Math.abs(balance) < 0.005}
            >
              {settling ? 'Processing…' : 'Record Settlement'}
            </Button>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {transactions.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No transactions recorded yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {['Date', 'Type', 'Description', 'Amount'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                      textAlign: i === 3 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {tx.transaction_date}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: `${TX_COLORS[tx.transaction_type]}18`,
                        color: TX_COLORS[tx.transaction_type],
                      }}
                    >
                      {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#111827' }}>
                    {tx.medicine_name
                      ? `${tx.medicine_name}${tx.quantity ? ` × ${tx.quantity}` : ''}`
                      : tx.notes ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>
                    {fmt(Number(tx.total_amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BorrowingTransactionModal
        pharmacyId={pharmacy.id}
        pharmacyName={pharmacy.name}
        open={txOpen}
        onClose={() => setTxOpen(false)}
      />
    </div>
  )
}
