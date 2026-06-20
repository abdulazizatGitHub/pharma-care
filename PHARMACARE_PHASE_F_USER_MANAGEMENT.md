# PHARMACARE — PHASE F: USER MANAGEMENT MODULE
> **Version:** 1.0  
> **Scope:** Full user management for superadmin + admin (staff management)  
> **Read PHARMACARE_RBAC_V2.md before this document.**

---

## 0. AGENT INSTRUCTIONS

Read this entire document before writing a single line of code.
Execute in the phases defined in Section 7.
Show plan before writing code. Run `npx tsc --noEmit` after each phase.

---

## 1. OVERVIEW

User management lives in two places:

| Route | Who accesses it | What they can do |
|---|---|---|
| `/superadmin/users` | SuperAdmin only | Create admins + pharmacists, edit any user, manage permissions, deactivate/reactivate |
| `/admin/staff` | Admin (if `user_manage_pharmacists` permission) | Create pharmacists only, deactivate pharmacists only |

**Core rules:**
- No user is ever hard-deleted. Deactivate only.
- Every action writes to `audit_logs`.
- Username is auto-generated from name + pharmacy slug.
- Password is auto-generated, shown once, never stored in plaintext.
- User must change password on first login (`force_password_change` flag).
- SuperAdmin creates admins. Admins (if permitted) create pharmacists only.
- Role cannot be changed post-creation. Deactivate and recreate instead.

---

## 2. DATABASE CHANGES

### 2.1 Migration: `007_user_management_fields.sql`

Add missing demographic fields to `profiles` table:

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS cnic           TEXT,
  ADD COLUMN IF NOT EXISTS joined_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS username       TEXT UNIQUE;

-- Index for username lookups (uniqueness check during generation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username 
  ON profiles(username) WHERE username IS NOT NULL;

-- Index for CNIC lookups (prevent duplicate CNICs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cnic
  ON profiles(cnic) WHERE cnic IS NOT NULL;
```

**Field definitions:**

| Field | Type | Notes |
|---|---|---|
| `phone` | TEXT | Required for new users. Pakistani format: 03XXXXXXXXX |
| `cnic` | TEXT | Optional. Format: XXXXX-XXXXXXX-X. Unique if provided. |
| `joined_at` | DATE | Defaults to today. Editable for backdated staff. When backdated, `created_at` records the actual registration timestamp automatically. |
| `force_password_change` | BOOLEAN | Set TRUE on creation. App checks this after login and redirects to change-password page. Set FALSE after user changes password. |
| `username` | TEXT | Auto-generated. Stored for display. The Supabase Auth email IS the username (they are the same value). |

### 2.2 Update `lib/db-types.ts`

Add new fields to `Profile` interface:
```typescript
phone: string | null
cnic: string | null
joined_at: string        // DATE as ISO string
force_password_change: boolean
username: string | null
```

---

## 3. USERNAME & PASSWORD GENERATION

### 3.1 Username generation (`lib/user-utils.ts`)

```typescript
/**
 * Generate a unique username for a new user.
 * Format: firstname.lastname@pharmacyslug
 * 
 * pharmacySlug = pharmacy name from settings, lowercased,
 * spaces and special chars replaced with dots,
 * multiple consecutive dots collapsed to one.
 * 
 * Example: "City Pharmacy Plus" → "city.pharmacy.plus"
 * 
 * If "ali.khan@pharmacare" exists:
 *   try "ali.khan2@pharmacare"
 *   try "ali.khan3@pharmacare" etc.
 * 
 * @param firstName - user's first name
 * @param lastName - user's last name
 * @param pharmacyName - from settings table
 * @param existingUsernames - array of existing usernames to check against
 */
export function generateUsername(
  firstName: string,
  lastName: string,
  pharmacyName: string,
  existingUsernames: string[]
): string {
  const slug = pharmacyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/, '')

  const base = `${firstName.toLowerCase().trim()}.${lastName.toLowerCase().trim()}`
  const candidate = `${base}@${slug}`

  if (!existingUsernames.includes(candidate)) return candidate

  let counter = 2
  while (existingUsernames.includes(`${base}${counter}@${slug}`)) {
    counter++
  }
  return `${base}${counter}@${slug}`
}
```

### 3.2 Password generation (`lib/user-utils.ts`)

```typescript
/**
 * Generate a cryptographically random strong password.
 * 
 * Rules:
 * - 12 characters total
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character from: @#$%!
 * - No ambiguous characters (0, O, l, 1, I)
 * 
 * Never stored in plaintext. Passed to Supabase Auth which hashes it.
 * Shown to superadmin once on Step 3 of the creation wizard.
 */
export function generatePassword(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '@#$%!'
  const all     = upper + lower + digits + special

  // Guarantee at least one of each required character type
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]

  // Fill remaining 8 characters from full set
  const rest = Array.from({ length: 8 }, () =>
    all[Math.floor(Math.random() * all.length)]
  )

  // Shuffle all 12 characters
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('')
}
```

---

## 4. USER CREATION WIZARD

### 4.1 Component structure

```
app/superadmin/users/page.tsx          ← Server Component, fetches user list
components/superadmin/
  UserManagementPage.tsx               ← Client Component, orchestrates the page
  CreateUserWizard.tsx                 ← Client Component, the 3-step wizard
  wizard-steps/
    Step1Identity.tsx                  ← Name, phone, CNIC, joining date
    Step2RolePermissions.tsx           ← Role select + permission checkboxes
    Step3Review.tsx                    ← Summary + generated credentials
  UserTable.tsx                        ← User list table
  EditUserDrawer.tsx                   ← Edit name/phone/reset password
  PermissionEditor.tsx                 ← Edit permissions for existing user
  DeactivateConfirm.tsx               ← Confirm deactivation dialog
