import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReportsPage } from '@/components/reports/ReportsPage'

export default async function SuperadminReportsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  return <ReportsPage role="superadmin" userId={user.id} />
}
