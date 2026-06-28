import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import type { UserRole, Permission } from '@/lib/permissions'
import { AdminStaffPage } from '@/components/admin/AdminStaffPage'
import type { UserRow } from '@/components/superadmin/UserTable'

export default async function AdminStaffPageRoute() {
  const supabase = await createClient()

  // Resolve the calling admin's permissions
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: overrides } = await supabase
    .from('user_permissions')
    .select('permission, type')
    .eq('user_id', user.id)

  const permissions = resolvePermissions(
    (profile?.role ?? 'admin') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'user_manage_pharmacists')) {
    redirect('/unauthorized')
  }

  // Fetch pharmacists + their permission overrides
  const [{ data: profiles }, { data: permOverrides }, { data: setting }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, is_active, username, phone, joined_at, special_discount_max_tier')
      .eq('role', 'pharmacist')
      .order('created_at', { ascending: true }),
    supabase
      .from('user_permissions')
      .select('user_id, permission, type'),
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'pharmacy_name')
      .single(),
  ])

  const permsByUser = (permOverrides ?? []).reduce<
    Record<string, { grants: string[]; restrictions: string[] }>
  >((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = { grants: [], restrictions: [] }
    if (p.type === 'grant') acc[p.user_id].grants.push(p.permission)
    else                    acc[p.user_id].restrictions.push(p.permission)
    return acc
  }, {})

  const users: UserRow[] = (profiles ?? []).map(p => ({
    id:           p.id,
    full_name:    p.full_name ?? '',
    username:     p.username,
    phone:        p.phone,
    role:         'pharmacist' as const,
    is_active:    p.is_active,
    joined_at:    p.joined_at,
    grants:                    permsByUser[p.id]?.grants       ?? [],
    restrictions:              permsByUser[p.id]?.restrictions ?? [],
    special_discount_max_tier: (p.special_discount_max_tier as number | null) ?? null,
  }))

  const pharmacyName = setting?.value ?? 'pharmacare'

  const existingUsernames = users
    .map(u => u.username)
    .filter((u): u is string => u !== null)

  return (
    <AdminStaffPage
      users={users}
      pharmacyName={pharmacyName}
      existingUsernames={existingUsernames}
    />
  )
}
