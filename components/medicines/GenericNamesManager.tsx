'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Check, X, ListPlus, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PAGE, TEXT } from '@/lib/design-tokens'
import {
  createGenericName,
  bulkCreateGenericNames,
  updateGenericName,
  deactivateGenericName,
} from '@/app/actions/medicines'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenericNameWithCount {
  id: string
  name: string
  medicine_count: number
}

interface GenericNamesManagerProps {
  genericNames: GenericNameWithCount[]
  onClose:      () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenericNamesManager({ genericNames, onClose }: GenericNamesManagerProps) {
  const router = useRouter()

  const [query,      setQuery]      = useState('')
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editName,   setEditName]   = useState('')
  const [addingNew,  setAddingNew]  = useState(false)
  const [newName,    setNewName]    = useState('')
  const [bulkOpen,   setBulkOpen]   = useState(false)
  const [bulkText,   setBulkText]   = useState('')
  const [bulkResult, setBulkResult] = useState<{ added: number; skipped: number } | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? genericNames.filter(g => g.name.toLowerCase().includes(q)) : genericNames
  }, [genericNames, query])

  // ── single add ──────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!newName.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createGenericName(newName)
      if (result.error) { setError(result.error); return }
      setNewName('')
      setAddingNew(false)
      router.refresh()
    })
  }

  // ── inline edit ─────────────────────────────────────────────────────────────

  function startEdit(id: string, name: string) {
    setEditId(id)
    setEditName(name)
    setError(null)
  }

  function cancelEdit() {
    setEditId(null)
    setEditName('')
    setError(null)
  }

  function handleSaveEdit() {
    if (!editId) return
    setError(null)
    startTransition(async () => {
      const result = await updateGenericName(editId, editName)
      if (result.error) { setError(result.error); return }
      router.refresh()
      cancelEdit()
    })
  }

  // ── deactivate ──────────────────────────────────────────────────────────────

  function handleDeactivate(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateGenericName(id)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  // ── bulk add ────────────────────────────────────────────────────────────────

  function handleBulkAdd() {
    const names = bulkText.split('\n')
    if (!names.some(n => n.trim())) return
    setBulkResult(null)
    setError(null)
    startTransition(async () => {
      const result = await bulkCreateGenericNames(names)
      if (result.error) { setError(result.error); return }
      setBulkResult({ added: result.added, skipped: result.skipped })
      setBulkText('')
      router.refresh()
    })
  }

  // ── styles ──────────────────────────────────────────────────────────────────

  const iconBtn = (
    onClick: () => void,
    title: string,
    icon: React.ReactNode,
    color?: string,
    disabled?: boolean,
  ) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled || isPending}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 2, color: disabled ? '#d1d5db' : (color ?? TEXT.secondary),
        display: 'flex', alignItems: 'center', opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
    </button>
  )

  return (
    <>
      <Modal open title="Manage Generic Names" onClose={onClose} size="lg">
        {error && (
          <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
            {error}
          </p>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
            <input
              type="text"
              placeholder="Search generic names…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-8 w-full rounded-md pl-7 pr-2.5 text-[12px] text-[#111827] placeholder:text-[#9ca3af] bg-white border border-[rgba(0,0,0,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<ListPlus size={13} />}
            onClick={() => { setBulkOpen(true); setBulkResult(null); setError(null) }}
          >
            Bulk Add
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={13} />}
            onClick={() => { setAddingNew(true); setError(null) }}
          >
            Add Generic Name
          </Button>
        </div>

        {/* List */}
        <div style={{ border: `1px solid ${PAGE.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 80px',
            padding: '6px 10px',
            background: '#f9fafb',
            borderBottom: `1px solid ${PAGE.border}`,
            fontSize: 11, fontWeight: 600, color: TEXT.secondary, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <span>Name</span>
            <span style={{ textAlign: 'center' }}>Medicines Using</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {/* Add new row (inline) */}
          {addingNew && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 130px 80px',
              alignItems: 'center', padding: '5px 10px',
              background: '#f0fdf4', borderBottom: `1px solid ${PAGE.border}`,
            }}>
              <input
                autoFocus
                placeholder="Generic name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddingNew(false); setNewName('') } }}
                style={{ height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
              />
              <span />
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {iconBtn(handleAdd, 'Save', <Check size={12} />, '#0F6E56')}
                {iconBtn(() => { setAddingNew(false); setNewName('') }, 'Cancel', <X size={12} />)}
              </div>
            </div>
          )}

          {/* Rows */}
          {filtered.length === 0 && !addingNew && (
            <p style={{ padding: '20px 10px', fontSize: 12, color: TEXT.secondary, textAlign: 'center' }}>
              {query ? 'No results for your search' : 'No generic names yet'}
            </p>
          )}
          {filtered.map(g => (
            <div
              key={g.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 130px 80px',
                alignItems: 'center', padding: '6px 10px',
                borderBottom: `1px solid ${PAGE.border}`,
                fontSize: 12, color: TEXT.primary,
              }}
            >
              {/* Name / inline edit */}
              {editId === g.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit() }}
                  style={{ height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
                />
              ) : (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
              )}

              {/* Usage count */}
              <span style={{ textAlign: 'center', color: g.medicine_count > 0 ? TEXT.primary : TEXT.secondary }}>
                {g.medicine_count > 0
                  ? <span style={{ fontWeight: 500 }}>{g.medicine_count}</span>
                  : <span style={{ fontSize: 11 }}>—</span>
                }
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {editId === g.id ? (
                  <>
                    {iconBtn(handleSaveEdit, 'Save', <Check size={12} />, '#0F6E56')}
                    {iconBtn(cancelEdit, 'Cancel', <X size={12} />)}
                  </>
                ) : (
                  <>
                    {iconBtn(() => startEdit(g.id, g.name), 'Edit', <Pencil size={12} />)}
                    <span
                      title={g.medicine_count > 0 ? `${g.medicine_count} medicine${g.medicine_count === 1 ? '' : 's'} use this name` : undefined}
                    >
                      {iconBtn(
                        () => handleDeactivate(g.id),
                        g.medicine_count > 0 ? `${g.medicine_count} medicines use this name` : 'Deactivate',
                        <X size={12} />,
                        '#A32D2D',
                        g.medicine_count > 0,
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)]">
          <span style={{ fontSize: 11, color: TEXT.secondary }}>
            {genericNames.length} generic name{genericNames.length !== 1 ? 's' : ''} total
            {query && ` · ${filtered.length} matching`}
          </span>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal>

      {/* Bulk Add overlay (z-50 sits above the parent modal at z-40) */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setBulkOpen(false) }}
        >
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[rgba(0,0,0,0.08)]">
              <h3 className="text-[14px] font-medium text-[#111827]">Bulk Add Generic Names</h3>
              <button
                onClick={() => setBulkOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#6b7280] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12px] text-[#6b7280]">Enter generic names, one per line:</p>
              <textarea
                autoFocus
                rows={10}
                value={bulkText}
                onChange={e => { setBulkText(e.target.value); setBulkResult(null) }}
                placeholder={'Paracetamol\nAmoxicillin\nIbuprofen\nMetformin\nOmeprazole\nCiprofloxacin'}
                className="w-full rounded-md px-2.5 py-2 text-[12px] text-[#111827] placeholder:text-[#9ca3af] bg-white border border-[rgba(0,0,0,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent resize-none font-mono"
              />
              {bulkResult && (
                <p className="text-[12px] text-[#0F6E56] bg-[#f0fdf4] border border-[#bbf7d0] rounded px-3 py-2">
                  Added <strong>{bulkResult.added}</strong> new name{bulkResult.added !== 1 ? 's' : ''}.
                  {bulkResult.skipped > 0 && <> <strong>{bulkResult.skipped}</strong> already existed.</>}
                </p>
              )}
              {error && (
                <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={isPending}
                onClick={handleBulkAdd}
                disabled={!bulkText.trim()}
              >
                Add All
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
