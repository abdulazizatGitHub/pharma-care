import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuditLogs, getAuditStats, getAuditFilterOptions } from '@/app/actions/audit'
import { AuditPage } from '@/components/audit/AuditPage'

export default async function SuperadminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?:      string
    userId?:    string
    action?:    string
    tableName?: string
    dateFrom?:  string
    dateTo?:    string
  }>
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

  const today           = new Date()
  const defaultDateTo   = today.toISOString().slice(0, 10)
  const defaultDateFrom = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10)

  const sp        = await searchParams
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10))
  const dateFrom  = sp.dateFrom  ?? defaultDateFrom
  const dateTo    = sp.dateTo    ?? defaultDateTo
  const userId    = sp.userId    ?? ''
  const action    = sp.action    ?? ''
  const tableName = sp.tableName ?? ''

  const filters = {
    userId:    userId    || undefined,
    action:    action    || undefined,
    tableName: tableName || undefined,
    dateFrom,
    dateTo,
  }

  const [logsResult, statsResult, optionsResult] = await Promise.all([
    getAuditLogs(filters, page, 15),
    getAuditStats(dateFrom, dateTo),
    getAuditFilterOptions(),
  ])

  return (
    <AuditPage
      logs={logsResult.data?.logs ?? []}
      currentPage={page}
      totalCount={logsResult.data?.total ?? 0}
      initialStats={statsResult.data}
      filterOptions={optionsResult.data ?? { users: [], tableNames: [] }}
      role="superadmin"
      defaultDateFrom={defaultDateFrom}
      defaultDateTo={defaultDateTo}
      defaultUserId={userId}
      defaultAction={action}
      defaultTableName={tableName}
    />
  )
}
