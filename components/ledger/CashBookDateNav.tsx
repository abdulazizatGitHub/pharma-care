'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

interface Props {
  from:     string  // YYYY-MM-DD
  to:       string  // YYYY-MM-DD
  basePath: string  // e.g. '/superadmin/ledger/cashbook'
}

export function CashBookDateNav({ from, to, basePath }: Props) {
  const router  = useRouter()
  const [fromVal, setFromVal] = useState(from)
  const [toVal,   setToVal]   = useState(to)

  const today = new Date().toISOString().split('T')[0]

  function apply() {
    router.push(`${basePath}?from=${fromVal}&to=${toVal}`)
  }

  function setToday() {
    setFromVal(today)
    setToVal(today)
    router.push(`${basePath}?from=${today}&to=${today}`)
  }

  const inputStyle: React.CSSProperties = {
    height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6,
    border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
    background: '#fff', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: '#6b7280',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={labelStyle}>From</span>
        <input
          type="date"
          value={fromVal}
          max={toVal}
          onChange={e => setFromVal(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={labelStyle}>To</span>
        <input
          type="date"
          value={toVal}
          min={fromVal}
          max={today}
          onChange={e => setToVal(e.target.value)}
          style={inputStyle}
        />
      </div>
      <Button variant="secondary" size="sm" onClick={setToday}>Today</Button>
      <Button size="sm" onClick={apply}>Apply</Button>
    </div>
  )
}
