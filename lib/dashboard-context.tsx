'use client'

import React, { createContext, useContext } from 'react'
import type { UserRole, Permission } from '@/lib/permissions'

export interface DashboardUser {
  id: string
  full_name: string
  role: UserRole
  permissions: Permission[]
}

export const DashboardUserContext = createContext<DashboardUser | null>(null)

export function DashboardUserProvider({
  value,
  children,
}: {
  value: DashboardUser
  children: React.ReactNode
}) {
  return (
    <DashboardUserContext.Provider value={value}>
      {children}
    </DashboardUserContext.Provider>
  )
}

export function useDashboardUser(): DashboardUser {
  const ctx = useContext(DashboardUserContext)
  if (!ctx) throw new Error('useDashboardUser must be used within DashboardUserProvider')
  return ctx
}

export function useDashboardUserSafe(): DashboardUser | null {
  return useContext(DashboardUserContext)
}
