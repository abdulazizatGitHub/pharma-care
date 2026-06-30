/**
 * Route Access Tests
 * Tests HTTP-level access control against the running dev server.
 *
 * REQUIRES: dev server running at http://localhost:3000
 *   npm run dev  (or:  npx next dev)
 *
 * Legend:
 *   [PHASE F+]  page not yet fully implemented — returns 200 (stub) for correct role
 *   [OLD PAGE]  old localStorage-based page at app root — authenticated, no middleware role guard
 *
 * Note: proxy.ts guards /superadmin, /admin, /pharmacist prefixes only.
 * All three use prefix-based matching (startsWith), so sub-routes are automatically covered.
 */

import { signIn, buildAuthCookie, authGet, anonGet } from './helpers/clients'
import type { Session } from '@supabase/supabase-js'

// ─── Test accounts ────────────────────────────────────────────────────────────
// Roles post-RBAC V2 migration:
//   superuser@pharmacare.dev  → superadmin
//   procure@pharmacare.dev    → admin (was: procurement)
//   pharma@pharmacare.dev     → pharmacist
const ACCOUNTS = {
  superadmin: { email: 'superuser@pharmacare.dev', password: 'SuperAdmin@123' },
  admin:      { email: 'procure@pharmacare.dev',   password: 'ProcurePass@123' },
  pharmacist: { email: 'pharma@pharmacare.dev',    password: 'PharmaPass@123' },
}

// ─── Shared state ─────────────────────────────────────────────────────────────
type RoleName = keyof typeof ACCOUNTS
let sessions: Record<RoleName, Session>
let cookies: Record<RoleName, string>

beforeAll(async () => {
  const pairs = await Promise.all(
    Object.entries(ACCOUNTS).map(async ([role, creds]) => {
      const session = await signIn(creds.email, creds.password)
      return [role as RoleName, session] as const
    })
  )
  sessions = {} as typeof sessions
  cookies  = {} as typeof cookies
  for (const [role, session] of pairs) {
    sessions[role] = session
    cookies[role]  = buildAuthCookie(session)
  }
}, 60000)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function expectRedirectTo(res: Response, destination: string) {
  expect(res.status).toBe(307)
  expect(res.headers.get('location') ?? '').toContain(destination)
}

