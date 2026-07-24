'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Shield,
  Users,
  Clock,
  Package,
  Pill,
  LogOut,
  BarChart3,
  ChevronDown,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { ICON_SIZE, SIDEBAR, BRAND } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  type?: 'item'
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: Permission | null
  disabled?: boolean
}

interface NavGroup {
  type: 'group'
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  children: { href: string; label: string; permission: Permission | null }[]
}

type NavEntry = NavItem | NavGroup

// ─── Navigation data ──────────────────────────────────────────────────────────

const NAV_ENTRIES: NavEntry[] = [
  { href: '/pharmacist/dashboard',           label: 'Dashboard',       icon: LayoutDashboard, permission: null },
  { href: '/pharmacist/pos',                 label: 'POS',             icon: ShoppingCart,    permission: 'pos' },
  { href: '/pharmacist/customers',           label: 'Customers',       icon: Users,           permission: 'customers', disabled: true },
  { href: '/pharmacist/shifts',              label: 'Shifts',          icon: Clock,           permission: 'shifts' },
  { href: '/pharmacist/inventory',           label: 'Inventory',       icon: Package,         permission: 'inventory_view' },
  {
    type: 'group', label: 'Reports', icon: BarChart3,
    children: [
      { href: '/pharmacist/reports', label: 'Overview', permission: 'reports_basic' },
    ],
  },
  { href: '/pharmacist/prescriptions',       label: 'Prescriptions',   icon: FileText,        permission: 'prescriptions', disabled: true },
  { href: '/pharmacist/controlled-register', label: 'Controlled Drugs', icon: Shield,         permission: 'controlled_drugs', disabled: true },
]

const PH_STORAGE_KEY = 'sidebar_pharmacist_reports_expanded'

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  pharmacyName: string
}

export function PharmacistSidebar({ pharmacyName }: Props) {
  const pathname = usePathname()
  const [expanded,     setExpanded]     = useState(false)
  const [reportsOpen,  setReportsOpen]  = useState(false)
  const { permissions } = useDashboardUser()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PH_STORAGE_KEY)
      if (stored === 'true') setReportsOpen(true)
    } catch {}
    if (pathname === '/pharmacist/reports') setReportsOpen(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pathname === '/pharmacist/reports') setReportsOpen(true)
  }, [pathname])

  function toggleReports() {
    setReportsOpen(prev => {
      const next = !prev
      try { localStorage.setItem(PH_STORAGE_KEY, String(next)) } catch {}
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

            // ── Reports group ────────────────────────────────────────────────
            if (entry.type === 'group') {
              const visChildren = entry.children.filter(
                c => c.permission === null || hasPermission(permissions, c.permission),
              )
              if (visChildren.length === 0) return null

              const groupActive = visChildren.some(c => pathname === c.href)
              return (
                <li key={`group-${entry.label}`}>
                  <button
                    type="button"
                    onClick={toggleReports}
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
                        transform: reportsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <ChevronDown size={12} />
                    </span>
                  </button>

                  <div
                    style={{
                      maxHeight: (reportsOpen && expanded) ? `${visChildren.length * 36 + 8}px` : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.2s ease',
                    }}
                  >
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {visChildren.map(child => {
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
            const { href, label, icon: Icon, permission, disabled } = entry as NavItem
            if (!disabled && permission !== null && !hasPermission(permissions, permission)) return null

            if (disabled) {
              return (
                <li key={href}>
                  <div
                    title={!expanded ? label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 6,
                      opacity: 0.45, cursor: 'not-allowed', marginBottom: 1,
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'inline-flex', color: SIDEBAR.iconInactive }}>
                      <Icon size={ICON_SIZE.nav} />
                    </span>
                    <span
                      style={{
                        display: 'flex', alignItems: 'center',
                        fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                        color: SIDEBAR.textInactive,
                        opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease',
                      }}
                    >
                      {label}
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        background: '#E5E7EB',
                        color: '#6B7280',
                        borderRadius: 4,
                        padding: '1px 5px',
                        marginLeft: 6,
                        textTransform: 'uppercase',
                        flexShrink: 0,
                      }}>Soon</span>
                    </span>
                  </div>
                </li>
              )
            }

            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={!expanded ? label : undefined}
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
                    <Icon size={ICON_SIZE.nav} />
                  </span>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                      color: active ? SIDEBAR.activeFg : SIDEBAR.textInactive,
                      opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease',
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
