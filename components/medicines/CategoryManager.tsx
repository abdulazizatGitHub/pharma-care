'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PAGE, TEXT } from '@/lib/design-tokens'
import {
  createCategory,
  createSubcategory,
  updateCategory,
  updateSubcategory,
  deleteCategory,
  deleteSubcategory,
} from '@/app/actions/medicines'
import type { MedicineCategory, MedicineSubcategory } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryManagerProps {
  categories:    MedicineCategory[]
  subcategories: MedicineSubcategory[]
  onClose:       () => void
}

type EditTarget = { type: 'category' | 'subcategory'; id: string; currentName: string }

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryManager({ categories, subcategories, onClose }: CategoryManagerProps) {
  const router = useRouter()
  const [selectedCatId,  setSelectedCatId]  = useState<string>(categories[0]?.id ?? '')
  const [editTarget,     setEditTarget]     = useState<EditTarget | null>(null)
  const [editName,       setEditName]       = useState('')
  const [newCatName,     setNewCatName]     = useState('')
  const [newSubName,     setNewSubName]     = useState('')
  const [addingCat,      setAddingCat]      = useState(false)
  const [addingSub,      setAddingSub]      = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [isPending,      startTransition]   = useTransition()

  const selectedCat  = categories.find(c => c.id === selectedCatId)
  const filteredSubs = subcategories.filter(s => s.category_id === selectedCatId)

  function startEdit(type: 'category' | 'subcategory', id: string, name: string) {
    setEditTarget({ type, id, currentName: name })
    setEditName(name)
    setError(null)
  }

  function cancelEdit() {
    setEditTarget(null)
    setEditName('')
    setError(null)
  }

  function handleSaveEdit() {
    if (!editTarget) return
    setError(null)
    startTransition(async () => {
      const result = editTarget.type === 'category'
        ? await updateCategory(editTarget.id, editName)
        : await updateSubcategory(editTarget.id, editName)
      if (result.error) { setError(result.error); return }
      router.refresh()
      cancelEdit()
    })
  }

  function handleDelete(type: 'category' | 'subcategory', id: string) {
    setError(null)
    startTransition(async () => {
      const result = type === 'category'
        ? await deleteCategory(id)
        : await deleteSubcategory(id)
      if (result.error) { setError(result.error); return }
      if (type === 'category' && id === selectedCatId) {
        setSelectedCatId(categories.find(c => c.id !== id)?.id ?? '')
      }
      router.refresh()
    })
  }

  function handleAddCategory() {
    if (!newCatName.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createCategory(newCatName)
      if (result.error) { setError(result.error); return }
      setNewCatName('')
      setAddingCat(false)
      router.refresh()
    })
  }

  function handleAddSubcategory() {
    if (!newSubName.trim() || !selectedCatId) return
    setError(null)
    startTransition(async () => {
      const result = await createSubcategory(newSubName, selectedCatId)
      if (result.error) { setError(result.error); return }
      setNewSubName('')
      setAddingSub(false)
      router.refresh()
    })
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 12,
    color: TEXT.primary,
    cursor: 'pointer',
    transition: 'background 0.1s',
  }

  const iconBtn = (onClick: () => void, title: string, color?: string) => (
    <button
      onClick={onClick}
      title={title}
      disabled={isPending}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: color ?? TEXT.secondary, display: 'flex', alignItems: 'center' }}
    >
      {title === 'Rename' ? <Pencil size={12} /> : <Trash2 size={12} />}
    </button>
  )

  return (
    <Modal open title="Manage Categories" onClose={onClose} size="lg">
      {error && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 320 }}>
        {/* Left — Categories */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: TEXT.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Categories
          </p>
          <div style={{ border: `1px solid ${PAGE.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {categories.map(cat => (
              <div
                key={cat.id}
                onClick={() => { if (!editTarget) setSelectedCatId(cat.id) }}
                style={{
                  ...rowStyle,
                  background: cat.id === selectedCatId ? '#E1F5EE' : 'transparent',
                  borderBottom: `1px solid ${PAGE.border}`,
                }}
              >
                {editTarget?.type === 'category' && editTarget.id === cat.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit() }}
                      style={{ flex: 1, height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
                      onClick={e => e.stopPropagation()}
                    />
                    <button onClick={handleSaveEdit} disabled={isPending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F6E56', display: 'flex', alignItems: 'center', padding: 2 }} title="Save">
                      <Check size={12} />
                    </button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT.secondary, display: 'flex', alignItems: 'center', padding: 2 }} title="Cancel">
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.name}
                    </span>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {iconBtn(() => startEdit('category', cat.id, cat.name), 'Rename')}
                      {iconBtn(() => handleDelete('category', cat.id), 'Delete', '#A32D2D')}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add category row */}
            {addingCat ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                <input
                  autoFocus
                  placeholder="Category name"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                  style={{ flex: 1, height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
                />
                <button onClick={handleAddCategory} disabled={isPending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F6E56', display: 'flex', alignItems: 'center', padding: 2 }} title="Save">
                  <Check size={12} />
                </button>
                <button onClick={() => { setAddingCat(false); setNewCatName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT.secondary, display: 'flex', alignItems: 'center', padding: 2 }} title="Cancel">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setAddingCat(true); setError(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0F6E56' }}
              >
                <Plus size={12} /> Add Category
              </button>
            )}
          </div>
        </div>

        {/* Right — Subcategories */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: TEXT.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Subcategories {selectedCat ? `— ${selectedCat.name}` : ''}
          </p>
          <div style={{ border: `1px solid ${PAGE.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {!selectedCatId && (
              <p style={{ padding: '12px 8px', fontSize: 12, color: TEXT.secondary }}>Select a category first</p>
            )}
            {filteredSubs.map(sub => (
              <div
                key={sub.id}
                style={{ ...rowStyle, borderBottom: `1px solid ${PAGE.border}` }}
              >
                {editTarget?.type === 'subcategory' && editTarget.id === sub.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit() }}
                      style={{ flex: 1, height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
                    />
                    <button onClick={handleSaveEdit} disabled={isPending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F6E56', display: 'flex', alignItems: 'center', padding: 2 }} title="Save">
                      <Check size={12} />
                    </button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT.secondary, display: 'flex', alignItems: 'center', padding: 2 }} title="Cancel">
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.name}
                    </span>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      {iconBtn(() => startEdit('subcategory', sub.id, sub.name), 'Rename')}
                      {iconBtn(() => handleDelete('subcategory', sub.id), 'Delete', '#A32D2D')}
                    </div>
                  </>
                )}
              </div>
            ))}
            {selectedCatId && filteredSubs.length === 0 && !addingSub && (
              <p style={{ padding: '12px 8px', fontSize: 12, color: TEXT.secondary }}>No subcategories yet</p>
            )}

            {/* Add subcategory row */}
            {selectedCatId && (
              addingSub ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                  <input
                    autoFocus
                    placeholder="Subcategory name"
                    value={newSubName}
                    onChange={e => setNewSubName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubcategory(); if (e.key === 'Escape') { setAddingSub(false); setNewSubName('') } }}
                    style={{ flex: 1, height: 24, fontSize: 12, padding: '0 6px', border: `1px solid #0F6E56`, borderRadius: 4, outline: 'none' }}
                  />
                  <button onClick={handleAddSubcategory} disabled={isPending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F6E56', display: 'flex', alignItems: 'center', padding: 2 }} title="Save">
                    <Check size={12} />
                  </button>
                  <button onClick={() => { setAddingSub(false); setNewSubName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT.secondary, display: 'flex', alignItems: 'center', padding: 2 }} title="Cancel">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingSub(true); setError(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0F6E56' }}
                >
                  <Plus size={12} /> Add Subcategory
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)]">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
