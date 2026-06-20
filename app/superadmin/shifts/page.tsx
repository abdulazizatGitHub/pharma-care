import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getShiftHistory } from '@/app/actions/shifts'
import { AdminShiftsContent } from '@/components/shifts/AdminShiftsContent'

export default async function SuperadminShiftsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

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
