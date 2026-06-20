'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Lock } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PAGE, TEXT } from '@/lib/design-tokens'
import { createMedicine, updateMedicine } from '@/app/actions/medicines'
import type { MedicineCategory, MedicineSubcategory, MedicineRow } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicineDrawerProps {
  medicine?:     MedicineRow | null
  categories:    MedicineCategory[]
  subcategories: MedicineSubcategory[]
  onClose:       () => void
}

const UNITS = ['strip', 'bottle', 'vial', 'sachet', 'tube', 'injection', 'syrup', 'drops', 'tablet', 'capsule']

// ─── Component ────────────────────────────────────────────────────────────────

export function MedicineDrawer({ medicine, categories, subcategories, onClose }: MedicineDrawerProps) {
  const router  = useRouter()
  const isEdit  = !!medicine

  // Form state — initialised from medicine prop (edit) or defaults (add)
  const [name,          setName]          = useState(medicine?.name ?? '')
  const [code,          setCode]          = useState(medicine?.code ?? '')
  const [genericName,   setGenericName]   = useState(medicine?.generic_name ?? '')
  const [manufacturer,  setManufacturer]  = useState(medicine?.manufacturer ?? '')
  const [drapRegNo,     setDrapRegNo]     = useState(medicine?.drap_reg_no ?? '')
  const [barcode,       setBarcode]       = useState(medicine?.barcode ?? '')
  const [categoryId,    setCategoryId]    = useState(medicine?.category_id ?? '')
  const [subcategoryId, setSubcategoryId] = useState(medicine?.subcategory_id ?? '')
  const [schedule,      setSchedule]      = useState<'OTC' | 'prescription' | 'controlled'>(medicine?.schedule ?? 'OTC')
  const [packSize,      setPackSize]      = useState(medicine?.pack_size ?? '')
  const [unit,          setUnit]          = useState(medicine?.unit ?? 'strip')
  const [mrp,           setMrp]           = useState(medicine ? String(medicine.mrp) : '')
  const [reorderLevel,  setReorderLevel]  = useState(medicine ? String(medicine.reorder_level) : '10')
  const [instructions,  setInstructions]  = useState(medicine?.instructions ?? '')
  const [precautions,   setPrecautions]   = useState(medicine?.precautions ?? '')
  const [error,         setError]         = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  const isOpen = true  // drawer is mounted only when open; key prop in parent forces remount

  // Subcategories filtered by selected category
  const filteredSubs = useMemo(
    () => categoryId ? subcategories.filter(s => s.category_id === categoryId) : [],
    [subcategories, categoryId],
  )

  function handleSave() {
    setError(null)
    const mrpNum        = parseFloat(mrp)
    const reorderNum    = parseInt(reorderLevel, 10)

    if (!name.trim())        { setError('Medicine name is required'); return }
    if (!manufacturer.trim()) { setError('Manufacturer is required'); return }
    if (isNaN(mrpNum) || mrpNum <= 0) { setError('MRP must be a positive number'); return }

    startTransition(async () => {
      if (isEdit) {
        const result = await updateMedicine(medicine.id, {
          name:           name.trim(),
          generic_name:   genericName.trim() || undefined,
          manufacturer:   manufacturer.trim(),
          drap_reg_no:    drapRegNo.trim() || undefined,
          category_id:    categoryId || null,
          subcategory_id: subcategoryId || null,
          schedule,
          pack_size:      packSize.trim() || undefined,
          unit,
          mrp:            mrpNum,
          reorder_level:  isNaN(reorderNum) ? 10 : reorderNum,
          barcode:        barcode.trim() || undefined,
          instructions:   instructions.trim() || undefined,
          precautions:    precautions.trim() || undefined,
        })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await createMedicine({
          name:           name.trim(),
          code:           code.trim() || undefined,
          generic_name:   genericName.trim() || undefined,
          manufacturer:   manufacturer.trim(),
          drap_reg_no:    drapRegNo.trim() || undefined,
          category_id:    categoryId || undefined,
          subcategory_id: subcategoryId || undefined,
          schedule,
          pack_size:      packSize.trim() || undefined,
          unit,
          mrp:            mrpNum,
          reorder_level:  isNaN(reorderNum) ? 10 : reorderNum,
          barcode:        barcode.trim() || undefined,
          instructions:   instructions.trim() || undefined,
          precautions:    precautions.trim() || undefined,
        })
        if (result.error) { setError(result.error); return }
      }
      router.refresh()
      onClose()
    })
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: `1px solid ${PAGE.border}`,
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-40 bg-white shadow-2xl flex flex-col"
        style={{
          width: 480,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[14px] font-medium text-[#111827]">
            {isEdit ? 'Edit Medicine' : 'Add Medicine'}
          </h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Section 1 — Identity */}
          <div>
            <p style={sectionHead}>Identity</p>
            <div className="space-y-3">
              <Input
                label="Medicine name"
                required
                placeholder="e.g. Panadol 500mg"
                value={name}
                onChange={e => setName(e.target.value)}
              />

              {/* Code — editable in add mode, read-only lock in edit mode */}
              {isEdit ? (
                <div className="flex flex-col gap-1">
                  <span style={{ fontSize: 11, fontWeight: 500, color: TEXT.secondary }}>Code</span>
                  <div className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#f9fafb]">
                    <Lock size={12} style={{ color: TEXT.secondary, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: TEXT.secondary, fontFamily: 'monospace' }}>
                      {medicine?.code ?? 'No code assigned'}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: TEXT.secondary }}>Medicine code is immutable after creation</p>
                </div>
              ) : (
                <Input
                  label="Code"
                  placeholder="Auto-generated if blank (001, 002…)"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  hint="Leave blank to auto-generate. Once saved, code cannot be changed."
                />
              )}

              <Input
                label="Generic / salt name"
                placeholder="e.g. Paracetamol"
                value={genericName}
                onChange={e => setGenericName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="DRAP reg. no."
                  placeholder="Optional"
                  value={drapRegNo}
                  onChange={e => setDrapRegNo(e.target.value)}
                />
                <Input
                  label="Barcode"
                  placeholder="Optional"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 2 — Classification */}
          <div>
            <p style={sectionHead}>Classification</p>
            <div className="space-y-3">
              <Input
                label="Manufacturer / Company"
                required
                placeholder="e.g. GSK Pakistan"
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Category"
                  value={categoryId}
                  onChange={e => { setCategoryId(e.target.value); setSubcategoryId('') }}
                >
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Select
                  label="Sub-category"
                  value={subcategoryId}
                  onChange={e => setSubcategoryId(e.target.value)}
                  disabled={!categoryId}
                >
                  <option value="">— Select —</option>
                  {filteredSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>

              {/* Schedule radio */}
              <div className="flex flex-col gap-1">
                <span style={{ fontSize: 11, fontWeight: 500, color: TEXT.secondary }}>Drug schedule <span style={{ color: '#E24B4A' }}>*</span></span>
                <div className="flex gap-4 pt-1">
                  {(['OTC', 'prescription', 'controlled'] as const).map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: TEXT.primary }}>
                      <input
                        type="radio"
                        name="schedule"
                        value={s}
                        checked={schedule === s}
                        onChange={() => setSchedule(s)}
                        style={{ accentColor: '#0F6E56' }}
                      />
                      {s === 'OTC' ? 'OTC' : s === 'prescription' ? 'Prescription' : 'Controlled'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 — Pack & Pricing */}
          <div>
            <p style={sectionHead}>Pack & Pricing</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Pack size"
                  placeholder="e.g. 10 tablets, 100ml"
                  value={packSize}
                  onChange={e => setPackSize(e.target.value)}
                />
                <Select
                  label="Unit"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="MRP (Rs)"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={mrp}
                  onChange={e => setMrp(e.target.value)}
                />
                <Input
                  label="Reorder level"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="10"
                  value={reorderLevel}
                  onChange={e => setReorderLevel(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 4 — Clinical Notes */}
          <div>
            <p style={sectionHead}>Clinical Notes</p>
            <div className="space-y-3">
              <Textarea
                label="Instructions"
                placeholder="Dosage instructions, usage directions…"
                rows={3}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
              <Textarea
                label="Precautions"
                placeholder="Warnings, contraindications…"
                rows={3}
                value={precautions}
                onChange={e => setPrecautions(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button className="flex-1" loading={isPending} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Medicine'}
          </Button>
        </div>
      </div>
    </>
  )
}
