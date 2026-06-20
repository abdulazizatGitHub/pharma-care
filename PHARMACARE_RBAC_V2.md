# PHARMACARE — RBAC V2 ARCHITECTURE SPECIFICATION
> **Version:** 2.0  
> **Routing:** Full role-prefixed URLs  
> **Hierarchy:** SuperAdmin → Admin → Pharmacist  
> **Permission model:** Base role sets + SuperAdmin overrides  
> **Multi-tenant:** Single pharmacy now, URL structure ready for future extension

---

## 0. AGENT OPERATING INSTRUCTIONS

Read this entire document before writing a single line of code.

This document replaces PHARMACARE_RBAC_REBUILD.md entirely.

**What changes:**
- Route structure: feature-based → role-prefixed (`/admin/suppliers`, `/pharmacist/pos`)
- Each role has its own layout, sidebar, and route group
- Permission model: base sets per role + override table for extras/restrictions
- User management: rebuilt for 3-tier hierarchy with override UI
- `proxy.ts`: updated route guard map for role-prefixed routes
- Old dashboard routes (`/dashboard/owner` etc.) deleted entirely

**What does NOT change:**
- Supabase Auth (email+password, session cookies)
- All UI components (StatCard, Badge, Button, etc.)
- All 16 database tables (structure)
- `.eq('is_deleted', false)` query requirement (migration 005)
- `proxy.ts` filename (Turbopack compiles it correctly)
- Test infrastructure

Execute in phases defined in Section 8. Show migration SQL before running.
Run `npx tsc --noEmit` after each phase. Do not proceed on TypeScript errors.

---

## 1. THREE-TIER HIERARCHY

```
SuperAdmin (1 per pharmacy)
│  role = 'superadmin'
│  Owns the business. Full visibility. 
│  NOT a cashier — does not use POS day-to-day.
│  Manages users, settings, financial oversight.
│  Can grant extra permissions or restrict base permissions
│  for any admin or pharmacist.
│
├── Admin (1 to N per pharmacy)
│   role = 'admin'
│   Manages pharmacy operations.
│   Suppliers, purchasing, inventory, staff scheduling.
│   Does NOT sit at the counter.
│   Each admin has a base permission set.
│   SuperAdmin can grant extras or restrict from base per admin.
│
└── Pharmacist (1 to N per pharmacy)
    role = 'pharmacist'
    Counter staff. Serves customers.
    POS, prescriptions, customer records, own shift.
    Does NOT manage suppliers or see full financial reports.
    Each pharmacist has a base permission set.
    SuperAdmin can grant extras or restrict per pharmacist.
```

---

## 2. BASE PERMISSION SETS

These are the DEFAULT permissions each role has.
SuperAdmin can modify these per-user via the override system.

### SuperAdmin — All permissions always
```
dashboard_full, users_manage, settings, audit_trail,
reports_full, expenses, suppliers, purchase_orders,
inventory_view, inventory_manage, customers,
prescriptions, controlled_drugs, shifts, pos,
sales_history_all
```
SuperAdmin permissions are hardcoded — no DB lookup.

### Admin — Base set (every new admin starts with these)
```
dashboard_ops, suppliers, purchase_orders,
inventory_view, inventory_manage, customers, shifts
```

### Admin — Optional (SuperAdmin can grant)
```
reports_full, expenses, user_manage_pharmacists,
sales_history_all, controlled_drugs
```

### Admin — Restrictable (SuperAdmin can remove from base)
```
inventory_manage, purchase_orders, suppliers, customers
```

### Pharmacist — Base set (every new pharmacist starts with these)
```
dashboard_shift, pos, prescriptions, controlled_drugs,
customers, shifts, inventory_view, sales_history_own
```

### Pharmacist — Optional (SuperAdmin can grant)
```
sales_history_all, inventory_manage, reports_basic
```

### Pharmacist — Restrictable (SuperAdmin can remove)
```
controlled_drugs, customers
```

---

## 3. PERMISSION DEFINITIONS

