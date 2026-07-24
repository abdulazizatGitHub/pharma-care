import { PackageX, ClipboardList, Truck, Clock } from 'lucide-react'
import { PageHeader }      from '@/components/ui/PageHeader'
import { StatCard }        from '@/components/ui/StatCard'
import { AlertsPanel }     from '@/components/medicines/AlertsPanel'
import { getAlertSummary } from '@/app/actions/stock'
import { createClient }    from '@/lib/supabase/server'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const last90 = new Date()
  last90.setDate(last90.getDate() - 90)

  const [alertResult, { count: openPOCount }, { count: activeSupplierCount }, { count: recentShiftCount }] = await Promise.all([
    getAlertSummary(),
    supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'confirmed', 'pending_approval'])
      .eq('is_deleted', false),
    supabase
      .from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_deleted', false),
    supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .gte('opened_at', last90.toISOString()),
  ])

  const alerts = alertResult.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Dashboard"
        description="Operations overview for today."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <StatCard
          label="Low Stock Alerts"
          value={alerts ? String(alerts.lowStockMedicines.length) : '—'}
          icon={PackageX}
          loading={!alerts}
        />
        <StatCard
          label="Open Purchase Orders"
          value={openPOCount != null ? String(openPOCount) : '—'}
          icon={ClipboardList}
          loading={openPOCount == null}
        />
        <StatCard
          label="Active Suppliers"
          value={activeSupplierCount != null ? String(activeSupplierCount) : '—'}
          icon={Truck}
          loading={activeSupplierCount == null}
        />
        <StatCard
          label="Shifts (Last 90 Days)"
          value={recentShiftCount != null ? String(recentShiftCount) : '—'}
          icon={Clock}
          loading={recentShiftCount == null}
        />
      </div>
      {alerts && (
        <AlertsPanel
          lowStockMedicines={alerts.lowStockMedicines}
          expiringBatches={alerts.expiringBatches}
          expiryAlertDays={alerts.expiryAlertDays}
        />
      )}
    </div>
  )
}
