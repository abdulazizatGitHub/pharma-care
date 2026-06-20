import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { getExpenses, getExpenseSummary } from '@/app/actions/expenses'
import { ExpensesPage } from '@/components/expenses/ExpensesPage'
import type { UserRole, Permission } from '@/lib/permissions'

export default async function AdminExpensesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: overrides }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('user_permissions').select('permission, type').eq('user_id', user.id),
  ])

  if (!profile) redirect('/login')

  const permissions = resolvePermissions(
    (profile.role ?? 'admin') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'expenses')) redirect('/unauthorized')

  const now       = new Date()
  const year      = now.getFullYear()
  const month     = now.getMonth()
  const dateFrom  = new Date(year, month, 1).toISOString().split('T')[0]
  const dateTo    = new Date(year, month + 1, 0).toISOString().split('T')[0]
  const monthLabel = now.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })

  const [expensesResult, summaryResult] = await Promise.all([
    getExpenses(),
    getExpenseSummary(dateFrom, dateTo),
  ])

  return (
    <ExpensesPage
      expenses={expensesResult.data ?? []}
      summary={summaryResult.data}
      monthLabel={monthLabel}
    />
  )
}
