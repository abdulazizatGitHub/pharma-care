'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { postOpeningBalances } from '@/app/actions/ledger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  code:           string
  name:           string
  account_type:   string
  normal_balance: string
}

interface ExistingLine {
  direction: string
  amount:    number
  accounts:  { code: string; name: string; account_type: string }
}

interface Props {
  existingEntry: {
    id:          string
    entry_date:  string
    description: string
  } | null
  existingLines: ExistingLine[] | null
  accounts:      AccountRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeBadge(accountType: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    asset:     { label: 'Asset',     bg: '#EFF6FF', color: '#1D4ED8' },
    liability: { label: 'Liability', bg: '#FFF7ED', color: '#C2410C' },
    equity:    { label: 'Equity',    bg: '#F5F3FF', color: '#6D28D9' },
  }
  const s = map[accountType] ?? { label: accountType, bg: '#F3F4F6', color: '#374151' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px',
      borderRadius: 4, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function directionBadge(direction: string) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px',
      borderRadius: 4, background: '#F3F4F6', color: '#6B7280',
    }}>
      {direction === 'debit' ? 'Dr' : 'Cr'}
    </span>
  )
}

function formatAmount(n: number) {
  return 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningBalancesPage({ existingEntry, existingLines, accounts }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [amounts, setAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(accounts.map(a => [a.code, '']))
  )
  const [asOfDate, setAsOfDate] = useState(
    () => new Date().toISOString().split('T')[0]
  )
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const debitTotal = accounts
    .filter(a => a.normal_balance === 'debit')
    .reduce((sum, a) => sum + (parseFloat(amounts[a.code]) || 0), 0)

  const creditTotal = accounts
    .filter(a => a.normal_balance === 'credit')
    .reduce((sum, a) => sum + (parseFloat(amounts[a.code]) || 0), 0)

  const difference  = Math.abs(debitTotal - creditTotal)
  const isBalanced  = difference < 0.001
  const hasAnyAmount = Object.values(amounts).some(v => parseFloat(v) > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const lines = accounts
      .filter(a => parseFloat(amounts[a.code]) > 0)
      .map(a => ({
        accountCode: a.code,
        amount:      parseFloat(amounts[a.code]),
        direction:   a.normal_balance as 'debit' | 'credit',
        description: `Opening balance — ${a.name}`,
      }))

    const result = await postOpeningBalances(lines, asOfDate, notes)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    toast('Opening balances posted successfully', 'success')
    router.refresh()
  }

  // ── Read-only view (balances already posted) ──────────────────────────────

  if (existingEntry) {
    return (
      <div style={{ maxWidth: 700, padding: '0 0 40px' }}>
        {/* Success banner */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 16px', borderRadius: 8, marginBottom: 24,
          background: '#F0FDF4', border: '1px solid #86EFAC',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>
              Opening balances were posted on {existingEntry.entry_date}
            </div>
            <div style={{ fontSize: 12, color: '#15803D', marginTop: 2 }}>
              {existingEntry.description}
            </div>
          </div>
        </div>

        {/* Read-only lines table */}
        {existingLines && existingLines.length > 0 && (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {(['Code', 'Account', 'Dr/Cr', 'Amount'] as const).map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 600, color: '#6B7280',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      borderBottom: '1px solid #E5E7EB',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {existingLines.map((line, i) => (
                  <tr key={i} style={{ borderBottom: i < existingLines!.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontFamily: 'monospace', fontSize: 12 }}>
                      {line.accounts.code}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#111827', fontWeight: 500 }}>
                      {line.accounts.name}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {directionBadge(line.direction)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                      {formatAmount(Number(line.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 13, color: '#6B7280' }}>
          To correct opening balances, contact your system administrator to void this entry.
        </p>
      </div>
    )
  }

  // ── Entry form (no balances yet) ─────────────────────────────────────────

  return (
    <div style={{ maxWidth: 800, padding: '0 0 40px' }}>
      <form onSubmit={handleSubmit}>

        {/* Date row */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 100 }}>
            As of date
          </label>
          <input
            type="date"
            value={asOfDate}
            max={today}
            onChange={e => setAsOfDate(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 6, border: '1px solid #D1D5DB',
              fontSize: 13, color: '#111827', outline: 'none',
            }}
          />
        </div>

        {/* Balance entry table */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={thStyle('left')}>Account</th>
                <th style={thStyle('left')}>Type</th>
                <th style={thStyle('center')}>Dr/Cr</th>
                <th style={thStyle('right')}>Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, i) => (
                <tr
                  key={account.code}
                  style={{ borderBottom: i < accounts.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{account.name}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{account.code}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {typeBadge(account.account_type)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {directionBadge(account.normal_balance)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amounts[account.code]}
                      onChange={e => setAmounts(prev => ({ ...prev, [account.code]: e.target.value }))}
                      placeholder="0.00"
                      style={{
                        width: 130, padding: '6px 10px', borderRadius: 6,
                        border: '1px solid #D1D5DB', fontSize: 13,
                        textAlign: 'right', color: '#111827', outline: 'none',
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{
          background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '14px 20px', marginBottom: 20,
          display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
        }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <span style={{ fontSize: 13, color: '#6B7280', minWidth: 80, textAlign: 'right' }}>Debits:</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 120, textAlign: 'right' }}>
              {formatAmount(debitTotal)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <span style={{ fontSize: 13, color: '#6B7280', minWidth: 80, textAlign: 'right' }}>Credits:</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 120, textAlign: 'right' }}>
              {formatAmount(creditTotal)}
            </span>
          </div>
          <div style={{ height: 1, background: '#E5E7EB', width: '100%', margin: '4px 0' }} />
          <div style={{ display: 'flex', gap: 24 }}>
            <span style={{ fontSize: 13, color: '#6B7280', minWidth: 80, textAlign: 'right' }}>Difference:</span>
            <span style={{
              fontSize: 13, fontWeight: 700, minWidth: 120, textAlign: 'right',
              color: isBalanced ? '#15803D' : '#DC2626',
            }}>
              {isBalanced
                ? '✓ Balanced'
                : `Out of balance by ${formatAmount(difference)}`}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Opening balances as at system setup date"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid #D1D5DB', fontSize: 13, color: '#111827',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 6, marginBottom: 16,
            background: '#FEF2F2', border: '1px solid #FECACA',
            fontSize: 13, color: '#DC2626',
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isBalanced || !hasAnyAmount || loading}
          style={{
            padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            background: (!isBalanced || !hasAnyAmount || loading) ? '#E5E7EB' : '#2563EB',
            color: (!isBalanced || !hasAnyAmount || loading) ? '#9CA3AF' : '#FFFFFF',
            transition: 'background 0.15s ease',
          }}
        >
          {loading ? 'Posting…' : 'Post Opening Balances'}
        </button>
      </form>
    </div>
  )
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function thStyle(align: 'left' | 'right' | 'center'): React.CSSProperties {
  return {
    padding: '10px 14px',
    textAlign: align,
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderBottom: '1px solid #E5E7EB',
  }
}
