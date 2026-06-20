'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  date:     string  // YYYY-MM-DD
  basePath: string  // e.g. '/superadmin/ledger/cashbook'
}

export function CashBookDateNav({ date, basePath }: Props) {
  const router = useRouter()

  function shift(days: number) {
    const d = new Date(date + 'T00:00:00')  // local midnight parse
    d.setDate(d.getDate() + days)
    const newDate = d.toISOString().split('T')[0]
    router.push(`${basePath}?date=${newDate}`)
  }

  const isToday = date === new Date().toISOString().split('T')[0]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => shift(-1)}
        aria-label="Previous day"
      >
        <ChevronLeft size={14} />
      </Button>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#111827',
          minWidth: 110,
          textAlign: 'center',
          display: 'inline-block',
        }}
      >
        {date}
        {isToday && (
          <span style={{ marginLeft: 4, fontSize: 10, color: '#0F6E56', fontWeight: 400 }}>
            (today)
          </span>
        )}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => shift(1)}
        disabled={isToday}
        aria-label="Next day"
      >
        <ChevronRight size={14} />
      </Button>
    </div>
  )
}
