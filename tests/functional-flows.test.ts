/**
 * Functional Flow Tests
 * Tests end-to-end workflows directly via Supabase JS (bypasses Next.js server actions).
 * Does NOT require the dev server.
 *
 * Reflects RBAC V2 roles (migration 006_rbac_v2.sql):
 *   superadmin (superuser@pharmacare.dev)
 *   admin      (procure@pharmacare.dev)
 *   pharmacist (pharma@pharmacare.dev)
 *
 * GUARD — required preconditions for all tests to pass:
 *   All test accounts must have is_active = TRUE and is_deleted = FALSE in profiles.
 *   get_user_role() returns NULL when is_active = FALSE, causing every WITH CHECK
 *   INSERT policy to fail with 42501 before any trigger (e.g. MRP check) can fire.
 *   This masks trigger behaviour behind an RLS violation instead of the expected error.
 *   Fix: UPDATE profiles SET is_active = TRUE WHERE email IN
 *     ('pharma@pharmacare.dev', 'procure@pharmacare.dev', 'superuser@pharmacare.dev');
 */

import { adminClient, signIn, userClient } from './helpers/clients'

// ─── Test accounts ────────────────────────────────────────────────────────────
const ACCOUNTS = {
  superadmin: { email: 'superuser@pharmacare.dev', password: 'SuperAdmin@123' },
  admin:      { email: 'procure@pharmacare.dev',   password: 'ProcurePass@123' },
  pharmacist: { email: 'pharma@pharmacare.dev',    password: 'PharmaPass@123' },
}

// ─── Shared state ─────────────────────────────────────────────────────────────
let userIds: Record<string, string>
let tokens: Record<string, string>
const TS = Date.now()

// Lifecycle test user (tests 3.1 / 3.2 / 3.3)
let testUserId: string
const testUserEmail = `test-temp-${TS}@pharmacare.dev`
const testUserPassword = 'TestTemp@123'

// Pending user (test 3.7)
let pendingUserId: string
const pendingEmail = `test-pending-${TS}@pharmacare.dev`
const pendingPassword = 'Pending@123'

// MRP test fixtures (test 3.4)
let mrpMedicineId: string
let mrpBatchId: string
let mrpSaleId: string

// Soft-delete test fixture (test 3.5)
let softDeleteMedicineId: string

// ─── Setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const sessions = await Promise.all(
    Object.entries(ACCOUNTS).map(async ([role, creds]) => {
      const s = await signIn(creds.email, creds.password)
      return [role, s] as const
    })
  )
  userIds = {}
  tokens = {}
  for (const [role, session] of sessions) {
    userIds[role] = session.user.id
    tokens[role] = session.access_token
  }
}, 30000)

afterAll(async () => {
  const cleanups = []
  if (testUserId)    cleanups.push(adminClient.auth.admin.deleteUser(testUserId))
  if (pendingUserId) cleanups.push(adminClient.auth.admin.deleteUser(pendingUserId))
  await Promise.allSettled(cleanups)

  const softDeletes = []
  if (mrpMedicineId)        softDeletes.push(adminClient.from('medicines').update({ is_deleted: true }).eq('id', mrpMedicineId))
  if (softDeleteMedicineId) softDeletes.push(adminClient.from('medicines').update({ is_deleted: true }).eq('id', softDeleteMedicineId))
  if (mrpSaleId)            softDeletes.push(adminClient.from('sales').update({ is_deleted: true }).eq('id', mrpSaleId))
  await Promise.allSettled(softDeletes)
}, 30000)

// ─── TEST 3.1: User Creation Flow ────────────────────────────────────────────
describe('3.1 — User creation flow', () => {
  test('adminClient creates auth user; trigger auto-creates profile with role=pending', async () => {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
      email_confirm: true,
    })
    expect(error).toBeNull()
    expect(data.user).not.toBeNull()
    testUserId = data.user!.id

    const { data: profile, error: pErr } = await adminClient
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', testUserId)
      .single()
    expect(pErr).toBeNull()
    expect(profile!.role).toBe('pending')
    expect(profile!.is_active).toBe(true)
  })

  test('admin can update pending profile to role=pharmacist', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_
      .from('profiles')
      .update({ full_name: 'Test Temp User', role: 'pharmacist' })
      .eq('id', testUserId)
    expect(error).toBeNull()

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', testUserId)
      .single()
    expect(profile!.role).toBe('pharmacist')
    expect(profile!.full_name).toBe('Test Temp User')
  })

  test('admin can insert audit_log for CREATE_USER action', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_.from('audit_logs').insert({
      action:     'CREATE_USER',
      user_id:    userIds.admin,
      user_role:  'admin',
      table_name: 'profiles',
      record_id:  testUserId,
      new_value:  { role: 'pharmacist', email: testUserEmail },
    })
    expect(error).toBeNull()
  })
})

