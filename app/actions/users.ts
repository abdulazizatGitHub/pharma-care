'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateUsername, generatePassword } from '@/lib/user-utils'
import type { UserRole } from '@/lib/db-types'
import type { Permission } from '@/lib/permissions'
import { logAction, ACTION_TYPES } from '@/lib/audit'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const nameField = z
  .string()
  .min(2, 'Minimum 2 characters')
  .regex(/^[a-zA-Z]+$/, 'Letters only')

const phoneField = z
  .string()
  .regex(/^03\d{9}$/, 'Must be 03XXXXXXXXX (11 digits starting with 03)')

const cnicField = z
  .string()
  .regex(/^(\d{5}-\d{7}-\d|\d{13})$/, 'Must be XXXXX-XXXXXXX-X or 13 digits')

const CreateUserSchema = z.object({
  firstName:    nameField,
  lastName:     nameField,
  phone:        phoneField,
  cnic:         cnicField.optional(),
  joinedAt:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  role:         z.enum(['admin', 'pharmacist']),
  grants:       z.array(z.string()),
  restrictions: z.array(z.string()),
})

const UpdateUserSchema = z.object({
  firstName: nameField.optional(),
  lastName:  nameField.optional(),
  phone:     phoneField.optional(),
  cnic:      cnicField.optional(),
})

// ─── Input types (exported for wizard use) ────────────────────────────────────

export interface CreateUserInput {
  firstName:    string
  lastName:     string
  phone:        string
  cnic?:        string
  joinedAt:     string
  role:         'admin' | 'pharmacist'
  grants:       Permission[]
  restrictions: Permission[]
}

export interface UpdateUserInput {
  firstName?: string
  lastName?:  string
  phone?:     string
  cnic?:      string
}

// ─── Shared helper ────────────────────────────────────────────────────────────

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

// ─── 5.1 createUser ───────────────────────────────────────────────────────────

export async function createUser(
  input: CreateUserInput,
): Promise<{ data?: { username: string; password: string; userId: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }

  // Superadmin may create admin or pharmacist.
  // Admin may create pharmacist only if they have user_manage_pharmacists.
  if (role === 'admin') {
    if (input.role !== 'pharmacist') return { error: 'Admins may only create pharmacist accounts' }
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('type')
      .eq('user_id', user.id)
      .eq('permission', 'user_manage_pharmacists')
      .eq('type', 'grant')
      .maybeSingle()
    if (!perm) return { error: 'Insufficient permissions' }
  } else if (role !== 'superadmin') {
    return { error: 'Insufficient permissions' }
  }

  const parsed = CreateUserSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { firstName, lastName, phone, cnic, joinedAt, role: newRole, grants, restrictions } = parsed.data

  // Fetch pharmacy name for username slug
  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'pharmacy_name')
    .single()
  const pharmacyName = setting?.value ?? 'pharmacare'

  // Fetch all existing usernames for collision check
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('username')
  const existingUsernames = (existingProfiles ?? [])
    .map((p: { username: string | null }) => p.username)
    .filter((u): u is string => u !== null)

  // Generate credentials server-side — never trust client for these
  const username = generateUsername(firstName, lastName, pharmacyName, existingUsernames)
  const password = generatePassword()
  const fullName = `${firstName} ${lastName}`

  // Create auth user — email IS the username per spec §2.1
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email:         username,
    password,
    email_confirm: true,
  })
  if (createError || !newUser.user) {
    return { error: createError?.message ?? 'Failed to create auth user' }
  }
  const userId = newUser.user.id

  // Update the trigger-seeded profile row (role='pending', full_name='')
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name:             fullName,
      phone,
      cnic:                  cnic ?? null,
      joined_at:             joinedAt,
      force_password_change: true,
      username,
      role:                  newRole,
    })
    .eq('id', userId)
  if (profileError) return { error: profileError.message }

  // Insert permission overrides (grants above base, restrictions below base)
  if (grants.length > 0 || restrictions.length > 0) {
    const permRows = [
      ...grants.map(p => ({ user_id: userId, permission: p, type: 'grant' as const, granted_by: user.id })),
      ...restrictions.map(p => ({ user_id: userId, permission: p, type: 'restrict' as const, granted_by: user.id })),
    ]
    const { error: permError } = await supabase.from('user_permissions').insert(permRows)
    if (permError) return { error: permError.message }
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.CREATE_USER,
    tableName: 'profiles',
    recordId:  userId,
    newValue:  { username, role: newRole, grants, restrictions },
  })

  revalidatePath('/superadmin/users')
  revalidatePath('/admin/staff')
  return { data: { username, password, userId }, error: null }
}