```

### 4.2 Step 1 — Identity

**Fields:**

| Field | Required | Validation |
|---|---|---|
| First name | Yes | Min 2 chars, letters only |
| Last name | Yes | Min 2 chars, letters only |
| Phone | Yes | Pakistani format: 03XXXXXXXXX (11 digits starting with 03) |
| CNIC | No | Format: XXXXX-XXXXXXX-X or 13 digits. Unique check on submit. |
| Date of joining | Yes | Defaults to today. Datepicker, max = today. |

**Live preview:** As user types first/last name, show a preview of the generated username below the name fields:
```
Generated username: ali.khan@pharmacare
```
This is readonly and updates in real time.

**Backdated joining note:** If date of joining is set to a past date, show a subtle info message:
```
ℹ️ Registration date will be recorded as today. 
   Joining date reflects when they started work.
```

### 4.3 Step 2 — Role & Permissions

**Role selection:**
Two large cards (not a dropdown):

```
┌─────────────────────┐  ┌─────────────────────┐
│  👤 Admin           │  │  💊 Pharmacist       │
│                     │  │                      │
│  Manages operations │  │  Counter staff       │
│  purchasing,        │  │  POS, prescriptions, │
│  inventory,         │  │  customer service    │
│  reporting          │  │                      │
└─────────────────────┘  └─────────────────────┘
```

Selecting a role immediately populates the permissions section below.

**Permissions section:**

Two columns — "Granted" and "Restricted":

For Admin creation:
```
Base permissions (all checked by default):
  ☑ Suppliers
  ☑ Purchase Orders
  ☑ Inventory View
  ☑ Inventory Manage
  ☑ Customers
  ☑ Shifts

Additional access (unchecked by default):
  ☐ Reports
  ☐ Expenses
  ☐ Manage Pharmacists
  ☐ Sales History (All)
  ☐ Controlled Drugs
```

For Pharmacist creation:
```
Base permissions (all checked by default):
  ☑ POS
  ☑ Prescriptions
  ☑ Controlled Drugs
  ☑ Customers
  ☑ Shifts
  ☑ Inventory View
  ☑ Sales History (Own)

Additional access (unchecked by default):
  ☐ Sales History (All)
  ☐ Inventory Manage
  ☐ Reports (Basic)
```

Unchecking a base permission = restrict override.
Checking an additional permission = grant override.

### 4.4 Step 3 — Review & Confirm

**Display:**
```
┌─────────────────────────────────────────┐
│  Review new user                        │
├─────────────────────────────────────────┤
│  Name:         Ali Khan                 │
│  Role:         Admin                    │
│  Phone:        03001234567              │
│  CNIC:         42101-1234567-1          │
│  Joined:       01 Jun 2026              │
├─────────────────────────────────────────┤
│  Username:     ali.khan@pharmacare      │
│  Password:     Xk#9mP2$vR4n  [Copy]    │
│                                         │
│  ⚠️ Save this password. It will not    │
│     be shown again.                     │
│                                         │
│  ✓ User must change password on         │
│    first login                          │
├─────────────────────────────────────────┤
│  Permissions:  6 granted, 0 restricted  │
│  [View details ▼]                       │
└─────────────────────────────────────────┘