```typescript
// lib/permissions.ts

export const PERMISSIONS = {
  // Dashboards
  dashboard_full:        'dashboard_full',       // superadmin full dashboard
  dashboard_ops:         'dashboard_ops',         // admin operations dashboard
  dashboard_shift:       'dashboard_shift',       // pharmacist shift dashboard

  // User & system management
  users_manage:          'users_manage',          // create/deactivate/edit users
  user_manage_pharmacists: 'user_manage_pharmacists', // admin creates pharmacists only
  settings:              'settings',              // system settings
  audit_trail:           'audit_trail',           // view audit log

  // Finance & reporting
  reports_full:          'reports_full',          // full financial reports
  reports_basic:         'reports_basic',         // basic sales summary only
  expenses:              'expenses',              // expenses management

  // Purchasing & supply
  suppliers:             'suppliers',             // supplier master management
  purchase_orders:       'purchase_orders',       // create and manage POs

  // Inventory
  inventory_view:        'inventory_view',        // view stock levels
  inventory_manage:      'inventory_manage',      // add/edit medicines, stock adjust

  // Clinical & POS
  pos:                   'pos',                   // POS screen, create sales
  sales_history_own:     'sales_history_own',     // view own sales only
  sales_history_all:     'sales_history_all',     // view all sales
  prescriptions:         'prescriptions',         // prescriptions management
  controlled_drugs:      'controlled_drugs',      // controlled drug register

  // Customers & shifts
  customers:             'customers',             // customer records and credit
  shifts:                'shifts',                // shift open/close and reports
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

// Base sets per role (hardcoded — not from DB)
export const SUPERADMIN_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

export const ADMIN_BASE_PERMISSIONS: Permission[] = [
  'dashboard_ops', 'suppliers', 'purchase_orders',
  'inventory_view', 'inventory_manage', 'customers', 'shifts',
]

export const PHARMACIST_BASE_PERMISSIONS: Permission[] = [
  'dashboard_shift', 'pos', 'prescriptions', 'controlled_drugs',
  'customers', 'shifts', 'inventory_view', 'sales_history_own',
]
```

---

## 4. DATABASE SCHEMA CHANGES

### 4.1 Migration: `006_rbac_v2.sql`

```sql
-- ============================================
-- STEP 1: Update role values
-- ============================================
UPDATE profiles SET role = 'superadmin' WHERE role IN ('superuser', 'owner');
UPDATE profiles SET role = 'admin'      WHERE role = 'procurement';
UPDATE profiles SET role = 'pharmacist' WHERE role IN ('pharmacist', 'cashier');
-- pending stays as pending

-- Update CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'admin', 'pharmacist', 'pending'));

-- ============================================
-- STEP 2: Create user_permissions table
-- Stores OVERRIDES only (grants above base OR restrictions below base)
-- ============================================
CREATE TABLE IF NOT EXISTS user_permissions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('grant', 'restrict')),
  granted_by   UUID NOT NULL REFERENCES profiles(id),
  granted_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, permission)
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);

-- RLS on user_permissions
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select" ON user_permissions FOR SELECT
  USING (
    get_user_role() = 'superadmin'
    OR user_id = auth.uid()
  );

CREATE POLICY "permissions_insert" ON user_permissions FOR INSERT
  WITH CHECK (get_user_role() = 'superadmin');

CREATE POLICY "permissions_delete" ON user_permissions FOR DELETE
  USING (get_user_role() = 'superadmin');

-- No UPDATE on permissions — delete and re-insert

-- ============================================
-- STEP 3: Update RLS policies (new role names)
-- ============================================

-- Pattern: drop old, recreate with new role names
-- Apply to: medicines, suppliers, doctors, customers, stock_batches,
-- purchase_orders, purchase_order_items, goods_receipts, grn_items,
-- shifts, sales, sale_items, prescriptions, expenses

-- Example for medicines (repeat pattern for all tables):
DROP POLICY IF EXISTS "medicines_select" ON medicines;
DROP POLICY IF EXISTS "medicines_insert" ON medicines;
DROP POLICY IF EXISTS "medicines_update" ON medicines;

CREATE POLICY "medicines_select" ON medicines FOR SELECT
  USING (
    get_user_role() IN ('superadmin', 'admin', 'pharmacist')
    AND is_deleted = FALSE
  );

CREATE POLICY "medicines_insert" ON medicines FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

CREATE POLICY "medicines_update" ON medicines FOR UPDATE
  USING (get_user_role() IN ('superadmin', 'admin', 'pharmacist'))
  WITH CHECK (get_user_role() IN ('superadmin', 'admin', 'pharmacist'));

-- Repeat for all other tables with appropriate role lists.
-- admin + pharmacist for operational tables (inventory, sales, customers etc)
-- admin + superadmin only for: suppliers, purchase_orders, expenses
-- superadmin only: settings, user_permissions (DELETE)
-- audit_logs: INSERT for all 3; SELECT for superadmin+admin; no UPDATE/DELETE
-- controlled_drug_register: INSERT/SELECT for all 3; no UPDATE/DELETE
-- profiles: self SELECT; superadmin+admin SELECT all; INSERT by superadmin only

-- ============================================
-- STEP 4: Update get_user_role() — no change needed
-- Function already reads from profiles.role
-- Just verify it returns correct values after role update
-- ============================================
```

