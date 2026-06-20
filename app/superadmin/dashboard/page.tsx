import { Users, Pill, Clock, Receipt } from 'lucide-react'
import { PageHeader }      from '@/components/ui/PageHeader'
import { StatCard }        from '@/components/ui/StatCard'
import { AlertsPanel }     from '@/components/medicines/AlertsPanel'
import { getAlertSummary } from '@/app/actions/stock'
import { getExpenseSummary } from '@/app/actions/expenses'
import { getSettlementDuePharmacies } from '@/app/actions/borrowing'
import { createClient }    from '@/lib/supabase/server'

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default async function SuperadminDashboardPage() {
  const supabase = await createClient()

  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth()
  const dateFrom = new Date(year, month, 1).toISOString().split('T')[0]
  const dateTo   = new Date(year, month + 1, 0).toISOString().split('T')[0]

  const [alertResult, { count: pendingPOCount }, expenseSummaryResult, { count: pendingReturnCount }, settlementResult] = await Promise.all([
    getAlertSummary(),
    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval')
      .eq('is_deleted', false),
    getExpenseSummary(dateFrom, dateTo),
    supabase
      .from('returns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval')
      .eq('is_deleted', false),
    getSettlementDuePharmacies(),
  ])

  const alerts              = alertResult.data
  const monthlyExpenses     = expenseSummaryResult.data?.grandTotal ?? 0
  const settlementDue       = settlementResult.data ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Dashboard"
        description="System overview across all roles and locations."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <StatCard label="Total Users"        value="—" icon={Users}   loading={true} />
        <StatCard label="Active Pharmacists" value="—" icon={Pill}    loading={true} />
        <StatCard label="Pending Approvals"  value={String(pendingPOCount ?? 0)} icon={Clock} />
        <StatCard
          label="Expenses This Month"
          value={fmtPKR(monthlyExpenses)}
          icon={Receipt}
        />
      </div>
      {alerts && (
        <AlertsPanel
          lowStockMedicines={alerts.lowStockMedicines}
          expiringBatches={alerts.expiringBatches}
          expiryAlertDays={alerts.expiryAlertDays}
          pendingApprovalPOCount={pendingPOCount ?? 0}
          pendingReturnCount={pendingReturnCount ?? 0}
          settlementDuePharmacies={settlementDue}
        />
      )}
    </div>
  )
}
