'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole, Supplier } from '@/lib/db-types'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getCallerContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, role: null as UserRole | null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { supabase, user, role: (profile?.role ?? null) as UserRole | null }
}

function canWriteSupplier(role: UserRole | null): boolean {
  return role === 'superadmin' || role === 'admin'
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const SupplierSchema = z.object({
  name:           z.string().min(1, 'Supplier name is required').max(200),
  contact_person: z.string().max(200).optional(),
  phone:          z.string().max(30).optional(),
  // email validated as either a valid address or absent/blank
  email:          z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email('Invalid email address').optional(),
  ),
  ntn:            z.string().max(50).optional(),
  address:        z.string().optional(),
  credit_days:    z.number().int().min(0).default(30),
  credit_limit:   z.number().positive('Credit limit must be positive').optional(),
  notes:          z.string().optional(),
})

export type CreateSupplierInput = z.input<typeof SupplierSchema>
export type UpdateSupplierInput = z.input<typeof SupplierSchema>

const REVALIDATE_PATHS = ['/superadmin/suppliers', '/admin/suppliers']

// ─── 1. createSupplier ────────────────────────────────────────────────────────

export async function createSupplier(
  input: CreateSupplierInput,
): Promise<{ data?: { id: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteSupplier(role)) return { error: 'Insufficient permissions' }

  const parsed = SupplierSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data

  const { data: row, error: insertError } = await supabase
    .from('suppliers')
    .insert({
      name:           d.name,
      contact_person: d.contact_person ?? null,
      phone:          d.phone ?? null,
      email:          d.email ?? null,
      ntn:            d.ntn ?? null,
      address:        d.address ?? null,
      credit_days:    d.credit_days,
      credit_limit:   d.credit_limit ?? null,
      notes:          d.notes ?? null,
      is_active:      true,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create supplier' }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.CREATE_SUPPLIER,
    tableName: 'suppliers',
    recordId:  row.id,
    newValue:  { name: d.name },
  })

  REVALIDATE_PATHS.forEach(p => revalidatePath(p))
  return { data: { id: row.id }, error: null }
}

// ─── 2. updateSupplier ────────────────────────────────────────────────────────

export async function updateSupplier(
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteSupplier(role)) return { error: 'Insufficient permissions' }

  const parsed = SupplierSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data

  const { error: updateError } = await supabase
    .from('suppliers')
    .update({
      name:           d.name,
      contact_person: d.contact_person ?? null,
      phone:          d.phone ?? null,
      email:          d.email ?? null,
      ntn:            d.ntn ?? null,
      address:        d.address ?? null,
      credit_days:    d.credit_days,
      credit_limit:   d.credit_limit ?? null,
      notes:          d.notes ?? null,
      updated_by:     user.id,
    })
    .eq('id', supplierId)
    .eq('is_deleted', false)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.UPDATE_SUPPLIER,
    tableName: 'suppliers',
    recordId:  supplierId,
    newValue:  { name: d.name },
  })

  REVALIDATE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 3. deactivateSupplier ────────────────────────────────────────────────────

export async function deactivateSupplier(
  supplierId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteSupplier(role)) return { error: 'Insufficient permissions' }

  // Guard: block if supplier has active POs (draft, pending_approval, or confirmed)
  const { count, error: countError } = await supabase
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
    .in('status', ['draft', 'pending_approval', 'confirmed'])
    .eq('is_deleted', false)

  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) {
    return { error: `Cannot deactivate — ${count} active purchase order${count === 1 ? '' : 's'} reference this supplier.` }
  }

  const { error: updateError } = await supabase
    .from('suppliers')
    .update({ is_active: false, updated_by: user.id })
    .eq('id', supplierId)
    .eq('is_deleted', false)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.DEACTIVATE_SUPPLIER,
    tableName: 'suppliers',
    recordId:  supplierId,
  })

  REVALIDATE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 4. reactivateSupplier ────────────────────────────────────────────────────

export async function reactivateSupplier(
  supplierId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (!canWriteSupplier(role)) return { error: 'Insufficient permissions' }

  const { error: updateError } = await supabase
    .from('suppliers')
    .update({ is_active: true, updated_by: user.id })
    .eq('id', supplierId)
    .eq('is_deleted', false)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase, userId: user.id, userRole: role,
    action:    ACTION_TYPES.REACTIVATE_SUPPLIER,
    tableName: 'suppliers',
    recordId:  supplierId,
  })

  REVALIDATE_PATHS.forEach(p => revalidatePath(p))
  return { error: null }
}

// ─── 5. getSuppliers ─────────────────────────────────────────────────────────
// All active roles. Returns is_active = true suppliers only (for dropdowns).
// The Supplier list UI fetches all (including inactive) directly in the
// server page rather than through this helper.

export async function getSuppliers(): Promise<{ data?: Supplier[]; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }
  if (role === 'pending') return { error: 'Insufficient permissions' }

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('name')

  if (error) return { error: error.message }
  return { data: (data ?? []) as Supplier[], error: null }
}
