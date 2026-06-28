'use server'

import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

export async function updateSettings(
  updates: Record<string, string>,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') {
    return { error: 'Unauthorized' }
  }

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) return { error: error.message }
  }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: updates,
  })

  return { error: null }
}

export async function updateSpecialDiscountSettings(
  enabled: boolean,
  type: 'percentage' | 'fixed',
  tiers: number[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'superadmin') return { error: 'Unauthorized' }

  if (!['percentage', 'fixed'].includes(type)) {
    return { error: 'Invalid discount type' }
  }
  if (tiers.length > 6) {
    return { error: 'Maximum 6 tiers allowed' }
  }
  for (const t of tiers) {
    if (type === 'percentage') {
      if (!Number.isInteger(t) || t < 1 || t > 100) {
        return { error: `Percentage tiers must be whole numbers 1–100 (invalid: ${t})` }
      }
    } else {
      if (t <= 0) {
        return { error: `Fixed tiers must be greater than 0 (invalid: ${t})` }
      }
    }
  }

  const updates: Record<string, string> = {
    special_discount_enabled: String(enabled),
    special_discount_type:    type,
    special_discount_tiers:   tiers.join(','),
  }

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) return { error: error.message }
  }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: updates,
  })

  return { error: null }
}
