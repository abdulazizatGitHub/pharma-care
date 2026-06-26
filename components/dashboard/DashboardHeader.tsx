'use client'

import React, { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu } from 'lucide-react'
import { ICON_SIZE } from '@/lib/design-tokens'
import { usePOSHeader } from '@/lib/pos-header-context'
import type { POSLayout } from '@/lib/pos-header-context'
import { OpenShiftModal } from '@/components/shifts/OpenShiftModal'
import { CloseShiftModal } from '@/components/shifts/CloseShiftModal'

const ROLE_PREFIXES = new Set(['superadmin', 'admin', 'pharmacist', 'dashboard'])

interface Props {
  userFullName: string
  pharmacyName: string
  onMenuClick?: () => void
}

function formatClock(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day   = d.getDate()
  const month = months[d.getMonth()]
  const year  = d.getFullYear()
  let   h     = d.getHours()
  const m     = d.getMinutes().toString().padStart(2, '0')
  const s     = d.getSeconds().toString().padStart(2, '0')
  const ampm  = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${day} ${month} ${year} · ${h.toString().padStart(2, '0')}:${m}:${s} ${ampm}`
}

function fmtPKR(n: number) {
  return 'Rs ' + Math.round(n).toLocaleString('en-PK')
}

export function DashboardHeader({ userFullName, pharmacyName, onMenuClick }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const segments  = pathname.split('/').filter(Boolean)
  const raw       = (ROLE_PREFIXES.has(segments[0] ?? '') && segments[1])
    ? segments[1]
    : (segments[0] ?? 'dashboard')
  const pageTitle = raw.replace(/-/g, ' ')

  const isPOS = pathname === '/pharmacist/pos'

  const initials = userFullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || '?'

  // Static date for non-POS pages
  const today = new Date().toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  // Live clock (POS only)
  const [clockStr, setClockStr] = useState('')
  useEffect(() => {
    if (!isPOS) return
    const tick = () => setClockStr(formatClock(new Date()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [isPOS])

  // POS header context
  const { shift, layout, setLayout } = usePOSHeader()

  const LAYOUT_LABELS: { value: POSLayout; label: string }[] = [
    { value: 'card',  label: 'Card'  },
    { value: 'table', label: 'Table' },
    { value: 'mixed', label: 'Mixed' },
  ]

  // Shift modals
  const [openShiftModal,  setOpenShiftModal]  = useState(false)
  const [closeShiftModal, setCloseShiftModal] = useState(false)

  function handleShiftSuccess() {
    router.refresh()
  }

  return (
    <>
      <header
        className="bg-white flex items-center shrink-0 relative z-10"
        style={{
          height: 48,
          padding: '0 20px',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          gap: 12,
        }}
      >
        {/* Left: menu + title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-1.5 -ml-1 rounded-md text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
            aria-label="Open menu"
          >
            <Menu size={ICON_SIZE.md} />
          </button>

          <div className="flex flex-col justify-center" style={{ gap: 1 }}>
            <h1
              className="capitalize"
              style={{ fontSize: 14, fontWeight: 500, color: '#111827', lineHeight: 1.2, whiteSpace: 'nowrap' }}
            >
              {pageTitle}
            </h1>
            <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {pharmacyName}
            </span>
          </div>
        </div>

        {/* Center: POS shift status */}
        {isPOS ? (
          <div
            className="flex items-center gap-3 flex-1 justify-center"
            style={{ minWidth: 0 }}
          >
            {shift ? (
              <>
                <span style={{
                  display: 'inline-block', width: 7, height: 7,
                  borderRadius: '50%', background: '#16A34A', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>
                  Shift open · {fmtPKR(shift.sales_total ?? 0)} in sales
                </span>
                <button
                  type="button"
                  onClick={() => setCloseShiftModal(true)}
                  style={{
                    fontSize: 11, fontWeight: 600, color: '#166534',
                    background: 'rgba(22,163,74,0.08)',
                    border: '1px solid #86EFAC',
                    borderRadius: 5, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Close Shift
                </button>
              </>
            ) : (
              <>
                <span style={{
                  display: 'inline-block', width: 7, height: 7,
                  borderRadius: '50%', background: '#EF4444', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: '#374151', whiteSpace: 'nowrap' }}>
                  No active shift
                </span>
                <button
                  type="button"
                  onClick={() => setOpenShiftModal(true)}
                  style={{
                    fontSize: 11, fontWeight: 600, color: '#92400E',
                    background: 'rgba(217,119,6,0.08)',
                    border: '1px solid #FCD34D',
                    borderRadius: 5, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Open Shift
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: layout toggle (POS only) + clock/date + bell + avatar */}
        <div className="flex items-center gap-3 shrink-0">
          {isPOS && (
            <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              {LAYOUT_LABELS.map(({ value, label }, i) => (
                <button
                  key={value}
                  onClick={() => setLayout(value)}
                  style={{
                    padding: '3px 9px',
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.6,
                    background: layout === value ? '#0F6E56' : 'white',
                    color:      layout === value ? 'white'   : '#6b7280',
                    border: 'none',
                    borderRight: i < LAYOUT_LABELS.length - 1 ? '1px solid #e5e7eb' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <span
            className="hidden sm:block"
            style={{ fontSize: 12, color: '#6b7280', fontFamily: isPOS ? 'monospace' : 'inherit', whiteSpace: 'nowrap' }}
          >
            {isPOS ? clockStr : today}
          </span>

          <button
            className="flex items-center justify-center rounded-md text-[#6b7280]"
            style={{ width: 28, height: 28 }}
            aria-label="Notifications (coming soon)"
            aria-disabled="true"
            tabIndex={-1}
            disabled
          >
            <Bell size={16} style={{ opacity: 0.5 }} />
          </button>

          <div
            className="flex items-center justify-center rounded-full shrink-0"
            style={{
              width: 28, height: 28,
              background: '#0F6E56',
              fontSize: 11, fontWeight: 500, color: '#fff',
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* Shift modals */}
      <OpenShiftModal
        open={openShiftModal}
        onClose={() => setOpenShiftModal(false)}
        onSuccess={handleShiftSuccess}
      />
      {shift && (
        <CloseShiftModal
          open={closeShiftModal}
          shift={shift}
          onClose={() => setCloseShiftModal(false)}
          onSuccess={handleShiftSuccess}
        />
      )}
    </>
  )
}
