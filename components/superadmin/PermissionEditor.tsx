'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { updatePermissions } from '@/app/actions/users'
import {
  ADMIN_BASE_PERMISSIONS,
  PHARMACIST_BASE_PERMISSIONS,
} from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import {
  ADMIN_ADDITIONAL,
  PHARMACIST_ADDITIONAL,
} from './wizard-steps/Step2RolePermissions'
import type { UserRow } from './UserTable'

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

function buildChecked(user: UserRow): Set<Permission> {
  const base = user.role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
  const set  = new Set<Permission>(base)
  for (const g of user.grants)       set.add(g as Permission)
  for (const r of user.restrictions) set.delete(r as Permission)
  return set
}

interface PermissionEditorProps {
  user:    UserRow | null
  onClose: () => void
}

export function PermissionEditor({ user, onClose }: PermissionEditorProps) {
  const router = useRouter()
  const [checked, setChecked] = useState<Set<Permission>>(
    user ? buildChecked(user) : new Set(),
  )
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle(p: Permission) {
    const next = new Set(checked)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setChecked(next)
  }

  function handleSave() {
    if (!user) return
    setError(null)
    const base       = user.role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
    const additional = user.role === 'admin' ? ADMIN_ADDITIONAL : PHARMACIST_ADDITIONAL
    const grants       = additional.filter(p => checked.has(p))
    const restrictions = base.filter(p => !checked.has(p))
    startTransition(async () => {
      const result = await updatePermissions(user.id, grants, restrictions)
      if (result.error) { setError(result.error); return }
      router.refresh()
      onClose()
    })
  }

  if (!user) return null

  const base       = user.role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
  const additional = user.role === 'admin' ? ADMIN_ADDITIONAL : PHARMACIST_ADDITIONAL

  return (
    <Modal open onClose={onClose} title={`Permissions — ${user.full_name}`} size="md">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-medium text-[#6b7280] mb-2">
            Base permissions (uncheck to restrict)
          </p>
          <div className="grid grid-cols-2 gap-y-2">
            {base.map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(p)}
                  onChange={() => toggle(p)}
                  className="accent-[#0F6E56]"
                />
                <span className="text-[12px] text-[#374151]">{PERMISSION_LABELS[p] ?? p}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-[#6b7280] mb-2">
            Additional permissions (check to grant)
          </p>
          <div className="grid grid-cols-2 gap-y-2">
            {additional.map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(p)}
                  onChange={() => toggle(p)}
                  className="accent-[#0F6E56]"
                />
                <span className="text-[12px] text-[#374151]">{PERMISSION_LABELS[p] ?? p}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button loading={isPending} onClick={handleSave}>
            Save Permissions
          </Button>
        </div>
      </div>
    </Modal>
  )
}
