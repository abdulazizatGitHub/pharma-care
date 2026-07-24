'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getDefaultRoute, ROLE_HOME } from '@/lib/routes'
import type { UserRole } from '@/lib/db-types'
import { logAction, ACTION_TYPES } from '@/lib/audit'

// Request metadata for audit logging — never throws, falls back to null.
async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? headersList.get('x-real-ip')
    ?? null
  const userAgent = headersList.get('user-agent') ?? null
  return { ip, userAgent }
}

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const { ip, userAgent } = await getRequestMeta()
    await logAction({
      supabase,
      userId:    null,
      userRole:  null,
      action:    ACTION_TYPES.LOGIN_FAILED,
      tableName: 'auth',
      newValue:  { description: 'Failed login attempt' },
      ipAddress: ip,
      userAgent,
    })
    return { error: 'Incorrect email or password. Please try again.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Authentication failed. Please try again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    redirect(`/unauthorized?message=${encodeURIComponent('Profile not found. Contact administrator.')}`)
  }

  {
    const { ip, userAgent } = await getRequestMeta()
    await logAction({
      supabase,
      userId:    user.id,
      userRole:  profile.role as UserRole,
      action:    ACTION_TYPES.LOGIN,
      tableName: 'auth',
      recordId:  user.id,
      newValue:  { role: profile.role },
      ipAddress: ip,
      userAgent,
    })
  }

  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { error: 'Your account has been deactivated. Contact administrator.' }
  }

  if (profile.role === 'pending') {
    await supabase.auth.signOut()
    redirect(`/unauthorized?message=${encodeURIComponent('Account pending activation. Contact administrator.')}`)
  }

  const destination = getDefaultRoute(profile.role)
  redirect(destination)
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const { ip, userAgent } = await getRequestMeta()
    await logAction({
      supabase,
      userId:    user.id,
      userRole:  (profile?.role ?? 'pending') as UserRole,
      action:    ACTION_TYPES.LOGOUT,
      tableName: 'auth',
      recordId:  user.id,
      newValue:  { role: profile?.role ?? 'unknown' },
      ipAddress: ip,
      userAgent,
    })

    await supabase.auth.signOut()
  }

  redirect('/login')
}

// ─── changePassword ───────────────────────────────────────────────────────────

function validatePasswordRules(pw: string): string | null {
  if (pw.length < 8)             return 'Minimum 8 characters required'
  if (!/[A-Z]/.test(pw))         return 'Must include an uppercase letter'
  if (!/[a-z]/.test(pw))         return 'Must include a lowercase letter'
  if (!/\d/.test(pw))            return 'Must include a digit'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Must include a special character'
  return null
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const pwError = validatePasswordRules(newPassword)
  if (pwError) return { error: pwError }

  // Fetch email from profiles — auth email IS the username for wizard-created users.
  const { data: profile, error: profileFetchError } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()
  if (profileFetchError || !profile) return { error: 'Profile not found' }

  // Re-authenticate with current password before allowing the change.
  // This prevents a password change via an unattended unlocked session.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    profile.email,
    password: currentPassword,
  })
  if (signInError) return { error: 'Current password is incorrect' }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) return { error: updateError.message }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id)
  if (profileUpdateError) return { error: profileUpdateError.message }

  await logAction({
    supabase,
    userId:    user.id,
    userRole:  profile.role as UserRole,
    action:    ACTION_TYPES.CHANGE_PASSWORD,
    tableName: 'profiles',
    recordId:  user.id,
    newValue:  { force_password_change: false },
  })

  redirect(ROLE_HOME[profile.role as UserRole])
}