### 4.2 Update `lib/db-types.ts`

```typescript
export type UserRole = 'superadmin' | 'admin' | 'pharmacist' | 'pending'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  phone: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface UserPermissionOverride {
  id: string
  user_id: string
  permission: Permission
  type: 'grant' | 'restrict'
  granted_by: string
  granted_at: string
}
```

---

## 5. PERMISSION RESOLUTION LOGIC

```typescript
// lib/permissions.ts

/**
 * Resolve the final permission set for a user.
 * 
 * Algorithm:
 * 1. Start with base set for the role
 * 2. Apply 'restrict' overrides (remove from base)
 * 3. Apply 'grant' overrides (add to base)
 * 
 * Result: the exact set of permissions this user has right now.
 */
export function resolvePermissions(
  role: UserRole,
  overrides: UserPermissionOverride[]
): Permission[] {
  // SuperAdmin always gets everything — no overrides apply
  if (role === 'superadmin') return SUPERADMIN_PERMISSIONS

  // Start with base set
  let permissions: Set<Permission> =
    role === 'admin'
      ? new Set(ADMIN_BASE_PERMISSIONS)
      : new Set(PHARMACIST_BASE_PERMISSIONS)

  // Apply restrictions first
  overrides
    .filter(o => o.type === 'restrict')
    .forEach(o => permissions.delete(o.permission))

  // Then apply grants
  overrides
    .filter(o => o.type === 'grant')
    .forEach(o => permissions.add(o.permission))

  return Array.from(permissions)
}

/**
 * Check if a user has a specific permission.
 * Pass the already-resolved permissions array.
 */
export function hasPermission(
  resolvedPermissions: Permission[],
  permission: Permission
): boolean {
  return resolvedPermissions.includes(permission)
}
```

---

## 6. ROUTE STRUCTURE

### 6.1 Next.js file structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── unauthorized/page.tsx
├── superadmin/
│   ├── layout.tsx          ← superadmin layout + sidebar
│   ├── dashboard/page.tsx
│   ├── users/page.tsx
│   ├── settings/page.tsx
│   ├── reports/page.tsx
│   └── audit/page.tsx
├── admin/
│   ├── layout.tsx          ← admin layout + sidebar (permission-aware)
│   ├── dashboard/page.tsx
│   ├── suppliers/page.tsx
│   ├── purchase-orders/page.tsx
│   ├── inventory/page.tsx
│   ├── reports/page.tsx    ← only rendered if permitted
│   ├── expenses/page.tsx   ← only rendered if permitted
│   └── customers/page.tsx
└── pharmacist/
    ├── layout.tsx          ← pharmacist layout + sidebar (permission-aware)
    ├── dashboard/page.tsx
    ├── pos/page.tsx
    ├── prescriptions/page.tsx
    ├── controlled-register/page.tsx
    ├── customers/page.tsx
    └── shifts/page.tsx
