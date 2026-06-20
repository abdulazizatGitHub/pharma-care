import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const PROJECT_REF = 'mrnjrxvlrscupalpwauh'

// Admin client — service role, bypasses RLS. For test fixture setup/teardown ONLY.
export const adminClient = createSupabaseClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Sign in and return the full session
export async function signIn(email: string, password: string): Promise<Session> {
  const client = createSupabaseClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? 'no session'}`)
  }
  return data.session
}

// Build a Supabase client authenticated as a specific user JWT (for RLS tests)
export function userClient(accessToken: string) {
  return createSupabaseClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Build the auth cookie string that @supabase/ssr reads from Next.js requests
export function buildAuthCookie(session: Session): string {
  return `sb-${PROJECT_REF}-auth-token=${encodeURIComponent(JSON.stringify(session))}`
}

// Authenticated GET to running dev server (redirect: manual to capture 307s)
export async function authGet(path: string, cookie: string): Promise<Response> {
  return fetch(`http://localhost:3000${path}`, {
    redirect: 'manual',
    headers: { Cookie: cookie },
  })
}

// Unauthenticated GET to running dev server
export async function anonGet(path: string): Promise<Response> {
  return fetch(`http://localhost:3000${path}`, { redirect: 'manual' })
}
