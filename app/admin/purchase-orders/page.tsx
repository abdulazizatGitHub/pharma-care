import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { POListPage } from '@/components/procurement/POListPage'
import type { UserRole, Permission } from '@/lib/permissions'
import type { POStatus, Supplier } from '@/lib/db-types'
import type { POListRow } from '@/components/procurement/POTable'

const PAGE_SIZE = 15

export default async function AdminPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?:       string
    status?:     string
    supplierId?: string
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
    (profile.role ?? 'admin') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'purchase_orders')) redirect('/unauthorized')

  const sp = await searchParams

  const page       = Math.max(1, parseInt(sp.page ?? '1', 10))
  const status     = sp.status     ?? ''
  const supplierId = sp.supplierId ?? ''
  const offset     = (page - 1) * PAGE_SIZE

  let poQuery = supabase
    .from('purchase_orders')
    .select(
      `id, po_number, supplier_id, total_amount, status, notes, created_at, suppliers ( name )`,
      { count: 'exact' }
    )
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (status)     poQuery = poQuery.eq('status', status)
  if (supplierId) poQuery = poQuery.eq('supplier_id', supplierId)

  const [{ data: rawPOs, count: totalCount }, { data: suppliers }] = await Promise.all([
    poQuery,
    supabase
      .from('suppliers')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name'),
  ])

  const poIds = (rawPOs ?? []).map((p: { id: string }) => p.id)
  const { data: itemCounts } = poIds.length > 0
    ? await supabase
        .from('purchase_order_items')
        .select('po_id')
        .in('po_id', poIds)
    : { data: [] }

  const countMap = new Map<string, number>()
  for (const row of (itemCounts ?? [])) {
    countMap.set(row.po_id, (countMap.get(row.po_id) ?? 0) + 1)
  }

  type RawPO = {
    id: string; po_number: string; supplier_id: string;
    total_amount: number; status: string; created_at: string;
    suppliers: { name: string } | null
  }
  const pos: POListRow[] = ((rawPOs ?? []) as unknown as RawPO[]).map(p => ({
    id:            p.id,
    po_number:     p.po_number,
    supplier_id:   p.supplier_id,
    supplier_name: p.suppliers?.name ?? null,
    item_count:    countMap.get(p.id) ?? 0,
    total_amount:  Number(p.total_amount ?? 0),
    status:        p.status as POStatus,
    created_at:    p.created_at,
  }))

  return (
    <POListPage
      pos={pos}
      suppliers={(suppliers ?? []) as Supplier[]}
      basePath="/admin/purchase-orders"
      currentPage={page}
      totalCount={totalCount ?? 0}
      pageSize={PAGE_SIZE}
      defaultStatus={status}
      defaultSupplierId={supplierId}
    />
  )
}
