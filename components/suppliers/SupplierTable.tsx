'use client'

import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FONT, TEXT, PAGE, BADGE_COLORS } from '@/lib/design-tokens'
import type { Supplier } from '@/lib/db-types'

interface SupplierTableProps {
  suppliers: Supplier[]
  canWrite:  boolean
  onEdit:         (s: Supplier) => void
  onDeactivate:   (s: Supplier) => void
  onReactivate:   (s: Supplier) => void
}

type StatusFilter = 'all' | 'active' | 'inactive'

export function SupplierTable({
  suppliers,
  canWrite,
  onEdit,
  onDeactivate,
  onReactivate,
}: SupplierTableProps) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return suppliers.filter(s => {
      if (statusFilter === 'active'   && !s.is_active) return false
      if (statusFilter === 'inactive' &&  s.is_active) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.contact_person ?? '').toLowerCase().includes(q)
      )
    })
  }, [suppliers, search, statusFilter])

  const thStyle: React.CSSProperties = {
    fontSize:      FONT.tableHeader,
    fontWeight:    600,
    color:         TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding:       '8px 12px',
    textAlign:     'left',
    whiteSpace:    'nowrap',
    borderBottom:  `1px solid ${PAGE.border}`,
  }

  const tdStyle: React.CSSProperties = {
    fontSize:   FONT.tableCell,
    color:      TEXT.primary,
    padding:    '9px 12px',
    borderBottom: `1px solid ${PAGE.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or contact…"
            className="h-8 w-full pl-8 pr-3 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent bg-white"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 bg-[#f3f4f6] rounded-md p-0.5">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="text-[11px] font-medium capitalize rounded px-3 py-1 transition-colors"
              style={{
                background: statusFilter === f ? '#ffffff' : 'transparent',
                color:      statusFilter === f ? TEXT.primary : TEXT.secondary,
                boxShadow:  statusFilter === f ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Contact Person</th>
              <th style={thStyle}>Phone</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Credit Days</th>
              <th style={thStyle}>Status</th>
              {canWrite && <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canWrite ? 6 : 5}
                  style={{ ...tdStyle, textAlign: 'center', color: TEXT.secondary, padding: '32px 12px' }}
                >
                  {search || statusFilter !== 'all'
                    ? 'No suppliers match your filters.'
                    : 'No suppliers yet — add one to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr
                  key={s.id}
                  style={{ opacity: s.is_active ? 1 : 0.55 }}
                  className="hover:bg-[#f9fafb] transition-colors"
                >
                  <td style={tdStyle}>
                    <span className="font-medium">{s.name}</span>
                    {s.ntn && (
                      <span className="ml-2 text-[10px] text-[#9ca3af]">NTN: {s.ntn}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: TEXT.secondary }}>
                    {s.contact_person ?? <span className="text-[#9ca3af]">—</span>}
                  </td>
                  <td style={{ ...tdStyle, color: TEXT.secondary }}>
                    {s.phone ?? <span className="text-[#9ca3af]">—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {s.credit_days}d
                  </td>
                  <td style={tdStyle}>
                    {s.is_active ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: BADGE_COLORS.success.bg, color: BADGE_COLORS.success.color }}
                      >
                        Active
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: BADGE_COLORS.neutral.bg, color: BADGE_COLORS.neutral.color }}
                      >
                        Inactive
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
                          Edit
                        </Button>
                        {s.is_active ? (
                          <Button variant="ghost" size="sm" onClick={() => onDeactivate(s)}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => onReactivate(s)}>
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
