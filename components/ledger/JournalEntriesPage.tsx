'use client'

import React, { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { ManualEntryModal } from '@/components/ledger/ManualEntryModal'
import {
  getJournalEntryLines,
  postDraftJournalEntry,
  reverseJournalEntry,
} from '@/app/actions/ledger'
import type { JournalEntry, Account } from '@/lib/db-types'
import type { JournalLineDisplay } from '@/app/actions/ledger'

// ─── Constants ────────────────────────────────────────────────────────────────

const REF_TYPE_LABELS: Record<string, string> = {
  sale:               'Sale',
  sale_return:        'Sale Return',
  purchase_order:     'Purchase Order',
  grn:                'GRN',
  supplier_payment:   'Supplier Payment',
  customer_payment:   'Customer Payment',
  borrowing_out:      'Borrowing Out',
  borrowing_in:       'Borrowing In',
  borrowing_payment:  'Borrowing Payment',
  expense:            'Expense',
  manual:             'Manual',
  opening_balance:    'Opening Balance',
  adjustment:         'Adjustment',
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  posted:   { bg: '#E1F5EE', color: '#0F6E56', label: 'Posted'   },
  draft:    { bg: '#FAEEDA', color: '#8B6100', label: 'Draft'    },
  reversed: { bg: '#F3F4F6', color: '#6b7280', label: 'Reversed' },
}

const fmtDate = (s: string) => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Reverse Modal ─────────────────────────────────────────────────────────────

function ReverseModal({
  entry,
  onClose,
  onDone,
}: {
  entry:   JournalEntry
  onClose: () => void
  onDone:  () => void
}) {
  const [reason,    setReason]    = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTx]      = useTransition()

  function handleSubmit() {
    if (!reason.trim()) { setError('Reason is required'); return }
    setError(null)
    startTx(async () => {
      const result = await reverseJournalEntry(entry.id, reason.trim())
      if (result.error) { setError(result.error); return }
      onDone()
    })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff', borderRadius: 10, padding: '20px 24px',
          width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>
          Reverse Entry
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          {entry.entry_no} &mdash; {entry.description}
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            Reason <span style={{ color: '#E24B4A' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this entry is being reversed"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6,
              border: '1px solid rgba(0,0,0,0.15)', resize: 'vertical',
              fontFamily: 'inherit', color: '#111827',
              outline: 'none',
            }}
          />
        </div>
        {error && (
          <p style={{ fontSize: 11, color: '#A32D2D', marginBottom: 8 }}>⚠ {error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={isPending} onClick={handleSubmit}>
            Reverse Entry
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Lines expansion row ───────────────────────────────────────────────────────

function LinesRow({ lines, colCount }: { lines: JournalLineDisplay[]; colCount: number }) {
  const debits  = lines.filter(l => l.direction === 'debit').reduce((s, l) => s + l.amount_pkr, 0)
  const credits = lines.filter(l => l.direction === 'credit').reduce((s, l) => s + l.amount_pkr, 0)

  return (
    <tr>
      <td
        colSpan={colCount}
        style={{ padding: '0 0 8px', background: '#F8FAFB' }}
      >
        <div style={{ margin: '0 32px 0 48px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Account', 'Direction', 'Amount', 'Description'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '5px 10px', fontSize: 9, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: '#6b7280', textAlign: h === 'Amount' ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: '#111827' }}>
                    {l.account_code} — {l.account_name}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11 }}>
                    <span
                      style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: l.direction === 'debit' ? '#E8F1FF' : '#FEF3E8',
                        color:      l.direction === 'debit' ? '#1B4A9A' : '#8B4500',
                      }}
                    >
                      {l.direction === 'debit' ? 'Dr' : 'Cr'}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>
                    {fmtPKR(l.amount_pkr)}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: '#6b7280' }}>
                    {l.description ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                <td colSpan={2} style={{ padding: '5px 10px', fontSize: 10, color: '#6b7280' }}>
                  {lines.length} line{lines.length !== 1 ? 's' : ''}
                </td>
                <td style={{ padding: '5px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>
                  Dr {fmtPKR(debits)} / Cr {fmtPKR(credits)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  entries:         JournalEntry[]
  total:           number
  currentPage:     number
  isSuperadmin:    boolean
  accounts:        Account[]
  filterDateFrom:  string
  filterDateTo:    string
  filterStatus:    string
  filterRefType:   string
  basePath:        string
}

// ─── Main component ────────────────────────────────────────────────────────────

export function JournalEntriesPage({
  entries,
  total,
  currentPage,
  isSuperadmin,
  accounts,
  filterDateFrom,
  filterDateTo,
  filterStatus,
  filterRefType,
  basePath,
}: Props) {
  const router = useRouter()

  // Filter state (controlled by URL)
  const [dateFrom,  setDateFrom]  = useState(filterDateFrom)
  const [dateTo,    setDateTo]    = useState(filterDateTo)
  const [status,    setStatus]    = useState(filterStatus)
  const [refType,   setRefType]   = useState(filterRefType)

  // UI state
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [expandedLines, setExpandedLines] = useState<Map<string, JournalLineDisplay[]>>(new Map())
  const [loadingLineId, setLoadingLineId] = useState<string | null>(null)
  const [lineError,     setLineError]     = useState<string | null>(null)

  const [postingId,     setPostingId]     = useState<string | null>(null)
  const [postError,     setPostError]     = useState<Record<string, string>>({})
  const [isPendingPost, startPost]        = useTransition()

  const [reversingEntry, setReversingEntry] = useState<JournalEntry | null>(null)
  const [newEntryOpen,   setNewEntryOpen]   = useState(false)

  // Apply filters → navigate
  function applyFilters() {
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo)   params.set('dateTo',   dateTo)
    if (status)   params.set('status',   status)
    if (refType)  params.set('refType',  refType)
    router.push(`${basePath}?${params.toString()}`)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setStatus(''); setRefType('')
    router.push(basePath)
  }

  // Toggle inline line expansion
  const toggleExpand = useCallback(async (entryId: string) => {
    if (expandedId === entryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(entryId)
    if (expandedLines.has(entryId)) return  // already loaded

    setLoadingLineId(entryId)
    setLineError(null)
    const result = await getJournalEntryLines(entryId)
    setLoadingLineId(null)
    if (result.error) { setLineError(result.error); return }
    setExpandedLines(prev => new Map(prev).set(entryId, result.data ?? []))
  }, [expandedId, expandedLines])

  // Post draft
  function handlePost(entry: JournalEntry) {
    setPostingId(entry.id)
    startPost(async () => {
      const result = await postDraftJournalEntry(entry.id)
      setPostingId(null)
      if (result.error) {
        setPostError(prev => ({ ...prev, [entry.id]: result.error! }))
      } else {
        router.refresh()
      }
    })
  }

  const COL_COUNT = 7

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Journal Entries</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            {total} entr{total !== 1 ? 'ies' : 'y'} total
          </p>
        </div>
        {isSuperadmin && (
          <Button variant="primary" size="sm" onClick={() => setNewEntryOpen(true)}>
            <Plus size={13} style={{ marginRight: 4 }} />
            New Manual Entry
          </Button>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        {[
          { label: 'Date From', value: dateFrom, setter: setDateFrom, type: 'date' as const },
          { label: 'Date To',   value: dateTo,   setter: setDateTo,   type: 'date' as const },
        ].map(({ label, value, setter, type }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label}
            </label>
            <input
              type={type}
              value={value}
              onChange={e => setter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              style={{
                height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)', color: '#111827', outline: 'none',
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Status
          </label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: '#111827' }}
          >
            <option value="">All statuses</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="reversed">Reversed</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Reference Type
          </label>
          <select
            value={refType}
            onChange={e => setRefType(e.target.value)}
            style={{ height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', color: '#111827' }}
          >
            <option value="">All types</option>
            {Object.entries(REF_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={applyFilters}>Apply</Button>
          <Button variant="secondary" size="sm" onClick={clearFilters}>Clear</Button>
        </div>
      </div>

      {lineError && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FCEBEB', borderRadius: 6, fontSize: 12, color: '#A32D2D' }}>
          Error loading lines: {lineError}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No journal entries found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {[
                  { h: '',           w: 32  },
                  { h: 'Entry No',   w: 160 },
                  { h: 'Date',       w: 110 },
                  { h: 'Description',w: 'auto' },
                  { h: 'Ref Type',   w: 130 },
                  { h: 'Status',     w: 90  },
                  { h: 'Actions',    w: 170 },
                ].map(({ h, w }) => (
                  <th
                    key={h || 'expand'}
                    style={{
                      padding: '8px 12px',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                      textAlign: 'left',
                      width: w,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const isExpanded    = expandedId === entry.id
                const isLoading     = loadingLineId === entry.id
                const lines         = expandedLines.get(entry.id)
                const s             = STATUS_STYLE[entry.status] ?? STATUS_STYLE.draft
                const hasPostErr    = postError[entry.id]

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      style={{
                        borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                        background: isExpanded ? '#F8FAFB' : (i % 2 === 0 ? '#fff' : '#fafafa'),
                      }}
                    >
                      {/* Expand toggle */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleExpand(entry.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 2, borderRadius: 3,
                          }}
                          title={isExpanded ? 'Collapse' : 'View lines'}
                        >
                          {isLoading
                            ? <span style={{ fontSize: 10, color: '#9ca3af' }}>…</span>
                            : isExpanded
                              ? <ChevronDown size={13} />
                              : <ChevronRight size={13} />
                          }
                        </button>
                      </td>

                      <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>
                        {entry.entry_no}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {fmtDate(entry.entry_date)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }}>
                        {entry.description}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280' }}>
                        {entry.reference_type ? (REF_TYPE_LABELS[entry.reference_type] ?? entry.reference_type) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            fontSize: 10, fontWeight: 600,
                            background: s.bg, color: s.color,
                          }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
                          {isSuperadmin && entry.status === 'draft' && (
                            <Button
                              variant="primary"
                              size="sm"
                              loading={isPendingPost && postingId === entry.id}
                              onClick={() => handlePost(entry)}
                            >
                              Post
                            </Button>
                          )}
                          {isSuperadmin && entry.status === 'posted' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setReversingEntry(entry)}
                            >
                              <RotateCcw size={11} style={{ marginRight: 3 }} />
                              Reverse
                            </Button>
                          )}
                          {entry.reversal_of && (
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>
                              Reversal
                            </span>
                          )}
                          {entry.reversed_by && entry.status === 'reversed' && (
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>
                              Reversed
                            </span>
                          )}
                        </div>
                        {hasPostErr && (
                          <p style={{ fontSize: 10, color: '#A32D2D', margin: '2px 0 0' }}>
                            {hasPostErr}
                          </p>
                        )}
                      </td>
                    </tr>

                    {/* Expanded lines */}
                    {isExpanded && lines && (
                      <LinesRow lines={lines} colCount={COL_COUNT} />
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(total / 15)}
        totalCount={total}
        pageSize={15}
        onPageChange={(p) => {
          const params = new URLSearchParams(window.location.search)
          params.set('page', String(p))
          router.push('?' + params.toString())
        }}
      />

      {/* Reverse modal */}
      {reversingEntry && (
        <ReverseModal
          entry={reversingEntry}
          onClose={() => setReversingEntry(null)}
          onDone={() => { setReversingEntry(null); router.refresh() }}
        />
      )}

      {/* New manual entry modal (superadmin only) */}
      {isSuperadmin && (
        <ManualEntryModal
          open={newEntryOpen}
          onClose={() => { setNewEntryOpen(false); router.refresh() }}
          accounts={accounts}
        />
      )}
    </div>
  )
}
