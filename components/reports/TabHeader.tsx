'use client'

import React from 'react'

interface Props {
  title:       string
  description: string
  onExportCSV: (() => void) | null
  onExportPDF: (() => void) | null
  loading?:    boolean
}

const BTN: React.CSSProperties = {
  display:     'inline-flex',
  alignItems:  'center',
  gap:         5,
  height:      30,
  padding:     '0 12px',
  borderRadius: 6,
  fontSize:    11,
  fontWeight:  500,
  cursor:      'pointer',
  whiteSpace:  'nowrap',
}

export function TabHeader({ title, description, onExportCSV, onExportPDF, loading }: Props) {
  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      marginBottom:    16,
      gap:             12,
      flexWrap:        'wrap',
    }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{description}</p>
      </div>
      <div data-print-hide style={{ display: 'flex', gap: 8 }}>
        {onExportCSV && (
          <button
            onClick={onExportCSV}
            disabled={loading}
            style={{
              ...BTN,
              border:     '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              color:      '#374151',
              opacity:    loading ? 0.5 : 1,
            }}
          >
            ↓ Export CSV
          </button>
        )}
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            disabled={loading}
            style={{
              ...BTN,
              border:     '1px solid rgba(13,148,136,0.3)',
              background: 'rgba(13,148,136,0.06)',
              color:      '#0D9488',
              opacity:    loading ? 0.5 : 1,
            }}
          >
            ↓ Export PDF
          </button>
        )}
      </div>
    </div>
  )
}
