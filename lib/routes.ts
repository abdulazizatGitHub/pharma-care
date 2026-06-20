import type { UserRole } from '@/lib/permissions'

export const ROLE_HOME: Record<UserRole, string> = {
  superadmin: '/superadmin/dashboard',
  admin:      '/admin/dashboard',
  pharmacist: '/pharmacist/dashboard',
  pending:    `/unauthorized?message=${encodeURIComponent('Account pending activation. Contact administrator.')}`,
}

export function getDefaultRoute(role: string | undefined): string {
  if (role === 'superadmin') return '/superadmin/dashboard'
  if (role === 'admin')      return '/admin/dashboard'
  if (role === 'pharmacist') return '/pharmacist/dashboard'
  return '/login'
}