```

### 6.2 After login redirects

```typescript
const ROLE_HOME: Record<UserRole, string> = {
  superadmin:  '/superadmin/dashboard',
  admin:       '/admin/dashboard',
  pharmacist:  '/pharmacist/dashboard',
  pending:     '/unauthorized?message=Account pending activation',
}
```

### 6.3 Route guards in `proxy.ts`

```typescript
const ROUTE_ROLES: Record<string, string[]> = {
  // SuperAdmin routes
  '/superadmin':          ['superadmin'],

  // Admin routes
  '/admin':               ['admin', 'superadmin'],

  // Pharmacist routes  
  '/pharmacist':          ['pharmacist', 'superadmin', 'admin'],
  // Note: admin can view pharmacist routes for oversight.
  // Page-level permission checks handle what they see/do.
  // If you want strict separation: '/pharmacist': ['pharmacist', 'superadmin']
}

// In middleware: check if pathname STARTS WITH the route prefix
// e.g. /admin/suppliers startsWith /admin → allowed roles: admin, superadmin
```

**Important:** The middleware checks the **prefix** (`/admin`, `/superadmin`, `/pharmacist`), not the full path. This means adding new pages under `/admin/` requires no middleware changes.

### 6.4 Sidebar — one per role

Each role gets its own sidebar component. No shared sidebar trying to handle all three.

**SuperAdmin sidebar** (`components/superadmin/SuperadminSidebar.tsx`):
```
Dashboard, Users, Settings, Reports, Audit Trail
```
All items always visible — no permission filtering needed.

**Admin sidebar** (`components/admin/AdminSidebar.tsx`):
Items filtered by resolved permissions:
```
Dashboard               → always visible
Suppliers               → if has 'suppliers'
Purchase Orders         → if has 'purchase_orders'
Inventory               → if has 'inventory_view'
Customers               → if has 'customers'
Shifts                  → if has 'shifts'
Reports                 → if has 'reports_full'
Expenses                → if has 'expenses'
Staff (Pharmacists)     → if has 'user_manage_pharmacists'
```

**Pharmacist sidebar** (`components/pharmacist/PharmacistSidebar.tsx`):
Items filtered by resolved permissions:
```
Dashboard               → always visible
POS                     → if has 'pos'
Prescriptions           → if has 'prescriptions'
Controlled Drugs        → if has 'controlled_drugs'
Customers               → if has 'customers'
Shifts                  → if has 'shifts'
Inventory               → if has 'inventory_view'
```

---

## 7. USER MANAGEMENT

### 7.1 Who manages whom

| Actor | Can create | Can deactivate | Can edit permissions |
|---|---|---|---|
| SuperAdmin | Admins, Pharmacists | Anyone | Anyone |
| Admin (with `user_manage_pharmacists`) | Pharmacists only | Pharmacists only | Nobody |
| Pharmacist | Nobody | Nobody | Nobody |

### 7.2 SuperAdmin `/superadmin/users` page

**Tabs: Admins | Pharmacists**

**Admins tab:**
- Table: name, email, status, permission count, actions
- "Add Admin" → modal:
  - Full name, email, password
  - Permission grants (checkboxes for optional permissions)
  - Permission restrictions (checkboxes for restrictable base permissions)
  - Two sections clearly labeled: "Additional Access" and "Restricted Access"
- "Edit Permissions" per row → same modal pre-populated
- "Deactivate" per row → confirm dialog

**Pharmacists tab:**
- Table: name, email, status, override count, actions
- "Add Pharmacist" → modal:
  - Full name, email, password
  - Optional: grant extras (sales_history_all, inventory_manage, reports_basic)
  - Optional: restrict base (controlled_drugs, customers)
- "Deactivate" per row

### 7.3 Admin `/admin/staff` page (if has `user_manage_pharmacists`)

- Simple list of pharmacists only
- "Add Pharmacist" → name, email, password only (no permission editing)
- "Deactivate" per row (pharmacists only — cannot touch admins)

### 7.4 Server actions (`app/actions/users.ts`)

```typescript
// createAdmin(data: CreateAdminInput) — superadmin only
// Input: full_name, email, password, grants: Permission[], restrictions: Permission[]
// 1. Verify caller is superadmin
// 2. adminClient.auth.admin.createUser(...)
// 3. UPDATE profiles SET role='admin', full_name=...
// 4. INSERT user_permissions (type='grant') for each grant
// 5. INSERT user_permissions (type='restrict') for each restriction
// 6. Audit log: CREATE_ADMIN

