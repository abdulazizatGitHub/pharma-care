'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { UserTable, type UserRow } from '@/components/superadmin/UserTable'
import { CreateUserWizard } from '@/components/superadmin/CreateUserWizard'
import { EditUserDrawer } from '@/components/superadmin/EditUserDrawer'
import { DeactivateConfirm } from '@/components/superadmin/DeactivateConfirm'
import { deactivateUser } from '@/app/actions/users'

interface AdminStaffPageProps {
  users:             UserRow[]
  pharmacyName:      string
  existingUsernames: string[]
}

export function AdminStaffPage({
  users, pharmacyName, existingUsernames,
}: AdminStaffPageProps) {
  const router = useRouter()

  const [search,           setSearch]           = useState('')
  const [wizardOpen,       setWizardOpen]        = useState(false)
  const [editingUser,      setEditingUser]        = useState<UserRow | null>(null)
  const [deactivateTarget, setDeactivateTarget]  = useState<UserRow | null>(null)
  const [deactivateError,  setDeactivateError]   = useState<string | null>(null)

  const [isDeactivating, startDeactivate] = useTransition()

  function handleDeactivate(user: UserRow) {
    setDeactivateTarget(user)
    setDeactivateError(null)
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
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Staff"
          description="Manage pharmacist accounts for your pharmacy."
        />
        <Button icon={<Plus size={14} />} onClick={() => setWizardOpen(true)}>
          New Pharmacist
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or username…"
          className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-[rgba(0,0,0,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] bg-white"
        />
      </div>

      <UserTable
        users={users}
        search={search}
        permissionFilter=""
        onEdit={setEditingUser}
        onPermissions={() => {}}
        onDeactivate={handleDeactivate}
        onReactivate={() => {}}
        hidePermsButton
        hideReactivate
        hideAdminsTab
      />

      {deactivateError && (
        <p className="text-[11px] text-[#A32D2D]">{deactivateError}</p>
      )}

      <CreateUserWizard
        open={wizardOpen}
        pharmacyName={pharmacyName}
        existingUsernames={existingUsernames}
        lockedRole="pharmacist"
        onClose={() => setWizardOpen(false)}
      />

      <EditUserDrawer
        user={editingUser}
        onClose={() => setEditingUser(null)}
        sdSettings={{ enabled: false, type: 'percentage', tiers: [] }}
      />

      <DeactivateConfirm
        open={!!deactivateTarget}
        fullName={deactivateTarget?.full_name ?? ''}
        role="pharmacist"
        loading={isDeactivating}
        onConfirm={confirmDeactivate}
        onClose={() => setDeactivateTarget(null)}
      />
    </div>
  )
}
