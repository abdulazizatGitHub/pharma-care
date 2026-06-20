import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { getShiftHistory } from '@/app/actions/shifts'
import { AdminShiftsContent } from '@/components/shifts/AdminShiftsContent'
import type { UserRole, Permission } from '@/lib/permissions'

export default async function AdminShiftsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: overrides }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('user_permissions').select('permission, type').eq('user_id', user.id),
  ])

  if (!profile) redirect('/login')

  const permissions = resolvePermissions(
    (profile.role ?? 'admin') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'shifts')) redirect('/unauthorized')

  const [historyResult, pharmacistsResult] = await Promise.all([
    getShiftHistory(),
    supabase.from('profiles').select('id, full_name').eq('role', 'pharmacist').eq('is_active', true).eq('is_deleted', false).order('full_name'),
  ])

  return (
    <AdminShiftsContent
      initialHistory={historyResult.data ?? []}
      pharmacistOptions={pharmacistsResult.data ?? []}
    />
  )
}
