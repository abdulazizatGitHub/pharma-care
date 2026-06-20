'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutList, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import { FONT, PAGE, TEXT } from '@/lib/design-tokens'
import { deactivateMedicine, reactivateMedicine } from '@/app/actions/medicines'
import { MedicineTable }    from './MedicineTable'
import { MedicineDrawer }   from './MedicineDrawer'
import { CategoryManager }  from './CategoryManager'
import { BulkImportModal }     from './BulkImportModal'
import { MedicineStockPanel }  from './MedicineStockPanel'
import type { MedicineCategory, MedicineSubcategory, MedicineRow, Supplier } from '@/lib/db-types'

// Re-export so server pages can import MedicineRow from here for backwards compatibility
export type { MedicineRow }

// ─── Props ────────────────────────────────────────────────────────────────────

interface MedicinesPageProps {
  medicines:     MedicineRow[]
  categories:    MedicineCategory[]
  subcategories: MedicineSubcategory[]
  suppliers:     Supplier[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MedicinesPage({ medicines, categories, subcategories, suppliers }: MedicinesPageProps) {
  const router = useRouter()
  const { role, permissions } = useDashboardUser()

  const canWrite = role === 'superadmin' || hasPermission(permissions, 'inventory_manage')

  const [selectedMedicine, setSelectedMedicine] = useState<MedicineRow | null>(null)
  const [drawerOpen,       setDrawerOpen]       = useState(false)
  const [catModalOpen,      setCatModalOpen]      = useState(false)
  const [importModalOpen,   setImportModalOpen]   = useState(false)
  const [stockPanelMedicine, setStockPanelMedicine] = useState<MedicineRow | null>(null)
  const [deactivateError,   setDeactivateError]   = useState<string | null>(null)
  const [isPending,        startTransition]     = useTransition()

  function openAddDrawer() {
    setSelectedMedicine(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(m: MedicineRow) {
    setSelectedMedicine(m)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setSelectedMedicine(null)
  }

  function handleDeactivate(m: MedicineRow) {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await deactivateMedicine(m.id)
      if (result.error) setDeactivateError(result.error)
      else router.refresh()
    })
  }

  function handleReactivate(m: MedicineRow) {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await reactivateMedicine(m.id)
      if (result.error) setDeactivateError(result.error)
      else router.refresh()
    })
  }

  function handleViewStock(m: MedicineRow) {
    setStockPanelMedicine(m)
  }

  return (
    <div style={{ padding: '24px 28px', background: PAGE.bg, minHeight: '100%' }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: FONT.pageHeading, fontWeight: 600, color: TEXT.primary, margin: 0 }}>
            Medicines
          </h1>
          <p style={{ fontSize: FONT.pageSubhead, color: TEXT.secondary, margin: '2px 0 0' }}>
            {medicines.length} medicine{medicines.length !== 1 ? 's' : ''} in catalog
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {canWrite && (
            <>
              <Button
                variant="secondary"
                size="md"
                icon={<LayoutList size={14} />}
                onClick={() => setCatModalOpen(true)}
              >
                Categories
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon={<Upload size={14} />}
                onClick={() => setImportModalOpen(true)}
              >
                Import CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Plus size={14} />}
                onClick={openAddDrawer}
              >
                Add Medicine
              </Button>
            </>
          )}
        </div>
      </div>

      {deactivateError && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {deactivateError}
        </p>
      )}

      {/* Table */}
      <div style={{ background: PAGE.surface, borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <MedicineTable
          medicines={medicines}
          categories={categories}
          subcategories={subcategories}
          canWrite={canWrite}
          onEdit={openEditDrawer}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onViewStock={handleViewStock}
        />
      </div>

      {/* Drawer — key forces full remount when switching between medicines */}
      {drawerOpen && (
        <MedicineDrawer
          key={selectedMedicine?.id ?? 'new'}
          medicine={selectedMedicine}
          categories={categories}
          subcategories={subcategories}
          onClose={closeDrawer}
        />
      )}

      {/* Category manager modal */}
      {catModalOpen && (
        <CategoryManager
          categories={categories}
          subcategories={subcategories}
          onClose={() => setCatModalOpen(false)}
        />
      )}

      {/* Bulk import modal */}
      {importModalOpen && (
        <BulkImportModal onClose={() => setImportModalOpen(false)} />
      )}

      {/* Stock panel — overlay, triggered by "Stock" button in MedicineTable */}
      {stockPanelMedicine && (
        <MedicineStockPanel
          key={stockPanelMedicine.id}
          medicine={stockPanelMedicine}
          suppliers={suppliers}
          canWrite={canWrite}
          onClose={() => setStockPanelMedicine(null)}
        />
      )}
    </div>
  )
}