// updateUserPermissions(userId, grants, restrictions) — superadmin only
// 1. Verify caller is superadmin
// 2. DELETE FROM user_permissions WHERE user_id = userId
// 3. INSERT new grants and restrictions
// 4. Audit log: PERMISSIONS_UPDATED

// createPharmacist(data) — superadmin OR admin with user_manage_pharmacists
// 1. Verify caller role
// 2. If admin: verify they have user_manage_pharmacists permission
// 3. adminClient.auth.admin.createUser(...)
// 4. UPDATE profiles SET role='pharmacist', full_name=...
// 5. If superadmin and overrides provided: INSERT user_permissions
// 6. Audit log: CREATE_PHARMACIST

// deactivateUser(userId) — superadmin OR admin with user_manage_pharmacists
// 1. Verify caller role and permission
// 2. Fetch target profile — block if target is superadmin (ever)
// 3. If caller is admin: block if target is not pharmacist
// 4. UPDATE profiles SET is_active=false
// 5. Audit log: DEACTIVATE_USER
```

---

## 8. LAYOUT & CONTEXT

### 8.1 Three separate layouts

Each role group has its own layout that:
1. Verifies the session and role
2. Fetches permission overrides from `user_permissions`
3. Resolves final permission set using `resolvePermissions()`
4. Provides `DashboardUserContext` with resolved permissions
5. Renders the role-specific shell (sidebar + header + content)

```typescript
// app/superadmin/layout.tsx
// Guards: role must be 'superadmin'
// Permissions: SUPERADMIN_PERMISSIONS (no DB fetch)
// Renders: SuperadminShell

// app/admin/layout.tsx
// Guards: role must be 'admin' (superadmin redirected to /superadmin)
// Permissions: fetch overrides from user_permissions, resolve
// Renders: AdminShell

// app/pharmacist/layout.tsx
// Guards: role must be 'pharmacist' (others redirected)
// Permissions: fetch overrides from user_permissions, resolve
// Renders: PharmacistShell
```

### 8.2 Updated DashboardUserContext

```typescript
// lib/dashboard-context.tsx
export interface DashboardUser {
  id: string
  full_name: string
  role: UserRole
  permissions: Permission[]  // fully resolved — ready to use
}

