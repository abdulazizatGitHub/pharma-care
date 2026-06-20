'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { POSHeaderProvider } from '@/lib/pos-header-context'

interface Props {
  sidebar: React.ReactNode
  userFullName: string
  pharmacyName: string
  children: React.ReactNode
}

export function RoleShell({ sidebar, userFullName, pharmacyName, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <POSHeaderProvider>
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-60 focus:px-4 focus:py-2 focus:bg-[#0F6E56] focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transform lg:static lg:block h-full transition-transform duration-300 ease-in-out print:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebar}
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
        <div className="print:hidden">
          <DashboardHeader
            userFullName={userFullName}
            pharmacyName={pharmacyName}
            onMenuClick={() => setMobileOpen(true)}
          />
        </div>
        <main
          id="main-content"
          className="flex-1 overflow-y-auto min-h-0 w-full"
          style={{ padding: '16px 20px' }}
        >
          {children}
        </main>
      </div>
    </div>
    </POSHeaderProvider>
  )
}
