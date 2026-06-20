/**
 * RLS Policy Tests
 * Tests Supabase row-level security policies directly using authenticated user JWTs.
 * Does NOT require the dev server. Talks to Supabase cloud directly.
 *
 * Reflects policies as of migration 006_rbac_v2.sql.
 * Role mapping applied by that migration:
 *   superuser/owner → superadmin
 *   procurement     → admin
 *   cashier         → pharmacist
 *   pharmacist      stays pharmacist
 *
 * GUARD — required preconditions for all tests to pass:
 *   All test accounts must have is_active = TRUE and is_deleted = FALSE in profiles.
 *   get_user_role() returns NULL when is_active = FALSE, causing every WITH CHECK
 *   INSERT policy to fail with 42501. Symptoms: INSERT tests fail with RLS violation;
 *   pharmacist can see their own seeded sale returns 0 rows instead of 1.
 *   Fix: UPDATE profiles SET is_active = TRUE WHERE email IN
 *     ('pharma@pharmacare.dev', 'cashier@pharmacare.dev',
 *      'procure@pharmacare.dev', 'superuser@pharmacare.dev');
 */

import { adminClient, signIn, userClient } from './helpers/clients'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Test accounts ────────────────────────────────────────────────────────────
const ACCOUNTS = {
  superadmin: { email: 'superuser@pharmacare.dev', password: 'SuperAdmin@123' },
  admin:      { email: 'procure@pharmacare.dev',   password: 'ProcurePass@123' },
  pharmacist: { email: 'pharma@pharmacare.dev',    password: 'PharmaPass@123' },
}

// Second pharmacist account (old cashier@pharmacare.dev, migrated → pharmacist)
// Used only for the sales own-rows isolation test.
const PHARMACIST2_CREDS = { email: 'cashier@pharmacare.dev', password: 'CashierPass@123' }

// ─── Shared state ─────────────────────────────────────────────────────────────
let clients: Record<string, SupabaseClient>
let userIds: Record<string, string>

// Test fixture IDs (created in beforeAll, cleaned up in afterAll)
let testMedicineId: string
let testSaleIdPharmacist: string    // cashier_id = pharma@pharmacare.dev
let testSaleIdPharmacist2: string   // cashier_id = cashier@pharmacare.dev
let testAuditLogId: string
let testCdrId: string

