'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { ShiftStatusBanner } from './ShiftStatusBanner'
import { ShiftHistoryTable } from './ShiftHistoryTable'
import { ShiftDetailPanel } from './ShiftDetailPanel'
import { DailyBorrowingReport } from '@/components/borrowing/DailyBorrowingReport'
import { getDailyBorrowingReport } from '@/app/actions/borrowing'
import type { ShiftRow } from '@/app/actions/shifts'
import type { DailyBorrowingReport as ReportData } from '@/app/actions/borrowing'

interface Props {
  initialShift:   ShiftRow | null
  initialHistory: ShiftRow[]
  currentPage:    number
  totalCount:     number
  pageSize:       number
}

export function PharmacistShiftsContent({
  initialShift,
  initialHistory,
  currentPage,
  totalCount,
  pageSize,
}: Props) {
  const router = useRouter()

  const [selectedShift, setSelectedShift] = useState<ShiftRow | null>(null)
  const [reportOpen,    setReportOpen]    = useState(false)
  const [reportData,    setReportData]    = useState<ReportData | null>(null)
  const [loadingRpt,    setLoadingRpt]    = useState(false)

  const totalPages = Math.ceil(totalCount / pageSize)

  async function handlePrintReport() {
    const today = new Date().toISOString().split('T')[0]
    setLoadingRpt(true)
    const res = await getDailyBorrowingReport(today)
    setLoadingRpt(false)
    if (res.data) {
      setReportData(res.data)
      setReportOpen(true)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="My Shifts"
        description="Manage your shift — open, close, and review shift history."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={13} />}
            onClick={handlePrintReport}
            disabled={loadingRpt}
          >
            {loadingRpt ? 'Loading…' : "Today's Borrowing Report"}
          </Button>
        }
      />

      <ShiftStatusBanner initialShift={initialShift} />

      <div style={{
        background: '#fff', borderRadius: 8,
        border: '1px solid #e5e7eb',
        padding: '0 0 4px',
        marginTop: 4,
      }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>Shift History</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Click a row to view full details</p>
        </div>
        <ShiftHistoryTable
          shifts={initialHistory}
          showName={false}
          onSelect={setSelectedShift}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={n => router.push('?page=' + (n === 1 ? '' : n))}
          className="px-4 py-3 border-t border-gray-100"
        />
      </div>

      <ShiftDetailPanel
        shift={selectedShift}
        onClose={() => setSelectedShift(null)}
      />

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Borrowing Report — ${new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        size="lg"
      >
        {reportData && (
          <DailyBorrowingReport date={new Date().toISOString().split('T')[0]} data={reportData} />
        )}
      </Modal>
    </div>
  )
}
