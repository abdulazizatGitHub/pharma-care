import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/StatCard'
import { Wallet, Users, Building2, ArrowLeftRight } from 'lucide-react'

type AccountRow = { code: string; normal_balance: string; balance: number }
type CustomerRow = { id: string; name: string; credit_balance: number }
type SupplierRow = { id: string; name: string }
type PharmacyRow = { current_balance: number }

const fmt = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default async function LedgerOverviewPage() {
  const supabase = await createClient()

  const [
    { data: accountRows },
    { data: topCustomers },
    { data: topSuppliers },
    { data: pharmacyRows },
  ] = await Promise.all([
    supabase.rpc('get_account_balances'),
    supabase
      .from('customers')
      .select('id, name, credit_balance')
      .gt('credit_balance', 0)
      .eq('is_deleted', false)
      .order('credit_balance', { ascending: false })
      .limit(5),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name')
      .limit(5),
    supabase
      .from('borrowing_pharmacies')
      .select('current_balance')
      .eq('is_deleted', false),
  ])

  const accounts = (accountRows ?? []) as AccountRow[]
  const customers = (topCustomers ?? []) as CustomerRow[]
  const suppliers = (topSuppliers ?? []) as SupplierRow[]
  const pharmacies = (pharmacyRows ?? []) as PharmacyRow[]

  const cash = accounts
    .filter(a => ['1000', '1001'].includes(a.code))
    .reduce((s, a) => s + Number(a.balance), 0)
  const receivables = Number(accounts.find(a => a.code === '1100')?.balance ?? 0)
  const payables    = Number(accounts.find(a => a.code === '2000')?.balance ?? 0)

  const oweUs = pharmacies
    .filter(p => Number(p.current_balance) > 0)
    .reduce((s, p) => s + Number(p.current_balance), 0)
  const weOwe = pharmacies
    .filter(p => Number(p.current_balance) < 0)
    .reduce((s, p) => s + Math.abs(Number(p.current_balance)), 0)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Ledger Overview</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
          Financial position at a glance
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Cash on Hand"
          value={fmt(cash)}
          icon={Wallet}
        />
        <StatCard
          label="Total Receivables (AR)"
          value={fmt(receivables)}
          icon={Users}
        />
        <StatCard
          label="Total Payables (AP)"
          value={fmt(payables)}
          icon={Building2}
        />
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top customers */}
        <div
          style={{
            background: '#fff',
            border: '0.5px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '0.5px solid rgba(0,0,0,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={14} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Top Udhaar (Customers)</span>
            </div>
            <Link href="/superadmin/ledger/customers" style={{ fontSize: 11, color: '#0F6E56', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {customers.length === 0 ? (
            <p style={{ padding: '24px 16px', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
              No outstanding udhaar
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {customers.map((c, i) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 16px',
                    borderBottom: i < customers.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#111827' }}>{c.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: '#0F6E56' }}>
                      {fmt(Number(c.credit_balance))}
                    </span>
                    <Link
                      href={`/superadmin/ledger/customers/${c.id}`}
                      style={{ fontSize: 11, color: '#6b7280', textDecoration: 'none' }}
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top suppliers */}
        <div
          style={{
            background: '#fff',
            border: '0.5px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '0.5px solid rgba(0,0,0,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Suppliers (AP)</span>
            </div>
            <Link href="/superadmin/ledger/suppliers" style={{ fontSize: 11, color: '#0F6E56', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {suppliers.length === 0 ? (
            <p style={{ padding: '24px 16px', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
              No active suppliers
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {suppliers.map((s, i) => (
                <li
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 16px',
                    borderBottom: i < suppliers.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#111827' }}>{s.name}</span>
                  <Link
                    href={`/superadmin/ledger/suppliers/${s.id}`}
                    style={{ fontSize: 11, color: '#6b7280', textDecoration: 'none' }}
                  >
                    View Ledger
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Borrowing summary */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ArrowLeftRight size={14} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Borrowing Summary</span>
          <Link
            href="/superadmin/ledger/borrowing"
            style={{ marginLeft: 'auto', fontSize: 11, color: '#0F6E56', textDecoration: 'none' }}
          >
            View all →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div
            style={{
              background: '#E1F5EE',
              borderRadius: 6,
              padding: '10px 14px',
            }}
          >
            <p style={{ fontSize: 11, color: '#0a5a45', margin: 0 }}>Others owe us</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#0F6E56', margin: '4px 0 0', fontFamily: 'monospace' }}>
              {fmt(oweUs)}
            </p>
          </div>
          <div
            style={{
              background: '#FAEEDA',
              borderRadius: 6,
              padding: '10px 14px',
            }}
          >
            <p style={{ fontSize: 11, color: '#854F0B', margin: 0 }}>We owe others</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#854F0B', margin: '4px 0 0', fontFamily: 'monospace' }}>
              {fmt(weOwe)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
