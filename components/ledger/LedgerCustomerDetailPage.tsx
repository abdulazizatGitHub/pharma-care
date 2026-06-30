'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PartyLedgerTable } from '@/components/ledger/PartyLedgerTable'
import { CustomerPaymentModal } from '@/components/ledger/CustomerPaymentModal'
import type { PartyLedgerLine } from '@/app/actions/ledger'

interface Props {
  customerId:    string
  customerName:  string
  phone:         string | null
  creditBalance: number  // denormalized from customers.credit_balance
  lines:         PartyLedgerLine[]
  dateFrom:      string
  dateTo:        string
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtDisplay(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function LedgerCustomerDetailPage({
  customerId,
  customerName,
  phone,
  creditBalance,
  lines,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter()
  const [collectOpen, setCollectOpen] = useState(false)
  const [localFrom,   setLocalFrom]   = useState(dateFrom)
  const [localTo,     setLocalTo]     = useState(dateTo)

  useEffect(() => {
    setLocalFrom(dateFrom)
    setLocalTo(dateTo)
  }, [dateFrom, dateTo])

  const isShowAll = dateFrom === '' && dateTo === ''

  // Use credit_balance from customers table (denormalized, more reliable for display)
  const owesUs = Number(creditBalance)

  function applyFilter() {
    const params = new URLSearchParams()
    if (localFrom) params.set('from', localFrom)
    if (localTo)   params.set('to',   localTo)
    router.push('?' + params.toString())
  }

  function showAll() {
    router.push('?from=&to=')
  }

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
          marginBottom: 12,
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

      {/* Date-range filter bar */}
      <div style={{
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.08)',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginRight: 4 }}>Period:</span>
        <input
          type="date"
          value={localFrom}
          onChange={e => setLocalFrom(e.target.value)}
          style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
        <input
          type="date"
          value={localTo}
          onChange={e => setLocalTo(e.target.value)}
          style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <button
          onClick={applyFilter}
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Apply
        </button>
        <button
          onClick={showAll}
          style={{ padding: '5px 10px', fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}
        >
          Show All
        </button>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
          {isShowAll
            ? 'Showing all transactions'
            : `Showing transactions from ${fmtDisplay(dateFrom)} to ${fmtDisplay(dateTo)}`}
        </span>
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
