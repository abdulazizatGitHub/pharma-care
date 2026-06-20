import { createClient } from '@/lib/supabase/server'
import { SuppliersPage } from '@/components/suppliers/SuppliersPage'
import type { Supplier } from '@/lib/db-types'

export default async function SuperadminSuppliersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .order('name')

  return <SuppliersPage suppliers={(data ?? []) as Supplier[]} />
}
