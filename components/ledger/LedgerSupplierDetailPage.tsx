'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PartyLedgerTable } from '@/components/ledger/PartyLedgerTable'
import { SupplierPaymentModal } from '@/components/ledger/SupplierPaymentModal'
import type { PartyLedgerLine } from '@/app/actions/ledger'

interface Props {
  supplierId:   string
  supplierName: string
  phone:        string | null
  lines:        PartyLedgerLine[]
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LedgerSupplierDetailPage({ supplierId, supplierName, phone, lines }: Props) {
  const [payOpen, setPayOpen] = useState(false)

  // Last line's running_balance: negative = we owe them (AP context)
  const lastBalance = lines.length > 0 ? Number(lines[lines.length - 1].running_balance) : 0
  const outstanding = -lastBalance  // positive = we owe them

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Back link */}
      <Link
        href="/superadmin/ledger/suppliers"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={13} /> Back to Suppliers
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
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{supplierName}</h1>
          {phone && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{phone}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Outstanding</p>
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: outstanding > 0.005 ? '#A32D2D' : '#6b7280',
                margin: 0,
                fontFamily: 'monospace',
              }}
            >
              {outstanding > 0.005 ? fmt(outstanding) : '—'}
            </p>
            {outstanding > 0.005 && (
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>We owe this supplier</p>
            )}
          </div>
          {outstanding > 0.005 && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setPayOpen(true)}
            >
              Record Payment
            </Button>
          )}
        </div>
      </div>

      <PartyLedgerTable lines={lines} />

      <SupplierPaymentModal
        supplierId={supplierId}
        supplierName={supplierName}
        open={payOpen}
        onClose={() => setPayOpen(false)}
      />
    </div>
  )
}
