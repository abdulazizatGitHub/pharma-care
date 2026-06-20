'use client'

import React from 'react'

export interface DateRange {
  from:   string
  to:     string
  preset: string
}

const PRESETS = [
  'Today', 'Yesterday', 'This Week', 'Last Week',
  'This Month', 'Last Month', 'This Quarter',
  'Last Quarter', 'This Year', 'Last Year', 'Custom',
] as const

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function getPresetRange(preset: string): { from: string; to: string } {
  const now   = new Date()
  const today = toISO(now)

  switch (preset) {
    case 'Today':
      return { from: today, to: today }

    case 'Yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const ys = toISO(y)
      return { from: ys, to: ys }
    }

    case 'This Week': {
      const dow  = now.getDay()
      const diff = dow === 0 ? -6 : 1 - dow  // offset to Monday
      const mon  = new Date(now)
      mon.setDate(now.getDate() + diff)
      return { from: toISO(mon), to: today }
    }

    case 'Last Week': {
      const dow     = now.getDay()
      const diff    = dow === 0 ? -6 : 1 - dow
      const thisMon = new Date(now)
      thisMon.setDate(now.getDate() + diff)
      const lastMon = new Date(thisMon)
      lastMon.setDate(thisMon.getDate() - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastMon.getDate() + 6)
      return { from: toISO(lastMon), to: toISO(lastSun) }
    }

    case 'This Month':
      return {
        from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
        to:   today,
      }

    case 'Last Month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const le = new Date(now.getFullYear(), now.getMonth(),     0)
      return { from: toISO(lm), to: toISO(le) }
    }

    case 'This Quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3
      return {
        from: toISO(new Date(now.getFullYear(), qStart, 1)),
        to:   today,
      }
    }

    case 'Last Quarter': {
      const curQ    = Math.floor(now.getMonth() / 3)
      const lqStart = curQ === 0 ? 9 : (curQ - 1) * 3
      const lqYear  = curQ === 0 ? now.getFullYear() - 1 : now.getFullYear()
      return {
        from: toISO(new Date(lqYear, lqStart,     1)),
        to:   toISO(new Date(lqYear, lqStart + 3, 0)),
      }
    }

    case 'This Year':
      return {
        from: toISO(new Date(now.getFullYear(), 0,  1)),
        to:   today,
      }

    case 'Last Year':
      return {
        from: toISO(new Date(now.getFullYear() - 1, 0,  1)),
        to:   toISO(new Date(now.getFullYear() - 1, 11, 31)),
      }

    default:
      return { from: today, to: today }
  }
}

interface Props {
  value:    DateRange
  onChange: (range: DateRange) => void
}

export function DateRangeSelector({ value, onChange }: Props) {
  function handlePreset(preset: string) {
    if (preset === 'Custom') {
      onChange({ ...value, preset: 'Custom' })
      return
    }
    const { from, to } = getPresetRange(preset)
    onChange({ from, to, preset })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Preset buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESETS.map(preset => {
          const active = value.preset === preset
          return (
            <button
              key={preset}
              onClick={() => handlePreset(preset)}
              style={{
                height:      28,
                padding:     '0 10px',
                borderRadius: 6,
                border:      `1px solid ${active ? 'transparent' : 'rgba(0,0,0,0.12)'}`,
                background:  active ? '#0D9488' : '#f9fafb',
                color:       active ? '#fff'    : '#374151',
                fontSize:    11,
                fontWeight:  500,
                cursor:      'pointer',
                whiteSpace:  'nowrap',
                transition:  'all 0.1s ease',
              }}
            >
              {preset}
            </button>
          )
        })}
      </div>

      {/* Custom date range inputs */}
      {value.preset === 'Custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: '#6b7280' }}>From</label>
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={e => onChange({ ...value, from: e.target.value })}
            style={dateInputStyle}
          />
          <label style={{ fontSize: 11, color: '#6b7280' }}>To</label>
          <input
            type="date"
            value={value.to}
            min={value.from}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => onChange({ ...value, to: e.target.value })}
            style={dateInputStyle}
          />
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            {value.from} – {value.to}
          </span>
        </div>
      )}
    </div>
  )
}

const dateInputStyle: React.CSSProperties = {
  height:       30,
  padding:      '0 8px',
  fontSize:     12,
  borderRadius: 6,
  border:       '1px solid rgba(0,0,0,0.15)',
  color:        '#111827',
  outline:      'none',
  background:   '#fff',
}
