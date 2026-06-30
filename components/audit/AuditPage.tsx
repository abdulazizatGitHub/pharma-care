'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { AuditLogRow } from './AuditLogRow'
import { ACTION_TYPES } from '@/lib/audit'
import type { AuditLogRow as AuditLogRowType, AuditStats, AuditFilterOptions } from '@/app/actions/audit'

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
  logs:             AuditLogRowType[]
  currentPage:      number
  totalCount:       number
  initialStats:     AuditStats | null
  filterOptions:    AuditFilterOptions
  role:             string
  defaultDateFrom:  string
  defaultDateTo:    string
  defaultUserId:    string
  defaultAction:    string
  defaultTableName: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditPage({
  logs,
  currentPage,
  totalCount,
  initialStats,
  filterOptions,
  role,
  defaultDateFrom,
  defaultDateTo,
  defaultUserId,
  defaultAction,
  defaultTableName,
}: Props) {
  const router = useRouter()

  // Controlled filter inputs (reflect URL state; Apply pushes to URL)
  const [userId,    setUserId]    = useState(defaultUserId)
  const [action,    setAction]    = useState(defaultAction)
  const [tableName, setTableName] = useState(defaultTableName)
  const [dateFrom,  setDateFrom]  = useState(defaultDateFrom)
  const [dateTo,    setDateTo]    = useState(defaultDateTo)

  const allActions   = Object.values(ACTION_TYPES) as string[]
  const totalPages   = Math.ceil(totalCount / 15) || 1
  const mostActiveUser   = initialStats?.actions_by_user[0]?.user_name ?? '—'
  const mostCommonAction = initialStats?.actions_by_type[0]?.action    ?? '—'

  function applyFilters() {
    const params = new URLSearchParams()
    if (userId)    params.set('userId',    userId)
    if (action)    params.set('action',    action)
    if (tableName) params.set('tableName', tableName)
    if (dateFrom)  params.set('dateFrom',  dateFrom)
    if (dateTo)    params.set('dateTo',    dateTo)
    // page omitted — resets to 1 on filter change
    router.push('?' + params.toString())
  }

  function clearFilters() {
    setUserId('')
    setAction('')
    setTableName('')
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
    router.push('?dateFrom=' + defaultDateFrom + '&dateTo=' + defaultDateTo)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Audit Trail"
        description="Complete log of all system actions."
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard label="Total Actions"      value={(initialStats?.total_actions ?? totalCount).toLocaleString()} />
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
            style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            style={{ padding: '6px 12px', fontSize: 13, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Activity chart — superadmin only */}
      {role === 'superadmin' && initialStats && initialStats.actions_by_day.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Activity Trend
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={initialStats.actions_by_day} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
            {totalCount.toLocaleString()} total · page {currentPage} of {totalPages}
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
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    No audit logs found for the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => <AuditLogRow key={log.id} log={log} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '0 16px' }}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={15}
            onPageChange={(p) => {
              const params = new URLSearchParams(window.location.search)
              params.set('page', String(p))
              router.push('?' + params.toString())
            }}
          />
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
