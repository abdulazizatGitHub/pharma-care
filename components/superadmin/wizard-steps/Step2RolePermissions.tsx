'use client'

import { Button } from '@/components/ui/Button'
import {
  ADMIN_BASE_PERMISSIONS,
  PHARMACIST_BASE_PERMISSIONS,
} from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface Step2Data {
  role:               'admin' | 'pharmacist'
  checkedPermissions: Set<Permission>
}

export const ADMIN_ADDITIONAL: Permission[] = [
  'reports_full',
  'expenses',
  'user_manage_pharmacists',
  'sales_history_all',
  'controlled_drugs',
]

export const PHARMACIST_ADDITIONAL: Permission[] = [
  'sales_history_all',
  'inventory_manage',
  'reports_basic',
]

const PERMISSION_LABELS: Record<string, string> = {
  suppliers:               'Suppliers',
  purchase_orders:         'Purchase Orders',
  inventory_view:          'Inventory View',
  inventory_manage:        'Inventory Manage',
  customers:               'Customers',
  shifts:                  'Shifts',
  reports_full:            'Full Reports',
  expenses:                'Expenses',
  user_manage_pharmacists: 'Manage Pharmacists',
  sales_history_all:       'All Sales History',
  controlled_drugs:        'Controlled Drugs',
  pos:                     'Point of Sale',
  prescriptions:           'Prescriptions',
  sales_history_own:       'Own Sales History',
  reports_basic:           'Basic Reports',
}

interface Step2RolePermissionsProps {
  data:        Step2Data
  onChange:    (data: Step2Data) => void
  onNext:      () => void
  onBack:      () => void
  lockedRole?: 'pharmacist'
}

export function Step2RolePermissions({
  data, onChange, onNext, onBack, lockedRole,
}: Step2RolePermissionsProps) {
  function selectRole(role: 'admin' | 'pharmacist') {
    const base = role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
    onChange({ role, checkedPermissions: new Set(base) })
  }

  function toggle(p: Permission) {
    const next = new Set(data.checkedPermissions)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    onChange({ ...data, checkedPermissions: next })
  }

  const base       = data.role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
  const additional = data.role === 'admin' ? ADMIN_ADDITIONAL : PHARMACIST_ADDITIONAL

  // Locked mode: role is pre-set by the caller, no picker or permission editing
  if (lockedRole) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] text-[#6b7280]">Step 2 of 3 — Role</p>

        <div className="rounded-[8px] border-2 border-[#0F6E56] bg-[#f0faf7] p-4">
          <p className="text-[13px] font-semibold text-[#111827]">Pharmacist</p>
          <p className="text-[11px] text-[#6b7280] mt-0.5">Clinical & POS</p>
          <p className="text-[11px] text-[#9ca3af] mt-2">
            Role is set by your account type. Permissions are managed by the superadmin.
          </p>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={onBack} icon={<ChevronLeft size={14} />}>
            Back
          </Button>
          <Button onClick={onNext} icon={<ChevronRight size={14} />}>
            Next: Review
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[#6b7280]">Step 2 of 3 — Role & Permissions</p>

      {/* Role cards */}
      <div className="grid grid-cols-2 gap-3">
        {(['admin', 'pharmacist'] as const).map(role => (
          <button
            key={role}
            onClick={() => selectRole(role)}
            className={`rounded-[8px] border-2 p-4 text-left transition-all ${
              data.role === role
                ? 'border-[#0F6E56] bg-[#f0faf7]'
                : 'border-[rgba(0,0,0,0.10)] hover:border-[rgba(0,0,0,0.20)]'
            }`}
          >
            <p className="text-[13px] font-semibold capitalize text-[#111827]">{role}</p>
            <p className="text-[11px] text-[#6b7280] mt-0.5">
              {role === 'admin' ? 'Procurement & operations' : 'Clinical & POS'}
            </p>
          </button>
        ))}
      </div>

      {/* Base permissions */}
      <div>
        <p className="text-[11px] font-medium text-[#6b7280] mb-2">
          Base permissions (uncheck to restrict)
        </p>
        <div className="grid grid-cols-2 gap-y-2">
          {base.map(p => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.checkedPermissions.has(p)}
                onChange={() => toggle(p)}
                className="accent-[#0F6E56]"
              />
              <span className="text-[12px] text-[#374151]">{PERMISSION_LABELS[p] ?? p}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Additional permissions */}
      <div>
        <p className="text-[11px] font-medium text-[#6b7280] mb-2">
          Additional permissions (check to grant)
        </p>
        <div className="grid grid-cols-2 gap-y-2">
          {additional.map(p => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.checkedPermissions.has(p)}
                onChange={() => toggle(p)}
                className="accent-[#0F6E56]"
              />
              <span className="text-[12px] text-[#374151]">{PERMISSION_LABELS[p] ?? p}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} icon={<ChevronLeft size={14} />}>
          Back
        </Button>
        <Button onClick={onNext} icon={<ChevronRight size={14} />}>
          Next: Review
        </Button>
      </div>
    </div>
  )
}
