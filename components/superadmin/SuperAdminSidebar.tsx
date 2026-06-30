'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Truck,
  Users,
  Calculator,
  Activity,
  BarChart3,
  UserCog,
  Settings,
  ClipboardList,
  LogOut,
  Pill,
  ChevronDown,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { ICON_SIZE, SIDEBAR, BRAND } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupChild =
  | { href: string;  label: string; disabled?: never }
  | { href?: string; label: string; disabled: true }

type NavEntry =
  | { type: 'item';  href: string; label: string; icon: React.ComponentType<{ size?: number }> }
  | { type: 'group'; label: string; icon: React.ComponentType<{ size?: number }>; children: GroupChild[] }

// ─── Navigation data ──────────────────────────────────────────────────────────

const NAV_ENTRIES: NavEntry[] = [
  { type: 'item', href: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    type: 'group', label: 'Medicines & Stock', icon: Package,
    children: [
      { href: '/superadmin/medicines',       label: 'Medicines' },
      { href: '/superadmin/purchase-orders', label: 'Purchase Orders' },
    ],
  },
  {
    type: 'group', label: 'Suppliers', icon: Truck,
    children: [
      { href: '/superadmin/suppliers',        label: 'Supplier List' },
      { href: '/superadmin/ledger/suppliers', label: 'Supplier Ledger' },
    ],
  },
  {
    type: 'group', label: 'Customers', icon: Users,
    children: [
      { href: '/superadmin/ledger/customers', label: 'Customers (Udhaar)' },
      { href: '/superadmin/ledger/borrowing', label: 'Borrowing' },
    ],
  },
  {
    type: 'group', label: 'Accounting', icon: Calculator,
    children: [
      { href: '/superadmin/ledger',                    label: 'Financial Overview' },
      { href: '/superadmin/ledger/balance-sheet',       label: 'Balance Sheet' },
      { href: '/superadmin/ledger/trial-balance',       label: 'Trial Balance' },
      { href: '/superadmin/ledger/cashbook',       label: 'Cash Book' },
      { href: '/superadmin/ledger/journal',        label: 'Journal' },
      { href: '/superadmin/opening-balances',      label: 'Opening Balances' },
      { href: '/superadmin/expenses',              label: 'Expenses' },
    ],
  },
  {
    type: 'group', label: 'Operations', icon: Activity,
    children: [
      { href: '/superadmin/returns', label: 'Returns' },
      { href: '/superadmin/shifts',  label: 'Shifts' },
    ],
  },
  {
    type: 'group', label: 'Reports', icon: BarChart3,
    children: [
      { href: '/superadmin/reports',             label: 'Overview' },
      { href: '/superadmin/reports/item-detail', label: 'Item Detail' },
      { disabled: true,                           label: 'Supplier Report' },
      { disabled: true,                           label: 'Batch Report' },
    ],
  },
  {
    type: 'group', label: 'User Management', icon: UserCog,
    children: [
      { href: '/superadmin/users', label: 'Users & Roles' },
    ],
  },
  { type: 'item', href: '/superadmin/settings', label: 'Settings',    icon: Settings },
  { type: 'item', href: '/superadmin/audit',     label: 'Audit Trail', icon: ClipboardList },
]

const SA_STORAGE_KEY = 'sidebar_superadmin_groups'

