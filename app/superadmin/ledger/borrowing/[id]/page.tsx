import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LedgerBorrowingDetailPage } from '@/components/ledger/LedgerBorrowingDetailPage'
import type { BorrowingPharmacy, BorrowingTransaction } from '@/lib/db-types'

export default async function SuperadminBorrowingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: rawPharmacy }, { data: rawTx }] = await Promise.all([
    supabase
      .from('borrowing_pharmacies')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('borrowing_transactions')
      .select('*')
      .eq('pharmacy_id', id)
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!rawPharmacy) notFound()

  return (
    <LedgerBorrowingDetailPage
      pharmacy={rawPharmacy as BorrowingPharmacy}
      transactions={(rawTx ?? []) as BorrowingTransaction[]}
    />
  )
}
