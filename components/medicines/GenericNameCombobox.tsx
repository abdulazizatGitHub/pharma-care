'use client'

import React, { useState, useRef, useEffect, useTransition } from 'react'
import { Plus, ChevronDown, Check } from 'lucide-react'
import { createGenericName } from '@/app/actions/medicines'

export interface GenericNameOption {
  id: string
  name: string
}

interface GenericNameComboboxProps {
  label?: string
  value: string
  onChange: (id: string, name: string) => void
  options: GenericNameOption[]
  canCreate?: boolean
}

export function GenericNameCombobox({
  label = 'Generic / salt name',
  value,
  onChange,
  options,
  canCreate = true,
}: GenericNameComboboxProps) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [creating, startCreate] = useTransition()
  const containerRef          = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  const selectedOption = options.find(o => o.id === value)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()),
  )
  const exactMatch = options.some(
    o => o.name.toLowerCase() === query.trim().toLowerCase(),
  )
  const showAdd = canCreate && query.trim().length > 0 && !exactMatch

  function handleSelect(opt: GenericNameOption) {
    onChange(opt.id, opt.name)
    setQuery('')
    setOpen(false)
  }

  function handleAdd() {
    const name = query.trim()
    if (!name) return
    startCreate(async () => {
      const result = await createGenericName(name)
      if (result.data) {
        onChange(result.data.id, result.data.name)
        setQuery('')
        setOpen(false)
      }
    })
  }

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
  }

  const displayValue = open ? query : (selectedOption?.name ?? '')

  return (
    <div ref={containerRef} className="flex flex-col gap-1 relative">
      <label className="text-[11px] font-medium text-[#6b7280]">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={handleFocus}
          onChange={handleChange}
          placeholder="Search or add generic name…"
          className="h-8 w-full rounded-md px-2.5 pr-7 text-[12px] text-[#111827] placeholder:text-[#9ca3af] bg-white border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent transition-colors duration-150"
        />
        <ChevronDown
          size={12}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-[rgba(0,0,0,0.12)] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 && !showAdd && (
            <p className="px-3 py-2 text-[12px] text-[#9ca3af]">No results</p>
          )}
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(opt)}
              className="w-full text-left px-3 py-2 text-[12px] text-[#111827] hover:bg-[#f3f4f6] flex items-center justify-between"
            >
              <span>{opt.name}</span>
              {opt.id === value && <Check size={12} className="text-[#0F6E56] shrink-0" />}
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={handleAdd}
              disabled={creating}
              className="w-full text-left px-3 py-2 text-[12px] text-[#0F6E56] hover:bg-[#f0fdf4] flex items-center gap-2 border-t border-[rgba(0,0,0,0.06)] disabled:opacity-60"
            >
              <Plus size={12} className="shrink-0" />
              {creating ? 'Adding…' : `Add "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
