import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LedgerSupplierDetailPage } from '@/components/ledger/LedgerSupplierDetailPage'
import { getPartyLedger } from '@/app/actions/ledger'
import type { PartyLedgerLine } from '@/app/actions/ledger'

type SupplierRow = { id: string; name: string; phone: string | null }

export default async function SuperadminSupplierLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: rawSupplier } = await supabase
    .from('suppliers')
    .select('id, name, phone')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!rawSupplier) notFound()

  const supplier = rawSupplier as SupplierRow

  const { data: lines, error } = await getPartyLedger('supplier', id)

  return (
    <LedgerSupplierDetailPage
      supplierId={supplier.id}
      supplierName={supplier.name}
      phone={supplier.phone}
      lines={(lines ?? []) as PartyLedgerLine[]}
    />
  )
}
