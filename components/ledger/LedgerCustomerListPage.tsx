'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { CustomerPaymentModal } from '@/components/ledger/CustomerPaymentModal'
import type { Customer } from '@/lib/db-types'

interface Props {
  customers: Customer[]
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LedgerCustomerListPage({ customers }: Props) {
  const [collectingFrom, setCollectingFrom] = useState<Customer | null>(null)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title="Customer Ledger (Accounts Receivable)"
        description="Outstanding udhaar balances owed by customers"
      />

      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {customers.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No outstanding customer balances.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {['Customer', 'Phone', 'Owes Us', 'Actions'].map((h, i) => (
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
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>
                    {c.phone ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'monospace',
                        color: '#0F6E56',
                      }}
                    >
                      {fmt(Number(c.credit_balance))}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href={`/superadmin/ledger/customers/${c.id}`}>
                        <Button variant="secondary" size="sm">View Ledger</Button>
                      </Link>
                      {Number(c.credit_balance) > 0.005 && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setCollectingFrom(c)}
                        >
                          Collect Payment
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

      {collectingFrom && (
        <CustomerPaymentModal
          customerId={collectingFrom.id}
          customerName={collectingFrom.name}
          maxAmount={Number(collectingFrom.credit_balance)}
          open={!!collectingFrom}
          onClose={() => setCollectingFrom(null)}
        />
      )}
    </div>
  )
}
