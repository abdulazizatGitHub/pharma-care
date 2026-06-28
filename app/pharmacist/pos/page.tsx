import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePermissions, hasPermission } from '@/lib/permissions'
import { POSPage } from '@/components/pos/POSPage'
import { getHeldSales, getTopMedicines } from '@/app/actions/sales'
import { getCurrentShift } from '@/app/actions/shifts'
import type { UserRole, Permission } from '@/lib/permissions'
import type { ParkedSale, POSMedicineResult } from '@/lib/pos-types'

export default async function PharmacistPosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: overrides }] = await Promise.all([
    supabase.from('profiles').select('role, full_name, special_discount_max_tier').eq('id', user.id).single(),
    supabase.from('user_permissions').select('permission, type').eq('user_id', user.id),
  ])

  if (!profile) redirect('/login')

  const permissions = resolvePermissions(
    (profile.role ?? 'pharmacist') as UserRole,
    (overrides ?? []) as { type: 'grant' | 'restrict'; permission: Permission }[],
  )

  if (!hasPermission(permissions, 'pos')) redirect('/unauthorized')

  const [{ data: settingsRows }, heldResult, topMedsResult, shiftResult] = await Promise.all([
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'service_fee_enabled',
        'service_fee_amount',
        'service_fee_label',
        'pos_discount_max_pct',
        'pos_receipt_footer',
        'pharmacy_name',
        'pharmacy_address',
        'receipt_header_note',
        'receipt_return_policy',
        'receipt_show_cashier',
        'receipt_show_receipt_no',
        'special_discount_enabled',
        'special_discount_type',
        'special_discount_tiers',
      ]),
    getHeldSales(user.id),
    getTopMedicines(),
    getCurrentShift(user.id),
  ])

  const settings: Record<string, string> = {}
  for (const row of (settingsRows ?? [])) {
    settings[row.key] = row.value
  }

  const specialDiscountTiers = (settings['special_discount_tiers'] ?? '')
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0)

  const rawMaxTier = (profile as { role: string; full_name?: string | null; special_discount_max_tier?: number | null }).special_discount_max_tier
  const specialDiscountMaxTier = rawMaxTier !== undefined && rawMaxTier !== null ? Number(rawMaxTier) : null

  return (
    <POSPage
      cashierId={user.id}
      cashierName={(profile as { role: string; full_name?: string | null }).full_name ?? 'Cashier'}
      pharmacyName={settings['pharmacy_name']        ?? 'PharmaCare'}
      pharmacyAddress={settings['pharmacy_address']  ?? ''}
      headerNote={settings['receipt_header_note']    ?? ''}
      receiptFooter={settings['pos_receipt_footer']  ?? 'Thank you for your visit.'}
      returnPolicy={settings['receipt_return_policy'] ?? ''}
      showCashierName={settings['receipt_show_cashier']    !== 'false'}
      showReceiptNo={settings['receipt_show_receipt_no']   !== 'false'}
      maxDiscountPct={parseInt(settings['pos_discount_max_pct'] ?? '10', 10)}
      serviceFeeEnabled={settings['service_fee_enabled'] === 'true'}
      serviceFeeAmount={parseFloat(settings['service_fee_amount'] ?? '2')}
      serviceFeeLabel={settings['service_fee_label']  ?? 'Service Fee'}
      initialParkedSales={(heldResult.data ?? []) as ParkedSale[]}
      initialMedicines={(topMedsResult.data ?? []) as POSMedicineResult[]}
      currentShift={shiftResult.data ?? null}
      specialDiscountEnabled={settings['special_discount_enabled'] === 'true'}
      specialDiscountType={settings['special_discount_type'] === 'fixed' ? 'fixed' : 'percentage'}
      specialDiscountTiers={specialDiscountTiers}
      specialDiscountMaxTier={specialDiscountMaxTier}
    />
  )
}
