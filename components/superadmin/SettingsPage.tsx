'use client'

import React, { useState } from 'react'
import { Building2, Receipt, Banknote, ClipboardList, Lock, RotateCcw, LucideIcon } from 'lucide-react'
import { updateSettings, updateSpecialDiscountSettings } from '@/app/actions/settings'
import { Button } from '@/components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  settings: Record<string, string>
}

type SectionKey = 'pharmacy' | 'receipt' | 'pos' | 'procurement' | 'returns' | 'fbr'

// ─── Style constants ──────────────────────────────────────────────────────────

const LABEL = 'block text-[12px] font-medium uppercase tracking-[0.04em] text-[#6b7280] mb-1'
const HELPER = 'text-[11px] text-[#9ca3af] mt-1 leading-normal'
const INPUT  = 'w-full h-8 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-0 bg-white'
const TXTA   = 'w-full px-2.5 py-2 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-0 resize-none bg-white'

// Active nav item: brand-info palette
const ACTIVE_BG  = '#E6F1FB'
const ACTIVE_FG  = '#185FA5'

// ─── Per-section state ────────────────────────────────────────────────────────

function useSection(initial: Record<string, string>) {
  const [values,  setValues]  = useState(initial)
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function set(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setLoading(true); setError(null); setSaved(false)
    const result = await updateSettings(values)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return { values, set, loading, saved, error, save }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? '#0F6E56' : '#d1d5db',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
      {hint && <p className={HELPER}>{hint}</p>}
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div style={{ flex: 1 }}>
        <p className="text-[12px] font-medium text-[#111827]">{label}</p>
        {description && <p className="text-[11px] text-[#9ca3af] mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function RowDivider() {
  return <div className="border-t border-[rgba(0,0,0,0.06)]" />
}

// ─── Section panel (header + scrollable content + footer) ─────────────────────

function SectionPanel({
  title,
  description,
  children,
  onSave,
  loading,
  saved,
  error,
  saveHint,
}: {
  title:       string
  description: string
  children:    React.ReactNode
  onSave:      () => void
  loading:     boolean
  saved:       boolean
  error:       string | null
  saveHint?:   string
}) {
  return (
    <>
      {/* Fixed header */}
      <div
        className="shrink-0 border-b border-[rgba(0,0,0,0.07)]"
        style={{ padding: '20px 32px 16px' }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111827', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{description}</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '24px 32px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {children}
        </div>
      </div>

      {/* Pinned footer */}
      <div
        className="shrink-0 border-t border-[rgba(0,0,0,0.07)] flex items-center justify-between"
        style={{ padding: '12px 32px', background: '#fff' }}
      >
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {saveHint ?? 'Changes take effect immediately'}
        </span>
        <div className="flex items-center gap-3">
          {saved && (
            <span style={{ fontSize: 11, color: '#0F6E56', fontWeight: 500 }}>✓ Saved</span>
          )}
          {error && (
            <span style={{ fontSize: 11, color: '#A32D2D' }}>⚠ {error}</span>
          )}
          <Button size="sm" onClick={onSave} loading={loading}>Save changes</Button>
        </div>
      </div>
    </>
  )
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function NavItem({
  icon: Icon,
  label,
  sub,
  active,
  disabled,
  onClick,
}: {
  icon:     LucideIcon
  label:    string
  sub:      string
  active:   boolean
  disabled: boolean
  onClick:  () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderRadius: 6,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? ACTIVE_BG : 'transparent',
        opacity: disabled ? 0.45 : 1,
        transition: 'background 0.13s',
        pointerEvents: disabled ? 'none' : 'auto',
        textAlign: 'left',
      }}
    >
      <Icon
        size={15}
        style={{ color: active ? ACTIVE_FG : '#6b7280', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12,
          fontWeight: 500,
          color: active ? ACTIVE_FG : '#374151',
          lineHeight: 1.2,
          margin: 0,
        }}>
          {label}
        </p>
        <p style={{
          fontSize: 10,
          color: active ? `${ACTIVE_FG}99` : '#9ca3af',
          lineHeight: 1.3,
          margin: 0,
          marginTop: 1,
        }}>
          {sub}
        </p>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
// Height: 100vh minus shell header (48px), main padding (32px), PageHeader (~68px)

export function SettingsPage({ settings }: Props) {
  const [active, setActive] = useState<SectionKey>('pharmacy')

  const pharmacy    = useSection({
    pharmacy_name:           settings['pharmacy_name']           ?? 'PharmaCare',
    receipt_header_note:     settings['receipt_header_note']     ?? '',
    pharmacy_address:        settings['pharmacy_address']        ?? '',
    session_timeout_minutes: settings['session_timeout_minutes'] ?? '30',
  })

  const receipt     = useSection({
    pos_receipt_footer:      settings['pos_receipt_footer']      ?? 'Thank you for your visit.',
    receipt_return_policy:   settings['receipt_return_policy']   ?? '',
    receipt_show_cashier:    settings['receipt_show_cashier']    ?? 'true',
    receipt_show_receipt_no: settings['receipt_show_receipt_no'] ?? 'true',
  })

  const pos         = useSection({
    service_fee_enabled:  settings['service_fee_enabled']  ?? 'false',
    service_fee_amount:   settings['service_fee_amount']   ?? '2',
    service_fee_label:    settings['service_fee_label']    ?? 'Service Fee',
    pos_discount_max_pct: settings['pos_discount_max_pct'] ?? '10',
  })

  const procurement = useSection({
    po_approval_threshold: settings['po_approval_threshold'] ?? '50000',
  })

  const returns = useSection({
    return_window_days:        settings['return_window_days']        ?? '3',
    return_auto_approve_limit: settings['return_auto_approve_limit'] ?? '1000',
    return_opened_pack_allowed: settings['return_opened_pack_allowed'] ?? 'false',
    exchange_window_days:      settings['exchange_window_days']      ?? '7',
    exchange_price_diff_payer: settings['exchange_price_diff_payer'] ?? 'either',
    return_requires_receipt:   settings['return_requires_receipt']   ?? 'true',
  })

  const feeEnabled = pos.values['service_fee_enabled'] === 'true'
  const pharmacyName = settings['pharmacy_name'] ?? 'PharmaCare'

  // ── Special discount local state ───────────────────────────────────────────
  // Kept separate from pos useSection because tiers require number[], not string.

  const [sdEnabled,  setSdEnabled]  = useState(settings['special_discount_enabled'] === 'true')
  const [sdType,     setSdType]     = useState<'percentage' | 'fixed'>(
    settings['special_discount_type'] === 'fixed' ? 'fixed' : 'percentage'
  )
  const [sdTiers,    setSdTiers]    = useState<number[]>(() => {
    const raw = settings['special_discount_tiers'] ?? ''
    return raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0)
  })
  const [sdInput,    setSdInput]    = useState('')
  const [sdInputErr, setSdInputErr] = useState<string | null>(null)
  const [sdLoading,  setSdLoading]  = useState(false)
  const [sdSaved,    setSdSaved]    = useState(false)
  const [sdError,    setSdError]    = useState<string | null>(null)

  function sdAddTier() {
    const raw = sdInput.trim()
    const val = parseFloat(raw)
    if (!raw || isNaN(val)) { setSdInputErr('Enter a valid number'); return }
    if (sdType === 'percentage') {
      if (!Number.isInteger(val) || val < 1 || val > 100) {
        setSdInputErr('Must be a whole number from 1–100'); return
      }
    } else {
      if (val <= 0) { setSdInputErr('Must be greater than 0'); return }
    }
    if (sdTiers.includes(val))   { setSdInputErr('Tier already exists'); return }
    if (sdTiers.length >= 6)     { setSdInputErr('Maximum 6 tiers allowed'); return }
    setSdTiers(prev => [...prev, val].sort((a, b) => a - b))
    setSdInput('')
    setSdInputErr(null)
  }

  function sdRemoveTier(val: number) {
    setSdTiers(prev => prev.filter(t => t !== val))
  }

  function sdHandleTypeChange(newType: 'percentage' | 'fixed') {
    if (sdTiers.length > 0) {
      if (!window.confirm('Changing type will clear existing tiers. Continue?')) return
      setSdTiers([])
      setSdInputErr(null)
    }
    setSdType(newType)
  }

  async function sdSave() {
    setSdLoading(true); setSdError(null); setSdSaved(false)
    const result = await updateSpecialDiscountSettings(sdEnabled, sdType, sdTiers)
    setSdLoading(false)
    if (result.error) { setSdError(result.error); return }
    setSdSaved(true)
    setTimeout(() => setSdSaved(false), 3000)
  }

  return (
    <div
      className="flex rounded-xl overflow-hidden"
      style={{
        height: 'calc(100vh - 152px)',
        border: '1px solid rgba(0,0,0,0.08)',
        background: '#fff',
      }}
    >

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 220,
          background: '#f8f9fb',
          borderRight: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 8px' }}>

          {/* Group: General */}
          <p style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#9ca3af',
            padding: '4px 10px 6px',
            margin: 0,
          }}>
            General
          </p>

          <NavItem
            icon={Building2}
            label="Pharmacy"
            sub="Name, address, info"
            active={active === 'pharmacy'}
            disabled={false}
            onClick={() => setActive('pharmacy')}
          />
          <NavItem
            icon={Receipt}
            label="Receipt"
            sub="Format, footer, policy"
            active={active === 'receipt'}
            disabled={false}
            onClick={() => setActive('receipt')}
          />

          {/* Group: Operations */}
          <p style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#9ca3af',
            padding: '12px 10px 6px',
            margin: 0,
          }}>
            Operations
          </p>

          <NavItem
            icon={Banknote}
            label="POS & Fees"
            sub="Charges, discounts"
            active={active === 'pos'}
            disabled={false}
            onClick={() => setActive('pos')}
          />
          <NavItem
            icon={ClipboardList}
            label="Procurement"
            sub="PO approvals"
            active={active === 'procurement'}
            disabled={false}
            onClick={() => setActive('procurement')}
          />
          <NavItem
            icon={RotateCcw}
            label="Returns"
            sub="Window, limits, policy"
            active={active === 'returns'}
            disabled={false}
            onClick={() => setActive('returns')}
          />
          <NavItem
            icon={Lock}
            label="FBR / Tax"
            sub="Coming soon"
            active={active === 'fbr'}
            disabled={true}
            onClick={() => setActive('fbr')}
          />

        </nav>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── PHARMACY ── */}
        {active === 'pharmacy' && (
          <SectionPanel
            title="Pharmacy details"
            description="Basic information shown on receipts and throughout the system."
            onSave={pharmacy.save}
            loading={pharmacy.loading}
            saved={pharmacy.saved}
            error={pharmacy.error}
          >
            <Field label="Pharmacy name *">
              <input
                type="text"
                value={pharmacy.values['pharmacy_name']}
                onChange={e => pharmacy.set('pharmacy_name', e.target.value)}
                placeholder="e.g. PharmaCare"
                className={INPUT}
              />
            </Field>

            <Field
              label="Tagline / header note"
              hint="Shown below pharmacy name on receipt. Leave blank to hide."
            >
              <input
                type="text"
                value={pharmacy.values['receipt_header_note']}
                onChange={e => pharmacy.set('receipt_header_note', e.target.value)}
                placeholder="e.g. Licensed Pharmacy · Est. 2010"
                className={INPUT}
              />
            </Field>

            <Field
              label="Address"
              hint="Printed below the tagline on receipts."
            >
              <textarea
                value={pharmacy.values['pharmacy_address']}
                onChange={e => pharmacy.set('pharmacy_address', e.target.value)}
                placeholder="Street, City"
                rows={3}
                className={TXTA}
              />
            </Field>

            <Field
              label="Session timeout (minutes)"
              hint="Auto-logout after this many minutes of inactivity. Set to 0 to disable."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="480"
                  step="1"
                  value={pharmacy.values['session_timeout_minutes']}
                  onChange={e => pharmacy.set('session_timeout_minutes', e.target.value)}
                  placeholder="30"
                  style={{ width: 96 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>min (0 = disabled)</span>
              </div>
            </Field>
          </SectionPanel>
        )}

        {/* ── RECEIPT ── */}
        {active === 'receipt' && (
          <SectionPanel
            title="Receipt configuration"
            description="Customize what appears on printed receipts."
            onSave={receipt.save}
            loading={receipt.loading}
            saved={receipt.saved}
            error={receipt.error}
          >
            <Field label="Receipt footer text">
              <input
                type="text"
                value={receipt.values['pos_receipt_footer']}
                onChange={e => receipt.set('pos_receipt_footer', e.target.value)}
                placeholder="Thank you for your visit."
                className={INPUT}
              />
            </Field>

            <Field
              label="Return & exchange policy"
              hint="Printed above footer on every receipt. Leave blank to hide."
            >
              <textarea
                value={receipt.values['receipt_return_policy']}
                onChange={e => receipt.set('receipt_return_policy', e.target.value)}
                placeholder="e.g. No returns after 24 hours. Exchange within 3 days with receipt."
                rows={3}
                className={TXTA}
              />
            </Field>

            <RowDivider />

            <ToggleRow
              label="Show cashier name"
              description="Cashier name printed on receipt"
              checked={receipt.values['receipt_show_cashier'] !== 'false'}
              onChange={v => receipt.set('receipt_show_cashier', String(v))}
            />
            <RowDivider />
            <ToggleRow
              label="Show receipt number"
              description="Unique receipt number printed on receipt"
              checked={receipt.values['receipt_show_receipt_no'] !== 'false'}
              onChange={v => receipt.set('receipt_show_receipt_no', String(v))}
            />
          </SectionPanel>
        )}

        {/* ── POS & FEES ── */}
        {active === 'pos' && (
          <SectionPanel
            title="POS & financial settings"
            description="Configure charges and discount limits at the counter."
            onSave={pos.save}
            loading={pos.loading}
            saved={pos.saved}
            error={pos.error}
          >
            <ToggleRow
              label="Enable service fee per sale"
              description="Adds a configurable fee to each sale total."
              checked={feeEnabled}
              onChange={v => pos.set('service_fee_enabled', String(v))}
            />

            {/* Slide-in fields when fee is enabled */}
            <div
              style={{
                maxHeight: feeEnabled ? '160px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.25s ease',
              }}
            >
              <div style={{ paddingTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Amount (PKR)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pos.values['service_fee_amount']}
                    onChange={e => pos.set('service_fee_amount', e.target.value)}
                    placeholder="2.00"
                    className={INPUT}
                  />
                </Field>
                <Field
                  label="Fee label"
                  hint="This label appears on every receipt."
                >
                  <input
                    type="text"
                    value={pos.values['service_fee_label']}
                    onChange={e => pos.set('service_fee_label', e.target.value || 'Service Fee')}
                    placeholder="e.g. Service Fee, Handling Fee"
                    className={INPUT}
                  />
                </Field>
              </div>
            </div>

            <RowDivider />

            <Field
              label="Maximum cashier discount (%)"
              hint="Cashiers cannot apply discounts above this limit."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="1"
                  value={pos.values['pos_discount_max_pct']}
                  onChange={e => pos.set('pos_discount_max_pct', e.target.value)}
                  placeholder="10"
                  style={{ width: 96 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>%</span>
              </div>
            </Field>

            <RowDivider />

            {/* ── Special Discount subsection ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: '#9ca3af', margin: 0,
              }}>
                Special Discount
              </p>

              <ToggleRow
                label="Enable special discount"
                description={
                  sdEnabled
                    ? 'Pharmacists with permission can apply a special discount at checkout.'
                    : 'Enable to configure discount tiers and grant access to pharmacists.'
                }
                checked={sdEnabled}
                onChange={setSdEnabled}
              />

              {sdEnabled && (
                <>
                  {/* Type radio */}
                  <Field label="Discount type">
                    <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                      {(['percentage', 'fixed'] as const).map(t => (
                        <label
                          key={t}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#374151' }}
                        >
                          <input
                            type="radio"
                            name="sd_type"
                            value={t}
                            checked={sdType === t}
                            onChange={() => sdHandleTypeChange(t)}
                            style={{ accentColor: '#0F6E56' }}
                          />
                          {t === 'percentage' ? 'Percentage (%)' : 'Fixed Amount (Rs)'}
                        </label>
                      ))}
                    </div>
                  </Field>

                  {/* Tier chip input */}
                  <Field
                    label="Discount tiers"
                    hint={`${sdTiers.length} / 6 tiers configured. Press Enter or click + Add.`}
                  >
                    {/* Existing tier chips */}
                    {sdTiers.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {sdTiers.map(tier => (
                          <span
                            key={tier}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 6px 2px 10px',
                              borderRadius: 12,
                              background: '#E6F1FB', border: '1px solid #B3D0F0',
                              fontSize: 11, fontWeight: 600, color: '#185FA5',
                            }}
                          >
                            {sdType === 'percentage' ? `${tier}%` : `Rs ${tier}`}
                            <button
                              type="button"
                              onClick={() => sdRemoveTier(tier)}
                              aria-label={`Remove tier ${tier}`}
                              style={{
                                width: 14, height: 14,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 7, border: 'none',
                                background: '#185FA5', color: '#fff',
                                fontSize: 9, cursor: 'pointer', lineHeight: 1, padding: 0,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add row */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        min="0"
                        step={sdType === 'percentage' ? '1' : '0.01'}
                        value={sdInput}
                        onChange={e => { setSdInput(e.target.value); setSdInputErr(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sdAddTier() } }}
                        placeholder={sdType === 'percentage' ? 'e.g. 5' : 'e.g. 50'}
                        style={{ width: 120 }}
                        className={INPUT}
                      />
                      <button
                        type="button"
                        onClick={sdAddTier}
                        style={{
                          height: 32, padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #0F6E56',
                          background: '#0F6E56', color: '#fff',
                          fontSize: 12, fontWeight: 500,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        + Add
                      </button>
                    </div>

                    {sdInputErr && (
                      <p style={{ fontSize: 11, color: '#A32D2D', marginTop: 4 }}>{sdInputErr}</p>
                    )}
                  </Field>

                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: -4 }}>
                    Pharmacists are granted access up to a maximum tier in{' '}
                    <strong style={{ color: '#6b7280' }}>User Management → Edit Pharmacist</strong>.
                  </p>
                </>
              )}

              {/* Special discount save row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                {sdSaved && <span style={{ fontSize: 11, color: '#0F6E56', fontWeight: 500 }}>✓ Saved</span>}
                {sdError && <span style={{ fontSize: 11, color: '#A32D2D' }}>⚠ {sdError}</span>}
                <Button size="sm" onClick={sdSave} loading={sdLoading}>
                  Save special discount
                </Button>
              </div>
            </div>
          </SectionPanel>
        )}

        {/* ── PROCUREMENT ── */}
        {active === 'procurement' && (
          <SectionPanel
            title="Purchase orders"
            description="Control approval workflow for supplier purchase orders."
            onSave={procurement.save}
            loading={procurement.loading}
            saved={procurement.saved}
            error={procurement.error}
          >
            <Field
              label="Approval threshold (PKR)"
              hint="Purchase orders at or above this amount require superadmin approval before confirmation."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={procurement.values['po_approval_threshold']}
                  onChange={e => procurement.set('po_approval_threshold', e.target.value)}
                  placeholder="50000"
                  style={{ width: 160 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>PKR</span>
              </div>
            </Field>
          </SectionPanel>
        )}

        {/* ── RETURNS & EXCHANGES ── */}
        {active === 'returns' && (
          <SectionPanel
            title="Returns & Exchanges"
            description="Configure return windows, auto-approval limits, and exchange policy."
            onSave={returns.save}
            loading={returns.loading}
            saved={returns.saved}
            error={returns.error}
          >
            <Field
              label="Return window (days)"
              hint="Returns submitted within this many days of the original sale are eligible for auto-approval."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={returns.values['return_window_days']}
                  onChange={e => returns.set('return_window_days', e.target.value)}
                  placeholder="3"
                  style={{ width: 80 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>days</span>
              </div>
            </Field>

            <Field
              label="Auto-approve limit (PKR)"
              hint="Returns with a total refund below this amount are auto-approved if all other criteria pass."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={returns.values['return_auto_approve_limit']}
                  onChange={e => returns.set('return_auto_approve_limit', e.target.value)}
                  placeholder="1000"
                  style={{ width: 140 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>PKR</span>
              </div>
            </Field>

            <Field
              label="Exchange window (days)"
              hint="Exchanges must be requested within this many days of the original sale."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={returns.values['exchange_window_days']}
                  onChange={e => returns.set('exchange_window_days', e.target.value)}
                  placeholder="7"
                  style={{ width: 80 }}
                  className={INPUT}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>days</span>
              </div>
            </Field>

            <RowDivider />

            <ToggleRow
              label="Require receipt for returns"
              description="Customer must provide the original receipt number to initiate a return."
              checked={returns.values['return_requires_receipt'] !== 'false'}
              onChange={v => returns.set('return_requires_receipt', String(v))}
            />
            <RowDivider />
            <ToggleRow
              label="Allow opened-pack returns without approval"
              description="If off, opened packs always require superadmin approval regardless of other criteria."
              checked={returns.values['return_opened_pack_allowed'] === 'true'}
              onChange={v => returns.set('return_opened_pack_allowed', String(v))}
            />

            <RowDivider />

            <Field
              label="Exchange price difference payer"
              hint="Who can settle the price difference when exchange items cost more or less than returned items."
            >
              <select
                value={returns.values['exchange_price_diff_payer']}
                onChange={e => returns.set('exchange_price_diff_payer', e.target.value)}
                className={INPUT}
                style={{ cursor: 'pointer' }}
              >
                <option value="customer">Customer pays / receives difference</option>
                <option value="pharmacy">Pharmacy absorbs difference</option>
                <option value="either">Either party (flexible)</option>
              </select>
            </Field>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: '#FEF9C3',
                border: '1px solid #FDE68A',
                fontSize: 11,
                color: '#78350F',
                lineHeight: 1.6,
              }}
            >
              <strong>Note:</strong> Controlled medicines (Schedule C / Narcotics) can never be returned
              regardless of these settings. This is hardcoded and cannot be overridden.
            </div>
          </SectionPanel>
        )}

        {/* ── FBR / TAX (coming soon) ── */}
        {active === 'fbr' && (
          <>
            {/* Fixed header */}
            <div
              className="shrink-0 border-b border-[rgba(0,0,0,0.07)]"
              style={{ padding: '20px 32px 16px' }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111827', margin: 0 }}>
                FBR / Tax integration
              </h2>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                Connect to Federal Board of Revenue for automated tax compliance.
              </p>
            </div>

            {/* Centered coming-soon card */}
            <div className="flex-1 flex items-center justify-center">
              <div
                style={{
                  maxWidth: 380,
                  textAlign: 'center',
                  padding: '40px 32px',
                  borderRadius: 12,
                  background: '#f8f9fb',
                  border: '1px solid rgba(0,0,0,0.07)',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    background: 'rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <Lock size={24} style={{ color: '#9ca3af' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
                  Coming in a future update
                </p>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, margin: '0 0 12px' }}>
                  FBR POS integration, NTN registration, and automated tax calculation will be
                  available after the core system is stable.
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af' }}>
                  Contact support for early access.
                </p>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
