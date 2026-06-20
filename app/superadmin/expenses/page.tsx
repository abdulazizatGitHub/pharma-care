import { getExpenses, getExpenseSummary } from '@/app/actions/expenses'
import { ExpensesPage } from '@/components/expenses/ExpensesPage'

export default async function SuperadminExpensesPage() {
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