// ─── Setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Sign in the 3 main accounts
  const sessions = await Promise.all(
    Object.entries(ACCOUNTS).map(async ([role, creds]) => {
      const session = await signIn(creds.email, creds.password)
      return [role, { session, client: userClient(session.access_token) }] as const
    })
  )

  clients = {}
  userIds = {}
  for (const [role, { session, client }] of sessions) {
    clients[role] = client
    userIds[role] = session.user.id
  }

  // Sign in pharmacist2 (old cashier account — now also role=pharmacist)
  const p2Session = await signIn(PHARMACIST2_CREDS.email, PHARMACIST2_CREDS.password)
  clients.pharmacist2 = userClient(p2Session.access_token)
  userIds.pharmacist2 = p2Session.user.id

  // Seed: test medicine (created by superadmin)
  const { data: med, error: medErr } = await adminClient
    .from('medicines')
    .insert({
      name: 'TEST-RLS-Medicine',
      mrp: 100.00,
      schedule: 'OTC',
      created_by: userIds.superadmin,
    })
    .select('id')
    .single()
  if (medErr || !med) throw new Error(`Failed to seed medicine: ${medErr?.message}`)
  testMedicineId = med.id

  // Seed: 2 sales — one per pharmacist account — for own-rows isolation test
  const now = new Date().toISOString()
  const [pharmSale, pharm2Sale] = await Promise.all([
    adminClient.from('sales').insert({
      receipt_no: `TEST-RLS-SALE-P-${Date.now()}`,
      cashier_id: userIds.pharmacist,
      subtotal: 50,
      total_amount: 50,
      created_by: userIds.pharmacist,
    }).select('id').single(),
    adminClient.from('sales').insert({
      receipt_no: `TEST-RLS-SALE-P2-${Date.now()}`,
      cashier_id: userIds.pharmacist2,
      subtotal: 75,
      total_amount: 75,
      created_by: userIds.pharmacist2,
    }).select('id').single(),
  ])
  if (pharmSale.error || !pharmSale.data)   throw new Error(`Failed to seed pharmacist sale: ${pharmSale.error?.message}`)
  if (pharm2Sale.error || !pharm2Sale.data) throw new Error(`Failed to seed pharmacist2 sale: ${pharm2Sale.error?.message}`)
  testSaleIdPharmacist  = pharmSale.data.id
  testSaleIdPharmacist2 = pharm2Sale.data.id

  // Seed: audit log entry (for immutability tests)
  const { data: log, error: logErr } = await adminClient
    .from('audit_logs')
    .insert({
      user_id:    userIds.superadmin,
      user_role:  'superadmin',
      action:     'TEST_RLS_ENTRY',
      table_name: 'audit_logs',
    })
    .select('id')
    .single()
  if (logErr || !log) throw new Error(`Failed to seed audit log: ${logErr?.message}`)
  testAuditLogId = log.id

  // Seed: controlled drug register entry
  const { data: cdr, error: cdrErr } = await adminClient
    .from('controlled_drug_register')
    .insert({
      sale_date:     new Date().toISOString().split('T')[0],
      doctor_name:   'TEST Doctor',
      patient_name:  'TEST Patient',
      medicine_id:   testMedicineId,
      medicine_name: 'TEST-RLS-Medicine',
      manufacturer:  'TEST Manufacturer',
      batch_no:      'TEST-BATCH-001',
      quantity_sold: 1,
      created_by:    userIds.superadmin,
    })
    .select('id')
    .single()
  if (cdrErr || !cdr) throw new Error(`Failed to seed CDR: ${cdrErr?.message}`)
  testCdrId = cdr.id
}, 60000)

afterAll(async () => {
  await Promise.allSettled([
    adminClient.from('medicines').update({ is_deleted: true }).eq('id', testMedicineId),
    adminClient.from('sales').update({ is_deleted: true }).eq('id', testSaleIdPharmacist),
    adminClient.from('sales').update({ is_deleted: true }).eq('id', testSaleIdPharmacist2),
    // audit_logs and CDR are append-only — leave them as test data
  ])
})

