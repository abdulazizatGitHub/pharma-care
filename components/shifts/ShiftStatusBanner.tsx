'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, AlertTriangle } from 'lucide-react'
import { OpenShiftModal } from './OpenShiftModal'
import { CloseShiftModal } from './CloseShiftModal'
import type { ShiftRow } from '@/app/actions/shifts'

function fmtPKR(n: number) {
  return 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

interface Props {
  initialShift: ShiftRow | null
  salesTotal?:  number
}

export function ShiftStatusBanner({ initialShift, salesTotal }: Props) {
  const router = useRouter()
  const [openModal,  setOpenModal]  = useState(false)
  const [closeModal, setCloseModal] = useState(false)

  function handleSuccess() {
    router.refresh()
  }

  if (initialShift) {
    const total = salesTotal ?? initialShift.sales_total ?? 0
    return (
      <>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderRadius: 8,
          background: '#f0fdf4', border: '1px solid #bbf7d0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={15} color="#16a34a" />
            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>
              Shift open since {fmtTime(initialShift.opened_at)}
              {total > 0 && <> · {fmtPKR(total)} in sales</>}
            </span>
          </div>
          <button
            onClick={() => setCloseModal(true)}
            style={{
              fontSize: 12, fontWeight: 600, color: '#15803d',
              background: 'rgba(22,163,74,0.1)', border: '1px solid #86efac',
              borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
            }}
          >
            Close Shift
          </button>
        </div>

        <CloseShiftModal
          open={closeModal}
          shift={initialShift}
          onClose={() => setCloseModal(false)}
          onSuccess={handleSuccess}
        />
      </>
    )
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderRadius: 8,
        background: '#fffbeb', border: '1px solid #fde68a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} color="#d97706" />
          <span style={{ fontSize: 13, color: '#b45309', fontWeight: 500 }}>
            No active shift — Open a shift to start selling
          </span>
        </div>
        <button
          onClick={() => setOpenModal(true)}
          style={{
            fontSize: 12, fontWeight: 600, color: '#92400e',
            background: 'rgba(217,119,6,0.1)', border: '1px solid #fcd34d',
            borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
          }}
        >
          Open Shift
        </button>
      </div>

      <OpenShiftModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onSuccess={handleSuccess}
      />
    </>
  )
}
