import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardUserProvider } from '@/lib/dashboard-context'
import { RoleShell } from '@/components/shared/RoleShell'
import { SuperadminSidebar } from '@/components/superadmin/SuperAdminSidebar'
import { SessionTimeout } from '@/lib/session-timeout'
import { SUPERADMIN_PERMISSIONS } from '@/lib/permissions'
import { ROLE_HOME } from '@/lib/routes'
import type { UserRole } from '@/lib/permissions'

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
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
  if (role !== 'superadmin') redirect(ROLE_HOME[role])
  if (profile.force_password_change) redirect('/change-password')

  const pharmacyName   = pharmacySetting?.value ?? 'PharmaCare'
  const timeoutMinutes = parseInt(timeoutSetting?.value ?? '30', 10)

  return (
    <>
    <SessionTimeout timeoutMinutes={timeoutMinutes} />
    <DashboardUserProvider
      value={{ id: user.id, full_name: profile.full_name ?? '', role: 'superadmin', permissions: SUPERADMIN_PERMISSIONS }}
    >
      <RoleShell
        sidebar={<SuperadminSidebar pharmacyName={pharmacyName} />}
        userFullName={profile.full_name ?? ''}
        pharmacyName={pharmacyName}
      >
        {children}
      </RoleShell>
    </DashboardUserProvider>
    </>
  )
}