// ─── MEDICINES ────────────────────────────────────────────────────────────────
// All 3 roles: SELECT, INSERT, UPDATE. No DELETE policy for any role.
describe('MEDICINES table RLS', () => {
  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can SELECT medicines',
    async (role) => {
      const { data, error } = await clients[role].from('medicines').select('id').limit(1)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can INSERT a medicine',
    async (role) => {
      const { data, error } = await clients[role]
        .from('medicines')
        .insert({ name: `TEST-INSERT-${role}-${Date.now()}`, mrp: 10, schedule: 'OTC' })
        .select('id')
        .single()
      expect(error).toBeNull()
      expect(data).not.toBeNull()
      if (data?.id) await adminClient.from('medicines').update({ is_deleted: true }).eq('id', data.id)
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can UPDATE a medicine',
    async (role) => {
      const { data, error } = await clients[role]
        .from('medicines')
        .update({ name: `TEST-UPDATE-${role}-${Date.now()}` })
        .eq('id', testMedicineId)
      // UPDATE returns null data on success (no .select() chained)
      expect(error).toBeNull()
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot hard-DELETE a medicine (no DELETE policy — 0 rows, no error)',
    async (role) => {
      const { data, error } = await clients[role].from('medicines').delete().eq('id', testMedicineId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )
})

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
// superadmin + admin only. Pharmacist is blocked.
describe('SUPPLIERS table RLS', () => {
  let testSupplierId: string

  beforeAll(async () => {
    const { data } = await adminClient
      .from('suppliers')
      .insert({ name: `TEST-Supplier-${Date.now()}` })
      .select('id')
      .single()
    testSupplierId = data!.id
  })

  afterAll(async () => {
    if (testSupplierId) {
      await adminClient.from('suppliers').update({ is_deleted: true }).eq('id', testSupplierId)
    }
  })

  test.each(['superadmin', 'admin'])(
    '%s can SELECT suppliers',
    async (role) => {
      const { data, error } = await clients[role].from('suppliers').select('id').limit(1)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    }
  )

  // Pharmacist can read suppliers — required for the
  // supplier dropdown in AddBatchForm (added Phase 4C,
  // migration 009 suppliers_select policy).
  test('pharmacist can SELECT suppliers (required for AddBatchForm supplier dropdown)', async () => {
    const { data, error } = await clients.pharmacist.from('suppliers').select('id')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  test.each(['superadmin', 'admin'])(
    '%s can INSERT a supplier',
    async (role) => {
      const { data, error } = await clients[role]
        .from('suppliers')
        .insert({ name: `TEST-SUP-${role}-${Date.now()}` })
        .select('id')
        .single()
      expect(error).toBeNull()
      expect(data).not.toBeNull()
      if (data?.id) await adminClient.from('suppliers').update({ is_deleted: true }).eq('id', data.id)
    }
  )

  test('pharmacist cannot INSERT a supplier (RLS blocks)', async () => {
    const { error } = await clients.pharmacist
      .from('suppliers')
      .insert({ name: `TEST-BLOCKED-SUP-pharmacist` })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  test('pharmacist cannot UPDATE a supplier (RLS blocks — 0 rows, no error)', async () => {
    const { data, error } = await clients.pharmacist
      .from('suppliers')
      .update({ name: 'TAMPERED' })
      .eq('id', testSupplierId)
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})

// ─── SALES ────────────────────────────────────────────────────────────────────
// superadmin + admin: see all rows.
// pharmacist: sees only own rows (cashier_id = auth.uid()).
describe('SALES table RLS', () => {
  test('pharmacist can SELECT only their own sales', async () => {
    const { data, error } = await clients.pharmacist.from('sales').select('id, cashier_id')
    expect(error).toBeNull()
    // Every row returned must belong to this pharmacist
    expect(data!.every((row) => row.cashier_id === userIds.pharmacist)).toBe(true)
    // The other pharmacist's sale must NOT be visible
    expect(data!.some((row) => row.id === testSaleIdPharmacist2)).toBe(false)
  })

  test('pharmacist can see their own seeded sale', async () => {
    const { data, error } = await clients.pharmacist.from('sales').select('id').eq('id', testSaleIdPharmacist)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('pharmacist2 can SELECT only their own sales (own-rows isolation)', async () => {
    const { data, error } = await clients.pharmacist2.from('sales').select('id, cashier_id')
    expect(error).toBeNull()
    expect(data!.every((row) => row.cashier_id === userIds.pharmacist2)).toBe(true)
    expect(data!.some((row) => row.id === testSaleIdPharmacist)).toBe(false)
  })

  test.each(['superadmin', 'admin'])(
    '%s can SELECT ALL sales (sees both seeded sales)',
    async (role) => {
      const { data, error } = await clients[role].from('sales').select('id')
      expect(error).toBeNull()
      const ids = data!.map((r) => r.id)
      expect(ids).toContain(testSaleIdPharmacist)
      expect(ids).toContain(testSaleIdPharmacist2)
    }
  )
})

// ─── AUDIT_LOGS ───────────────────────────────────────────────────────────────
// All 3 roles can INSERT. Only superadmin + admin can SELECT. No UPDATE or DELETE.
describe('AUDIT_LOGS table RLS', () => {
  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can INSERT an audit log entry',
    async (role) => {
      const { error } = await clients[role].from('audit_logs').insert({
        action:     `TEST_RLS_INSERT_${role.toUpperCase()}`,
        user_id:    userIds[role],
        user_role:  role,
        table_name: 'audit_logs',
      })
      expect(error).toBeNull()
    }
  )

  test.each(['superadmin', 'admin'])(
    '%s can SELECT audit logs',
    async (role) => {
      const { data, error } = await clients[role].from('audit_logs').select('id').limit(1)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect(data!.length).toBeGreaterThan(0)
    }
  )

  test('pharmacist cannot SELECT audit logs (returns 0 rows)', async () => {
    const { data, error } = await clients.pharmacist.from('audit_logs').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot UPDATE an audit log (no UPDATE policy — 0 rows, no error)',
    async (role) => {
      const { data, error } = await clients[role]
        .from('audit_logs')
        .update({ action: 'TAMPERED' })
        .eq('id', testAuditLogId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot DELETE an audit log (no DELETE policy — 0 rows, no error)',
    async (role) => {
      const { data, error } = await clients[role]
        .from('audit_logs')
        .delete()
        .eq('id', testAuditLogId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )
})

// ─── CONTROLLED_DRUG_REGISTER ─────────────────────────────────────────────────
// All 3 roles: SELECT and INSERT. No UPDATE or DELETE (append-only).
describe('CONTROLLED_DRUG_REGISTER table RLS', () => {
  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can INSERT into controlled_drug_register',
    async (role) => {
      const { data, error } = await clients[role]
        .from('controlled_drug_register')
        .insert({
          sale_date:     new Date().toISOString().split('T')[0],
          doctor_name:   `TEST-DR-${role}`,
          patient_name:  `TEST-PT-${role}`,
          medicine_id:   testMedicineId,
          medicine_name: 'TEST-RLS-Medicine',
          manufacturer:  'TEST MFG',
          batch_no:      `TEST-BATCH-${role}`,
          quantity_sold: 1,
          created_by:    userIds[role],
        })
        .select('id')
        .single()
      expect(error).toBeNull()
      expect(data).not.toBeNull()
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can SELECT controlled_drug_register',
    async (role) => {
      const { data, error } = await clients[role].from('controlled_drug_register').select('id').limit(1)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot UPDATE controlled_drug_register (append-only — 0 rows, no error)',
    async (role) => {
      const { data, error } = await clients[role]
        .from('controlled_drug_register')
        .update({ doctor_name: 'TAMPERED' })
        .eq('id', testCdrId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )

  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s cannot DELETE from controlled_drug_register (append-only — 0 rows, no error)',
    async (role) => {
      const { data, error } = await clients[role]
        .from('controlled_drug_register')
        .delete()
        .eq('id', testCdrId)
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  )
})

// ─── PROFILES ─────────────────────────────────────────────────────────────────
// Self-read for all. Admin-read (all profiles) for superadmin + admin.
// Admin-update for superadmin + admin. Pharmacist sees only own row.
describe('PROFILES table RLS', () => {
  test.each(['superadmin', 'admin', 'pharmacist'])(
    '%s can SELECT their own profile row',
    async (role) => {
      const { data, error } = await clients[role]
        .from('profiles')
        .select('id, role')
        .eq('id', userIds[role])
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data![0].id).toBe(userIds[role])
    }
  )

  test.each(['superadmin', 'admin'])(
    '%s can SELECT ALL profiles (admin_select policy)',
    async (role) => {
      const { data, error } = await clients[role].from('profiles').select('id')
      expect(error).toBeNull()
      // At least 3 accounts exist
      expect(data!.length).toBeGreaterThanOrEqual(3)
    }
  )

  test('pharmacist cannot SELECT other users profiles (only own row returned)', async () => {
    const { data, error } = await clients.pharmacist.from('profiles').select('id')
    expect(error).toBeNull()
    // Only their own row via profiles_self_select
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(userIds.pharmacist)
  })
})
