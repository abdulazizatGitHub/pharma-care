import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getShiftHistory } from '@/app/actions/shifts'
import { AdminShiftsContent } from '@/components/shifts/AdminShiftsContent'

const PAGE_SIZE = 15

export default async function SuperadminShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pharmacist?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  const sp = await searchParams
  const page        = Math.max(1, parseInt(sp.page ?? '1', 10))
  const pharmacist  = sp.pharmacist ?? ''
  const dateFrom    = sp.from ?? ''
  const dateTo      = sp.to ?? ''

  const [historyResult, pharmacistsResult] = await Promise.all([
    getShiftHistory(
      pharmacist || undefined,
      dateFrom   || undefined,
      dateTo     || undefined,
      page,
      PAGE_SIZE,
    ),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'pharmacist')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('full_name'),
  ])

  return (
    <AdminShiftsContent
      shifts={historyResult.data ?? []}
      pharmacistOptions={pharmacistsResult.data ?? []}
      currentPage={page}
      totalCount={historyResult.total}
      pageSize={PAGE_SIZE}
      defaultPharmacistId={pharmacist}
      defaultDateFrom={dateFrom}
      defaultDateTo={dateTo}
    />
  )
}
