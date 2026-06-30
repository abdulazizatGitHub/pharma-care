'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Pencil, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { softDeleteExpense, updateExpenseDetails, voidExpense } from '@/app/actions/expenses'
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
  expenses:            ExpenseRow[]
  isSuperadmin:        boolean
  onVoidAndReRecord?:  (expense: ExpenseRow) => void
  // Pagination + filter defaults
  currentPage:         number
  total:               number
  pageSize:            number
  defaultSearch:       string
  defaultAccountCode:  string
}

interface EditFields {
  description:  string
  reference_no: string
  category:     string
}

export function ExpenseTable({
  expenses, isSuperadmin, onVoidAndReRecord,
  currentPage, total, pageSize, defaultSearch, defaultAccountCode,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()

  // Local state only for the text search input
  const [localSearch, setLocalSearch] = useState(defaultSearch)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<Record<string, string>>({})
  const [isPending,  startTransition] = useTransition()

  const [editTarget,  setEditTarget]  = useState<ExpenseRow | null>(null)
  const [editFields,  setEditFields]  = useState<EditFields>({ description: '', reference_no: '', category: '' })
  const [editErr,     setEditErr]     = useState<string | null>(null)
  const [isSaving,    startSave]      = useTransition()

  const [voidTarget,  setVoidTarget]  = useState<ExpenseRow | null>(null)
  const [isVoiding,   startVoid]      = useTransition()

  function openEdit(e: ExpenseRow) {
    setEditTarget(e)
    setEditFields({
      description:  e.description  ?? '',
      reference_no: e.reference_no ?? '',
      category:     e.account_name ?? '',
    })
    setEditErr(null)
  }

  function closeEdit() {
    setEditTarget(null)
    setEditErr(null)
  }

  function handleSave() {
    if (!editTarget) return
    startSave(async () => {
      const result = await updateExpenseDetails(editTarget.id, {
        description:  editFields.description  || undefined,
        reference_no: editFields.reference_no || undefined,
        category:     editFields.category     || undefined,
      })
      if (result.error) {
        setEditErr(result.error)
      } else {
        toast('Expense updated successfully', 'success')
        closeEdit()
      }
    })
  }

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

  function handleVoidConfirm() {
    if (!voidTarget) return
    const target = voidTarget
    startVoid(async () => {
      const result = await voidExpense(target.id)
      setVoidTarget(null)
      if (result.error) {
        toast(result.error, 'error')
      } else {
        toast('Expense voided and journal entry reversed', 'success')
      }
    })
  }

  function handleVoidAndReRecord(expense: ExpenseRow) {
    startVoid(async () => {
      const result = await voidExpense(expense.id)
      if (result.error) {
        toast(result.error, 'error')
      } else {
        toast('Expense voided — fill in corrected values below', 'success')
        onVoidAndReRecord?.(expense)
      }
    })
  }

  // Build URL from applied filter props + overrides
  function pushFilters(overrides: Record<string, string>) {
    const params = new URLSearchParams()
    const all = {
      search:      defaultSearch,
      accountCode: defaultAccountCode,
      ...overrides,
    }
    if (all.search)      params.set('search',      all.search)
    if (all.accountCode) params.set('accountCode', all.accountCode)
    // page omitted → resets to 1
    router.push('?' + params.toString())
  }

  function submitSearch() {
    pushFilters({ search: localSearch })
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
          placeholder="Search description… (Enter)"
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitSearch() }}
          style={{
            height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
            outline: 'none', minWidth: 200,
          }}
        />
        <select
          value={defaultAccountCode}
          onChange={e => pushFilters({ accountCode: e.target.value })}
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
      </div>

      {expenses.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          {total === 0 ? 'No expenses recorded yet.' : 'No expenses match your filter.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
              {['Date', 'Category', 'Description', 'Amount', 'Payment', 'Ref No', ...(isSuperadmin ? ['Actions'] : [])].map((h, i) => (
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
            {expenses.map((e, i) => {
              const voided = !!e.is_voided
              const rowOpacity = voided ? 0.5 : 1
              const textColor  = voided ? '#9ca3af' : undefined
              return (
                <React.Fragment key={e.id}>
                  <tr
                    style={{
                      borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                      opacity: rowOpacity,
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontSize: 12, color: textColor ?? '#6b7280', whiteSpace: 'nowrap' }}>
                      {fmtDate(e.expense_date)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: textColor ?? '#374151' }}>
                      {e.account_name ?? e.account_code ?? e.category}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: textColor ?? '#111827', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.description}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: voided ? '#9ca3af' : '#A32D2D', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {voided && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            background: '#FCEBEB', color: '#A32D2D', borderRadius: 4,
                            padding: '2px 5px', fontFamily: 'inherit',
                          }}>
                            Voided
                          </span>
                        )}
                        {fmtPKR(Number(e.amount))}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: textColor ?? '#6b7280' }}>
                      {PAYMENT_LABELS[e.payment_method ?? 'cash'] ?? e.payment_method ?? 'Cash'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: textColor ?? '#6b7280', fontFamily: 'monospace' }}>
                      {e.reference_no ?? '—'}
                    </td>
                    {isSuperadmin && (
                      <td style={{ padding: '10px 12px' }}>
                        {!voided && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              title="Edit expense details"
                              onClick={() => openEdit(e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              title="Void this expense"
                              onClick={() => setVoidTarget(e)}
                              disabled={isVoiding}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                            >
                              <XCircle size={13} />
                            </button>
                            <button
                              title="Void and re-record with corrections"
                              onClick={() => handleVoidAndReRecord(e)}
                              disabled={isVoiding}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                            >
                              <RefreshCw size={13} />
                            </button>
                            {!e.journal_entry_id && (
                              <button
                                title="Delete expense (no journal entry posted)"
                                onClick={() => handleDelete(e.id)}
                                disabled={isPending && deletingId === e.id}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
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
              )
            })}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      <div style={{ padding: '0 14px' }}>
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(total / pageSize) || 1}
          totalCount={total}
          pageSize={pageSize}
          onPageChange={(p) => {
            const params = new URLSearchParams(window.location.search)
            params.set('page', String(p))
            router.push('?' + params.toString())
          }}
        />
      </div>

      {/* Edit Expense Modal */}
      <Modal open={!!editTarget} onClose={closeEdit} title="Edit Expense" size="sm">
        {editTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: '#f9fafb', border: '0.5px solid rgba(0,0,0,0.08)',
              borderRadius: 8, padding: '12px 14px',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
            }}>
              {[
                { label: 'Date',    value: fmtDate(editTarget.expense_date) },
                { label: 'Amount',  value: fmtPKR(Number(editTarget.amount)), valueColor: '#A32D2D' },
                { label: 'Account', value: editTarget.account_name ?? editTarget.account_code ?? '—' },
                { label: 'Payment', value: PAYMENT_LABELS[editTarget.payment_method ?? 'cash'] ?? editTarget.payment_method ?? 'Cash' },
              ].map(({ label, value, valueColor }) => (
                <div key={label}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 500, color: valueColor ?? '#111827', margin: 0, fontFamily: valueColor ? 'monospace' : 'inherit' }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Description</label>
              <textarea
                value={editFields.description}
                onChange={e => setEditFields(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                maxLength={500}
                style={{ width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: '#111827', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Reference No</label>
              <input
                type="text"
                value={editFields.reference_no}
                onChange={e => setEditFields(prev => ({ ...prev, reference_no: e.target.value }))}
                maxLength={100}
                style={{ width: '100%', height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Category</label>
              <select
                value={editFields.category}
                onChange={e => setEditFields(prev => ({ ...prev, category: e.target.value }))}
                style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="">— Select category —</option>
                {Object.entries(EXPENSE_ACCOUNT_LABELS).map(([code, name]) => (
                  <option key={code} value={name}>{code} — {name}</option>
                ))}
              </select>
            </div>

            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
              To correct amount or account, reverse this expense in Journal Entries and record a new one.
            </p>

            {editErr && (
              <p style={{ fontSize: 11, color: '#A32D2D', background: '#FCEBEB', borderRadius: 6, padding: '6px 10px', margin: 0 }}>
                {editErr}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <Button variant="secondary" size="sm" onClick={closeEdit} disabled={isSaving}>Cancel</Button>
              <Button size="sm" loading={isSaving} onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Void confirm dialog */}
      <ConfirmDialog
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoidConfirm}
        title="Void this expense?"
        message={
          voidTarget
            ? `This will reverse the journal entry for "${voidTarget.description}" — ${fmtPKR(Number(voidTarget.amount))}. The expense will remain visible as voided. This cannot be undone.`
            : ''
        }
        confirmLabel="Void Expense"
        confirmVariant="danger"
        loading={isVoiding}
      />
    </div>
  )
}
