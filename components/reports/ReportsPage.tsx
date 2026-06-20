'use client'

import React, { useState } from 'react'
import { DateRangeSelector, getPresetRange } from './DateRangeSelector'
import type { DateRange } from './DateRangeSelector'
import { SalesTab }        from './tabs/SalesTab'
import { FinancialTab }    from './tabs/FinancialTab'
import { InventoryTab }    from './tabs/InventoryTab'
import { ProcurementTab }  from './tabs/ProcurementTab'
import { CustomersTab }    from './tabs/CustomersTab'
import { PharmacistTab }   from './tabs/PharmacistTab'

type TabId = 'sales' | 'financial' | 'inventory' | 'procurement' | 'customers' | 'pharmacist'

const ALL_TABS: { id: TabId; label: string; roles: string[] }[] = [
  { id: 'sales',       label: 'Sales',              roles: ['superadmin', 'admin', 'pharmacist'] },
  { id: 'financial',   label: 'Financial',           roles: ['superadmin'] },
  { id: 'inventory',   label: 'Inventory',           roles: ['superadmin', 'admin'] },
  { id: 'procurement', label: 'Procurement',         roles: ['superadmin', 'admin'] },
  { id: 'customers',   label: 'Customers',           roles: ['superadmin', 'admin'] },
  { id: 'pharmacist',  label: 'Pharmacist Perf.',    roles: ['superadmin', 'admin'] },
]

function defaultRange(): DateRange {
  const { from, to } = getPresetRange('This Month')
  return { from, to, preset: 'This Month' }
}

interface Props {
  role:          'superadmin' | 'admin' | 'pharmacist'
  userId:        string
  pharmacyName?: string
}

export function ReportsPage({ role, userId, pharmacyName = 'PharmaCare' }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange)

  const visibleTabs = ALL_TABS.filter(t => t.roles.includes(role))
  const [activeTab,  setActiveTab]  = useState<TabId>(visibleTabs[0]?.id ?? 'sales')

  // Guard: if active tab is no longer visible (role downgrade mid-session), reset.
  const currentTab = visibleTabs.find(t => t.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? 'sales')

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           16,
        padding:       '20px 24px',
        maxWidth:      1400,
        minHeight:     '100%',
      }}
    >
      {/* Print-only header — hidden on screen, visible when printing */}
      <div className="reports-print-header" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
          {pharmacyName}
        </h1>
        <p style={{ fontSize: 13, color: '#374151', margin: '0 0 2px' }}>
          {ALL_TABS.find(t => t.id === currentTab)?.label ?? 'Report'} Report — {dateRange.from} to {dateRange.to}
        </p>
        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
          Generated: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0 0' }} />
      </div>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
          Reports
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 0 }}>
          {role === 'pharmacist'
            ? 'Your sales performance for the selected period'
            : 'Business analytics and operational reporting'}
        </p>
      </div>

      {/* Date range selector */}
      <div
        className="reports-date-selector"
        style={{
          background:   '#fff',
          border:       '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding:      '12px 16px',
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', margin: '0 0 8px' }}>
          Date Range
        </p>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      {/* Tab navigation */}
      <div className="reports-tab-nav" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 0 }}>
        {visibleTabs.map(tab => {
          const active = currentTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:      '9px 18px',
                fontSize:     13,
                fontWeight:   active ? 600 : 500,
                color:        active ? '#0D9488' : '#6b7280',
                background:   'transparent',
                border:       'none',
                borderBottom: active ? '2px solid #0D9488' : '2px solid transparent',
                cursor:       'pointer',
                marginBottom: -1,
                whiteSpace:   'nowrap',
                transition:   'color 0.1s ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <div style={{ flex: 1 }}>
        {currentTab === 'sales'       && (
          <SalesTab       dateRange={dateRange} role={role} userId={userId} />
        )}
        {currentTab === 'financial'   && (
          <FinancialTab   dateRange={dateRange} role={role} />
        )}
        {currentTab === 'inventory'   && (
          <InventoryTab   dateRange={dateRange} role={role} />
        )}
        {currentTab === 'procurement' && (
          <ProcurementTab dateRange={dateRange} role={role} />
        )}
        {currentTab === 'customers'   && (
          <CustomersTab   dateRange={dateRange} role={role} />
        )}
        {currentTab === 'pharmacist'  && (
          <PharmacistTab  dateRange={dateRange} role={role} />
        )}
      </div>
    </div>
  )
}
