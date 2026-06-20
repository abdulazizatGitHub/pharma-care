'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { useDashboardUser } from '@/lib/dashboard-context'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { ICON_SIZE, SIDEBAR, BRAND } from '@/lib/design-tokens'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: Permission | null
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, permission: null },
  { href: '/admin/inventory',       label: 'Inventory',       icon: Package,         permission: 'inventory_view' },
  { href: '/admin/suppliers',       label: 'Suppliers',       icon: Truck,           permission: 'suppliers' },
  { href: '/admin/purchase-orders', label: 'Purchase Orders', icon: ClipboardList,   permission: 'purchase_orders' },
  { href: '/admin/customers',       label: 'Customers',       icon: Users,           permission: 'customers' },
  { href: '/admin/shifts',          label: 'Shifts',          icon: Clock,           permission: 'shifts' },
  { href: '/admin/reports',         label: 'Reports',         icon: BarChart2,       permission: 'reports_full' },
  { href: '/admin/expenses',        label: 'Expenses',        icon: Wallet,          permission: 'expenses' },
  { href: '/admin/staff',           label: 'Staff',           icon: UserCog,         permission: 'user_manage_pharmacists' },
  { href: '/admin/ledger',          label: 'Ledger',          icon: Landmark,        permission: null },
]

interface Props {
  pharmacyName: string
}

export function AdminSidebar({ pharmacyName }: Props) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const { permissions } = useDashboardUser()

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.permission === null || hasPermission(permissions, item.permission),
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
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
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
