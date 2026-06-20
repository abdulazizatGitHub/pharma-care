import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardUserProvider } from '@/lib/dashboard-context'
import { RoleShell } from '@/components/shared/RoleShell'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { SessionTimeout } from '@/lib/session-timeout'
import { resolvePermissions } from '@/lib/permissions'
import { ROLE_HOME } from '@/lib/routes'
import type { UserRole, Permission } from '@/lib/permissions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: pharmacySetting }, { data: timeoutSetting }] = await Promise.all([
    supabase.from('profiles').select('full_name, role, force_password_change').eq('id', user.id).single(),
    supabase.from('settings').select('value').eq('key', 'pharmacy_name').single(),
    supabase.from('settings').select('value').eq('key', 'session_timeout_minutes').single(),
  ])

  if (!profile) {
    redirect(`/unauthorized?message=${encodeURIComponent('Profile not found. Contact administrator.')}`)
  }

  const role = profile.role as UserRole
  if (role !== 'admin' && role !== 'superadmin') redirect(ROLE_HOME[role])
  if (profile.force_password_change) redirect('/change-password')

  const { data: overrides } = await supabase
    .from('user_permissions')
    .select('permission, type')
    .eq('user_id', user.id)

  const permissions = resolvePermissions(
    role,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  const pharmacyName   = pharmacySetting?.value ?? 'PharmaCare'
  const timeoutMinutes = parseInt(timeoutSetting?.value ?? '30', 10)

  return (
    <>
      <SessionTimeout timeoutMinutes={timeoutMinutes} />
      <DashboardUserProvider
        value={{ id: user.id, full_name: profile.full_name ?? '', role, permissions }}
      >
        <RoleShell
          sidebar={<AdminSidebar pharmacyName={pharmacyName} />}
          userFullName={profile.full_name ?? ''}
          pharmacyName={pharmacyName}
        >
          {children}
        </RoleShell>
      </DashboardUserProvider>
    </>
  )
}
