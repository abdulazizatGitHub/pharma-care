import { getExpenses, getExpenseSummary } from '@/app/actions/expenses'
import { ExpensesPage } from '@/components/expenses/ExpensesPage'

const PAGE_SIZE = 15

export default async function SuperadminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?:        string
    search?:      string
    accountCode?: string
  }>
}) {
  const sp = await searchParams

  const page        = Math.max(1, parseInt(sp.page ?? '1', 10))
  const search      = sp.search      ?? ''
  const accountCode = sp.accountCode ?? ''

  const now        = new Date()
  const year       = now.getFullYear()
  const month      = now.getMonth()
  const dateFrom   = new Date(year, month, 1).toISOString().split('T')[0]
  const dateTo     = new Date(year, month + 1, 0).toISOString().split('T')[0]
  const monthLabel = now.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })

  const [expensesResult, summaryResult] = await Promise.all([
    getExpenses(
      {
        accountCode: accountCode || undefined,
        search:      search      || undefined,
      },
      page,
      PAGE_SIZE,
    ),
    getExpenseSummary(dateFrom, dateTo),
  ])

  return (
    <ExpensesPage
      expenses={expensesResult.data ?? []}
      total={expensesResult.total}
      summary={summaryResult.data}
      monthLabel={monthLabel}
      currentPage={page}
      pageSize={PAGE_SIZE}
      defaultSearch={search}
      defaultAccountCode={accountCode}
    />
  )
}
