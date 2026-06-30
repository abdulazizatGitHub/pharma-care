import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LedgerCustomerDetailPage } from '@/components/ledger/LedgerCustomerDetailPage'
import { getPartyLedger } from '@/app/actions/ledger'
import type { PartyLedgerLine } from '@/app/actions/ledger'

type CustomerRow = { id: string; name: string; phone: string | null; credit_balance: number }

export default async function SuperadminCustomerLedgerPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])

  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo   = now.toISOString().split('T')[0]

  // sp.from === '' means "Show All" was clicked; sp.from === undefined means first load (use default)
  const dateFrom = sp.from !== undefined ? sp.from : defaultFrom
  const dateTo   = sp.to   !== undefined ? sp.to   : defaultTo

  const supabase = await createClient()

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select('id, name, phone, credit_balance')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!rawCustomer) notFound()

  const customer = rawCustomer as CustomerRow

  const { data: lines } = await getPartyLedger(
    'customer',
    id,
    dateFrom || undefined,
    dateTo   || undefined,
  )

  return (
    <LedgerCustomerDetailPage
      customerId={customer.id}
      customerName={customer.name}
      phone={customer.phone}
      creditBalance={Number(customer.credit_balance)}
      lines={(lines ?? []) as PartyLedgerLine[]}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  )
}
