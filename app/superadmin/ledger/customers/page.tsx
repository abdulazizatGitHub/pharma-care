import { createClient } from '@/lib/supabase/server'
import { LedgerCustomerListPage } from '@/components/ledger/LedgerCustomerListPage'
import type { Customer } from '@/lib/db-types'

export default async function SuperadminLedgerCustomersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('customers')
    .select('*')
    .gt('credit_balance', 0)
    .eq('is_deleted', false)
    .order('credit_balance', { ascending: false })

  return <LedgerCustomerListPage customers={(data ?? []) as Customer[]} />
}