// Usage in any client component:
const { permissions } = useDashboardUser()
const canViewReports = hasPermission(permissions, 'reports_full')
```

---

## 9. EXECUTION PLAN

Execute in order. Show migration SQL before running `supabase db push`.
Run `npx tsc --noEmit` after each phase.

### Phase A — Database migration
1. Write `supabase/migrations/006_rbac_v2.sql` per Section 4.1
2. Show full SQL — wait for approval before running
3. `npx supabase db push`
4. Verify: profiles show 3 role values, user_permissions table exists
5. Verify: `get_user_role()` still returns correct values

### Phase B — Core types and permissions
1. Update `lib/db-types.ts` (new UserRole type)
2. Create `lib/permissions.ts` (all constants + resolvePermissions + hasPermission)
3. Update `lib/dashboard-context.tsx` (add permissions to context)
4. `npx tsc --noEmit`

### Phase C — Update proxy.ts routing
1. Update route guard map: prefix-based checks for `/superadmin`, `/admin`, `/pharmacist`
2. Remove old `/dashboard/owner`, `/dashboard/pharmacist` etc. entries
3. Update login redirect: all roles → ROLE_HOME map
4. `npx tsc --noEmit`

### Phase D — Three layouts + shells
1. Create `app/superadmin/layout.tsx` + `SuperadminShell` component
2. Create `app/admin/layout.tsx` + `AdminShell` component  
3. Create `app/pharmacist/layout.tsx` + `PharmacistShell` component
4. Create three sidebar components (SuperadminSidebar, AdminSidebar, PharmacistSidebar)
5. Update `app/page.tsx` root redirect to use ROLE_HOME map
6. `npx tsc --noEmit`

### Phase E — Dashboard pages
1. Create `app/superadmin/dashboard/page.tsx`
2. Create `app/admin/dashboard/page.tsx` (permission-aware widgets)
3. Create `app/pharmacist/dashboard/page.tsx` (shift-focused widgets)
4. Delete old route files:
   - `app/(dashboard)/dashboard/owner/page.tsx`
   - `app/(dashboard)/dashboard/pharmacist/page.tsx`
   - `app/(dashboard)/dashboard/cashier/page.tsx`
   - `app/(dashboard)/dashboard/procurement/page.tsx`
5. `npx tsc --noEmit`

### Phase F — User management
1. Update `app/actions/users.ts` per Section 7.4
2. Build `app/superadmin/users/page.tsx` + UserManagement components
3. Build `app/admin/staff/page.tsx` (pharmacist management only)
4. `npx tsc --noEmit`

### Phase G — Stub pages for future phases
Create stub pages (simple "Coming in Phase X" placeholder) for:
- `/superadmin/reports`, `/superadmin/audit`, `/superadmin/settings`
- `/admin/suppliers`, `/admin/purchase-orders`, `/admin/inventory`
- `/admin/reports`, `/admin/expenses`, `/admin/customers`
- `/pharmacist/pos`, `/pharmacist/prescriptions`
- `/pharmacist/controlled-register`, `/pharmacist/customers`, `/pharmacist/shifts`

These stubs eliminate ALL 404 errors. Every valid route returns 200.
They will be replaced with real functionality in Phases 2–7.

### Phase H — Verification
1. `npx next build` — must be clean
2. Update all 3 test files for new routes and role names
3. Run full test suite
4. Manual browser checklist

---

## 10. WHAT HAPPENS TO OLD FILES

| File | Action |
|---|---|
| `app/(dashboard)/layout.tsx` | Delete after new layouts are confirmed working |
| `app/(dashboard)/dashboard/*/page.tsx` | Delete (4 files) |
| `app/(dashboard)/users/page.tsx` | Move to `app/superadmin/users/page.tsx` |
| `components/dashboard/DashboardSidebar.tsx` | Keep as base, extend for 3 role sidebars |
| `components/dashboard/DashboardHeader.tsx` | Keep, reuse across all 3 shells |
| `components/dashboard/DashboardShell.tsx` | Keep as base, extend for 3 role shells |
| `components/dashboard/RolePreviewSwitcher.tsx` | Delete (no longer needed) |
| `components/dashboard/UserManagement.tsx` | Rebuild for new 3-tier UI |
| `proxy.ts` | Update route map only |

---

## 11. CRITICAL RULES FOR ALL FUTURE PHASES

1. **Every query adds `.eq('is_deleted', false)`** — RLS no longer filters this
2. **Permission checks use `hasPermission(permissions, 'x')`** — never check role directly for features
3. **Role checks for structural access** (which layout, which shell) — use role
4. **Permission checks for feature access** (show/hide nav items, page content) — use permissions
5. **Never hard-delete any record** — soft-delete only
6. **Every write inserts into audit_logs**
7. **No localStorage for any business data**

---

*End of PHARMACARE_RBAC_V2.md*