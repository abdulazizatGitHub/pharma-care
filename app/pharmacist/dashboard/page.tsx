import { ShoppingCart, Clock, FileText, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader }    from '@/components/ui/PageHeader'
import { StatCard }      from '@/components/ui/StatCard'
import { AlertsPanel }   from '@/components/medicines/AlertsPanel'
import { ShiftStatusBanner } from '@/components/shifts/ShiftStatusBanner'
import { getAlertSummary } from '@/app/actions/stock'
import { getCurrentShift }  from '@/app/actions/shifts'

export default async function PharmacistDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [alertResult, shiftResult, salesTodayResult] = await Promise.all([
    getAlertSummary(),
    user ? getCurrentShift(user.id) : Promise.resolve({ data: null, error: null }),
    user
      ? supabase
          .from('sales')
          .select('id, total_amount')
          .eq('cashier_id', user.id)
          .eq('is_deleted', false)
          .gte('created_at', todayISO)
      : Promise.resolve({ data: null, error: null }),
  ])

  const alerts        = alertResult.data
  const shift         = shiftResult.data
  const wasAutoClosed = (shiftResult as { wasAutoClosed?: boolean }).wasAutoClosed === true
  const shiftLabel    = shift ? 'Open' : 'No shift'

  const salesToday      = salesTodayResult.data ?? []
  const salesTodayCount = salesToday.length
  const salesTodayLabel = `${salesTodayCount} sale${salesTodayCount === 1 ? '' : 's'}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Dashboard"
        description="Your shift summary for today."
      />

      {wasAutoClosed && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          fontSize: 13,
          color: '#92400E',
          lineHeight: 1.5,
        }}>
          <strong>Notice:</strong> Your previous shift was auto-closed because it wasn&apos;t closed before midnight.
          Please review your <a href="/pharmacist/shifts" style={{ color: '#B45309', fontWeight: 600, textDecoration: 'underline' }}>shift history</a>.
        </div>
      )}

      <ShiftStatusBanner initialShift={shift} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <StatCard label="My Sales Today" value={salesTodayLabel} icon={ShoppingCart} />
        <StatCard label="Shift Status"   value={shiftLabel}      icon={Clock} />
        <div style={{ opacity: 0.5 }}>
          <StatCard label="Prescriptions" value="Soon" icon={FileText} />
        </div>
        <div style={{ opacity: 0.5 }}>
          <StatCard label="Controlled Drugs" value="Soon" icon={Shield} />
        </div>
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
