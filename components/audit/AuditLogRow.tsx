'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AuditLogRow as AuditLog } from '@/app/actions/audit'

// ─── Action categories ────────────────────────────────────────────────────────

const USER_ACTIONS    = ['CREATE_USER','UPDATE_USER','DEACTIVATE_USER','REACTIVATE_USER','RESET_PASSWORD','CHANGE_PASSWORD','UPDATE_PERMISSIONS','LOGIN','LOGOUT']
const SALE_ACTIONS    = ['CREATE_SALE','HOLD_SALE','RESUME_SALE','VOID_SALE','RETURN_SALE','APPROVE_PRESCRIPTION']
const MED_ACTIONS     = ['CREATE_MEDICINE','UPDATE_MEDICINE','DEACTIVATE_MEDICINE','REACTIVATE_MEDICINE','IMPORT_MEDICINES','CREATE_CATEGORY','UPDATE_CATEGORY']
const STOCK_ACTIONS   = ['ADD_STOCK_BATCH','ADJUST_STOCK','STOCK_WRITEOFF']
const PROCURE_ACTIONS = ['CREATE_PO','ADD_PO_ITEM','UPDATE_PO_ITEM','CONFIRM_PO','APPROVE_PO','REJECT_PO','CANCEL_PO','CREATE_GRN','CREATE_SUPPLIER','UPDATE_SUPPLIER','DEACTIVATE_SUPPLIER','REACTIVATE_SUPPLIER']
const FINANCE_ACTIONS = ['MANUAL_JOURNAL_ENTRY','REVERSE_JOURNAL_ENTRY','SUPPLIER_PAYMENT','CUSTOMER_PAYMENT','BORROWING_TRANSACTION','RECORD_EXPENSE','CREATE_EXPENSE','UPDATE_EXPENSE','DELETE_EXPENSE']
const SHIFT_ACTIONS   = ['OPEN_SHIFT','CLOSE_SHIFT']

function getActionStyle(action: string): { color: string; bg: string; border: string } {
  if (USER_ACTIONS.includes(action))    return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' }
  if (SALE_ACTIONS.includes(action))    return { color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' }
  if (MED_ACTIONS.includes(action))     return { color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4' }
  if (STOCK_ACTIONS.includes(action))   return { color: '#b45309', bg: '#fef3c7', border: '#fde68a' }
  if (PROCURE_ACTIONS.includes(action)) return { color: '#7c3aed', bg: '#ede9fe', border: '#ddd6fe' }
  if (FINANCE_ACTIONS.includes(action)) return { color: '#c2410c', bg: '#ffedd5', border: '#fed7aa' }
  if (SHIFT_ACTIONS.includes(action))   return { color: '#3730a3', bg: '#e0e7ff', border: '#c7d2fe' }
  return                                       { color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' }
}

function getRoleBadge(role: string | null): { label: string; color: string; bg: string } {
  if (role === 'superadmin') return { label: 'superadmin', color: '#7c3aed', bg: '#ede9fe' }
  if (role === 'admin')      return { label: 'admin',      color: '#0f766e', bg: '#ccfbf1' }
  if (role === 'pharmacist') return { label: 'pharmacist', color: '#1d4ed8', bg: '#dbeafe' }
  return                            { label: role ?? '—',  color: '#6b7280', bg: '#f3f4f6' }
}

// ─── Time formatting ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })
}

// ─── JSON formatter ───────────────────────────────────────────────────────────

function formatJsonValue(obj: Record<string, unknown> | null): { key: string; val: string }[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([key, val]) => ({
    key,
    val: val === null ? 'null'
       : typeof val === 'object' ? JSON.stringify(val, null, 2)
       : String(val),
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  log: AuditLog
}

export function AuditLogRow({ log }: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = log.old_value !== null || log.new_value !== null
  const actionStyle = getActionStyle(log.action)
  const roleStyle   = getRoleBadge(log.user_role)

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #f3f4f6', cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setExpanded(e => !e)}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '' }}
      >
        {/* Time */}
        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }}>
          <span title={fmtFull(log.created_at)}>{timeAgo(log.created_at)}</span>
        </td>

        {/* User */}
        <td style={{ padding: '9px 12px', fontSize: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#111827', fontWeight: 500 }}>{log.user_name ?? '—'}</span>
            {log.user_role && (
              <span style={{
                display: 'inline-block', fontSize: 10, fontWeight: 600,
                color: roleStyle.color, background: roleStyle.bg,
                padding: '1px 6px', borderRadius: 4, width: 'fit-content',
              }}>
                {roleStyle.label}
              </span>
            )}
          </div>
        </td>

        {/* Action */}
        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 600,
            color: actionStyle.color, background: actionStyle.bg,
            border: `1px solid ${actionStyle.border}`,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {log.action}
          </span>
        </td>

        {/* Table */}
        <td style={{ padding: '9px 12px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
          {log.table_name ?? '—'}
        </td>

        {/* Record ID */}
        <td style={{ padding: '9px 12px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
          {log.record_id ? log.record_id.slice(0, 8) + '…' : '—'}
        </td>

        {/* Expand toggle */}
        <td style={{ padding: '9px 12px', width: 32 }}>
          {hasDetail && (
            <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && hasDetail && (
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
          <td colSpan={6} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: log.old_value && log.new_value ? '1fr 1fr' : '1fr', gap: 16 }}>
              {log.old_value && (
                <ValuePanel title="Before" entries={formatJsonValue(log.old_value)} color="#dc2626" />
              )}
              {log.new_value && (
                <ValuePanel title="After" entries={formatJsonValue(log.new_value)} color="#15803d" />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ValuePanel({ title, entries, color }: { title: string; entries: { key: string; val: string }[]; color: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {entries.map(({ key, val }) => (
          <div key={key} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#6b7280', minWidth: 120, flexShrink: 0 }}>{key}</span>
            <span style={{ color: '#111827', fontFamily: val.length > 60 ? 'monospace' : undefined, wordBreak: 'break-word' }}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
