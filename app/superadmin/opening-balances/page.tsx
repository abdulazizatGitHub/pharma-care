import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { OpeningBalancesPage } from '@/components/superadmin/OpeningBalancesPage'

export default async function SuperadminOpeningBalancesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  // Check if opening balances already exist
  const { data: existingEntry } = await supabase
    .from('journal_entries')
    .select('id, entry_date, description')
    .eq('reference_type', 'opening_balance')
    .limit(1)
    .maybeSingle()

  // Fetch lines for the existing entry (if any)
  type ExistingLine = {
    direction: string
    amount: number
    accounts: { code: string; name: string; account_type: string }
  }

  let existingLines: ExistingLine[] | null = null
  if (existingEntry) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('direction, amount, accounts!inner(code, name, account_type)')
      .eq('entry_id', existingEntry.id)
      .order('accounts(code)', { ascending: true })
    existingLines = (lines ?? []) as unknown as ExistingLine[]
  }

  // Fetch accounts for the form (asset, liability, equity only)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('code, name, account_type, normal_balance')
    .eq('is_deleted', false)
    .in('account_type', ['asset', 'liability', 'equity'])
    .order('code', { ascending: true })

  return (
    <div>
      <PageHeader
        title="Opening Balances"
        description="Enter the starting balances when setting up the system. This can only be done once."
      />
      <OpeningBalancesPage
        existingEntry={existingEntry ?? null}
        existingLines={existingLines}
        accounts={(accounts ?? []) as {
          code: string
          name: string
          account_type: string
          normal_balance: string
        }[]}
      />
    </div>
  )
}
