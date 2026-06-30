import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LedgerSupplierDetailPage } from '@/components/ledger/LedgerSupplierDetailPage'
import { getPartyLedger } from '@/app/actions/ledger'
import type { PartyLedgerLine } from '@/app/actions/ledger'

type SupplierRow = { id: string; name: string; phone: string | null }

export default async function SuperadminSupplierLedgerPage({
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

  const { data: rawSupplier } = await supabase
    .from('suppliers')
    .select('id, name, phone')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!rawSupplier) notFound()

  const supplier = rawSupplier as SupplierRow

  const { data: lines } = await getPartyLedger(
    'supplier',
    id,
    dateFrom || undefined,
    dateTo   || undefined,
  )

  return (
    <LedgerSupplierDetailPage
      supplierId={supplier.id}
      supplierName={supplier.name}
      phone={supplier.phone}
      lines={(lines ?? []) as PartyLedgerLine[]}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  )
}
