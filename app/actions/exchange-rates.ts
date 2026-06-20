'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { UserRole, ExchangeRate } from '@/lib/db-types'

// ─── Helper ───────────────────────────────────────────────────────────────────

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

const SetRateSchema = z.object({
  currency:    z.string().min(2).max(10).toUpperCase(),
  rate_to_pkr: z.number().positive('Rate must be positive'),
  rate_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
})

// ─── getExchangeRates ─────────────────────────────────────────────────────────
// superadmin, admin.
// Returns the most recent exchange rate for each currency, or all rates for a
// specific date when p_date is provided.

export async function getExchangeRates(date?: string): Promise<{
  data: ExchangeRate[] | null
  error: string | null
}> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role) return { data: null, error: 'Not authenticated' }
  if (role !== 'superadmin' && role !== 'admin') {
    return { data: null, error: 'Insufficient permissions' }
  }

  let query = supabase
    .from('exchange_rates')
    .select('*')
    .order('rate_date', { ascending: false })
    .order('currency',  { ascending: true })

  if (date) {
    // Rates for a specific date
    query = query.eq('rate_date', date)
  } else {
    // Most recent rate per currency: fetch last 90 days, deduplicate in code
    // (PostgREST does not support DISTINCT ON)
    query = query.limit(200)
  }

  const { data, error } = await query
  if (error) return { data: null, error: error.message }

  let rates = (data ?? []) as ExchangeRate[]

  // When no date filter: return only the most recent rate per currency
  if (!date) {
    const seen = new Set<string>()
    rates = rates.filter(r => {
      if (seen.has(r.currency)) return false
      seen.add(r.currency)
      return true
    })
  }

  return { data: rates, error: null }
}

// ─── setExchangeRate ──────────────────────────────────────────────────────────
// superadmin only.
// Inserts or updates the exchange rate for a given (currency, date) pair.
// UNIQUE(currency, rate_date) is enforced at DB level — upsert on conflict.

export async function setExchangeRate(
  currency:   string,
  rateTosPkr: number,
  rateDate:   string,
): Promise<{ data?: { id: string }; error: string | null }> {
  const { supabase, user, role } = await getCallerContext()
  if (!user || !role)        return { error: 'Not authenticated' }
  if (role !== 'superadmin') return { error: 'Only superadmin can set exchange rates' }

  const parsed = SetRateSchema.safeParse({
    currency,
    rate_to_pkr: rateTosPkr,
    rate_date:   rateDate,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: row, error: upsertError } = await supabase
    .from('exchange_rates')
    .upsert(
      {
        currency:    parsed.data.currency,
        rate_to_pkr: parsed.data.rate_to_pkr,
        rate_date:   parsed.data.rate_date,
        source:      'manual',
        created_by:  user.id,
      },
      { onConflict: 'currency,rate_date' },
    )
    .select('id')
    .single()

  if (upsertError || !row) return { error: upsertError?.message ?? 'Failed to save exchange rate' }

  revalidatePath('/superadmin/ledger')
  return { data: { id: row.id as string }, error: null }
}
