'use server'

import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { logAction, ACTION_TYPES } from '@/lib/audit'
import type { UserRole } from '@/lib/db-types'

export async function updateSettings(
  updates: Record<string, string>,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') {
    return { error: 'Unauthorized' }
  }

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) return { error: error.message }
  }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: updates,
  })

  return { error: null }
}

export async function updateSpecialDiscountSettings(
  enabled: boolean,
  type: 'percentage' | 'fixed',
  tiers: number[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'superadmin') return { error: 'Unauthorized' }

  if (!['percentage', 'fixed'].includes(type)) {
    return { error: 'Invalid discount type' }
  }
  if (tiers.length > 6) {
    return { error: 'Maximum 6 tiers allowed' }
  }
  for (const t of tiers) {
    if (type === 'percentage') {
      if (!Number.isInteger(t) || t < 1 || t > 100) {
        return { error: `Percentage tiers must be whole numbers 1–100 (invalid: ${t})` }
      }
    } else {
      if (t <= 0) {
        return { error: `Fixed tiers must be greater than 0 (invalid: ${t})` }
      }
    }
  }

  const updates: Record<string, string> = {
    special_discount_enabled: String(enabled),
    special_discount_type:    type,
    special_discount_tiers:   tiers.join(','),
  }

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) return { error: error.message }
  }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: updates,
  })

  return { error: null }
}

// =============================================================================
// Phase 15A — Print Settings
// =============================================================================

export interface PrintSettings {
  logoUrl:            string
  pharmacyAddress:    string
  pharmacyPhone:      string
  pharmacyEmail:      string
  pharmacyLicense:    string
  footerText:         string
  logoEveryPage:      boolean
  headerEveryPage:    boolean
  footerEveryPage:    boolean
  showPageNumbers:    boolean
  showGeneratedDate:  boolean
  watermarkLogo:      boolean
  watermarkText:      boolean
  watermarkTextValue: string
  watermarkOpacity:   number
}

// Map from PrintSettings camelCase field name → settings table key
const PRINT_KEY_MAP: Record<keyof PrintSettings, string> = {
  logoUrl:            'print_logo_url',
  pharmacyAddress:    'print_pharmacy_address',
  pharmacyPhone:      'print_pharmacy_phone',
  pharmacyEmail:      'print_pharmacy_email',
  pharmacyLicense:    'print_pharmacy_license',
  footerText:         'print_footer_text',
  logoEveryPage:      'print_logo_every_page',
  headerEveryPage:    'print_header_every_page',
  footerEveryPage:    'print_footer_every_page',
  showPageNumbers:    'print_show_page_numbers',
  showGeneratedDate:  'print_show_generated_date',
  watermarkLogo:      'print_watermark_logo',
  watermarkText:      'print_watermark_text',
  watermarkTextValue: 'print_watermark_text_value',
  watermarkOpacity:   'print_watermark_opacity',
}

// Available to all authenticated roles — any role may need to print a document.
export async function getPrintSettings(): Promise<{
  data: PrintSettings | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated' }

  const { data: rows, error } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'print_%')

  if (error) return { data: null, error: error.message }

  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    map[row.key] = row.value
  }

  const data: PrintSettings = {
    logoUrl:            map['print_logo_url']             ?? '',
    pharmacyAddress:    map['print_pharmacy_address']     ?? '',
    pharmacyPhone:      map['print_pharmacy_phone']       ?? '',
    pharmacyEmail:      map['print_pharmacy_email']       ?? '',
    pharmacyLicense:    map['print_pharmacy_license']     ?? '',
    footerText:         map['print_footer_text']          ?? '',
    logoEveryPage:      map['print_logo_every_page']      === 'true',
    headerEveryPage:    map['print_header_every_page']    === 'true',
    footerEveryPage:    map['print_footer_every_page']    === 'true',
    showPageNumbers:    map['print_show_page_numbers']    === 'true',
    showGeneratedDate:  map['print_show_generated_date']  === 'true',
    watermarkLogo:      map['print_watermark_logo']       === 'true',
    watermarkText:      map['print_watermark_text']       === 'true',
    watermarkTextValue: map['print_watermark_text_value'] ?? 'CONFIDENTIAL',
    watermarkOpacity:   parseFloat(map['print_watermark_opacity'] ?? '8'),
  }

  return { data, error: null }
}

// Superadmin only. Updates only the keys present in the partial object.
export async function updatePrintSettings(
  settings: Partial<PrintSettings>,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'superadmin') return { error: 'Unauthorized' }

  if (settings.watermarkOpacity !== undefined) {
    if (settings.watermarkOpacity < 5 || settings.watermarkOpacity > 20) {
      return { error: 'Watermark opacity must be between 5 and 20.' }
    }
  }

  const updates: Record<string, string> = {}
  for (const k of Object.keys(settings) as (keyof PrintSettings)[]) {
    const value = settings[k]
    if (value === undefined) continue
    const dbKey = PRINT_KEY_MAP[k]
    if (!dbKey) continue
    updates[dbKey] = String(value)
  }

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) return { error: error.message }
  }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: updates,
  })

  return { error: null }
}

const ALLOWED_EXTS = ['png', 'jpg', 'jpeg', 'svg'] as const
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml'] as const

// Superadmin only. Validates, compresses (PNG/JPEG via sharp), uploads to
// pharmacy-assets bucket, and updates print_logo_url setting.
export async function uploadPharmacyLogo(
  formData: FormData,
): Promise<{ data: { url: string } | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'superadmin') return { data: null, error: 'Unauthorized' }

  const file = formData.get('logo')
  if (!file || !(file instanceof File)) return { data: null, error: 'No file provided' }

  if (file.size > 2097152) {
    return { data: null, error: 'File too large. Maximum size is 2MB.' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (
    !ALLOWED_EXTS.includes(ext as typeof ALLOWED_EXTS[number]) ||
    !ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])
  ) {
    return {
      data: null,
      error: 'Invalid file type. Only PNG, JPG, JPEG, and SVG files are allowed.',
    }
  }

  const arrayBuffer = await file.arrayBuffer()
  const inputBuffer = Buffer.from(arrayBuffer)

  let uploadBody: Buffer
  if (file.type === 'image/svg+xml') {
    uploadBody = inputBuffer
  } else {
    uploadBody = await sharp(inputBuffer)
      .resize(800, 400, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer()
  }

  const path = file.type === 'image/svg+xml' ? 'logo.svg' : 'logo.png'
  const contentType = file.type === 'image/svg+xml' ? 'image/svg+xml' : 'image/png'

  // Remove the other-format file to avoid orphaned logo files in the bucket
  const oldExt = file.type === 'image/svg+xml' ? 'png' : 'svg'
  await supabase.storage.from('pharmacy-assets').remove([`logo.${oldExt}`])

  const { error: uploadError } = await supabase.storage
    .from('pharmacy-assets')
    .upload(path, uploadBody, { upsert: true, contentType })
  if (uploadError) return { data: null, error: uploadError.message }

  const { data: urlData } = supabase.storage
    .from('pharmacy-assets')
    .getPublicUrl(path)

  const { error: settingError } = await supabase
    .from('settings')
    .upsert({ key: 'print_logo_url', value: urlData.publicUrl }, { onConflict: 'key' })
  if (settingError) return { data: null, error: settingError.message }

  await logAction({
    supabase,
    userId:   user.id,
    userRole: profile.role as UserRole,
    action:   ACTION_TYPES.UPDATE_SETTINGS,
    newValue: { print_logo_url: urlData.publicUrl },
  })

  return { data: { url: urlData.publicUrl }, error: null }
}
