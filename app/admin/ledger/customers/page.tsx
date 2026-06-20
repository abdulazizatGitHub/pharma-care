import { createClient } from '@/lib/supabase/server'
import type { Customer } from '@/lib/db-types'

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default async function AdminLedgerCustomersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('customers')
    .select('*')
    .gt('credit_balance', 0)
    .eq('is_deleted', false)
    .order('credit_balance', { ascending: false })

  const customers = (data ?? []) as Customer[]
  const total     = customers.reduce((s, c) => s + Number(c.credit_balance), 0)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Customer Ledger</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
          Customers with outstanding udhaar balances (read-only view)
        </p>
      </div>

      {customers.length === 0 ? (
        <div
          style={{
            background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8,
            padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13,
          }}
        >
          No customers with outstanding balances.
        </div>
      ) : (
        <div
          style={{
            background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)',
            borderRadius: 8, overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {['Customer', 'Phone', 'Udhaar Balance'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 16px', fontSize: 10, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: '#6b7280', textAlign: i === 2 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {c.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                    {c.phone ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>
                      {fmtPKR(Number(c.credit_balance))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.08)',
              background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#6b7280' }}>Total outstanding:</span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#0F6E56' }}>
              {fmtPKR(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
