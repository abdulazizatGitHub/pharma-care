import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { getCurrentShift, getShiftHistory } from '@/app/actions/shifts'
import { PharmacistShiftsContent } from '@/components/shifts/PharmacistShiftsContent'
import type { UserRole, Permission } from '@/lib/permissions'

const PAGE_SIZE = 15

export default async function PharmacistShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: overrides }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('user_permissions').select('permission, type').eq('user_id', user.id),
  ])

  if (!profile) redirect('/login')

  const permissions = resolvePermissions(
    (profile.role ?? 'pharmacist') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'shifts')) redirect('/unauthorized')

  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))

  const [shiftResult, historyResult] = await Promise.all([
    getCurrentShift(user.id),
    getShiftHistory(user.id, undefined, undefined, page, PAGE_SIZE),
  ])

  return (
    <PharmacistShiftsContent
      initialShift={shiftResult.data}
      initialHistory={historyResult.data ?? []}
      currentPage={page}
      totalCount={historyResult.total}
      pageSize={PAGE_SIZE}
    />
  )
}
