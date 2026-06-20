'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { UserTable, type UserRow } from './UserTable'
import { CreateUserWizard } from './CreateUserWizard'
import { EditUserDrawer } from './EditUserDrawer'
import { PermissionEditor } from './PermissionEditor'
import { DeactivateConfirm } from './DeactivateConfirm'
import { deactivateUser, reactivateUser } from '@/app/actions/users'

interface UserManagementPageProps {
  users:             UserRow[]
  pharmacyName:      string
  existingUsernames: string[]
}

export function UserManagementPage({
  users, pharmacyName, existingUsernames,
}: UserManagementPageProps) {
  const router = useRouter()

  const [search,          setSearch]          = useState('')
  const [permissionFilter]                    = useState('')
  const [wizardOpen,      setWizardOpen]      = useState(false)
  const [editingUser,     setEditingUser]      = useState<UserRow | null>(null)
  const [permUser,        setPermUser]         = useState<UserRow | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null)
  const [deactivateError,  setDeactivateError]  = useState<string | null>(null)

  const [isDeactivating, startDeactivate] = useTransition()

  function handleDeactivate(user: UserRow) {
    setDeactivateTarget(user)
    setDeactivateError(null)
  }

  function handleReactivate(user: UserRow) {
    startDeactivate(async () => {
      const result = await reactivateUser(user.id)
      if (!result.error) router.refresh()
    })
  }

  function confirmDeactivate() {
    if (!deactivateTarget) return
    startDeactivate(async () => {
      const result = await deactivateUser(deactivateTarget.id)
      if (result.error) { setDeactivateError(result.error); return }
      router.refresh()
      setDeactivateTarget(null)
    })
  }

  return (
    <div className="space-y-5">
      {/* Page header + primary action */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="User Management"
          description="Create and manage admin and pharmacist accounts."
        />
        <Button icon={<Plus size={14} />} onClick={() => setWizardOpen(true)}>
          New User
        </Button>
      </div>

      {/* Search filter */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or username…"
          className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-[rgba(0,0,0,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] bg-white"
        />
      </div>

      {/* User table */}
      <UserTable
        users={users}
        search={search}
        permissionFilter={permissionFilter}
        onEdit={setEditingUser}
        onPermissions={user => setPermUser(user)}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
      />

      {deactivateError && (
        <p className="text-[11px] text-[#A32D2D]">{deactivateError}</p>
      )}

      {/* Modals / drawers */}
      <CreateUserWizard
        open={wizardOpen}
        pharmacyName={pharmacyName}
        existingUsernames={existingUsernames}
        onClose={() => setWizardOpen(false)}
      />

      <EditUserDrawer
        user={editingUser}
        onClose={() => setEditingUser(null)}
      />

      {permUser && (
        <PermissionEditor
          key={permUser.id}
          user={permUser}
          onClose={() => setPermUser(null)}
        />
      )}

      <DeactivateConfirm
        open={!!deactivateTarget}
        fullName={deactivateTarget?.full_name ?? ''}
        role={deactivateTarget?.role ?? 'pharmacist'}
        loading={isDeactivating}
        onConfirm={confirmDeactivate}
        onClose={() => setDeactivateTarget(null)}
      />
    </div>
  )
}
