# PharmaCare — Browser Testing Checklist
Phase 1 + Visual Redesign — Manual verification items not covered by automated tests.

> Automated test results are in the Jest test files. This checklist covers UX flows, visual
> correctness, and app-layer guards that require a real browser session.

---

## AUTH FLOWS

- [ ] Navigating to `/` while logged out redirects to `/login`
- [ ] Login page renders correctly (logo, form, labels)
- [ ] Submitting the login form with valid credentials redirects to the correct dashboard
  - owner → `/dashboard/owner`
  - pharmacist → `/dashboard/pharmacist`
  - cashier → `/dashboard/cashier`
  - procurement → `/dashboard/procurement`
- [ ] Submitting with invalid credentials shows an error message (not a crash)
- [ ] Submitting with empty fields shows validation errors
- [ ] After logout, navigating back to a dashboard URL redirects to `/login` (session cleared)
- [ ] Pending-role user (`role = 'pending'`) lands on `/unauthorized` with activation message

---

## ROLE ROUTING

- [ ] owner can access `/dashboard/owner` (200)
- [ ] superuser can access `/dashboard/owner` (200)
- [ ] pharmacist navigating to `/dashboard/owner` is redirected (should be `/unauthorized` — currently returns 200; see **KNOWN GAPS**)
- [ ] cashier navigating to `/dashboard/owner` is redirected (same known gap)
- [ ] procurement navigating to `/dashboard/owner` is redirected (same known gap)
- [ ] pharmacist can access `/dashboard/pharmacist` (200)
- [ ] cashier can access `/dashboard/cashier` (200)
- [ ] procurement can access `/dashboard/procurement` (200)
- [ ] Any role can access `/unauthorized` (200)

### KNOWN GAPS (proxy.ts not wired — fix: rename to middleware.ts, export as `middleware`)
- [ ] After middleware fix: pharmacist → `/dashboard/owner` → `/unauthorized`
- [ ] After middleware fix: owner → `/dashboard/pharmacist` → `/unauthorized`
- [ ] After middleware fix: cashier → `/dashboard/cashier` → 200, cashier → `/dashboard/owner` → `/unauthorized`

---

## SIDEBAR BEHAVIOUR

- [ ] Sidebar renders correctly on initial load (not collapsed, not broken)
- [ ] Clicking the collapse toggle collapses the sidebar to icon-only view
- [ ] Hovering over the collapsed sidebar expands it temporarily
- [ ] Moving mouse away from hover-expanded sidebar collapses it back
- [ ] Active route is highlighted in the sidebar
- [ ] Pharmacy name appears in the sidebar header
- [ ] User full name and role badge appear correctly at the sidebar bottom

---

## ROLE-FILTERED NAVIGATION

The sidebar must show only the navigation items relevant to each role.

### Superuser
- [ ] Sees: Owner Dashboard link, all management links, User Management

### Owner
- [ ] Sees: Owner Dashboard, Expenses, Reports, User Management, Settings, Audit Log
- [ ] Does NOT see: Pharmacist Dashboard, Cashier Dashboard, Procurement Dashboard

### Pharmacist
- [ ] Sees: Pharmacist Dashboard, Prescriptions, Controlled Register
- [ ] Does NOT see: Owner Dashboard, User Management, Expenses

### Cashier
- [ ] Sees: Cashier Dashboard
- [ ] Does NOT see: Owner Dashboard, User Management, Reports

### Procurement
- [ ] Sees: Procurement Dashboard, Suppliers, Purchase Orders
- [ ] Does NOT see: Owner Dashboard, User Management, Reports

---

## DIRECT URL ACCESS (type URL in address bar, press Enter)

- [ ] Authenticated owner typing `/users` → loads user management page (200)
- [ ] Authenticated pharmacist typing `/users` → redirected to `/unauthorized`
- [ ] Authenticated cashier typing `/users` → redirected to `/unauthorized`
- [ ] Authenticated procurement typing `/users` → redirected to `/unauthorized`
- [ ] Unauthenticated user typing `/users` → redirected to `/login`
- [ ] Unauthenticated user typing `/dashboard/owner` → redirected to `/login`

---

## USER MANAGEMENT (`/users` — owner and superuser only)

### Creating users
- [ ] Owner can open "Create User" dialog
- [ ] Form fields: Full Name, Email, Password, Role dropdown
- [ ] Role dropdown shows: Owner, Pharmacist, Cashier, Procurement
- [ ] **Role dropdown does NOT include "Superuser" as an option** (app-layer guard in create form)
- [ ] Submitting valid data creates the user and shows a success message
- [ ] New user appears in the users table
- [ ] Duplicate email shows an error message (not a crash)
- [ ] Creating a user inserts an audit_log row with action = 'CREATE_USER'

### Deactivating users
- [ ] Owner can click Deactivate on any non-superuser user
- [ ] Deactivated user's row shows "Inactive" status
- [ ] Owner cannot deactivate their own account (button disabled or shows error)
- [ ] Owner cannot deactivate a superuser account (shows error)
- [ ] Deactivating a user inserts an audit_log row with action = 'DEACTIVATE_USER'

### Changing roles
- [ ] Owner can change the role of a non-superuser user via role dropdown
- [ ] **Owner attempting to change a superuser's role receives an error toast** (server action blocks it — app-layer guard in `changeUserRole()`)
- [ ] Superuser can change any role including promoting to superuser (if that UI exists)
- [ ] Role change inserts an audit_log row with action = 'CHANGE_USER_ROLE'

---

## AUDIT LOG (owner/superuser visible; Phase 2 UI not yet built)

- [ ] Creating a user via the UI results in an audit_log row (verify via Supabase dashboard or direct DB query)
- [ ] Deactivating a user via the UI results in an audit_log row
- [ ] Changing a role via the UI results in an audit_log row
- [ ] Pharmacist, cashier, and procurement cannot directly view audit logs (no UI; direct Supabase query returns 0 rows)

---

## VISUAL / RESPONSIVE DESIGN

- [ ] Login page renders correctly on mobile (375px width)
- [ ] Login page renders correctly on desktop (1280px width)
- [ ] Dashboard renders correctly on desktop without horizontal scroll
- [ ] Dashboard sidebar collapses on narrow viewports (< 768px) or on mobile
- [ ] Stat cards in the owner dashboard display their values without overflow
- [ ] All buttons have correct variant colours (green primary, white secondary, red danger)
- [ ] Focus rings appear on tab navigation (accessibility)
- [ ] No layout shifts on initial load

---

## EDGE CASES

- [ ] Two browser tabs: logging out in Tab A, then navigating in Tab B → redirected to `/login`
- [ ] Session expiry (token expired): navigating to a protected page → redirected to `/login`
- [ ] Invalid/malformed auth cookie → redirected to `/login` (no error page)
- [ ] Navigating to an unimplemented Phase 2 route (e.g., `/suppliers`) → 404 page (not a crash)
