'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Truck,
  ClipboardList,
  Users,
  Clock,
  BarChart2,
  Wallet,
  UserCog,
  Pill,
  LogOut,
  Landmark,
  ChevronDown,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { ICON_SIZE, SIDEBAR, BRAND } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupChild =
  | { href: string;     label: string; disabled?: never }
  | { href?: undefined; label: string; disabled: true }

interface NavItem {
  type?: 'item'
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: Permission | null
}

interface NavGroup {
  type: 'group'
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: Permission | null
  children: GroupChild[]
}

type NavEntry = NavItem | NavGroup

// ─── Navigation data ──────────────────────────────────────────────────────────

const NAV_ENTRIES: NavEntry[] = [
  { href: '/admin/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, permission: null },
  { href: '/admin/inventory',       label: 'Inventory',       icon: Package,         permission: 'inventory_view' },
  { href: '/admin/suppliers',       label: 'Suppliers',       icon: Truck,           permission: 'suppliers' },
  { href: '/admin/purchase-orders', label: 'Purchase Orders', icon: ClipboardList,   permission: 'purchase_orders' },
  { href: '/admin/customers',       label: 'Customers',       icon: Users,           permission: 'customers' },
  { href: '/admin/shifts',          label: 'Shifts',          icon: Clock,           permission: 'shifts' },
  {
    type: 'group',
    label: 'Reports',
    icon: BarChart2,
    permission: 'reports_full',
    children: [
      { href: '/admin/reports',             label: 'Overview' },
      { href: '/admin/reports/item-detail', label: 'Item Detail' },
      { label: 'Supplier Report',           disabled: true },
      { label: 'Batch Report',              disabled: true },
    ],
  },
  { href: '/admin/expenses',        label: 'Expenses',        icon: Wallet,          permission: 'expenses' },
  { href: '/admin/staff',           label: 'Staff',           icon: UserCog,         permission: 'user_manage_pharmacists' },
  { href: '/admin/ledger',          label: 'Ledger',          icon: Landmark,        permission: null },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  pharmacyName: string
}

export function AdminSidebar({ pharmacyName }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [expanded,    setExpanded]    = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const { permissions } = useDashboardUser()

  // Restore group state from localStorage on mount (avoids hydration mismatch
  // by not reading storage during SSR — useState(false) is the server value).
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebar_reports_expanded')
      if (stored === 'true') setReportsOpen(true)
    } catch {
      // localStorage unavailable (e.g. private browsing with blocked storage)
    }
  }, [])

  // Auto-expand when the current route is inside /admin/reports.
  useEffect(() => {
    if (pathname.startsWith('/admin/reports')) {
      setReportsOpen(true)
    }
  }, [pathname])

  function toggleReports() {
    setReportsOpen(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar_reports_expanded', String(next)) } catch {}
      return next
    })
  }

  function handleReportsClick() {
    toggleReports()
    router.push('/admin/reports')
  }

  const visibleEntries = NAV_ENTRIES.filter(
    entry => entry.permission === null || hasPermission(permissions, entry.permission),
  )

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
      <nav className="flex-1 overflow-hidden" style={{ paddingBottom: 4 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px' }}>
          {visibleEntries.map((entry, i) => {

            // ── Collapsible group (Reports) ───────────────────────────────────
            if (entry.type === 'group') {
              const groupActive = pathname.startsWith('/admin/reports')
              return (
                <li key={`group-${entry.label}`}>
                  {/* Parent row — toggles open/closed AND navigates to overview */}
                  <button
                    type="button"
                    onClick={handleReportsClick}
                    title={!expanded ? entry.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 10px',
                      borderRadius: 6,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      marginBottom: 1,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {/* Icon */}
                    <span style={{ flexShrink: 0, display: 'inline-flex', color: groupActive ? SIDEBAR.activeFg : SIDEBAR.iconInactive }}>
                      <entry.icon size={ICON_SIZE.nav} />
                    </span>
                    {/* Label */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: 500,
                        color: groupActive ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                        opacity: expanded ? 1 : 0,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      {entry.label}
                    </span>
                    {/* Chevron — rotates 180° when open */}
                    <span
                      style={{
                        display: 'inline-flex',
                        flexShrink: 0,
                        color: SIDEBAR.iconInactive,
                        opacity: expanded ? 1 : 0,
                        transition: 'opacity 0.15s ease, transform 0.2s ease',
                        transform: reportsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <ChevronDown size={12} />
                    </span>
                  </button>

                  {/* Children — max-height animation, only visible when sidebar is expanded */}
                  <div
                    style={{
                      maxHeight: (reportsOpen && expanded) ? '300px' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.2s ease',
                    }}
                  >
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {entry.children.map((child, ci) => {
                        // Disabled placeholder (Supplier Report, Batch Report)
                        if (child.disabled) {
                          return (
                            <li key={`disabled-${ci}`}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 10px 6px 37px',
                                  borderRadius: 6,
                                  marginBottom: 1,
                                  opacity: 0.45,
                                  cursor: 'not-allowed',
                                }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 500, color: SIDEBAR.textInactive, whiteSpace: 'nowrap' }}>
                                  {child.label}
                                </span>
                                <span style={{ fontSize: 9, color: SIDEBAR.textInactive, whiteSpace: 'nowrap' }}>
                                  Soon
                                </span>
                              </div>
                            </li>
                          )
                        }

                        // Active child link — exact match to avoid Overview matching sub-routes
                        const childActive = pathname === child.href
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={childActive ? 'page' : undefined}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 10px 6px 37px',
                                borderRadius: 6,
                                textDecoration: 'none',
                                background: childActive ? SIDEBAR.activeBg : 'transparent',
                                transition: 'background 0.15s ease',
                                marginBottom: 1,
                              }}
                              onMouseEnter={(e) => {
                                if (!childActive) (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg
                              }}
                              onMouseLeave={(e) => {
                                if (!childActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: childActive ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                                  whiteSpace: 'nowrap',
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
            const { href, label, icon: Icon } = entry as NavItem
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={`${href}-${i}`}>
                <Link
                  href={href}
                  title={!expanded ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    background: active ? SIDEBAR.activeBg : 'transparent',
                    transition: 'background 0.15s ease',
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <span style={{ flexShrink: 0, display: 'inline-flex', color: active ? SIDEBAR.activeFg : SIDEBAR.iconInactive }}>
                    <Icon size={ICON_SIZE.nav} />
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: active ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                      whiteSpace: 'nowrap',
                      opacity: expanded ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    {label}
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
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 0px',
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SIDEBAR.hoverBg }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ flexShrink: 0, display: 'inline-flex', color: SIDEBAR.iconInactive }}>
              <LogOut size={ICON_SIZE.nav} />
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: SIDEBAR.textInactive,
                whiteSpace: 'nowrap',
                opacity: expanded ? 1 : 0,
                transition: 'opacity 0.15s ease',
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
