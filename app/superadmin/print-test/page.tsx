import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPrintSettings } from '@/app/actions/settings'
import type { PrintSettings } from '@/app/actions/settings'
import { PrintDocument } from '@/components/print/PrintDocument'

// Fallback used when getPrintSettings() returns an error (e.g. migration 034
// not yet executed in this environment). Keeps the test page functional.
const FALLBACK_SETTINGS: PrintSettings = {
  logoUrl:            '',
  pharmacyAddress:    '',
  pharmacyPhone:      '',
  pharmacyEmail:      '',
  pharmacyLicense:    '',
  footerText:         '',
  logoEveryPage:      true,
  headerEveryPage:    true,
  footerEveryPage:    true,
  showPageNumbers:    true,
  showGeneratedDate:  true,
  watermarkLogo:      false,
  watermarkText:      false,
  watermarkTextValue: 'CONFIDENTIAL',
  watermarkOpacity:   8,
}

export default async function PrintTestPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') redirect('/unauthorized')

  const [printResult, pharmNameRow] = await Promise.all([
    getPrintSettings(),
    supabase.from('settings').select('value').eq('key', 'pharmacy_name').single(),
  ])

  const printSettings = printResult.data ?? FALLBACK_SETTINGS
  const pharmacyName  = pharmNameRow.data?.value ?? 'PharmaCare'

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        Print System Test (temporary)
      </h1>
      <PrintDocument
        printSettings={printSettings}
        pharmacyName={pharmacyName}
        documentTitle="Test Document"
        documentSubtitle="Verifying PrintDocument component — multi-page test"
      >
        <div style={{ padding: '20px 0' }}>
          <p style={{ marginBottom: 16 }}>
            This is test body content to verify the PrintDocument component renders
            correctly and repeats its header/footer across multiple printed pages.
          </p>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
                  Item
                </th>
                <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 40 }, (_, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    Test row {i + 1}
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    Rs {((i + 1) * 100).toLocaleString('en-PK')}.00
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PrintDocument>
    </div>
  )
}
