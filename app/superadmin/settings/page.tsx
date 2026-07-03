import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { SettingsPage } from '@/components/superadmin/SettingsPage'
import { getPrintSettings } from '@/app/actions/settings'

export default async function SuperadminSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  const [settingsResult, printResult] = await Promise.all([
    supabase.from('settings').select('key, value'),
    getPrintSettings(),
  ])

  const settings: Record<string, string> = {}
  for (const row of (settingsResult.data ?? [])) {
    settings[row.key] = row.value
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage pharmacy settings, receipt configuration, and POS behaviour." />
      <SettingsPage settings={settings} printSettings={printResult.data} />
    </div>
  )
}
