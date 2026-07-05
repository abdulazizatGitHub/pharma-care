import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { BalanceSheetPage } from '@/components/superadmin/BalanceSheetPage'
import { getPrintSettings } from '@/app/actions/settings'
import { FALLBACK_PRINT_SETTINGS } from '@/lib/print-utils'

export default async function SuperadminBalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
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

  const today = new Date().toISOString().split('T')[0]
  const sp    = await searchParams
  const raw   = sp.date ?? ''
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today

  const [{ data: rows }, { data: pharmacySetting }, printResult] = await Promise.all([
    supabase.rpc('get_balance_sheet', { p_as_of_date: asOfDate }),
    supabase.from('settings').select('value').eq('key', 'pharmacy_name').single(),
    getPrintSettings(),
  ])

  const pharmacyName = pharmacySetting?.value ?? 'PharmaCare'

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1080, margin: '0 auto' }}>
      <PageHeader
        title="Balance Sheet"
        description={`As of ${asOfDate}`}
      />
      <BalanceSheetPage
        rows={rows ?? []}
        asOfDate={asOfDate}
        pharmacyName={pharmacyName}
        printSettings={printResult.data ?? FALLBACK_PRINT_SETTINGS}
      />
    </div>
  )
}
