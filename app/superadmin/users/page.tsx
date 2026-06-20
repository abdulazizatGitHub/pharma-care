import { createClient } from '@/lib/supabase/server'
import { UserManagementPage } from '@/components/superadmin/UserManagementPage'
import type { UserRow } from '@/components/superadmin/UserTable'

export default async function SuperadminUsersPage() {
  const supabase = await createClient()

  const [{ data: profiles }, { data: permissions }, { data: setting }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, username, phone, joined_at')
      .in('role', ['admin', 'pharmacist'])
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

  const permsByUser = (permissions ?? []).reduce<
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
    role:         p.role as 'admin' | 'pharmacist',
    is_active:    p.is_active,
    joined_at:    p.joined_at,
    grants:       permsByUser[p.id]?.grants       ?? [],
    restrictions: permsByUser[p.id]?.restrictions ?? [],
  }))

  const pharmacyName = setting?.value ?? 'pharmacare'

  // TODO: At scale, replace with a server-side uniqueness check API call instead of passing
  // all usernames to the client. Acceptable for single-branch MVP with <100 users.
  const existingUsernames = users
    .map(u => u.username)
    .filter((u): u is string => u !== null)

  return (
    <UserManagementPage
      users={users}
      pharmacyName={pharmacyName}
      existingUsernames={existingUsernames}
    />
  )
}
