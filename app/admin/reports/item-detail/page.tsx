import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ItemDetailPage from '@/components/reports/item-detail/ItemDetailPage'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ medicine_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
    redirect('/admin/dashboard')
  }

  const params = await searchParams

  return (
    <ItemDetailPage
      role={profile.role as 'superadmin' | 'admin'}
      initialMedicineId={params.medicine_id ?? null}
    />
  )
}