[← Back]              [Create User]
```

**Copy button behavior:** Copies password to clipboard. Shows "Copied!" for 2 seconds then reverts. Uses `navigator.clipboard.writeText()`.

**Create User button:** Disabled until the superadmin has seen the password (tracked by a `passwordSeen` state that flips to true when the copy button is clicked OR when the page has been on Step 3 for 3+ seconds).

---

## 5. SERVER ACTIONS

File: `app/actions/users.ts` (rebuild, replacing existing)

### 5.1 `createUser(input: CreateUserInput)`

```typescript
interface CreateUserInput {
  firstName: string
  lastName: string
  phone: string
  cnic?: string
  joinedAt: string        // ISO date string
  role: 'admin' | 'pharmacist'
  grants: Permission[]    // permissions above base to grant
  restrictions: Permission[] // permissions below base to restrict
  // username and password are generated server-side, not passed from client
}
```

**Flow:**
1. Verify caller session — must be `superadmin` (or `admin` with `user_manage_pharmacists` for pharmacist creation only)
2. Zod validate all inputs
3. Fetch pharmacy name from settings for username generation
4. Fetch all existing usernames from profiles
5. Generate username via `generateUsername()`
6. Generate password via `generatePassword()`
7. `adminClient.auth.admin.createUser({ email: username, password, email_confirm: true })`
8. `UPDATE profiles SET full_name, phone, cnic, joined_at, force_password_change=true, username, role WHERE id = newUser.id`
9. If grants or restrictions: `INSERT user_permissions` rows
10. `INSERT audit_logs { action: 'CREATE_USER', new_value: { username, role, grants, restrictions } }`
11. Return `{ username, password, userId }` — password returned once to display in Step 3

**Security note:** Password is generated and used in one server action call. It is never stored anywhere except Supabase Auth (hashed). The plaintext is returned to the client only once to display on Step 3.

### 5.2 `updateUser(userId, input: UpdateUserInput)`

```typescript
interface UpdateUserInput {
  firstName?: string
  lastName?: string
  phone?: string
  cnic?: string
}
```

**Flow:**
1. Verify caller is `superadmin`
2. Validate inputs
3. `UPDATE profiles SET full_name, phone, cnic WHERE id = userId`
4. Audit log: `UPDATE_USER`

**Note:** Email/username cannot be changed post-creation. Role cannot be changed. These are immutable once set.

### 5.3 `resetPassword(userId)`

**Flow:**
1. Verify caller is `superadmin`
2. Generate new password via `generatePassword()`
3. `adminClient.auth.admin.updateUserById(userId, { password: newPassword })`
4. `UPDATE profiles SET force_password_change = TRUE WHERE id = userId`
5. Audit log: `RESET_PASSWORD`
6. Return `{ newPassword }` — shown once to superadmin

### 5.4 `updatePermissions(userId, grants, restrictions)`

**Flow:**
1. Verify caller is `superadmin`
2. Fetch target user's role (cannot update superadmin)
3. `DELETE FROM user_permissions WHERE user_id = userId`
4. `INSERT user_permissions` for each grant and restriction
5. Audit log: `UPDATE_PERMISSIONS`

### 5.5 `deactivateUser(userId)`

**Flow:**
1. Verify caller is `superadmin` OR (`admin` with `user_manage_pharmacists` targeting a pharmacist)
2. Fetch target — block if target is `superadmin`
3. If caller is `admin` — block if target is not `pharmacist`
4. `UPDATE profiles SET is_active = FALSE WHERE id = userId`
5. Audit log: `DEACTIVATE_USER`

### 5.6 `reactivateUser(userId)`

**Flow:**
1. Verify caller is `superadmin`
2. `UPDATE profiles SET is_active = TRUE WHERE id = userId`
3. Audit log: `REACTIVATE_USER`

---

## 6. USER TABLE & MANAGEMENT UI

### 6.1 `/superadmin/users` page layout

```
PageHeader: "Users"  "Manage staff accounts"    [+ Add User]
                                                 
Tabs: [Admins (N)] [Pharmacists (N)] [Inactive (N)]

Filter row: [Search by name...] [All permissions ▼]

Table:
Name          Username              Phone         Joined       Status    Actions
Ali Khan      ali.khan@pharmacare   0300-1234567  01 Jun 2026  Active    [Edit] [Permissions] [Deactivate]
Sara Ahmed    sara.ahmed@pharmacare 0312-9876543  15 May 2026  Active    [Edit] [Permissions] [Deactivate]

