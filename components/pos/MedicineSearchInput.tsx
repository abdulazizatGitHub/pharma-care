'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value:             string
  onChange:          (query: string) => void
  onBarcodeDetected: (barcode: string) => void
  inputRef?:         React.RefObject<HTMLInputElement | null>
  onKeyDown?:        (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function MedicineSearchInput({ value, onChange, onBarcodeDetected, inputRef: externalRef, onKeyDown: externalKeyDown }: Props) {
  const internalRef = useRef<HTMLInputElement>(null)
  const ref = externalRef ?? internalRef

  const lastKeyTime     = useRef<number>(0)
  const keystrokeBuffer = useRef<string>('')
  const barcodeTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-focus on mount
  useEffect(() => { ref.current?.focus() }, [ref])

  // '/' re-focuses from anywhere
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== ref.current) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [ref])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onChange('')
      return
    }

    if (e.key.length !== 1) return   // skip non-printable

    const now   = Date.now()
    const delta = now - lastKeyTime.current
    lastKeyTime.current = now

    if (delta < 50) {
      // Fast input — scanner
      keystrokeBuffer.current += e.key
      if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
      barcodeTimer.current = setTimeout(() => {
        if (keystrokeBuffer.current.length >= 4) {
          onBarcodeDetected(keystrokeBuffer.current)
          onChange('')
        }
        keystrokeBuffer.current = ''
      }, 100)
    } else {
      keystrokeBuffer.current = e.key
    }
  }, [onChange, onBarcodeDetected])

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { externalKeyDown?.(e); handleKeyDown(e) }}
        placeholder="Search medicine name, code, or scan barcode…"
        data-pos-search="true"
        tabIndex={-1}
        className="w-full h-10 pl-9 pr-8 rounded-lg border border-[rgba(0,0,0,0.15)] text-[13px] text-[#111827] placeholder:text-[#9ca3af] bg-white focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent"
        autoComplete="off"
      />
      {value && (
        <button
          onClick={() => { onChange(''); ref.current?.focus() }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
          tabIndex={-1}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
