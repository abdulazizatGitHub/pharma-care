import { createClient } from '@supabase/supabase-js'

// Server-only: never import this in client components.
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC prefix by design.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
