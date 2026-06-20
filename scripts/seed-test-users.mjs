// Run: node scripts/seed-test-users.mjs
// Creates test accounts and sets roles via the Supabase Admin API.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '..', '.env.local')

// Parse .env.local manually (no dotenv dependency needed)
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const USERS = [
  { email: 'superuser@pharmacare.dev', password: 'SuperPass@123', full_name: 'System Superuser', role: 'superuser' },
  { email: 'owner@pharmacare.dev',     password: 'OwnerPass@123',   full_name: 'Pharmacy Owner',    role: 'owner' },
  { email: 'pharma@pharmacare.dev',    password: 'PharmaPass@123',  full_name: 'Lead Pharmacist',   role: 'pharmacist' },
  { email: 'cashier@pharmacare.dev',   password: 'CashierPass@123', full_name: 'Front Cashier',     role: 'cashier' },
  { email: 'procure@pharmacare.dev',   password: 'ProcurePass@123', full_name: 'Procurement Staff', role: 'procurement' },
]

for (const u of USERS) {
  // Check if user already exists
  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing?.users?.find(x => x.email === u.email)

  let userId
  if (found) {
    userId = found.id
    console.log(`↷  ${u.email} already exists (${userId})`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    })
    if (error) { console.error(`✗  ${u.email}: ${error.message}`); continue }
    userId = data.user.id
    console.log(`✓  Created ${u.email} (${userId})`)
  }

  // Set profile fields
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ full_name: u.full_name, role: u.role })
    .eq('id', userId)

  if (profErr) {
    console.error(`✗  Profile update for ${u.email}: ${profErr.message}`)
  } else {
    console.log(`   role=${u.role} full_name="${u.full_name}"`)
  }
}

console.log('\nDone.')
