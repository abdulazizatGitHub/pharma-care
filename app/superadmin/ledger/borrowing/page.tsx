import { createClient } from '@/lib/supabase/server'
import { LedgerBorrowingListPage } from '@/components/ledger/LedgerBorrowingListPage'
import type { BorrowingPharmacy } from '@/lib/db-types'

export default async function SuperadminLedgerBorrowingPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('borrowing_pharmacies')
    .select('*')
    .eq('is_deleted', false)
    .order('name')

  return <LedgerBorrowingListPage pharmacies={(data ?? []) as BorrowingPharmacy[]} />
}
