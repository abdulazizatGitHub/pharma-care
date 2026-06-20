import { createClient } from '@/lib/supabase/server'
import { MedicinesPage } from '@/components/medicines/MedicinesPage'
import type { MedicineRow, MedicineCategory, MedicineSubcategory, Medicine, Supplier } from '@/lib/db-types'

export default async function SuperadminMedicinesPage() {
  const supabase = await createClient()

  const [
    { data: medicines },
    { data: categories },
    { data: subcategories },
    { data: stockSummary },
    { data: suppliers },
  ] = await Promise.all([
    supabase
      .from('medicines')
      .select('*')
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('medicine_categories')
      .select('id, name, slug, is_deleted, created_at')
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('medicine_subcategories')
      .select('id, category_id, name, slug, is_deleted, created_at')
      .eq('is_deleted', false)
      .order('name'),
    supabase.rpc('get_stock_summary'),
    supabase.from('suppliers').select('*').eq('is_deleted', false).eq('is_active', true).order('name'),
  ])

  const stockMap = new Map<string, { total_quantity: number; nearest_expiry: string | null }>(
    (stockSummary ?? []).map((s: { medicine_id: string; total_quantity: number; nearest_expiry: string | null }) => [
      s.medicine_id,
      { total_quantity: Number(s.total_quantity), nearest_expiry: s.nearest_expiry ?? null },
    ])
  )

  const medicineRows: MedicineRow[] = (medicines ?? []).map((m: Medicine) => ({
    ...m,
    total_stock:    stockMap.get(m.id)?.total_quantity ?? 0,
    nearest_expiry: stockMap.get(m.id)?.nearest_expiry ?? null,
  }))

  return (
    <MedicinesPage
      medicines={medicineRows}
      categories={(categories ?? []) as MedicineCategory[]}
      subcategories={(subcategories ?? []) as MedicineSubcategory[]}
      suppliers={(suppliers ?? []) as Supplier[]}
    />
  )
}
