import { createClient } from '@/lib/supabase/server'
import { getJournalEntries } from '@/app/actions/ledger'
import { JournalEntriesPage } from '@/components/ledger/JournalEntriesPage'
import type { Account } from '@/lib/db-types'

export default async function SuperadminJournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?:   string
    status?:   string
    refType?:  string
    page?:     string
  }>
}) {
  const sp         = await searchParams
  const dateFrom   = sp.dateFrom   ?? ''
  const dateTo     = sp.dateTo     ?? ''
  const status     = sp.status     ?? ''
  const refType    = sp.refType    ?? ''
  const page       = Math.max(1, parseInt(sp.page ?? '1', 10))

  const [entriesResult, accountsResult] = await Promise.all([
    getJournalEntries({
      dateFrom:      dateFrom  || undefined,
      dateTo:        dateTo    || undefined,
      status:        status    || undefined,
      referenceType: refType   || undefined,
      page,
      pageSize: 15,
    }),
    (async () => {
      const supabase = await createClient()
      return supabase
        .from('accounts')
        .select('*')
        .eq('is_active',  true)
        .eq('is_deleted', false)
        .order('code')
    })(),
  ])

  return (
    <JournalEntriesPage
      entries={entriesResult.data ?? []}
      total={entriesResult.total}
      currentPage={page}
      isSuperadmin={true}
      accounts={(accountsResult.data ?? []) as Account[]}
      filterDateFrom={dateFrom}
      filterDateTo={dateTo}
      filterStatus={status}
      filterRefType={refType}
      basePath="/superadmin/ledger/journal"
    />
  )
}
