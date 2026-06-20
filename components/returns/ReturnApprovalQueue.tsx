'use client'

import React, { useState, useTransition } from 'react'
import { CheckCircle, XCircle, Clock, RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  approveReturn,
  denyReturn,
  getReturnHistory,
  type ReturnRecord,
  type ReturnHistorySummary,
  type ReturnHistoryFilters,
} from '@/app/actions/returns'

interface Props {
  initialPending: ReturnRecord[]
  initialHistory: { items: ReturnHistorySummary[]; total: number }
}

type Tab = 'pending' | 'history'

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  auto_approved:    { bg: '#D1FAE5', color: '#065F46', label: 'Auto-approved' },
  pending_approval: { bg: '#FEF3C7', color: '#92400E', label: 'Pending Approval' },
  approved:         { bg: '#DBEAFE', color: '#1E40AF', label: 'Approved' },
  completed:        { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  denied:           { bg: '#FEE2E2', color: '#991B1B', label: 'Denied' },
}

function fmtPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Pending return card ───────────────────────────────────────────────────────

function PendingCard({
  ret,
  onApproved,
  onDenied,
}: {
  ret: ReturnRecord
  onApproved: (id: string) => void
  onDenied:   (id: string) => void
}) {
  const [expanded,     setExpanded]     = useState(false)
  const [denyMode,     setDenyMode]     = useState(false)
  const [denyReason,   setDenyReason]   = useState('')
  const [denyError,    setDenyError]    = useState<string | null>(null)
  const [isPending, startTransition]   = useTransition()
  const [actionError,  setActionError]  = useState<string | null>(null)

  function handleApprove() {
    setActionError(null)
    startTransition(async () => {
      const res = await approveReturn(ret.id)
      if (res.error) { setActionError(res.error); return }
      onApproved(ret.id)
    })
  }

  function handleDeny() {
    if (!denyReason.trim()) { setDenyError('Enter a denial reason'); return }
    setDenyError(null)
    setActionError(null)
    startTransition(async () => {
      const res = await denyReturn(ret.id, denyReason.trim())
      if (res.error) { setActionError(res.error); return }
      onDenied(ret.id)
    })
  }

  const flagLabels: Record<string, string> = {
    window_expired: 'Window expired',
    opened_pack:    'Pack opened',
    exceeds_limit:  'Exceeds limit',
  }

  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.09)] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-semibold text-[#111827]">{ret.return_no}</span>
            <span
              className="text-[10px] font-semibold rounded-full px-2 py-0.5"
              style={STATUS_COLORS['pending_approval'] ? {
                background: STATUS_COLORS['pending_approval'].bg,
                color:      STATUS_COLORS['pending_approval'].color,
              } : {}}
            >
              Pending Approval
            </span>
            {ret.return_type === 'exchange' && (
              <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-[#EFF6FF] text-[#1D4ED8]">
                Exchange
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#6b7280]">
            Receipt: <span className="font-medium text-[#374151]">{ret.receipt_no ?? '—'}</span>
            {' · '}Requested by: <span className="font-medium text-[#374151]">{ret.requester_name ?? 'Unknown'}</span>
            {' · '}{fmtDate(ret.created_at)}
          </p>
          <p className="text-[11px] text-[#6b7280] mt-0.5">
            Reason: <span className="font-medium text-[#374151]">{ret.reason}</span>
            {ret.pack_opened && <span className="ml-2 text-[#92400E] font-medium">· Pack opened</span>}
          </p>
          {ret.policy_flags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {ret.policy_flags.map(f => (
                <span key={f} className="text-[10px] rounded-full px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E] font-medium">
                  {flagLabels[f] ?? f}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right ml-4 shrink-0">
          <p className="text-[15px] font-semibold text-[#166534]">{fmtPKR(ret.refund_amount)}</p>
          {ret.charge_amount > 0 && (
            <p className="text-[10px] text-[#6b7280]">Charge: {fmtPKR(ret.charge_amount)}</p>
          )}
          <p className="text-[11px] text-[#6b7280]">
            Net: <span className="font-medium">{fmtPKR(ret.net_amount)}</span>
          </p>
        </div>
      </div>

      {/* Items expandable */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1 px-4 py-1.5 text-[11px] text-[#6b7280] hover:bg-[#f8f9fb] border-t border-[rgba(0,0,0,0.06)] transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {ret.items.length} item{ret.items.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1 border-t border-[rgba(0,0,0,0.06)] bg-[#f8f9fb]">
          {ret.items.map(item => (
            <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-[rgba(0,0,0,0.05)] last:border-0">
              <div>
                <p className="text-[11px] font-medium text-[#111827]">{item.medicine_name}</p>
                <p className="text-[10px] text-[#9ca3af]">
                  Batch {item.batch_no} · Qty {item.quantity_returned} × {fmtPKR(item.unit_price)}
                </p>
              </div>
              <span className="text-[11px] font-medium text-[#374151]">{fmtPKR(item.line_refund)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f8f9fb] border-t border-[rgba(0,0,0,0.07)]">
        {actionError && (
          <p className="text-[11px] text-[#A32D2D] flex items-center gap-1">
            <AlertTriangle size={11} /> {actionError}
          </p>
        )}
        {!denyMode ? (
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDenyMode(true)}
              disabled={isPending}
            >
              Deny
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              loading={isPending}
              icon={<CheckCircle size={12} />}
            >
              Approve
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              placeholder="Reason for denial…"
              value={denyReason}
              onChange={e => setDenyReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeny()}
              className="flex-1 h-7 px-2 rounded border border-[rgba(0,0,0,0.15)] text-[11px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-[#E24B4A] bg-white"
            />
            {denyError && <p className="text-[10px] text-[#A32D2D]">{denyError}</p>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDenyMode(false); setDenyReason(''); setDenyError(null) }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleDeny}
              disabled={isPending}
              className="h-7 px-3 rounded text-[11px] font-medium bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA] transition-colors disabled:opacity-50"
            >
              <XCircle size={11} className="inline mr-1" />
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── History table row ─────────────────────────────────────────────────────────

function HistoryRow({ ret }: { ret: ReturnHistorySummary }) {
  const [expanded, setExpanded] = useState(false)
  const status = STATUS_COLORS[ret.status] ?? { bg: '#F3F4F6', color: '#374151', label: ret.status }

  return (
    <>
      <tr
        className="border-b border-[rgba(0,0,0,0.05)] hover:bg-[#f8f9fb] cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5 text-[12px] font-medium text-[#0F6E56]">{ret.return_no}</td>
        <td className="px-3 py-2.5 text-[11px] text-[#6b7280]">{ret.receipt_no ?? '—'}</td>
        <td className="px-3 py-2.5 text-[11px] text-[#374151]">{fmtDate(ret.created_at)}</td>
        <td className="px-3 py-2.5">
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            style={{ background: status.bg, color: status.color }}
          >
            {status.label}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
            ret.return_type === 'exchange' ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F3F4F6] text-[#374151]'
          }`}>
            {ret.return_type === 'exchange' ? 'Exchange' : 'Return'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-[12px] font-medium text-[#111827] text-right">{fmtPKR(ret.refund_amount)}</td>
        <td className="px-3 py-2.5 text-[12px] font-medium text-[#374151] text-right">{fmtPKR(ret.net_amount)}</td>
        <td className="px-3 py-2.5 text-[11px] text-[#6b7280]">{ret.requester_name ?? '—'}</td>
        <td className="px-3 py-2.5">
          {expanded ? <ChevronDown size={13} className="text-[#9ca3af]" /> : <ChevronRight size={13} className="text-[#9ca3af]" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#f8f9fb]">
          <td colSpan={9} className="px-4 py-3">
            <div className="space-y-1 text-[11px] text-[#374151]">
              <p><span className="text-[#9ca3af]">Reason:</span> {ret.reason}</p>
              {ret.pack_opened && <p className="text-[#92400E]">Pack was opened</p>}
              {ret.policy_flags.length > 0 && (
                <p><span className="text-[#9ca3af]">Flags:</span> {ret.policy_flags.join(', ')}</p>
              )}
              {ret.approved_at && (
                <p>
                  <span className="text-[#9ca3af]">{ret.status === 'denied' ? 'Denied' : 'Approved'}:</span>{' '}
                  {ret.approver_name ?? '—'} · {fmtDate(ret.approved_at)}
                </p>
              )}
              {ret.denial_reason && (
                <p><span className="text-[#9ca3af]">Denial reason:</span> {ret.denial_reason}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ReturnApprovalQueue({ initialPending, initialHistory }: Props) {
  const [tab, setTab]         = useState<Tab>('pending')
  const [pending, setPending] = useState<ReturnRecord[]>(initialPending)

  // History state
  const [history, setHistory]       = useState(initialHistory)
  const [histPage, setHistPage]     = useState(1)
  const [filters, setFilters]       = useState<ReturnHistoryFilters>({ pageSize: 20 })
  const [histLoading, setHistLoading] = useState(false)

  const pageSize = filters.pageSize ?? 20
  const totalPages = Math.max(1, Math.ceil(history.total / pageSize))

  async function reloadHistory(newFilters: ReturnHistoryFilters, page = 1) {
    setHistLoading(true)
    const res = await getReturnHistory({ ...newFilters, page, pageSize })
    setHistLoading(false)
    if (res.data) { setHistory(res.data); setHistPage(page) }
  }

  function handleApproved(id: string) {
    setPending(prev => prev.filter(r => r.id !== id))
    if (tab === 'history') reloadHistory(filters, histPage)
  }

  function handleDenied(id: string) {
    setPending(prev => prev.filter(r => r.id !== id))
    if (tab === 'history') reloadHistory(filters, histPage)
  }

  const tabBtnStyle = (active: boolean) =>
    `px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
      active
        ? 'border-[#0F6E56] text-[#0F6E56]'
        : 'border-transparent text-[#6b7280] hover:text-[#374151]'
    }`

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-[rgba(0,0,0,0.08)] mb-5">
        <button type="button" className={tabBtnStyle(tab === 'pending')} onClick={() => setTab('pending')}>
          <Clock size={12} className="inline mr-1.5" />
          Pending Approval
          {pending.length > 0 && (
            <span className="ml-1.5 bg-[#FEF3C7] text-[#92400E] text-[10px] font-semibold rounded-full px-1.5 py-0.5">
              {pending.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={tabBtnStyle(tab === 'history')}
          onClick={() => {
            setTab('history')
            if (history.items.length === 0 && history.total === 0) {
              reloadHistory(filters, 1)
            }
          }}
        >
          <RotateCcw size={12} className="inline mr-1.5" />
          Return History
          <span className="ml-1.5 text-[10px] text-[#9ca3af]">({history.total})</span>
        </button>
      </div>

      {/* ── PENDING TAB ─────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-[#9ca3af]">
              <CheckCircle size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No returns pending approval</p>
            </div>
          ) : (
            pending.map(ret => (
              <PendingCard
                key={ret.id}
                ret={ret}
                onApproved={handleApproved}
                onDenied={handleDenied}
              />
            ))
          )}
        </div>
      )}

      {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select
              value={filters.status ?? ''}
              onChange={e => {
                const next = { ...filters, status: e.target.value || undefined }
                setFilters(next); reloadHistory(next, 1)
              }}
              className="h-8 px-2.5 rounded border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            >
              <option value="">All statuses</option>
              <option value="auto_approved">Auto-approved</option>
              <option value="pending_approval">Pending</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="denied">Denied</option>
            </select>
            <select
              value={filters.returnType ?? ''}
              onChange={e => {
                const next = { ...filters, returnType: e.target.value || undefined }
                setFilters(next); reloadHistory(next, 1)
              }}
              className="h-8 px-2.5 rounded border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            >
              <option value="">All types</option>
              <option value="return">Returns only</option>
              <option value="exchange">Exchanges only</option>
            </select>
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={e => {
                const next = { ...filters, dateFrom: e.target.value || undefined }
                setFilters(next); reloadHistory(next, 1)
              }}
              className="h-8 px-2.5 rounded border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            />
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={e => {
                const next = { ...filters, dateTo: e.target.value || undefined }
                setFilters(next); reloadHistory(next, 1)
              }}
              className="h-8 px-2.5 rounded border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
            />
          </div>

          {/* Table */}
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[rgba(0,0,0,0.07)] bg-[#f8f9fb]">
                  {['Return #', 'Receipt #', 'Date', 'Status', 'Type', 'Refund', 'Net', 'Requested By', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-[#6b7280] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {histLoading ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-[12px] text-[#9ca3af]">Loading…</td></tr>
                ) : history.items.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-[12px] text-[#9ca3af]">No returns found</td></tr>
                ) : (
                  history.items.map(ret => <HistoryRow key={ret.id} ret={ret} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-[11px] text-[#6b7280]">
                Page {histPage} of {totalPages} · {history.total} total
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reloadHistory(filters, histPage - 1)}
                  disabled={histPage === 1 || histLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reloadHistory(filters, histPage + 1)}
                  disabled={histPage >= totalPages || histLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
