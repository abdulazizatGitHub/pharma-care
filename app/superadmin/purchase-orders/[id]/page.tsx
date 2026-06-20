import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PODetailPage } from '@/components/procurement/PODetailPage'
import type { POStatus } from '@/lib/db-types'
import type { PODetail } from '@/components/procurement/PODetailPage'
import type { POItemRow, MedicineLookup } from '@/components/procurement/POLineItems'

export default async function SuperadminPODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: rawPO }, { data: rawItems }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, notes, rejection_note, created_at, suppliers ( name )')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('purchase_order_items')
      .select('id, po_id, medicine_id, quantity, unit_price, total_price, received_quantity, medicines ( name, code )')
      .eq('po_id', id)
      .order('created_at'),
  ])

  if (!rawPO) notFound()

  type RawPODetail = { id: string; po_number: string; status: string; total_amount: number; notes: string | null; rejection_note: string | null; created_at: string; suppliers: { name: string } | null }
  type RawItem = { id: string; medicine_id: string; quantity: number; unit_price: number; total_price: number; medicines: { name: string; code: string | null } | null }

  const typedPO = rawPO as unknown as RawPODetail

  const po: PODetail = {
    id:             typedPO.id,
    po_number:      typedPO.po_number,
    status:         typedPO.status as POStatus,
    total_amount:   Number(typedPO.total_amount ?? 0),
    notes:          typedPO.notes ?? null,
    rejection_note: typedPO.rejection_note ?? null,
    created_at:     typedPO.created_at,
    supplier_name:  typedPO.suppliers?.name ?? null,
  }

  const items: POItemRow[] = ((rawItems ?? []) as unknown as RawItem[]).map(item => ({
    id:           item.id,
    medicineId:   item.medicine_id,
    medicineName: item.medicines?.name ?? 'Unknown',
    medicineCode: item.medicines?.code ?? null,
    quantity:     item.quantity,
    unitPrice:    Number(item.unit_price),
    totalPrice:   Number(item.total_price),
  }))

  let medicines: MedicineLookup[] = []
  if (po.status === 'draft') {
    const { data: meds } = await supabase
      .from('medicines')
      .select('id, name, code')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name')
    type RawMed = { id: string; name: string; code: string | null }
    medicines = ((meds ?? []) as unknown as RawMed[]).map(m => ({
      id: m.id, name: m.name, code: m.code,
    }))
  }

  return (
    <PODetailPage
      po={po}
      items={items}
      medicines={medicines}
      basePath="/superadmin/purchase-orders"
    />
  )
}
