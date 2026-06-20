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
