import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuditLogs, getAuditStats, getAuditFilterOptions } from '@/app/actions/audit'
import { AuditPage } from '@/components/audit/AuditPage'

export default async function SuperadminAuditPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  // Default date range: last 30 days
  const today     = new Date()
  const dateTo    = today.toISOString().slice(0, 10)
  const dateFrom  = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10)

  const [logsResult, statsResult, optionsResult] = await Promise.all([
    getAuditLogs({ dateFrom, dateTo }, 1, 50),
    getAuditStats(dateFrom, dateTo),
    getAuditFilterOptions(),
  ])

  return (
    <AuditPage
      initialPage={logsResult.data ?? { logs: [], total: 0, page: 1, pageSize: 50 }}
      initialStats={statsResult.data}
      filterOptions={optionsResult.data ?? { users: [], tableNames: [] }}
      role="superadmin"
      defaultDateFrom={dateFrom}
      defaultDateTo={dateTo}
    />
  )
}
