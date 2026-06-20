import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLE_HOME } from '@/lib/routes'
import type { UserRole } from '@/lib/permissions'

export default async function RootPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect(`/unauthorized?message=${encodeURIComponent('Profile not found. Contact administrator.')}`)
  }

  redirect(ROLE_HOME[profile.role as UserRole] ?? '/unauthorized')
}
