import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Prefix-based guards. Any path that startsWith the prefix is covered —
// no middleware changes needed when adding pages under these prefixes.
// /pharmacist is superadmin + pharmacist only — admins cannot access (strict separation).
const routeRoles: Record<string, string[]> = {
  '/superadmin': ['superadmin'],
  '/admin':      ['admin', 'superadmin'],
  '/pharmacist': ['pharmacist', 'superadmin'],
}

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const path = request.nextUrl.pathname

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Always read role from profiles table — authoritative source.
  // user_metadata.role is not kept in sync by migrations or by any current server action.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, force_password_change')
    .eq('id', user.id)
    .single()
  const role: string | undefined = profile?.role ?? undefined

  for (const [route, allowedRoles] of Object.entries(routeRoles)) {
    if (path.startsWith(route) && !allowedRoles.includes(role ?? '')) {
      const url = request.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  if (profile?.force_password_change) {
    const url = request.nextUrl.clone()
    url.pathname = '/change-password'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|unauthorized|change-password|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
