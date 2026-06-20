'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PartyLedgerTable } from '@/components/ledger/PartyLedgerTable'
import { CustomerPaymentModal } from '@/components/ledger/CustomerPaymentModal'
import type { PartyLedgerLine } from '@/app/actions/ledger'

interface Props {
  customerId:     string
  customerName:   string
  phone:          string | null
  creditBalance:  number  // denormalized from customers.credit_balance
  lines:          PartyLedgerLine[]
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LedgerCustomerDetailPage({ customerId, customerName, phone, creditBalance, lines }: Props) {
  const [collectOpen, setCollectOpen] = useState(false)

  // Use credit_balance from customers table (denormalized, more reliable for display)
  const owesUs = Number(creditBalance)

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Back link */}
      <Link
        href="/superadmin/ledger/customers"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={13} /> Back to Customers
      </Link>

      {/* Header */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{customerName}</h1>
          {phone && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{phone}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Owes Us</p>
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: owesUs > 0.005 ? '#0F6E56' : '#6b7280',
                margin: 0,
                fontFamily: 'monospace',
              }}
            >
              {owesUs > 0.005 ? fmt(owesUs) : '—'}
            </p>
            {owesUs > 0.005 && (
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Outstanding udhaar</p>
            )}
          </div>
          {owesUs > 0.005 && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setCollectOpen(true)}
            >
              Collect Payment
            </Button>
          )}
        </div>
      </div>

      <PartyLedgerTable lines={lines} />

      <CustomerPaymentModal
        customerId={customerId}
        customerName={customerName}
        maxAmount={owesUs}
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
      />
    </div>
  )
}
