'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import { deactivateSupplier, reactivateSupplier } from '@/app/actions/suppliers'
import { SupplierTable }  from './SupplierTable'
import { SupplierDrawer } from './SupplierDrawer'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import type { Supplier } from '@/lib/db-types'

interface SuppliersPageProps {
  suppliers: Supplier[]
}

export function SuppliersPage({ suppliers }: SuppliersPageProps) {
  const router = useRouter()
  const { role, permissions } = useDashboardUser()

  const canWrite = role === 'superadmin' || hasPermission(permissions, 'suppliers')

  const [drawerOpen,       setDrawerOpen]       = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [actionError,      setActionError]      = useState<string | null>(null)
  const [isPending,        startTransition]     = useTransition()

  function openAddDrawer() {
    setSelectedSupplier(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(s: Supplier) {
    setSelectedSupplier(s)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setSelectedSupplier(null)
  }

  function handleDeactivate(s: Supplier) {
    setActionError(null)
    startTransition(async () => {
      const result = await deactivateSupplier(s.id)
      if (result.error) setActionError(result.error)
      else router.refresh()
    })
  }

  function handleReactivate(s: Supplier) {
    setActionError(null)
    startTransition(async () => {
      const result = await reactivateSupplier(s.id)
      if (result.error) setActionError(result.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ padding: '24px 28px', background: PAGE.bg, minHeight: '100%' }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: FONT.pageHeading, fontWeight: 600, color: TEXT.primary, margin: 0 }}>
            Suppliers
          </h1>
          <p style={{ fontSize: FONT.pageSubhead, color: TEXT.secondary, margin: '2px 0 0' }}>
            {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {canWrite && (
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={openAddDrawer}
            disabled={isPending}
          >
            Add Supplier
          </Button>
        )}
      </div>

      {actionError && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {actionError}
        </p>
      )}

      {/* Table */}
      <div style={{ background: PAGE.surface, borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <SupplierTable
          suppliers={suppliers}
          canWrite={canWrite}
          onEdit={openEditDrawer}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
        />
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <SupplierDrawer
          key={selectedSupplier?.id ?? 'new'}
          supplier={selectedSupplier}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}