function getActiveGroupSA(pathname: string): string | null {
  for (const entry of NAV_ENTRIES) {
    if (entry.type !== 'group') continue
    if (entry.children.some(child => !child.disabled && child.href === pathname)) {
      return entry.label
    }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  pharmacyName: string
}

export function SuperadminSidebar({ pharmacyName }: Props) {
  const pathname = usePathname()
  const [expanded,   setExpanded]   = useState(false)
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const initial: Record<string, boolean> = {}
    NAV_ENTRIES.forEach(e => { if (e.type === 'group') initial[e.label] = false })
    const active = getActiveGroupSA(pathname)
    if (active) initial[active] = true
    setGroupsOpen(initial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const active = getActiveGroupSA(pathname)
    if (active) {
      setGroupsOpen(prev => {
        const allClosed: Record<string, boolean> = {}
        Object.keys(prev).forEach(k => { allClosed[k] = false })
        return { ...allClosed, [active]: true }
      })
    }
  }, [pathname])

  function toggleGroup(label: string) {
    setGroupsOpen(prev => {
      const wasOpen = !!prev[label]
      const allClosed: Record<string, boolean> = {}
      Object.keys(prev).forEach(k => { allClosed[k] = false })
      const next = { ...allClosed, [label]: !wasOpen }
      try { localStorage.setItem(SA_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="h-full flex flex-col shrink-0 print:hidden"
      style={{
        background: SIDEBAR.bg,
        boxShadow: '1px 0 0 rgba(255,255,255,0.06)',
        width: expanded ? SIDEBAR.widthExpanded : SIDEBAR.widthCollapsed,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center shrink-0"
        style={{ padding: '12px 10px', marginBottom: 8, gap: 10 }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, borderRadius: 8, background: BRAND.primary }}
        >
          <Pill size={ICON_SIZE.nav} className="text-white" />
        </div>
        <span
          className="text-white font-medium truncate"
          style={{
            fontSize: 13,
            opacity: expanded ? 1 : 0,
            transition: 'opacity 0.15s ease',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {pharmacyName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto" style={{ paddingBottom: 4 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px' }}>
          {NAV_ENTRIES.map((entry, i) => {

            // ── Collapsible group ────────────────────────────────────────────
            if (entry.type === 'group') {
              const isOpen      = !!groupsOpen[entry.label]
              const groupActive = entry.children.some(c => !c.disabled && c.href === pathname)
              return (
                <li key={`group-${entry.label}`}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.label)}
                    title={!expanded ? entry.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 6,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      width: '100%', marginBottom: 1,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ flexShrink: 0, display: 'inline-flex', color: groupActive ? SIDEBAR.activeFg : SIDEBAR.iconInactive }}>
                      <entry.icon size={ICON_SIZE.nav} />
                    </span>
                    <span
                      style={{
                        flex: 1, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'left',
                        color: groupActive ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                        opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease',
                      }}
                    >
                      {entry.label}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex', flexShrink: 0, color: SIDEBAR.iconInactive,
                        opacity: expanded ? 1 : 0,
                        transition: 'opacity 0.15s ease, transform 0.2s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <ChevronDown size={12} />
                    </span>
                  </button>

                  <div
                    style={{
                      maxHeight: (isOpen && expanded) ? `${entry.children.length * 36 + 8}px` : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.2s ease',
                    }}
                  >
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {entry.children.map((child, ci) => {
                        if (child.disabled) {
                          return (
                            <li key={`disabled-${entry.label}-${ci}`}>
                              <div
                                style={{
                                  display: 'flex', alignItems: 'center',
                                  padding: '6px 10px 6px 37px', borderRadius: 6, marginBottom: 1,
                                }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                                  {child.label}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9, background: '#F3F4F6', color: '#9CA3AF',
                                    border: '1px solid #E5E7EB', borderRadius: 3,
                                    padding: '1px 5px', marginLeft: 6, whiteSpace: 'nowrap',
                                  }}
                                >
                                  Soon
                                </span>
                              </div>
                            </li>
                          )
                        }
                        const childActive = pathname === child.href
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={childActive ? 'page' : undefined}
                              style={{
                                display: 'flex', alignItems: 'center',
                                padding: '6px 10px 6px 37px', borderRadius: 6,
                                textDecoration: 'none', marginBottom: 1,
                                background: childActive ? SIDEBAR.activeBg : 'transparent',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={e => {
                                if (!childActive) (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg
                              }}
                              onMouseLeave={e => {
                                if (!childActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                                  color: childActive ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                                }}
                              >
                                {child.label}
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </li>
              )
            }

            // ── Regular nav item ─────────────────────────────────────────────
            const active = pathname === entry.href
            return (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  title={!expanded ? entry.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 6, textDecoration: 'none',
                    background: active ? SIDEBAR.activeBg : 'transparent',
                    transition: 'background 0.15s ease', marginBottom: 1,
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <span style={{ flexShrink: 0, display: 'inline-flex', color: active ? SIDEBAR.activeFg : SIDEBAR.iconInactive }}>
                    <entry.icon size={ICON_SIZE.nav} />
                  </span>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                      color: active ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                      opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease',
                    }}
                  >
                    {entry.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom: Sign Out */}
      <div style={{ padding: '0 10px 12px' }}>
        <div
          style={{
            height: '0.5px',
            background: 'rgba(255,255,255,0.1)',
            marginBottom: 8,
            width: expanded ? 'calc(100% - 0px)' : '28px',
            transition: 'width 0.2s ease',
          }}
        />
        <form action={signOut}>
          <button
            type="submit"
            title={!expanded ? 'Sign Out' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0px',
              borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ flexShrink: 0, display: 'inline-flex', color: SIDEBAR.iconInactive }}>
              <LogOut size={ICON_SIZE.nav} />
            </span>
            <span
              style={{
                fontSize: 12, fontWeight: 500, color: SIDEBAR.textInactive,
                whiteSpace: 'nowrap', opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease',
              }}
            >
              Sign Out
            </span>
          </button>
        </form>
      </div>
    </aside>
  )
}
