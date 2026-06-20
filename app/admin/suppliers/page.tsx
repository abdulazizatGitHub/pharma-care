import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { SuppliersPage } from '@/components/suppliers/SuppliersPage'
import type { UserRole, Permission } from '@/lib/permissions'
import type { Supplier } from '@/lib/db-types'

export default async function AdminSuppliersPage() {
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

  if (!hasPermission(permissions, 'suppliers')) redirect('/unauthorized')

  const { data } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .order('name')

  return <SuppliersPage suppliers={(data ?? []) as Supplier[]} />
}
