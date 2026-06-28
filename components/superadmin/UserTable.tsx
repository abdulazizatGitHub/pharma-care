'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Edit3, Settings, UserMinus, UserPlus } from 'lucide-react'

export interface UserRow {
  id: string
  full_name: string
  username: string | null
  phone: string | null
  role: 'admin' | 'pharmacist'
  is_active: boolean
  joined_at: string | null
  grants: string[]
  restrictions: string[]
  special_discount_max_tier: number | null
}

type Tab = 'admins' | 'pharmacists' | 'inactive'

interface UserTableProps {
  users:             UserRow[]
  search:            string
  permissionFilter:  string
  onEdit:            (user: UserRow) => void
  onPermissions:     (user: UserRow) => void
  onDeactivate:      (user: UserRow) => void
  onReactivate:      (user: UserRow) => void
  hidePermsButton?:  boolean
  hideReactivate?:   boolean
  hideAdminsTab?:    boolean
}

export function UserTable({
  users, search, permissionFilter,
  onEdit, onPermissions, onDeactivate, onReactivate,
  hidePermsButton = false,
  hideReactivate  = false,
  hideAdminsTab   = false,
}: UserTableProps) {
  const [tab, setTab] = useState<Tab>(hideAdminsTab ? 'pharmacists' : 'admins')

  const counts = {
    admins:      users.filter(u => u.role === 'admin'      && u.is_active).length,
    pharmacists: users.filter(u => u.role === 'pharmacist' && u.is_active).length,
    inactive:    users.filter(u => !u.is_active).length,
  }

  const filtered = users.filter(u => {
    if (tab === 'admins'      && (u.role !== 'admin'      || !u.is_active)) return false
    if (tab === 'pharmacists' && (u.role !== 'pharmacist' || !u.is_active)) return false
    if (tab === 'inactive'    && u.is_active) return false
    const q = search.toLowerCase()
    if (q && !u.full_name.toLowerCase().includes(q) && !(u.username ?? '').toLowerCase().includes(q)) return false
    if (permissionFilter && !u.grants.includes(permissionFilter)) return false
    return true
  })

  const allTabs: { key: Tab; label: string }[] = [
    { key: 'admins',      label: `Admins (${counts.admins})` },
    { key: 'pharmacists', label: `Pharmacists (${counts.pharmacists})` },
    { key: 'inactive',    label: `Inactive (${counts.inactive})` },
  ]
  const tabs = hideAdminsTab ? allTabs.filter(t => t.key !== 'admins') : allTabs

  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[rgba(0,0,0,0.08)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-[12px] font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'text-[#0F6E56] border-[#0F6E56]'
                : 'text-[#6b7280] border-transparent hover:text-[#111827]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[#f9fafb] text-[#6b7280] text-[11px] uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left font-medium">Name</th>
            <th className="px-4 py-2.5 text-left font-medium">Username</th>
            <th className="px-4 py-2.5 text-left font-medium">Phone</th>
            <th className="px-4 py-2.5 text-left font-medium">Joined</th>
            <th className="px-4 py-2.5 text-left font-medium">Permissions</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-[#9ca3af]">
                No users found
              </td>
            </tr>
          )}
          {filtered.map(u => (
            <tr key={u.id} className="border-t border-[rgba(0,0,0,0.06)] hover:bg-[#f9fafb]">
              <td className="px-4 py-3 font-medium text-[#111827]">{u.full_name}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-[#6b7280]">{u.username ?? '—'}</td>
              <td className="px-4 py-3 text-[#6b7280]">{u.phone ?? '—'}</td>
              <td className="px-4 py-3 text-[#6b7280]">{u.joined_at ? u.joined_at.slice(0, 10) : '—'}</td>
              <td className="px-4 py-3 text-[#6b7280]">
                {u.grants.length > 0 ? `+${u.grants.length} granted` : 'Base'}
                {u.restrictions.length > 0 && `, −${u.restrictions.length} restricted`}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  <Button variant="ghost" size="sm" icon={<Edit3 size={12} />} onClick={() => onEdit(u)}>
                    Edit
                  </Button>
                  {!hidePermsButton && (
                    <Button variant="ghost" size="sm" icon={<Settings size={12} />} onClick={() => onPermissions(u)}>
                      Perms
                    </Button>
                  )}
                  {u.is_active ? (
                    <Button variant="danger" size="sm" icon={<UserMinus size={12} />} onClick={() => onDeactivate(u)}>
                      Deactivate
                    </Button>
                  ) : (!hideReactivate && (
                    <Button variant="success" size="sm" icon={<UserPlus size={12} />} onClick={() => onReactivate(u)}>
                      Reactivate
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
