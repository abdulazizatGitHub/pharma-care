'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { SupplierPaymentModal } from '@/components/ledger/SupplierPaymentModal'

export interface SupplierBalance {
  id:          string
  name:        string
  phone:       string | null
  outstanding: number  // positive = we owe them
}

interface Props {
  suppliers: SupplierBalance[]
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LedgerSupplierListPage({ suppliers }: Props) {
  const [payingSupplier, setPayingSupplier] = useState<SupplierBalance | null>(null)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title="Supplier Ledger (Accounts Payable)"
        description="Outstanding balances owed to each supplier"
      />

      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {suppliers.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No suppliers found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {['Supplier', 'Phone', 'Outstanding (we owe)', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                      textAlign: i === 2 ? 'right' : 'left',
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
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>
                    {s.phone ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'monospace',
                        color: s.outstanding > 0.005 ? '#A32D2D' : '#6b7280',
                      }}
                    >
                      {s.outstanding > 0.005 ? fmt(s.outstanding) : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href={`/superadmin/ledger/suppliers/${s.id}`}>
                        <Button variant="secondary" size="sm">View Ledger</Button>
                      </Link>
                      {s.outstanding > 0.005 && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setPayingSupplier(s)}
                        >
                          Record Payment
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payingSupplier && (
        <SupplierPaymentModal
          supplierId={payingSupplier.id}
          supplierName={payingSupplier.name}
          open={!!payingSupplier}
          onClose={() => setPayingSupplier(null)}
        />
      )}
    </div>
  )
}
