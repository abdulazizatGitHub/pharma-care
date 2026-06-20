import { createClient } from '@/lib/supabase/server'
import type { SupplierBalance } from '@/components/ledger/LedgerSupplierListPage'

type JournalLine = { party_id: string; direction: string; amount_pkr: number; entry_id: string }
type EntryId     = { id: string }
type SupplierRow = { id: string; name: string; phone: string | null }

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default async function AdminLedgerSuppliersPage() {
  const supabase = await createClient()

  const [{ data: rawSuppliers }, { data: rawEntries }, { data: rawLines }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, phone')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name'),
    supabase.from('journal_entries').select('id').neq('status', 'reversed'),
    supabase
      .from('journal_lines')
      .select('party_id, direction, amount_pkr, entry_id')
      .eq('party_type', 'supplier'),
  ])

  const activeSet = new Set(((rawEntries ?? []) as EntryId[]).map(e => e.id))

  const balanceMap = new Map<string, number>()
  for (const line of (rawLines ?? []) as JournalLine[]) {
    if (!activeSet.has(line.entry_id)) continue
    const prev  = balanceMap.get(line.party_id) ?? 0
    const delta = line.direction === 'debit' ? Number(line.amount_pkr) : -Number(line.amount_pkr)
    balanceMap.set(line.party_id, prev + delta)
  }

  const suppliers: SupplierBalance[] = ((rawSuppliers ?? []) as SupplierRow[]).map(s => ({
    id:          s.id,
    name:        s.name,
    phone:       s.phone,
    outstanding: Math.max(0, -(balanceMap.get(s.id) ?? 0)),
  }))
  suppliers.sort((a, b) => b.outstanding - a.outstanding)

  const withBalance = suppliers.filter(s => s.outstanding > 0.005)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Supplier Ledger</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
          Outstanding payables to suppliers (read-only view)
        </p>
      </div>

      {suppliers.length === 0 ? (
        <div
          style={{
            background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8,
            padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13,
          }}
        >
          No active suppliers found.
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
                {['Supplier', 'Phone', 'Outstanding'].map((h, i) => (
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
              {suppliers.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {s.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                    {s.phone ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {s.outstanding > 0.005 ? (
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#A32D2D' }}>
                        {fmtPKR(s.outstanding)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {withBalance.length > 0 && (
            <div
              style={{
                padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.08)',
                background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: 4,
              }}
            >
              <span style={{ fontSize: 12, color: '#6b7280' }}>Total outstanding:</span>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#A32D2D' }}>
                {fmtPKR(withBalance.reduce((s, r) => s + r.outstanding, 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