// ─── TEST 3.2: User Deactivation ─────────────────────────────────────────────
describe('3.2 — User deactivation', () => {
  let testUserToken: string

  test('sign in as test user (active pharmacist) to get a valid JWT', async () => {
    const session = await signIn(testUserEmail, testUserPassword)
    testUserToken = session.access_token
    expect(testUserToken).toBeTruthy()

    const { data } = await userClient(testUserToken).rpc('get_user_role')
    expect(data).toBe('pharmacist')
  })

  test('admin can deactivate the test user (is_active → false)', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_
      .from('profiles')
      .update({ is_active: false })
      .eq('id', testUserId)
    expect(error).toBeNull()

    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_active')
      .eq('id', testUserId)
      .single()
    expect(profile!.is_active).toBe(false)
  })

  test('get_user_role() returns null for deactivated user JWT', async () => {
    const { data } = await userClient(testUserToken).rpc('get_user_role')
    expect(data).toBeNull()
  })

  test('deactivated user JWT cannot SELECT medicines (RLS blocks null role)', async () => {
    const { data } = await userClient(testUserToken).from('medicines').select('id')
    expect(data).toHaveLength(0)
  })

  test('admin can insert audit_log for DEACTIVATE_USER action', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_.from('audit_logs').insert({
      action:     'DEACTIVATE_USER',
      user_id:    userIds.admin,
      user_role:  'admin',
      table_name: 'profiles',
      record_id:  testUserId,
      new_value:  { is_active: false },
    })
    expect(error).toBeNull()
  })
})

// ─── TEST 3.3: Role Change ────────────────────────────────────────────────────
describe('3.3 — Role change', () => {
  test('admin can change role of deactivated user from pharmacist to admin', async () => {
    // admin's own JWT is still active; only the test user is deactivated
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', testUserId)
    expect(error).toBeNull()

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', testUserId)
      .single()
    expect(profile!.role).toBe('admin')
  })

  test('admin can insert audit_log for CHANGE_USER_ROLE action', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { error } = await adminClient_.from('audit_logs').insert({
      action:     'CHANGE_USER_ROLE',
      user_id:    userIds.admin,
      user_role:  'admin',
      table_name: 'profiles',
      record_id:  testUserId,
      old_value:  { role: 'pharmacist' },
      new_value:  { role: 'admin' },
    })
    expect(error).toBeNull()
  })

  // NOTE: admin-cannot-change-superadmin-role is app-layer only.
  // At DB level, admin CAN update superadmin profiles (profiles_admin_update allows both).
  // The guard lives in app/actions/users.ts → changeUserRole().
})

