'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { BorrowingTransactionModal } from '@/components/ledger/BorrowingTransactionModal'
import { AddBorrowingPharmacyModal } from '@/components/ledger/AddBorrowingPharmacyModal'
import { DailyBorrowingReport } from '@/components/borrowing/DailyBorrowingReport'
import { getDailyBorrowingReport } from '@/app/actions/borrowing'
import type { BorrowingPharmacy } from '@/lib/db-types'
import type { DailyBorrowingReport as ReportData } from '@/app/actions/borrowing'

interface Props {
  pharmacies: BorrowingPharmacy[]
}

const fmt = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function BalanceLabel({ balance }: { balance: number }) {
  if (balance > 0.005)
    return <span style={{ color: '#0F6E56', fontSize: 12, fontWeight: 500 }}>They owe us {fmt(balance)}</span>
  if (balance < -0.005)
    return <span style={{ color: '#854F0B', fontSize: 12, fontWeight: 500 }}>We owe {fmt(balance)}</span>
  return <span style={{ color: '#9ca3af', fontSize: 12 }}>Settled</span>
}

export function LedgerBorrowingListPage({ pharmacies }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [addOpen,      setAddOpen]      = useState(false)
  const [txPharmacy,   setTxPharmacy]   = useState<BorrowingPharmacy | null>(null)
  const [reportDate,   setReportDate]   = useState(today)
  const [reportOpen,   setReportOpen]   = useState(false)
  const [reportData,   setReportData]   = useState<ReportData | null>(null)
  const [loadingRpt,   setLoadingRpt]   = useState(false)
  const [reportError,  setReportError]  = useState<string | null>(null)

  async function handleViewReport() {
    setLoadingRpt(true)
    setReportError(null)
    setReportData(null)
    const res = await getDailyBorrowingReport(reportDate)
    setLoadingRpt(false)
    if (res.error) { setReportError(res.error); return }
    setReportData(res.data)
    setReportOpen(true)
  }

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title="Borrowing Pharmacies"
        description="Medicine borrowing and settlement with neighbouring pharmacies"
        actions={
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
          >
            Add Pharmacy
          </Button>
        }
      />

      {/* Date picker + View Daily Report */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <input
          type="date"
          value={reportDate}
          max={today}
          onChange={e => setReportDate(e.target.value)}
          style={{
            height: 34, padding: '0 10px', fontSize: 12,
            border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6,
            color: '#111827',
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleViewReport}
          disabled={loadingRpt}
        >
          {loadingRpt ? 'Loading…' : 'View Daily Report'}
        </Button>
        {reportError && <span style={{ fontSize: 11, color: '#dc2626' }}>⚠ {reportError}</span>}
      </div>

      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {pharmacies.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No borrowing pharmacies added yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#f9fafb' }}>
                {['Pharmacy', 'Contact', 'Balance', 'Status', 'Actions'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                      textAlign: 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pharmacies.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#111827' }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>
                    {p.contact_person ?? p.phone ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <BalanceLabel balance={Number(p.current_balance)} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: p.is_active ? '#E1F5EE' : '#f3f4f6',
                        color:      p.is_active ? '#0F6E56' : '#6b7280',
                      }}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href={`/superadmin/ledger/borrowing/${p.id}`}>
                        <Button variant="secondary" size="sm">View</Button>
                      </Link>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setTxPharmacy(p)}
                        disabled={!p.is_active}
                      >
                        New Transaction
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddBorrowingPharmacyModal open={addOpen} onClose={() => setAddOpen(false)} />

      {txPharmacy && (
        <BorrowingTransactionModal
          pharmacyId={txPharmacy.id}
          pharmacyName={txPharmacy.name}
          open={!!txPharmacy}
          onClose={() => setTxPharmacy(null)}
        />
      )}

      {/* Daily Report Modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Daily Borrowing Report — ${reportDate}`} size="lg">
        {reportData && (
          <DailyBorrowingReport date={reportDate} data={reportData} />
        )}
      </Modal>
    </div>
  )
}
