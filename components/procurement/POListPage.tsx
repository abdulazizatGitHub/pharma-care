'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import { createPO } from '@/app/actions/procurement'
import { POTable } from './POTable'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import type { POListRow } from './POTable'
import type { Supplier } from '@/lib/db-types'

interface POListPageProps {
  pos:       POListRow[]
  suppliers: Supplier[]
  basePath:  string
}

export function POListPage({ pos, suppliers, basePath }: POListPageProps) {
  const router = useRouter()
  const { role, permissions } = useDashboardUser()

  const canWrite = role === 'superadmin' || hasPermission(permissions, 'purchase_orders')

  const [createOpen,   setCreateOpen]   = useState(false)
  const [supplierId,   setSupplierId]   = useState('')
  const [poNotes,      setPoNotes]      = useState('')
  const [createError,  setCreateError]  = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  const supplierDropdown = suppliers.map(s => ({ id: s.id, name: s.name }))

  // pending_approval POs shown at top for superadmin
  const pendingFirst = role === 'superadmin'
    ? [
        ...pos.filter(p => p.status === 'pending_approval'),
        ...pos.filter(p => p.status !== 'pending_approval'),
      ]
    : pos

  function handleCreate() {
    setCreateError(null)
    if (!supplierId) { setCreateError('Select a supplier'); return }

    startTransition(async () => {
      const result = await createPO(supplierId, poNotes.trim() || undefined)
      if (result.error) { setCreateError(result.error); return }
      setCreateOpen(false)
      setSupplierId('')
      setPoNotes('')
      router.push(`${basePath}/${result.data!.poId}`)
    })
  }

  return (
    <div style={{ padding: '24px 28px', background: PAGE.bg, minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: FONT.pageHeading, fontWeight: 600, color: TEXT.primary, margin: 0 }}>
            Purchase Orders
          </h1>
          <p style={{ fontSize: FONT.pageSubhead, color: TEXT.secondary, margin: '2px 0 0' }}>
            {pos.length} order{pos.length !== 1 ? 's' : ''} total
          </p>
        </div>
        {canWrite && (
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={() => { setCreateOpen(o => !o); setCreateError(null) }}
            disabled={isPending}
          >
            New PO
          </Button>
        )}
      </div>

      {/* Create PO inline panel */}
      {createOpen && (
        <div
          className="rounded-xl border border-[rgba(0,0,0,0.08)] p-5 mb-4 space-y-4"
          style={{ background: PAGE.surface }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#111827]">New Purchase Order</p>
            <button
              onClick={() => { setCreateOpen(false); setCreateError(null) }}
              className="text-[#6b7280] hover:text-[#111827]"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <Select
              label="Supplier"
              required
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
            >
              <option value="">— Select supplier —</option>
              {suppliers.length === 0 ? (
                <option disabled>No active suppliers — add one first</option>
              ) : (
                suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </Select>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[#6b7280]">Notes (optional)</label>
              <input
                placeholder="e.g. Urgent restock"
                value={poNotes}
                onChange={e => setPoNotes(e.target.value)}
                className="h-8 w-full px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] bg-white"
              />
            </div>
          </div>
          {createError && (
            <p className="text-[11px] text-[#A32D2D]">{createError}</p>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setCreateOpen(false); setCreateError(null) }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button size="sm" loading={isPending} onClick={handleCreate}>
              Create PO
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: PAGE.surface, borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <POTable
          pos={pendingFirst}
          suppliers={supplierDropdown}
          basePath={basePath}
          canWrite={canWrite}
        />
      </div>
    </div>
  )
}
