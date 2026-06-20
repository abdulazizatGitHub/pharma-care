'use client'

import React, { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { softDeleteExpense } from '@/app/actions/expenses'
import { EXPENSE_ACCOUNT_LABELS } from '@/lib/expense-constants'
import type { ExpenseRow } from '@/app/actions/expenses'

const fmtDate = (s: string) => {
  try {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return s }
}

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  cheque:        'Cheque',
}

interface Props {
  expenses:      ExpenseRow[]
  isSuperadmin:  boolean
}

export function ExpenseTable({ expenses, isSuperadmin }: Props) {
  const [search,     setSearch]     = useState('')
  const [filterCode, setFilterCode] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<Record<string, string>>({})
  const [isPending,  startTransition] = useTransition()

  // Client-side filters
  const visible = expenses.filter(e => {
    const matchSearch = !search ||
      e.description.toLowerCase().includes(search.toLowerCase())
    const matchCode = !filterCode || e.account_code === filterCode
    return matchSearch && matchCode
  })

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const result = await softDeleteExpense(id)
      setDeletingId(null)
      if (result.error) {
        setDeleteErr(prev => ({ ...prev, [id]: result.error! }))
      }
    })
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Filters bar */}
      <div
        style={{
          display: 'flex', gap: 10, padding: '10px 14px',
          borderBottom: '0.5px solid rgba(0,0,0,0.06)', flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
            outline: 'none', minWidth: 200,
          }}
        />
        <select
          value={filterCode}
          onChange={e => setFilterCode(e.target.value)}
          style={{
            height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
            background: '#fff', outline: 'none',
          }}
        >
          <option value="">All categories</option>
          {Object.entries(EXPENSE_ACCOUNT_LABELS).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          {visible.length} record{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          {expenses.length === 0 ? 'No expenses recorded yet.' : 'No expenses match your filter.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
              {['Date', 'Category', 'Description', 'Amount', 'Payment', 'Ref No', ...(isSuperadmin ? [''] : [])].map((h, i) => (
                <th
                  key={h + i}
                  style={{
                    padding: '7px 12px',
                    fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: '#6b7280',
                    textAlign: h === 'Amount' ? 'right' : 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((e, i) => (
              <React.Fragment key={e.id}>
                <tr
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {fmtDate(e.expense_date)}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#374151' }}>
                    {e.account_name ?? e.account_code ?? e.category}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#111827', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.description}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: '#A32D2D', whiteSpace: 'nowrap' }}>
                    {fmtPKR(Number(e.amount))}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280' }}>
                    {PAYMENT_LABELS[e.payment_method ?? 'cash'] ?? e.payment_method ?? 'Cash'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                    {e.reference_no ?? '—'}
                  </td>
                  {isSuperadmin && (
                    <td style={{ padding: '10px 12px' }}>
                      {/* Only show delete when no journal entry (unposted edge case) */}
                      {!e.journal_entry_id && (
                        <button
                          title="Delete expense (no journal entry posted)"
                          onClick={() => handleDelete(e.id)}
                          disabled={isPending && deletingId === e.id}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#9ca3af', padding: 4, borderRadius: 4,
                            display: 'inline-flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {deleteErr[e.id] && (
                  <tr>
                    <td
                      colSpan={isSuperadmin ? 7 : 6}
                      style={{ padding: '4px 12px 8px', background: '#FCEBEB', fontSize: 11, color: '#A32D2D' }}
                    >
                      {deleteErr[e.id]}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
