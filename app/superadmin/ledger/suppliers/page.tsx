import { createClient } from '@/lib/supabase/server'
import { LedgerSupplierListPage } from '@/components/ledger/LedgerSupplierListPage'
import type { SupplierBalance } from '@/components/ledger/LedgerSupplierListPage'

type JournalLine = { party_id: string; direction: string; amount_pkr: number; entry_id: string }
type EntryId     = { id: string }
type SupplierRow = { id: string; name: string; phone: string | null }

export default async function SuperadminLedgerSuppliersPage() {
  const supabase = await createClient()

  const [{ data: rawSuppliers }, { data: rawEntries }, { data: rawLines }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, phone')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name'),
    supabase.from('journal_entries').select('id').neq('status', 'reversed'),
    supabase
      .from('journal_lines')
      .select('party_id, direction, amount_pkr, entry_id')
      .eq('party_type', 'supplier'),
  ])

  const activeSet = new Set(((rawEntries ?? []) as EntryId[]).map(e => e.id))

  // Aggregate AP balance per supplier
  // positive net_debit = debit > credit = we paid more than we owed (unusual)
  // negative net_debit = credit > debit = we owe them
  const balanceMap = new Map<string, number>()
  for (const line of (rawLines ?? []) as JournalLine[]) {
    if (!activeSet.has(line.entry_id)) continue
    const prev  = balanceMap.get(line.party_id) ?? 0
    const delta = line.direction === 'debit' ? Number(line.amount_pkr) : -Number(line.amount_pkr)
    balanceMap.set(line.party_id, prev + delta)
  }

  const suppliers: SupplierBalance[] = ((rawSuppliers ?? []) as SupplierRow[]).map(s => ({
    id:          s.id,
    name:        s.name,
    phone:       s.phone,
    outstanding: Math.max(0, -(balanceMap.get(s.id) ?? 0)),  // negate: positive = we owe them
  }))

  // Sort by outstanding descending
  suppliers.sort((a, b) => b.outstanding - a.outstanding)

  return <LedgerSupplierListPage suppliers={suppliers} />
}
