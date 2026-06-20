'use client'

import React, { useState, useTransition } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { AuditLogRow } from './AuditLogRow'
import { getAuditLogs, getAuditStats } from '@/app/actions/audit'
import { ACTION_TYPES } from '@/lib/audit'
import type { AuditLogPage, AuditStats, AuditFilters, AuditFilterOptions } from '@/app/actions/audit'

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtShortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '14px 18px',
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, color: '#111827' }}>
        {value}
      </p>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialPage:    AuditLogPage
  initialStats:   AuditStats | null
  filterOptions:  AuditFilterOptions
  role:           string
  defaultDateFrom: string
  defaultDateTo:   string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditPage({
  initialPage,
  initialStats,
  filterOptions,
  role,
  defaultDateFrom,
  defaultDateTo,
}: Props) {
  const [logPage,    setLogPage]    = useState<AuditLogPage>(initialPage)
  const [stats,      setStats]      = useState<AuditStats | null>(initialStats)
  const [isPending,  startTransition] = useTransition()

  // Filter state
  const [userId,    setUserId]    = useState('')
  const [action,    setAction]    = useState('')
  const [tableName, setTableName] = useState('')
  const [dateFrom,  setDateFrom]  = useState(defaultDateFrom)
  const [dateTo,    setDateTo]    = useState(defaultDateTo)

  const allActions = Object.values(ACTION_TYPES) as string[]

  function buildFilters(): AuditFilters {
    return {
      userId:    userId    || undefined,
      action:    action    || undefined,
      tableName: tableName || undefined,
      dateFrom:  dateFrom  || undefined,
      dateTo:    dateTo    || undefined,
    }
  }

  function fetchPage(page: number, filters?: AuditFilters) {
    startTransition(async () => {
      const f = filters ?? buildFilters()
      const [logsRes, statsRes] = await Promise.all([
        getAuditLogs(f, page, 50),
        role === 'superadmin' ? getAuditStats(dateFrom || defaultDateFrom, dateTo || defaultDateTo) : Promise.resolve({ data: null, error: null }),
      ])
      if (logsRes.data)  setLogPage(logsRes.data)
      if (statsRes.data) setStats(statsRes.data)
    })
  }

  function applyFilters() { fetchPage(1) }

  function clearFilters() {
    setUserId('')
    setAction('')
    setTableName('')
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
    startTransition(async () => {
      const [logsRes, statsRes] = await Promise.all([
        getAuditLogs({ dateFrom: defaultDateFrom, dateTo: defaultDateTo }, 1, 50),
        role === 'superadmin' ? getAuditStats(defaultDateFrom, defaultDateTo) : Promise.resolve({ data: null, error: null }),
      ])
      if (logsRes.data)  setLogPage(logsRes.data)
      if (statsRes.data) setStats(statsRes.data)
    })
  }

  const totalPages = Math.ceil(logPage.total / logPage.pageSize) || 1

  // Stats derived
  const mostActiveUser   = stats?.actions_by_user[0]?.user_name ?? '—'
  const mostCommonAction = stats?.actions_by_type[0]?.action ?? '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Audit Trail"
        description="Complete log of all system actions."
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard label="Total Actions" value={(stats?.total_actions ?? logPage.total).toLocaleString()} />
        <StatCard label="Most Active User"   value={mostActiveUser} />
        <StatCard label="Most Common Action" value={mostCommonAction} />
      </div>

      {/* Filter row */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}>
        <FilterField label="From">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </FilterField>
        <FilterField label="User">
          <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
            <option value="">All users</option>
            {filterOptions.users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Action">
          <select value={action} onChange={e => setAction(e.target.value)} style={inputStyle}>
            <option value="">All actions</option>
            {allActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>
        <FilterField label="Table">
          <select value={tableName} onChange={e => setTableName(e.target.value)} style={inputStyle}>
            <option value="">All tables</option>
            {filterOptions.tableNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterField>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={applyFilters}
            disabled={isPending}
            style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {isPending ? 'Loading…' : 'Apply'}
          </button>
          <button
            onClick={clearFilters}
            disabled={isPending}
            style={{ padding: '6px 12px', fontSize: 13, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Activity chart — superadmin only */}
      {role === 'superadmin' && stats && stats.actions_by_day.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Activity Trend
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={stats.actions_by_day} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtShortDate}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                formatter={((val: number) => [val, 'Actions']) as any}
                labelFormatter={((d: string) => fmtShortDate(d)) as any}
                contentStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#0f766e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Log table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>
            Audit Log
          </p>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {logPage.total.toLocaleString()} total · page {logPage.page} of {totalPages}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <Th>Time</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Table</Th>
                <Th>Record</Th>
                <Th>{/* expand */}</Th>
              </tr>
            </thead>
            <tbody>
              {logPage.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    No audit logs found for the selected filters.
                  </td>
                </tr>
              ) : (
                logPage.logs.map(log => <AuditLogRow key={log.id} log={log} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            onClick={() => fetchPage(logPage.page - 1)}
            disabled={logPage.page <= 1 || isPending}
            style={paginationBtnStyle(logPage.page <= 1)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#6b7280', padding: '0 4px' }}>
            Page {logPage.page} of {totalPages}
          </span>
          <button
            onClick={() => fetchPage(logPage.page + 1)}
            disabled={logPage.page >= totalPages || isPending}
            style={paginationBtnStyle(logPage.page >= totalPages)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{
      padding: '8px 12px', textAlign: 'left',
      fontSize: 11, fontWeight: 600, color: '#6b7280',
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13,
  border: '1px solid #d1d5db', borderRadius: 6,
  minWidth: 130, maxWidth: 200,
}

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', fontSize: 12, fontWeight: 500,
    border: '1px solid #e5e7eb', borderRadius: 6,
    background: disabled ? '#f9fafb' : '#fff',
    color: disabled ? '#d1d5db' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
