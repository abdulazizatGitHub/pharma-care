import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { MedicinesPage } from '@/components/medicines/MedicinesPage'
import type { UserRole, Permission } from '@/lib/permissions'
import type { MedicineRow, MedicineCategory, MedicineSubcategory, Medicine, Supplier } from '@/lib/db-types'
import type { GenericNameOption } from '@/components/medicines/GenericNameCombobox'

export default async function PharmacistInventoryPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: overrides }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('user_permissions').select('permission, type').eq('user_id', user.id),
  ])

  if (!profile) redirect('/login')

  const permissions = resolvePermissions(
    (profile.role ?? 'pharmacist') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'inventory_view')) redirect('/unauthorized')

  const [
    { data: medicines },
    { data: categories },
    { data: subcategories },
    { data: stockSummary },
    { data: genericNamesData },
  ] = await Promise.all([
    supabase.from('medicines').select('*').eq('is_deleted', false).order('name'),
    supabase.from('medicine_categories').select('id, name, slug, is_deleted, created_at').eq('is_deleted', false).order('name'),
    supabase.from('medicine_subcategories').select('id, category_id, name, slug, is_deleted, created_at').eq('is_deleted', false).order('name'),
    supabase.rpc('get_stock_summary'),
    supabase.from('generic_names').select('id, name').eq('is_deleted', false).eq('is_active', true).order('name'),
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
      genericNames={(genericNamesData ?? []) as GenericNameOption[]}
      suppliers={[] as Supplier[]}
    />
  )
}
