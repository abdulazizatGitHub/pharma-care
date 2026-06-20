'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

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

async function checkInventoryManage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: UserRole,
): Promise<boolean> {
  if (role === 'superadmin') return true
  if (role !== 'admin') return false

  const { data } = await supabase
    .from('user_permissions')
    .select('type')
    .eq('user_id', userId)
    .eq('permission', 'inventory_manage')
    .eq('type', 'grant')
    .maybeSingle()
  return !!data
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateMedicineSchema = z.object({
  name:           z.string().min(1, 'Medicine name is required').max(200),
  code:           z.string().max(20).optional(),
  generic_name:   z.string().max(200).optional(),
  manufacturer:   z.string().min(1, 'Manufacturer is required').max(200),
  drap_reg_no:    z.string().max(50).optional(),
  category_id:    z.string().uuid().optional(),
  subcategory_id: z.string().uuid().optional(),
  schedule:       z.enum(['OTC', 'prescription', 'controlled']).default('OTC'),
  pack_size:      z.string().max(100).optional(),
  unit:           z.string().max(50).default('strip'),
  mrp:            z.number().positive('MRP must be positive'),
  reorder_level:  z.number().int().min(0).default(10),
  barcode:        z.string().max(100).optional(),
  instructions:   z.string().optional(),
  precautions:    z.string().optional(),
})

const UpdateMedicineSchema = z.object({
  name:           z.string().min(1).max(200).optional(),
  generic_name:   z.string().max(200).optional(),
  manufacturer:   z.string().min(1).max(200).optional(),
  drap_reg_no:    z.string().max(50).optional(),
  category_id:    z.string().uuid().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  schedule:       z.enum(['OTC', 'prescription', 'controlled']).optional(),
  pack_size:      z.string().max(100).optional(),
  unit:           z.string().max(50).optional(),
  mrp:            z.number().positive().optional(),
  reorder_level:  z.number().int().min(0).optional(),
  barcode:        z.string().max(100).optional(),
  instructions:   z.string().optional(),
  precautions:    z.string().optional(),
})

// ─── Input types (exported for component use) ─────────────────────────────────

export type CreateMedicineInput = z.input<typeof CreateMedicineSchema>
export type UpdateMedicineInput = z.input<typeof UpdateMedicineSchema>

export interface CSVRow {
  name:          string
  generic_name?: string
  manufacturer?: string
  code?:         string
  drap_reg_no?:  string
  category?:     string
  subcategory?:  string
  schedule?:     string
  pack_size?:    string
  unit?:         string
  mrp?:          string
  reorder_level?: string
  instructions?: string
  precautions?:  string
}

export interface ImportResult {
  imported: number
  skipped:  number
  errors:   string[]
}

// ─── 1. createMedicine ────────────────────────────────────────────────────────

export async function createMedicine(
  input: CreateMedicineInput,
): Promise<{ data?: { id: string; code: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const parsed = CreateMedicineSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const data = parsed.data
  let code = data.code?.trim() || null

  if (code) {
    // Validate uniqueness of provided code
    const { data: existing } = await supabase
      .from('medicines')
      .select('id')
      .eq('code', code)
      .eq('is_deleted', false)
      .maybeSingle()
    if (existing) return { error: `Medicine code "${code}" is already in use` }
  } else {
    // Auto-generate next sequential code
    const { data: generated, error: rpcError } = await supabase.rpc('next_medicine_code')
    if (rpcError || !generated) return { error: 'Failed to generate medicine code' }
    code = generated as string
  }

  const { data: row, error: insertError } = await supabase
    .from('medicines')
    .insert({
      name:           data.name,
      code,
      generic_name:   data.generic_name ?? null,
      manufacturer:   data.manufacturer,
      drap_reg_no:    data.drap_reg_no ?? null,
      category_id:    data.category_id ?? null,
      subcategory_id: data.subcategory_id ?? null,
      schedule:       data.schedule,
      pack_size:      data.pack_size ?? null,
      unit:           data.unit,
      mrp:            data.mrp,
      reorder_level:  data.reorder_level,
      barcode:        data.barcode ?? null,
      instructions:   data.instructions ?? null,
      precautions:    data.precautions ?? null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create medicine' }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CREATE_MEDICINE,
    tableName: 'medicines',
    recordId:  row.id,
    newValue:  { name: data.name, code, manufacturer: data.manufacturer },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { data: { id: row.id, code }, error: null }
}

// ─── 2. updateMedicine ────────────────────────────────────────────────────────

export async function updateMedicine(
  medicineId: string,
  input: UpdateMedicineInput,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const parsed = UpdateMedicineSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Never include code in the update payload — codes are immutable
  const { data: existing } = await supabase
    .from('medicines')
    .select('id, name, is_deleted')
    .eq('id', medicineId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!existing) return { error: 'Medicine not found' }

  const { error: updateError } = await supabase
    .from('medicines')
    .update({ ...parsed.data, updated_by: user.id })
    .eq('id', medicineId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_MEDICINE,
    tableName: 'medicines',
    recordId:  medicineId,
    newValue:  parsed.data as Record<string, unknown>,
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 3. deactivateMedicine ────────────────────────────────────────────────────

export async function deactivateMedicine(
  medicineId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const { data: existing } = await supabase
    .from('medicines')
    .select('id, is_active')
    .eq('id', medicineId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!existing) return { error: 'Medicine not found' }
  if (!existing.is_active) return { error: 'Medicine is already inactive' }

  const { error: updateError } = await supabase
    .from('medicines')
    .update({ is_active: false, updated_by: user.id })
    .eq('id', medicineId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.DEACTIVATE_MEDICINE,
    tableName: 'medicines',
    recordId:  medicineId,
    newValue:  { is_active: false },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 4. reactivateMedicine ────────────────────────────────────────────────────

export async function reactivateMedicine(
  medicineId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const { data: existing } = await supabase
    .from('medicines')
    .select('id, is_active')
    .eq('id', medicineId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!existing) return { error: 'Medicine not found' }
  if (existing.is_active) return { error: 'Medicine is already active' }

  const { error: updateError } = await supabase
    .from('medicines')
    .update({ is_active: true, updated_by: user.id })
    .eq('id', medicineId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.REACTIVATE_MEDICINE,
    tableName: 'medicines',
    recordId:  medicineId,
    newValue:  { is_active: true },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 5. importMedicinesCSV ───────────────────────────────────────────────────

export async function importMedicinesCSV(
  rows: CSVRow[],
): Promise<{ data?: ImportResult; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  // Category/subcategory cache to avoid repeated DB lookups within the import
  const catCache = new Map<string, string>()   // slug → id
  const subCache = new Map<string, string>()   // `${catId}:${slug}` → id

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowLabel = `Row ${i + 2}`  // 1-indexed + header row

    if (!row.name?.trim()) {
      result.errors.push(`${rowLabel}: medicine name is required`)
      result.skipped++
      continue
    }

    const name         = row.name.trim()
    const manufacturer = row.manufacturer?.trim() || null
    const mrpRaw       = parseFloat(row.mrp ?? '')

    if (isNaN(mrpRaw) || mrpRaw <= 0) {
      result.errors.push(`${rowLabel} (${name}): MRP must be a positive number`)
      result.skipped++
      continue
    }

    // Skip if medicine with same name + manufacturer already exists
    const dupQuery = supabase
      .from('medicines')
      .select('id')
      .eq('is_deleted', false)
      .ilike('name', name)
    if (manufacturer) dupQuery.ilike('manufacturer', manufacturer)

    const { data: dup } = await dupQuery.maybeSingle()
    if (dup) {
      result.errors.push(`${rowLabel} (${name}): already exists — skipped`)
      result.skipped++
      continue
    }

    // Resolve or generate code
    let code: string
    const rawCode = row.code?.trim()
    if (rawCode) {
      const { data: codeExists } = await supabase
        .from('medicines')
        .select('id')
        .eq('code', rawCode)
        .eq('is_deleted', false)
        .maybeSingle()
      if (codeExists) {
        result.errors.push(`${rowLabel} (${name}): code "${rawCode}" already in use — skipped`)
        result.skipped++
        continue
      }
      code = rawCode
    } else {
      const { data: generated, error: rpcError } = await supabase.rpc('next_medicine_code')
      if (rpcError || !generated) {
        result.errors.push(`${rowLabel} (${name}): failed to generate code — skipped`)
        result.skipped++
        continue
      }
      code = generated as string
    }

    // Resolve category (find or create)
    let categoryId: string | null = null
    if (row.category?.trim()) {
      const catName = row.category.trim()
      const catSlug = slugify(catName)
      if (catCache.has(catSlug)) {
        categoryId = catCache.get(catSlug)!
      } else {
        const { data: existingCat } = await supabase
          .from('medicine_categories')
          .select('id')
          .eq('slug', catSlug)
          .eq('is_deleted', false)
          .maybeSingle()
        if (existingCat) {
          categoryId = existingCat.id
        } else {
          const { data: newCat, error: catErr } = await supabase
            .from('medicine_categories')
            .insert({ name: catName, slug: catSlug, created_by: user.id })
            .select('id')
            .single()
          if (catErr || !newCat) {
            result.errors.push(`${rowLabel} (${name}): failed to create category "${catName}"`)
          } else {
            categoryId = newCat.id
            await logAction({
              supabase, userId: user.id, userRole: role,
              action: ACTION_TYPES.CREATE_CATEGORY,
              tableName: 'medicine_categories', recordId: newCat.id,
              newValue: { name: catName, slug: catSlug },
            })
          }
        }
        if (categoryId) catCache.set(catSlug, categoryId)
      }
    }

    // Resolve subcategory (find or create under resolved category)
    let subcategoryId: string | null = null
    if (categoryId && row.subcategory?.trim()) {
      const subName = row.subcategory.trim()
      const subSlug = slugify(subName)
      const subKey  = `${categoryId}:${subSlug}`
      if (subCache.has(subKey)) {
        subcategoryId = subCache.get(subKey)!
      } else {
        const { data: existingSub } = await supabase
          .from('medicine_subcategories')
          .select('id')
          .eq('category_id', categoryId)
          .eq('slug', subSlug)
          .eq('is_deleted', false)
          .maybeSingle()
        if (existingSub) {
          subcategoryId = existingSub.id
        } else {
          const { data: newSub, error: subErr } = await supabase
            .from('medicine_subcategories')
            .insert({ name: subName, slug: subSlug, category_id: categoryId, created_by: user.id })
            .select('id')
            .single()
          if (subErr || !newSub) {
            result.errors.push(`${rowLabel} (${name}): failed to create subcategory "${subName}"`)
          } else {
            subcategoryId = newSub.id
          }
        }
        if (subcategoryId) subCache.set(subKey, subcategoryId)
      }
    }

    const scheduleRaw = row.schedule?.trim()
    const schedule = (
      scheduleRaw === 'prescription' || scheduleRaw === 'controlled'
        ? scheduleRaw
        : 'OTC'
    ) as 'OTC' | 'prescription' | 'controlled'

    const reorderLevel = parseInt(row.reorder_level ?? '10', 10)

    const { data: inserted, error: insertError } = await supabase
      .from('medicines')
      .insert({
        name,
        code,
        generic_name:   row.generic_name?.trim() || null,
        manufacturer,
        drap_reg_no:    row.drap_reg_no?.trim() || null,
        category_id:    categoryId,
        subcategory_id: subcategoryId,
        schedule,
        pack_size:      row.pack_size?.trim() || null,
        unit:           row.unit?.trim() || 'strip',
        mrp:            mrpRaw,
        reorder_level:  isNaN(reorderLevel) ? 10 : reorderLevel,
        instructions:   row.instructions?.trim() || null,
        precautions:    row.precautions?.trim() || null,
        created_by:     user.id,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      result.errors.push(`${rowLabel} (${name}): ${insertError?.message ?? 'insert failed'}`)
      result.skipped++
      continue
    }

    await logAction({
      supabase,
      userId:    user.id,
      userRole:  role,
      action:    ACTION_TYPES.CREATE_MEDICINE,
      tableName: 'medicines',
      recordId:  inserted.id,
      newValue:  { name, code, manufacturer },
    })

    result.imported++
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.IMPORT_MEDICINES,
    tableName: 'medicines',
    newValue:  { imported: result.imported, skipped: result.skipped },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { data: result, error: null }
}

// ─── 6. createCategory ───────────────────────────────────────────────────────

export async function createCategory(
  name: string,
): Promise<{ data?: { id: string; slug: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required' }
  if (trimmed.length > 100) return { error: 'Category name too long (max 100 characters)' }

  const slug = slugify(trimmed)

  const { data: existing } = await supabase
    .from('medicine_categories')
    .select('id')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .maybeSingle()
  if (existing) return { error: `Category "${trimmed}" already exists` }

  const { data: row, error: insertError } = await supabase
    .from('medicine_categories')
    .insert({ name: trimmed, slug, created_by: user.id })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create category' }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CREATE_CATEGORY,
    tableName: 'medicine_categories',
    recordId:  row.id,
    newValue:  { name: trimmed, slug },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  return { data: { id: row.id, slug }, error: null }
}

// ─── 7. createSubcategory ─────────────────────────────────────────────────────

export async function createSubcategory(
  name: string,
  categoryId: string,
): Promise<{ data?: { id: string; slug: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Subcategory name is required' }
  if (trimmed.length > 100) return { error: 'Subcategory name too long (max 100 characters)' }

  if (!categoryId) return { error: 'Category is required' }

  const slug = slugify(trimmed)

  const { data: existing } = await supabase
    .from('medicine_subcategories')
    .select('id')
    .eq('category_id', categoryId)
    .eq('slug', slug)
    .eq('is_deleted', false)
    .maybeSingle()
  if (existing) return { error: `Subcategory "${trimmed}" already exists in this category` }

  const { data: row, error: insertError } = await supabase
    .from('medicine_subcategories')
    .insert({ name: trimmed, slug, category_id: categoryId, created_by: user.id })
    .select('id')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create subcategory' }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CREATE_CATEGORY,
    tableName: 'medicine_subcategories',
    recordId:  row.id,
    newValue:  { name: trimmed, slug, category_id: categoryId },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  return { data: { id: row.id, slug }, error: null }
}

// ─── 8. updateCategory ────────────────────────────────────────────────────────

export async function updateCategory(
  categoryId: string,
  name: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required' }
  if (trimmed.length > 100) return { error: 'Category name too long (max 100 characters)' }

  const newSlug = slugify(trimmed)

  const { data: conflict } = await supabase
    .from('medicine_categories')
    .select('id')
    .eq('slug', newSlug)
    .eq('is_deleted', false)
    .neq('id', categoryId)
    .maybeSingle()
  if (conflict) return { error: 'A category with this name already exists' }

  const { error: updateError } = await supabase
    .from('medicine_categories')
    .update({ name: trimmed, slug: newSlug })
    .eq('id', categoryId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_CATEGORY,
    tableName: 'medicine_categories',
    recordId:  categoryId,
    newValue:  { name: trimmed, slug: newSlug },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 9. deleteCategory ────────────────────────────────────────────────────────

export async function deleteCategory(
  categoryId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const { count } = await supabase
    .from('medicines')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .eq('is_deleted', false)

  if (count && count > 0) {
    return { error: `Cannot delete — ${count} medicine${count === 1 ? '' : 's'} are assigned to this category` }
  }

  const { error: updateError } = await supabase
    .from('medicine_categories')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', categoryId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_CATEGORY,
    tableName: 'medicine_categories',
    recordId:  categoryId,
    newValue:  { is_deleted: true },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 10. updateSubcategory ────────────────────────────────────────────────────

export async function updateSubcategory(
  subcategoryId: string,
  name: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Subcategory name is required' }
  if (trimmed.length > 100) return { error: 'Subcategory name too long (max 100 characters)' }

  const { data: current } = await supabase
    .from('medicine_subcategories')
    .select('category_id')
    .eq('id', subcategoryId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!current) return { error: 'Subcategory not found' }

  const newSlug = slugify(trimmed)

  const { data: conflict } = await supabase
    .from('medicine_subcategories')
    .select('id')
    .eq('category_id', current.category_id)
    .eq('slug', newSlug)
    .eq('is_deleted', false)
    .neq('id', subcategoryId)
    .maybeSingle()
  if (conflict) return { error: 'A subcategory with this name already exists in this category' }

  const { error: updateError } = await supabase
    .from('medicine_subcategories')
    .update({ name: trimmed, slug: newSlug })
    .eq('id', subcategoryId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_CATEGORY,
    tableName: 'medicine_subcategories',
    recordId:  subcategoryId,
    newValue:  { name: trimmed, slug: newSlug },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}

// ─── 11. deleteSubcategory ────────────────────────────────────────────────────

export async function deleteSubcategory(
  subcategoryId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { error: 'Not authenticated' }

  const allowed = await checkInventoryManage(supabase, user.id, role)
  if (!allowed) return { error: 'Insufficient permissions' }

  const { count } = await supabase
    .from('medicines')
    .select('id', { count: 'exact', head: true })
    .eq('subcategory_id', subcategoryId)
    .eq('is_deleted', false)

  if (count && count > 0) {
    return { error: `Cannot delete — ${count} medicine${count === 1 ? '' : 's'} are assigned to this subcategory` }
  }

  const { error: updateError } = await supabase
    .from('medicine_subcategories')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', subcategoryId)

  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_CATEGORY,
    tableName: 'medicine_subcategories',
    recordId:  subcategoryId,
    newValue:  { is_deleted: true },
  })

  revalidatePath('/superadmin/medicines')
  revalidatePath('/admin/inventory')
  revalidatePath('/pharmacist/inventory')
  return { error: null }
}
