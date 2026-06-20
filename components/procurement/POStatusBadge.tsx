import React from 'react'
import type { POStatus } from '@/lib/db-types'

const CONFIG: Record<POStatus, { label: string; bg: string; color: string }> = {
  draft:            { label: 'Draft',            bg: '#f3f4f6', color: '#374151' },
  pending_approval: { label: 'Pending Approval', bg: '#FAEEDA', color: '#854F0B' },
  confirmed:        { label: 'Confirmed',        bg: '#E6F1FB', color: '#185FA5' },
  received:         { label: 'Received',         bg: '#E1F5EE', color: '#0F6E56' },
  cancelled:        { label: 'Cancelled',        bg: '#FCEBEB', color: '#A32D2D' },
}

interface POStatusBadgeProps {
  status: POStatus
  size?: 'sm' | 'md'
}

export function POStatusBadge({ status, size = 'sm' }: POStatusBadgeProps) {
  const { label, bg, color } = CONFIG[status]
  return (
    <span
      className="inline-flex items-center rounded-full font-medium"
      style={{
        background:  bg,
        color,
        fontSize:    size === 'sm' ? 10 : 12,
        padding:     size === 'sm' ? '2px 8px' : '3px 10px',
        whiteSpace:  'nowrap',
      }}
    >
      {label}
    </span>
  )
}
