export type UserRole = 'superadmin' | 'admin' | 'pharmacist' | 'pending'

// TODO: Sub-permissions (read/edit/deactivate per module)
// are deferred to a future phase after core features
// are built. Current model: flat permissions per module.
// When implemented, this file will be the single place
// to define the hierarchy.
export const PERMISSIONS = {
  // User & system management
  users_manage:            'users_manage',
  user_manage_pharmacists: 'user_manage_pharmacists',
  settings:                'settings',
  audit_trail:             'audit_trail',

  // Finance & reporting
  reports_full:  'reports_full',
  reports_basic: 'reports_basic',
  expenses:      'expenses',

  // Purchasing & supply
  suppliers:       'suppliers',
  purchase_orders: 'purchase_orders',

  // Inventory
  inventory_view:   'inventory_view',
  inventory_manage: 'inventory_manage',

  // Clinical & POS
  pos:               'pos',
  sales_history_own: 'sales_history_own',
  sales_history_all: 'sales_history_all',
  prescriptions:     'prescriptions',
  controlled_drugs:  'controlled_drugs',

  // Customers & shifts
  customers: 'customers',
  shifts:    'shifts',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

export const SUPERADMIN_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

export const ADMIN_BASE_PERMISSIONS: Permission[] = [
  'suppliers',
  'purchase_orders',
  'inventory_view',
  'inventory_manage',
  'customers',
  'shifts',
  'expenses',
  'reports_full',
]

export const PHARMACIST_BASE_PERMISSIONS: Permission[] = [
  'pos',
  'prescriptions',
  'controlled_drugs',
  'customers',
  'shifts',
  'inventory_view',
  'sales_history_own',
  'reports_basic',
]

/**
 * Resolves the final permission set for a user.
 * SuperAdmin always gets all permissions — overrides are ignored.
 * For admin and pharmacist: start from base set, apply restrict overrides
 * first, then grant overrides.
 */
export function resolvePermissions(
  role: UserRole,
  overrides: { type: 'grant' | 'restrict'; permission: Permission }[],
): Permission[] {
  if (role === 'superadmin') return SUPERADMIN_PERMISSIONS

  const set = new Set<Permission>(
    role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS,
  )

  for (const o of overrides) {
    if (o.type === 'restrict') set.delete(o.permission)
  }
  for (const o of overrides) {
    if (o.type === 'grant') set.add(o.permission)
  }

  return Array.from(set)
}

export function hasPermission(
  resolvedPermissions: Permission[],
  permission: Permission,
): boolean {
  return resolvedPermissions.includes(permission)
}