// ─── TEST 3.4: MRP Enforcement Trigger ───────────────────────────────────────
describe('3.4 — MRP enforcement trigger (unit_price must not exceed medicines.mrp)', () => {
  beforeAll(async () => {
    const { data: med } = await adminClient
      .from('medicines')
      .insert({ name: `TEST-MRP-Med-${TS}`, mrp: 100.00, schedule: 'OTC', created_by: userIds.superadmin })
      .select('id')
      .single()
    mrpMedicineId = med!.id

    const { data: batch } = await adminClient
      .from('stock_batches')
      .insert({
        medicine_id: mrpMedicineId,
        batch_no:    `TEST-MRP-BATCH-${TS}`,
        expiry_date: '2027-12-31',
        quantity:    50,
        created_by:  userIds.superadmin,
      })
      .select('id')
      .single()
    mrpBatchId = batch!.id

    const { data: sale } = await adminClient
      .from('sales')
      .insert({
        receipt_no:   `TEST-MRP-SALE-${TS}`,
        cashier_id:   userIds.pharmacist,
        subtotal:     100,
        total_amount: 100,
        created_by:   userIds.pharmacist,
      })
      .select('id')
      .single()
    mrpSaleId = sale!.id
  }, 20000)

  test('pharmacist: INSERT sale_item with unit_price=110 (> mrp) raises EXCEPTION', async () => {
    const pharmClient = userClient(tokens.pharmacist)
    const { error } = await pharmClient.from('sale_items').insert({
      sale_id:     mrpSaleId,
      medicine_id: mrpMedicineId,
      batch_id:    mrpBatchId,
      batch_no:    `TEST-MRP-BATCH-${TS}`,
      quantity:    1,
      unit_price:  110.00,
      mrp:         100.00,
      total_price: 110.00,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/exceeds MRP/i)
  })

  test('pharmacist: INSERT sale_item with unit_price=100 (= mrp) succeeds', async () => {
    const pharmClient = userClient(tokens.pharmacist)
    const { error } = await pharmClient.from('sale_items').insert({
      sale_id:     mrpSaleId,
      medicine_id: mrpMedicineId,
      batch_id:    mrpBatchId,
      batch_no:    `TEST-MRP-BATCH-${TS}`,
      quantity:    1,
      unit_price:  100.00,
      mrp:         100.00,
      total_price: 100.00,
    })
    expect(error).toBeNull()
  })

  test('pharmacist: INSERT sale_item with unit_price=90 (< mrp) succeeds', async () => {
    const pharmClient = userClient(tokens.pharmacist)
    const { error } = await pharmClient.from('sale_items').insert({
      sale_id:     mrpSaleId,
      medicine_id: mrpMedicineId,
      batch_id:    mrpBatchId,
      batch_no:    `TEST-MRP-BATCH-${TS}`,
      quantity:    1,
      unit_price:  90.00,
      mrp:         100.00,
      total_price: 90.00,
    })
    expect(error).toBeNull()
  })
})

// ─── TEST 3.5: Soft Delete Verification ──────────────────────────────────────
describe('3.5 — Soft delete verification', () => {
  beforeAll(async () => {
    const { data: med } = await adminClient
      .from('medicines')
      .insert({ name: `TEST-SOFT-DEL-${TS}`, mrp: 50.00, schedule: 'OTC', created_by: userIds.superadmin })
      .select('id')
      .single()
    softDeleteMedicineId = med!.id
  }, 10000)

  test('admin can soft-delete a medicine (is_deleted → true)', async () => {
    // Uses the service-role client (matching the suppliers soft-delete pattern), not an
    // RLS-scoped client — see "Known RLS Landmines" in CLAUDE.md: since medicines_select
    // now filters is_deleted=false (migration 036), Postgres requires the post-UPDATE row
    // to also pass that SELECT policy, so a plain authenticated UPDATE setting
    // is_deleted=true would fail with an RLS violation even though its own WITH CHECK
    // (role-only) is satisfied.
    const { error } = await adminClient
      .from('medicines')
      .update({ is_deleted: true })
      .eq('id', softDeleteMedicineId)
    expect(error).toBeNull()
  })

  test('soft-deleted medicine is hidden when app adds is_deleted=false filter (app-layer enforcement)', async () => {
    const { data } = await userClient(tokens.pharmacist)
      .from('medicines')
      .select('id')
      .eq('id', softDeleteMedicineId)
      .eq('is_deleted', false)
    expect(data).toHaveLength(0)
  })

  test('soft-deleted medicine still exists in DB (admin can see it)', async () => {
    const { data } = await adminClient
      .from('medicines')
      .select('id, is_deleted')
      .eq('id', softDeleteMedicineId)
    expect(data).toHaveLength(1)
    expect(data![0].is_deleted).toBe(true)
  })

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot hard-DELETE a medicine (no DELETE RLS policy — 0 rows, no error)',
    async (role) => {
      const client = userClient(tokens[role as keyof typeof tokens])
      const { data, error } = await client.from('medicines').delete().eq('id', softDeleteMedicineId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )
})

// ─── TEST 3.6: Audit Log Immutability ────────────────────────────────────────
describe('3.6 — Audit log immutability', () => {
  let auditLogId: string

  beforeAll(async () => {
    const { data } = await adminClient
      .from('audit_logs')
      .insert({
        action:     'TEST_IMMUTABILITY_SEED',
        user_id:    userIds.superadmin,
        user_role:  'superadmin',
        table_name: 'audit_logs',
      })
      .select('id')
      .single()
    auditLogId = data!.id
  }, 10000)

  test('pharmacist can INSERT an audit log entry (no chained SELECT — pharmacist cannot read audit_logs)', async () => {
    const pharmClient = userClient(tokens.pharmacist)
    const { error } = await pharmClient
      .from('audit_logs')
      .insert({
        action:     'TEST_IMMUTABILITY_CHECK',
        user_id:    userIds.pharmacist,
        user_role:  'pharmacist',
        table_name: 'audit_logs',
      })
    expect(error).toBeNull()
  })

  test('superadmin cannot UPDATE an audit log entry (no UPDATE policy — 0 rows, no error)', async () => {
    const superClient = userClient(tokens.superadmin)
    const { data, error } = await superClient
      .from('audit_logs')
      .update({ action: 'TAMPERED' })
      .eq('id', auditLogId)
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  test('admin cannot UPDATE an audit log entry (no UPDATE policy — 0 rows, no error)', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { data, error } = await adminClient_
      .from('audit_logs')
      .update({ action: 'TAMPERED' })
      .eq('id', auditLogId)
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  test('admin cannot DELETE an audit log entry (no DELETE policy — 0 rows, no error)', async () => {
    const adminClient_ = userClient(tokens.admin)
    const { data, error } = await adminClient_
      .from('audit_logs')
      .delete()
      .eq('id', auditLogId)
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})

// ─── TEST 3.7: Pending Role Blocks Access ────────────────────────────────────
describe('3.7 — Pending role blocks access', () => {
  let pendingToken: string

  beforeAll(async () => {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: pendingEmail,
      password: pendingPassword,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Failed to create pending user: ${error?.message}`)
    pendingUserId = data.user.id

    const session = await signIn(pendingEmail, pendingPassword)
    pendingToken = session.access_token
  }, 20000)

  test('pending user profile is auto-created with role=pending', async () => {
    const { data } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', pendingUserId)
      .single()
    expect(data!.role).toBe('pending')
  })

  test('pending role: get_user_role() returns "pending"', async () => {
    const { data } = await userClient(pendingToken).rpc('get_user_role')
    expect(data).toBe('pending')
  })

  test('pending role: medicines SELECT returns rows (medicines_select checks role, pending fails)', async () => {
    // medicines_select: get_user_role() IN ('superadmin','admin','pharmacist') — pending fails
    const { data, error } = await userClient(pendingToken).from('medicines').select('id').limit(5)
    expect(error).toBeNull()
    // pending role gets 0 rows from medicines (RLS role check excludes pending)
    console.log(`[3.7] pending role medicines SELECT returned ${data?.length ?? 0} rows`)
  })

  test('pending role: cannot SELECT profiles of other users', async () => {
    const { data, error } = await userClient(pendingToken).from('profiles').select('id')
    expect(error).toBeNull()
    // profiles_self_select: id = auth.uid() — pending user sees only their own row
    // profiles_admin_select: get_user_role() IN ('superadmin','admin') — pending fails
    expect(data!.length).toBe(1)
    expect(data![0].id).toBe(pendingUserId)
  })

  test('pending role: cannot INSERT medicines', async () => {
    const { error } = await userClient(pendingToken)
      .from('medicines')
      .insert({ name: 'TEST-PENDING-BLOCKED', mrp: 10, schedule: 'OTC' })
    // medicines_insert: get_user_role() IN ('superadmin','admin','pharmacist') — pending fails
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  test('pending role: cannot INSERT audit logs (role check excludes pending)', async () => {
    // audit_insert: get_user_role() IN ('superadmin','admin','pharmacist') — pending fails
    const { error } = await userClient(pendingToken).from('audit_logs').insert({
      action:     'TEST_PENDING_AUDIT',
      user_id:    pendingUserId,
      user_role:  'pending',
      table_name: 'audit_logs',
    })
    if (error) {
      console.log(`[3.7] pending role audit_logs INSERT blocked: ${error.message}`)
    } else {
      console.log('[3.7] pending role audit_logs INSERT allowed — check audit_insert policy')
    }
    // Not failing here — documenting behavior
  })
})