Inactive tab shows deactivated users with [Reactivate] button instead.
```

### 6.2 Edit User drawer (slide-in from right)

Fields: First name, Last name, Phone, CNIC
Save button → calls `updateUser()`
"Reset Password" button at bottom → calls `resetPassword()` → shows new password in a modal with copy button

### 6.3 Permission Editor (modal)

Shows current permission state for the user:
- Base permissions for their role (read-only labels)
- Overrides applied (grants shown in green, restrictions shown in red)
- Edit toggles — same checkbox UI as Step 2 of creation wizard
- Save → calls `updatePermissions()`

### 6.4 `/admin/staff` page layout

Simpler version — pharmacists only, no permission editing:

```
PageHeader: "Staff"  "Manage pharmacist accounts"    [+ Add Pharmacist]

Table:
Name          Username              Phone         Joined       Status    Actions
Ali Khan      ali.khan@pharmacare   0300-1234567  01 Jun 2026  Active    [Deactivate]
```

Add Pharmacist → same 3-step wizard but:
- Step 2 shows only Pharmacist role (no role choice)
- No permission customization (admin cannot edit permissions)
- Step 3 shows credentials same as superadmin wizard

---

## 7. FORCE PASSWORD CHANGE FLOW

After login, the layout server components check `profiles.force_password_change`.

If `TRUE`:
- Redirect to `/change-password` before rendering any dashboard
- `/change-password` is accessible to all 3 roles
- Form: Current password (or temp password), New password, Confirm new password
- Password rules: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
- On success:
  - `adminClient.auth.admin.updateUserById(userId, { password: newPassword })`
  - `UPDATE profiles SET force_password_change = FALSE`
  - Redirect to role dashboard

File: `app/change-password/page.tsx`
This route must be excluded from proxy.ts middleware matcher 
(it needs to be accessible during the force-change flow).

---

## 8. EXECUTION PLAN

Execute in order. Plan before code. `npx tsc --noEmit` after each phase.

### Phase F1 — Database + utilities
1. Write `supabase/migrations/007_user_management_fields.sql`
   Show SQL — wait for approval before running.
2. Update `lib/db-types.ts` with new Profile fields
3. Create `lib/user-utils.ts` with `generateUsername()` and `generatePassword()`
4. `npx tsc --noEmit`

### Phase F2 — Server actions
1. Rebuild `app/actions/users.ts` with all 6 actions
2. `npx tsc --noEmit`

### Phase F3 — Change password page
1. Create `app/change-password/page.tsx`
2. Update `proxy.ts` matcher to exclude `/change-password`
3. Update all 3 role layouts to check `force_password_change` and redirect
4. `npx tsc --noEmit`

### Phase F4 — SuperAdmin users page
1. Create component folder `components/superadmin/`
2. Build `CreateUserWizard.tsx` with all 3 steps
3. Build `UserTable.tsx`
4. Build `EditUserDrawer.tsx`
5. Build `PermissionEditor.tsx`
6. Build `DeactivateConfirm.tsx`
7. Replace stub `app/superadmin/users/page.tsx` with real page
8. Move old `app/(dashboard)/users/page.tsx` — verify it's no longer needed, delete it
9. Delete `components/dashboard/UserManagement.tsx`
10. `npx tsc --noEmit`

### Phase F5 — Admin staff page
1. Replace stub `app/admin/staff/page.tsx` with real page
2. Reuse wizard and table components from Phase F4 (restricted mode)
3. `npx tsc --noEmit`

### Phase F6 — Verification
1. `npx next build`
2. Manual browser verification checklist:
   - Create an admin via wizard — all 3 steps work
   - Generated username shown in Step 3
   - Password shown with copy button
   - New admin appears in Admins tab
   - Login as new admin → force_password_change redirect works
   - After password change → lands on /admin/dashboard
   - Edit admin name → reflects in table
   - Reset password → new password shown once
   - Edit permissions → changes reflected immediately on next login
   - Deactivate admin → moved to Inactive tab
   - Reactivate → moved back to Admins tab
   - Create pharmacist via admin staff page → works
   - Admin cannot deactivate another admin

---

## 9. RULES & CONSTRAINTS (document in CLAUDE.md)

```
## User Management Rules
- Usernames are immutable after creation
- Roles are immutable after creation  
- No user record is ever hard-deleted
- force_password_change must be TRUE for all new users
- Password generation uses lib/user-utils.ts generatePassword()
- Username generation uses lib/user-utils.ts generateUsername()
- Pharmacy slug for username comes from settings table key='pharmacy_name'
- Every user action writes to audit_logs
- Admin can only manage pharmacists — never other admins
- SuperAdmin cannot be deactivated by any role including themselves
```

---

*End of PHARMACARE_PHASE_F_USER_MANAGEMENT.md*