'use client'

import React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DailyBorrowingReport as ReportData } from '@/app/actions/borrowing'

const fmt = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TX_LABELS: Record<string, string> = {
  borrow_in:   'Borrow In',
  borrow_out:  'Borrow Out',
  payment_in:  'Payment In',
  payment_out: 'Payment Out',
}

const TX_COLORS: Record<string, string> = {
  borrow_in:   '#854F0B',
  borrow_out:  '#185FA5',
  payment_in:  '#0F6E56',
  payment_out: '#A32D2D',
}

interface Props {
  date: string
  data: ReportData
}

export function DailyBorrowingReport({ date, data }: Props) {
  const borrowed = data.pharmacies.filter(p => p.borrowedTotal > 0)
  const lent     = data.pharmacies.filter(p => p.lentTotal > 0)

  return (
    <div>
      {/* Print button — hidden in print */}
      <div className="no-print flex justify-end mb-4">
        <Button icon={<Printer size={14} />} variant="secondary" onClick={() => window.print()}>
          Print Report
        </Button>
      </div>

      <div
        id="borrowing-report-printable"
        style={{ fontFamily: 'monospace', fontSize: 12, color: '#111827' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111827', paddingBottom: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>PharmaCare — Borrowing Report</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
            Date: {new Date(date).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Borrowed From Others */}
        <Section title="BORROWED FROM OTHERS" accent="#854F0B">
          {borrowed.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 11, margin: '4px 0 8px' }}>No borrowing activity</p>
          ) : borrowed.map(p => (
            <PharmacyBlock key={p.pharmacyId} group={p} showType="borrow_in" />
          ))}
          <TotalRow label="Total borrowed today" amount={data.totalBorrowedToday} />
        </Section>

        {/* Lent to Others */}
        <Section title="LENT TO OTHERS" accent="#185FA5">
          {lent.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 11, margin: '4px 0 8px' }}>No lending activity</p>
          ) : lent.map(p => (
            <PharmacyBlock key={p.pharmacyId} group={p} showType="borrow_out" />
          ))}
          <TotalRow label="Total lent today" amount={data.totalLentToday} />
        </Section>

        {/* Net Today */}
        <div style={{ borderTop: '2px solid #111827', paddingTop: 10, marginTop: 16 }}>
          <NetRow
            label="Net Today"
            net={data.netToday}
            positive="We lent more than we borrowed"
            negative="We borrowed more than we lent"
          />
        </div>

        {/* Running Balances */}
        {data.pharmacies.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid #d1d5db', paddingTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, color: '#6b7280' }}>
              Running Balances
            </p>
            {data.pharmacies.map(p => {
              const bal = p.currentBalance
              return (
                <div key={p.pharmacyId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{p.pharmacyName}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: bal > 0.005 ? '#0F6E56' : bal < -0.005 ? '#854F0B' : '#6b7280' }}>
                    {Math.abs(bal) < 0.005 ? 'Settled' : `${fmt(bal)} ${bal > 0 ? '(they owe us)' : '(we owe them)'}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 20, textAlign: 'center' }}>
          Generated {new Date().toLocaleString('en-PK')}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #borrowing-report-printable, #borrowing-report-printable * { visibility: visible; }
          #borrowing-report-printable { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent, borderBottom: `1px solid ${accent}40`, paddingBottom: 4, marginBottom: 8 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function PharmacyBlock({ group, showType }: { group: import('@/app/actions/borrowing').DailyBorrowPharmacyGroup; showType: string }) {
  const relevant = group.transactions.filter(tx => tx.transactionType === showType)
  if (relevant.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{group.pharmacyName}</p>
      {relevant.map(tx => (
        <div key={tx.transactionId} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 12, marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {tx.medicineName ?? '—'}
            {tx.quantity != null ? ` × ${tx.quantity}` : ''}
            {tx.saleReceiptNo ? ` [${tx.saleReceiptNo}]` : ''}
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: TX_COLORS[tx.transactionType] }}>
            {fmt(tx.totalAmount)}
          </span>
        </div>
      ))}
    </div>
  )
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 12, borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 4 }}>
      <span>{label}</span>
      <span>{fmt(amount)}</span>
    </div>
  )
}

function NetRow({ label, net, positive, negative }: { label: string; net: number; positive: string; negative: string }) {
  const color = net > 0.005 ? '#185FA5' : net < -0.005 ? '#854F0B' : '#6b7280'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#9ca3af', margin: '2px 0 0' }}>
          {net > 0.005 ? positive : net < -0.005 ? negative : 'Balanced'}
        </p>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {Math.abs(net) < 0.005 ? '—' : `${net > 0 ? '+' : '−'}${fmt(net)}`}
      </span>
    </div>
  )
}