// ─── UNAUTHENTICATED ACCESS ───────────────────────────────────────────────────
describe('Unauthenticated access', () => {
  test('GET /login → 200', async () => {
    const res = await anonGet('/login')
    expect(res.status).toBe(200)
  })

  test('GET /unauthorized → 200', async () => {
    const res = await anonGet('/unauthorized')
    expect(res.status).toBe(200)
  })

  test.each(['/superadmin/dashboard', '/admin/dashboard', '/pharmacist/dashboard'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // /expenses and /reports exist as old pages; middleware redirects unauthenticated → /login
  test.each(['/expenses', '/reports'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Bare paths without role prefix: middleware fires (auth check) → /login before 404
  test.each(['/settings', '/audit', '/prescriptions', '/controlled-register', '/suppliers', '/purchase-orders'])(
    'GET %s (bare path) unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )
})

// ─── CORRECT ROLE — AUTHORISED ACCESS ────────────────────────────────────────
describe('Authenticated — correct role gets 200', () => {
  // /superadmin: superadmin only
  test('GET /superadmin/dashboard as superadmin → 200', async () => {
    const res = await authGet('/superadmin/dashboard', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // /admin: admin + superadmin
  test('GET /admin/dashboard as admin → 200', async () => {
    const res = await authGet('/admin/dashboard', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/dashboard as superadmin → 200', async () => {
    const res = await authGet('/admin/dashboard', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // /pharmacist: pharmacist + superadmin
  test('GET /pharmacist/dashboard as pharmacist → 200', async () => {
    const res = await authGet('/pharmacist/dashboard', cookies.pharmacist)
    expect(res.status).toBe(200)
  })

  test('GET /pharmacist/dashboard as superadmin → 200', async () => {
    const res = await authGet('/pharmacist/dashboard', cookies.superadmin)
    expect(res.status).toBe(200)
  })

})

// ─── STRICT ROLE SEPARATION — WRONG ROLE REDIRECTS ───────────────────────────
// proxy.ts enforces prefix-based RBAC. Strict separation: admin CANNOT access /pharmacist/*.
describe('Authenticated — wrong role redirects to /unauthorized', () => {
  // /superadmin: only superadmin; admin and pharmacist blocked
  test('GET /superadmin/dashboard as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/dashboard', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/dashboard as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/dashboard', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  // /admin: pharmacist blocked (admin + superadmin allowed)
  test('GET /admin/dashboard as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/dashboard', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  // /pharmacist: admin blocked — STRICT SEPARATION (admin cannot access pharmacist routes)
  test('GET /pharmacist/dashboard as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/pharmacist/dashboard', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  // Verify stub sub-routes inherit the same separation
  test('GET /pharmacist/pos as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/pharmacist/pos', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/users as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/users', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── /EXPENSES AND /REPORTS — OLD PAGES (NO MIDDLEWARE ROLE GUARD) ────────────
// These pages exist at app/expenses/page.tsx and app/reports/page.tsx.
// New proxy.ts only guards /superadmin, /admin, /pharmacist prefixes.
// These bare paths are authenticated-only (no role restriction at middleware level).
// TODO Phase F: replace with /admin/expenses and /admin/reports tests when old pages deleted.
describe('/expenses and /reports — old localStorage pages (authenticated, no middleware role guard)', () => {
  test.each(['superadmin', 'admin', 'pharmacist'] as RoleName[])(
    'GET /expenses as %s → 200',
    async (role) => {
      const res = await authGet('/expenses', cookies[role])
      expect(res.status).toBe(200)
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'] as RoleName[])(
    'GET /reports as %s → 200',
    async (role) => {
      const res = await authGet('/reports', cookies[role])
      expect(res.status).toBe(200)
    }
  )
})

// ─── PHASE 4 — SUPPLIER & PROCUREMENT ROUTES ─────────────────────────────────
// New routes added in Phase 4C and 4D.
// /admin/suppliers:        admin + superadmin (layout); also guards hasPermission('suppliers')
// /admin/purchase-orders:  admin + superadmin (layout); also guards hasPermission('purchase_orders')
// /superadmin/suppliers:   superadmin only (middleware prefix)
// /superadmin/purchase-orders: superadmin only (middleware prefix)
//
// Dynamic detail routes (/admin/purchase-orders/[id], /superadmin/purchase-orders/[id])
// require a real PO UUID from the DB — tested with a TODO below instead.
describe('Phase 4 — Supplier & Procurement routes', () => {

  // Unauthenticated → 307 → /login (middleware fires before page)
  test.each([
    '/admin/suppliers',
    '/admin/purchase-orders',
    '/superadmin/suppliers',
    '/superadmin/purchase-orders',
  ])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /admin/suppliers as admin → 200', async () => {
    const res = await authGet('/admin/suppliers', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/suppliers as superadmin → 200', async () => {
    const res = await authGet('/admin/suppliers', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/purchase-orders as admin → 200', async () => {
    const res = await authGet('/admin/purchase-orders', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/purchase-orders as superadmin → 200', async () => {
    const res = await authGet('/admin/purchase-orders', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /superadmin/suppliers as superadmin → 200', async () => {
    const res = await authGet('/superadmin/suppliers', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /superadmin/purchase-orders as superadmin → 200', async () => {
    const res = await authGet('/superadmin/purchase-orders', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307 → /unauthorized
  // Pharmacist blocked from all /admin/* by middleware
  test('GET /admin/suppliers as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/suppliers', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/purchase-orders as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/purchase-orders', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  // Admin + pharmacist both blocked from /superadmin/* by middleware
  test('GET /superadmin/suppliers as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/suppliers', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/purchase-orders as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/purchase-orders', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/suppliers as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/suppliers', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/purchase-orders as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/purchase-orders', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  // TODO: dynamic detail routes require a real PO UUID from the DB.
  // Add these when a seeded PO is available in the test environment:
  //   GET /admin/purchase-orders/[id]       as admin      → 200
  //   GET /superadmin/purchase-orders/[id]  as superadmin → 200
  //   GET /admin/purchase-orders/[id]       as pharmacist → 307
})

// ─── PHASE 5 — POS & SETTINGS ROUTES ────────────────────────────────────────
// /pharmacist/pos:     pharmacist + superadmin (strict separation — admin blocked)
// /superadmin/settings: superadmin only
describe('Phase 5 — POS & Settings routes', () => {

  // Unauthenticated → 307 → /login
  test('GET /pharmacist/pos unauthenticated → 307 → /login', async () => {
    const res = await anonGet('/pharmacist/pos')
    expectRedirectTo(res, '/login')
  })

  test('GET /superadmin/settings unauthenticated → 307 → /login', async () => {
    const res = await anonGet('/superadmin/settings')
    expectRedirectTo(res, '/login')
  })

  // Correct role → 200
  test('GET /pharmacist/pos as pharmacist → 200', async () => {
    const res = await authGet('/pharmacist/pos', cookies.pharmacist)
    expect(res.status).toBe(200)
  })

  test('GET /pharmacist/pos as superadmin → 200', async () => {
    const res = await authGet('/pharmacist/pos', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /superadmin/settings as superadmin → 200', async () => {
    const res = await authGet('/superadmin/settings', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307 → /unauthorized
  test('GET /pharmacist/pos as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/pharmacist/pos', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/settings as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/settings', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/settings as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/settings', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── BARE PATHS — NO PAGE EXISTS (STILL 404) ─────────────────────────────────
// These paths have no page.tsx. Middleware passes authenticated users through;
// Next.js returns 404. After Phase F these will be superseded by role-prefixed routes.
describe('Bare paths without role prefix — authenticated gets 404 (no page)', () => {
  const barePaths = ['/settings', '/audit', '/prescriptions', '/controlled-register', '/suppliers', '/purchase-orders']

  test.each(barePaths)(
    'GET %s as superadmin → 404 (no page at bare path)',
    async (path) => {
      const res = await authGet(path, cookies.superadmin)
      expect(res.status).toBe(404)
    }
  )
})

// ─── PHASE E STUB PAGES — ROLE-PREFIXED ROUTES NOW RETURN 200 ────────────────
describe('Phase E stubs — correct role gets 200 for all new role-prefixed routes', () => {
  const superadminRoutes = [
    '/superadmin/dashboard',
    '/superadmin/users',
    '/superadmin/settings',
    '/superadmin/reports',
    '/superadmin/audit',
    '/superadmin/suppliers',        // Phase 4C
    '/superadmin/purchase-orders',  // Phase 4D
    '/superadmin/opening-balances',       // Phase 13C
    '/superadmin/ledger/balance-sheet',   // Phase 14B
    '/superadmin/ledger/trial-balance',   // Phase 14B
  ]

  const adminRoutes = [
    '/admin/dashboard',
    '/admin/suppliers',
    '/admin/purchase-orders',
    '/admin/inventory',
    '/admin/customers',
    '/admin/shifts',
    '/admin/reports',
    '/admin/expenses',
    // NOTE: /admin/staff is NOT included here — it guards `user_manage_pharmacists`,
    // which is not in admin base permissions. The procure@pharmacare.dev test account
    // does not have this grant, so it correctly returns 307.
    // Tested separately below.
  ]

  const pharmacistRoutes = [
    '/pharmacist/dashboard',
    '/pharmacist/pos',
    '/pharmacist/prescriptions',
    '/pharmacist/controlled-register',
    '/pharmacist/customers',
    '/pharmacist/shifts',
    '/pharmacist/inventory',
  ]

  test.each(superadminRoutes)(
    'GET %s as superadmin → 200',
    async (path) => {
      const res = await authGet(path, cookies.superadmin)
      expect(res.status).toBe(200)
    }
  )

  test.each(adminRoutes)(
    'GET %s as admin → 200',
    async (path) => {
      const res = await authGet(path, cookies.admin)
      expect(res.status).toBe(200)
    }
  )

  test.each(adminRoutes)(
    'GET %s as superadmin → 200 (superadmin can access all admin routes)',
    async (path) => {
      const res = await authGet(path, cookies.superadmin)
      expect(res.status).toBe(200)
    }
  )

  test.each(pharmacistRoutes)(
    'GET %s as pharmacist → 200',
    async (path) => {
      const res = await authGet(path, cookies.pharmacist)
      expect(res.status).toBe(200)
    }
  )

  test.each(pharmacistRoutes)(
    'GET %s as superadmin → 200 (superadmin can access all pharmacist routes)',
    async (path) => {
      const res = await authGet(path, cookies.superadmin)
      expect(res.status).toBe(200)
    }
  )

  // /admin/staff requires user_manage_pharmacists — not in admin base permissions.
  // Plain admin (without that grant) correctly gets 307; superadmin always gets 200.
  test('GET /admin/staff as admin (no user_manage_pharmacists) → 307', async () => {
    const res = await authGet('/admin/staff', cookies.admin)
    expect(res.status).toBe(307)
  })

  test('GET /admin/staff as superadmin → 200', async () => {
    const res = await authGet('/admin/staff', cookies.superadmin)
    expect(res.status).toBe(200)
  })
})

// ─── PHASE 7 — LEDGER ROUTES ──────────────────────────────────────────────────
// /superadmin/ledger/*: superadmin only
// /admin/ledger:        admin + superadmin (read-only)
// Pharmacist has no ledger access at any route.
describe('Phase 7 — Ledger routes', () => {

  // Unauthenticated → 307 → /login
  test.each([
    '/superadmin/ledger',
    '/superadmin/ledger/journal',
    '/admin/ledger',
  ])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /superadmin/ledger as superadmin → 200', async () => {
    const res = await authGet('/superadmin/ledger', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /superadmin/ledger/journal as superadmin → 200', async () => {
    const res = await authGet('/superadmin/ledger/journal', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/ledger as admin → 200', async () => {
    const res = await authGet('/admin/ledger', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/ledger as superadmin → 200', async () => {
    const res = await authGet('/admin/ledger', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307 → /unauthorized
  test('GET /superadmin/ledger as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/ledger', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/ledger as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/ledger', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/ledger as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/ledger', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── PHASE 8 — EXPENSES ROUTES ────────────────────────────────────────────────
// /superadmin/expenses: superadmin only (middleware prefix)
// /admin/expenses:      admin + superadmin, guards hasPermission('expenses')
//
// Note: the procure@pharmacare.dev test account has 'expenses' in base admin
// permissions — confirmed in permissions.ts. If this account lacks the grant
// the test for admin→200 would return 307; update the comment if that occurs.
describe('Phase 8 — Expenses routes', () => {

  // Unauthenticated → 307 → /login
  test.each(['/superadmin/expenses', '/admin/expenses'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /superadmin/expenses as superadmin → 200', async () => {
    const res = await authGet('/superadmin/expenses', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/expenses as admin → 200', async () => {
    const res = await authGet('/admin/expenses', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/expenses as superadmin → 200', async () => {
    const res = await authGet('/admin/expenses', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307
  test('GET /superadmin/expenses as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/expenses', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/expenses as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/expenses', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/expenses as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/expenses', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── PHASE 9 — REPORTS ROUTES ────────────────────────────────────────────────
// /superadmin/reports: superadmin only (middleware prefix)
// /admin/reports:      admin + superadmin, guards hasPermission('reports_full')
// /pharmacist/reports: pharmacist + superadmin, guards hasPermission('reports_basic')
describe('Phase 9 — Reports routes', () => {

  // Unauthenticated → 307 → /login
  test.each(['/superadmin/reports', '/admin/reports', '/pharmacist/reports'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /superadmin/reports as superadmin → 200', async () => {
    const res = await authGet('/superadmin/reports', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/reports as admin → 200', async () => {
    const res = await authGet('/admin/reports', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/reports as superadmin → 200', async () => {
    const res = await authGet('/admin/reports', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /pharmacist/reports as pharmacist → 200', async () => {
    const res = await authGet('/pharmacist/reports', cookies.pharmacist)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307
  test('GET /superadmin/reports as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/reports', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/reports as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/reports', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /pharmacist/reports as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/pharmacist/reports', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── PHASE 9B — ITEM DETAIL REPORT ROUTES ────────────────────────────────────
// /superadmin/reports/item-detail: superadmin only (middleware prefix)
// /admin/reports/item-detail:      admin + superadmin, guards reports_full permission
// Pharmacist has no access to either.
describe('Phase 9B — Item Detail Report routes', () => {

  // Unauthenticated → 307 → /login
  test.each(['/superadmin/reports/item-detail', '/admin/reports/item-detail'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /superadmin/reports/item-detail as superadmin → 200', async () => {
    const res = await authGet('/superadmin/reports/item-detail', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/reports/item-detail as admin → 200', async () => {
    const res = await authGet('/admin/reports/item-detail', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/reports/item-detail as superadmin → 200', async () => {
    const res = await authGet('/admin/reports/item-detail', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307 → /unauthorized
  test('GET /superadmin/reports/item-detail as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/reports/item-detail', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /superadmin/reports/item-detail as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/reports/item-detail', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/reports/item-detail as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/reports/item-detail', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })
})

// ─── PHASE 11 — SHIFT ROUTES ──────────────────────────────────────────────────
// /pharmacist/shifts: pharmacist + superadmin (not admin)
// /admin/shifts:      admin + superadmin (not pharmacist)
// /superadmin/shifts: superadmin only
describe('Phase 11 — Shift routes', () => {

  // Unauthenticated → 307 → /login
  test.each(['/superadmin/shifts', '/admin/shifts', '/pharmacist/shifts'])(
    'GET %s unauthenticated → 307 → /login',
    async (path) => {
      const res = await anonGet(path)
      expectRedirectTo(res, '/login')
    }
  )

  // Correct role → 200
  test('GET /pharmacist/shifts as pharmacist → 200', async () => {
    const res = await authGet('/pharmacist/shifts', cookies.pharmacist)
    expect(res.status).toBe(200)
  })

  test('GET /admin/shifts as admin → 200', async () => {
    const res = await authGet('/admin/shifts', cookies.admin)
    expect(res.status).toBe(200)
  })

  test('GET /admin/shifts as superadmin → 200', async () => {
    const res = await authGet('/admin/shifts', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  test('GET /superadmin/shifts as superadmin → 200', async () => {
    const res = await authGet('/superadmin/shifts', cookies.superadmin)
    expect(res.status).toBe(200)
  })

  // Wrong role → 307
  test('GET /superadmin/shifts as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/superadmin/shifts', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /admin/shifts as pharmacist → 307 → /unauthorized', async () => {
    const res = await authGet('/admin/shifts', cookies.pharmacist)
    expectRedirectTo(res, '/unauthorized')
  })

  test('GET /pharmacist/shifts as admin → 307 → /unauthorized', async () => {
    const res = await authGet('/pharmacist/shifts', cookies.admin)
    expectRedirectTo(res, '/unauthorized')
  })
})