// ─── 5.2 updateUser ───────────────────────────────────────────────────────────

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Insufficient permissions' }

  const parsed = UpdateUserSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { firstName, lastName, phone, cnic } = parsed.data
  const profileUpdate: Record<string, string | null> = {}

  if (firstName !== undefined || lastName !== undefined) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    const parts       = (existing?.full_name ?? '').split(' ')
    const existingFirst = parts[0] ?? ''
    const existingLast  = parts.slice(1).join(' ')
    profileUpdate.full_name = `${firstName ?? existingFirst} ${lastName ?? existingLast}`.trim()
  }
  if (phone !== undefined) profileUpdate.phone = phone
  if (cnic  !== undefined) profileUpdate.cnic  = cnic

  if (Object.keys(profileUpdate).length === 0) return { error: null }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', userId)
  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_USER,
    tableName: 'profiles',
    recordId:  userId,
    newValue:  profileUpdate,
  })

  revalidatePath('/superadmin/users')
  return { error: null }
}

// ─── 5.3 resetPassword ────────────────────────────────────────────────────────

export async function resetPassword(
  userId: string,
): Promise<{ data?: { newPassword: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Insufficient permissions' }

  const newPassword = generatePassword()
  const admin = createAdminClient()

  const { error: resetError } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (resetError) return { error: resetError.message }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ force_password_change: true })
    .eq('id', userId)
  if (profileError) return { error: profileError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.RESET_PASSWORD,
    tableName: 'profiles',
    recordId:  userId,
    newValue:  { force_password_change: true },
  })

  revalidatePath('/superadmin/users')
  return { data: { newPassword }, error: null }
}

// ─── 5.4 updatePermissions ────────────────────────────────────────────────────

export async function updatePermissions(
  userId: string,
  grants: Permission[],
  restrictions: Permission[],
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Insufficient permissions' }

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (!target) return { error: 'User not found' }
  if (target.role === 'superadmin') return { error: 'Superadmin permissions cannot be modified' }

  // Delete all existing overrides then re-insert the full new set atomically
  const { error: deleteError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)
  if (deleteError) return { error: deleteError.message }

  if (grants.length > 0 || restrictions.length > 0) {
    const rows = [
      ...grants.map(p => ({ user_id: userId, permission: p, type: 'grant' as const, granted_by: user.id })),
      ...restrictions.map(p => ({ user_id: userId, permission: p, type: 'restrict' as const, granted_by: user.id })),
    ]
    const { error: insertError } = await supabase.from('user_permissions').insert(rows)
    if (insertError) return { error: insertError.message }
  }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.UPDATE_PERMISSIONS,
    tableName: 'user_permissions',
    recordId:  userId,
    newValue:  { grants, restrictions },
  })

  revalidatePath('/superadmin/users')
  return { error: null }
}

// ─── 5.5 deactivateUser ───────────────────────────────────────────────────────

export async function deactivateUser(
  userId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }
  if (role !== 'superadmin' && role !== 'admin') return { error: 'Insufficient permissions' }

  if (role === 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('type')
      .eq('user_id', user.id)
      .eq('permission', 'user_manage_pharmacists')
      .eq('type', 'grant')
      .maybeSingle()
    if (!perm) return { error: 'Insufficient permissions' }
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (!target) return { error: 'User not found' }
  if (target.role === 'superadmin') return { error: 'Superadmin accounts cannot be deactivated' }
  if (role === 'admin' && target.role !== 'pharmacist') {
    return { error: 'Admins can only deactivate pharmacist accounts' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId)
  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.DEACTIVATE_USER,
    tableName: 'profiles',
    recordId:  userId,
    newValue:  { is_active: false },
  })

  revalidatePath('/superadmin/users')
  revalidatePath('/admin/staff')
  return { error: null }
}

// ─── 5.6 reactivateUser ───────────────────────────────────────────────────────

export async function reactivateUser(
  userId: string,
): Promise<{ error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user) return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Insufficient permissions' }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('id', userId)
  if (updateError) return { error: updateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  role,
    action:    ACTION_TYPES.REACTIVATE_USER,
    tableName: 'profiles',
    recordId:  userId,
    newValue:  { is_active: true },
  })

  revalidatePath('/superadmin/users')
  return { error: null }
}
