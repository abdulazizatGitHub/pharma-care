'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TEXT, PAGE } from '@/lib/design-tokens'
import { createSupplier, updateSupplier } from '@/app/actions/suppliers'
import type { Supplier } from '@/lib/db-types'

interface SupplierDrawerProps {
  supplier?: Supplier | null
  onClose:  () => void
}

export function SupplierDrawer({ supplier, onClose }: SupplierDrawerProps) {
  const router  = useRouter()
  const isEdit  = !!supplier
  const [isPending, startTransition] = useTransition()

  // ── Section 1: Company Details ─────────────────────────────────────────────
  const [name,          setName]          = useState(supplier?.name          ?? '')
  const [contactPerson, setContactPerson] = useState(supplier?.contact_person ?? '')
  const [phone,         setPhone]         = useState(supplier?.phone         ?? '')
  const [email,         setEmail]         = useState(supplier?.email         ?? '')

  // ── Section 2: Tax & Finance ───────────────────────────────────────────────
  const [ntn,         setNtn]         = useState(supplier?.ntn          ?? '')
  const [creditDays,  setCreditDays]  = useState(String(supplier?.credit_days ?? 30))
  const [creditLimit, setCreditLimit] = useState(
    supplier?.credit_limit != null ? String(supplier.credit_limit) : '',
  )

  // ── Section 3: Address & Notes ─────────────────────────────────────────────
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [notes,   setNotes]   = useState(supplier?.notes   ?? '')

  const [error, setError] = useState<string | null>(null)

  const sectionHead: React.CSSProperties = {
    fontSize:      11,
    fontWeight:    600,
    color:         TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom:  10,
    paddingBottom: 6,
    borderBottom:  `1px solid ${PAGE.border}`,
  }

  function buildInput() {
    const cdNum = parseInt(creditDays, 10)
    const clNum = parseFloat(creditLimit)

    return {
      name:           name.trim(),
      contact_person: contactPerson.trim() || undefined,
      phone:          phone.trim()         || undefined,
      email:          email.trim()         || undefined,
      ntn:            ntn.trim()           || undefined,
      credit_days:    isNaN(cdNum) ? 30 : Math.max(0, cdNum),
      credit_limit:   isNaN(clNum) || creditLimit.trim() === '' ? undefined : clNum,
      address:        address.trim() || undefined,
      notes:          notes.trim()   || undefined,
    }
  }

  function validate(): boolean {
    setError(null)
    if (!name.trim()) { setError('Supplier name is required'); return false }
    const cdNum = parseInt(creditDays, 10)
    if (isNaN(cdNum) || cdNum < 0) { setError('Credit days must be 0 or more'); return false }
    if (creditLimit.trim()) {
      const clNum = parseFloat(creditLimit)
      if (isNaN(clNum) || clNum <= 0) { setError('Credit limit must be a positive number'); return false }
    }
    return true
  }

  function handleSave() {
    if (!validate()) return
    const input = buildInput()

    startTransition(async () => {
      const result = isEdit
        ? await updateSupplier(supplier.id, input)
        : await createSupplier(input)

      if (result.error) { setError(result.error); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full z-50 bg-white shadow-2xl flex flex-col"
        style={{ width: 440 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div>
            <h2 className="text-[14px] font-medium text-[#111827]">
              {isEdit ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            {isEdit && (
              <p className="text-[11px] text-[#6b7280] mt-0.5">{supplier.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Section 1 — Company Details */}
          <div>
            <p style={sectionHead}>Company Details</p>
            <div className="space-y-3">
              <Input
                label="Supplier name"
                required
                placeholder="e.g. MedLine Distributors"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <Input
                label="Contact person"
                placeholder="Primary contact name"
                value={contactPerson}
                onChange={e => setContactPerson(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Phone"
                  placeholder="03xx-xxxxxxx"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="supplier@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 2 — Tax & Finance */}
          <div>
            <p style={sectionHead}>Tax & Finance</p>
            <div className="space-y-3">
              <Input
                label="NTN (National Tax Number)"
                placeholder="e.g. 1234567-8"
                value={ntn}
                onChange={e => setNtn(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Credit days"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="30"
                  value={creditDays}
                  onChange={e => setCreditDays(e.target.value)}
                  hint="Payment due after delivery"
                />
                <Input
                  label="Credit limit (PKR)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  hint="Max outstanding balance"
                />
              </div>
            </div>
          </div>

          {/* Section 3 — Address & Notes */}
          <div>
            <p style={sectionHead}>Address & Notes</p>
            <div className="space-y-3">
              <Textarea
                label="Address"
                placeholder="Full business address"
                rows={3}
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
              <Textarea
                label="Internal notes"
                placeholder="Optional — internal notes about this supplier"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
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
            {isEdit ? 'Save Changes' : 'Add Supplier'}
          </Button>
        </div>
      </div>
    </>
  )
}
