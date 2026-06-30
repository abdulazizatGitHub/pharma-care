import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { MedicinesPage } from '@/components/medicines/MedicinesPage'
import type { UserRole, Permission } from '@/lib/permissions'
import type { MedicineRow, MedicineCategory, MedicineSubcategory, Medicine, Supplier } from '@/lib/db-types'
import type { GenericNameOption } from '@/components/medicines/GenericNameCombobox'

const PAGE_SIZE = 15

export default async function PharmacistInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?:     string
    search?:   string
    cat?:      string
    subcat?:   string
    schedule?: string
    status?:   string
  }>
}) {
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

  const sp = await searchParams

  const page     = Math.max(1, parseInt(sp.page ?? '1', 10))
  const search   = sp.search   ?? ''
  const cat      = sp.cat      ?? ''
  const subcat   = sp.subcat   ?? ''
  const schedule = sp.schedule ?? ''
  const status   = sp.status   ?? ''
  const offset   = (page - 1) * PAGE_SIZE

  let medQuery = supabase
    .from('medicines')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('name')
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    medQuery = medQuery.or(
      `name.ilike.%${search}%,generic_name.ilike.%${search}%,code.ilike.%${search}%,manufacturer.ilike.%${search}%`
    )
  }
  if (cat)      medQuery = medQuery.eq('category_id', cat)
  if (subcat)   medQuery = medQuery.eq('subcategory_id', subcat)
  if (schedule) medQuery = medQuery.eq('schedule', schedule)
  if (status === 'active')   medQuery = medQuery.eq('is_active', true)
  if (status === 'inactive') medQuery = medQuery.eq('is_active', false)

  const [
    { data: medicines, count: totalCount },
    { data: categories },
    { data: subcategories },
    { data: stockSummary },
    { data: genericNamesData },
  ] = await Promise.all([
    medQuery,
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
      currentPage={page}
      totalCount={totalCount ?? 0}
      pageSize={PAGE_SIZE}
      defaultSearch={search}
      defaultCat={cat}
      defaultSubcat={subcat}
      defaultSchedule={schedule}
      defaultStatus={status}
    />
  )
}
