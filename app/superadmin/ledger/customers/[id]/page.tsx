import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LedgerCustomerDetailPage } from '@/components/ledger/LedgerCustomerDetailPage'
import { getPartyLedger } from '@/app/actions/ledger'
import type { PartyLedgerLine } from '@/app/actions/ledger'

type CustomerRow = { id: string; name: string; phone: string | null; credit_balance: number }

export default async function SuperadminCustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select('id, name, phone, credit_balance')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!rawCustomer) notFound()

  const customer = rawCustomer as CustomerRow

  const { data: lines } = await getPartyLedger('customer', id)

  return (
    <LedgerCustomerDetailPage
      customerId={customer.id}
      customerName={customer.name}
      phone={customer.phone}
      creditBalance={Number(customer.credit_balance)}
      lines={(lines ?? []) as PartyLedgerLine[]}
    />
  )
}
