'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/pos-context'
import { useToast } from '@/components/ui/Toast'
import { BatchItemSelector } from '@/components/pos/BatchItemSelector'
import type { CartItem } from '@/lib/pos-types'

export default function CardRemoveFlow() {
  const { items, removeItem, addItem } = useCart()
  const { toast } = useToast()

  const [lastRemoved,        setLastRemoved]        = useState<CartItem | null>(null)
  const [undoTimer,          setUndoTimer]          = useState<ReturnType<typeof setTimeout> | null>(null)
  const [deleteSelectorOpen, setDeleteSelectorOpen] = useState(false)

  function doRemove(item: CartItem) {
    removeItem(item.id)
    setLastRemoved(item)
    if (undoTimer) clearTimeout(undoTimer)
    const timer = setTimeout(() => setLastRemoved(null), 5000)
    setUndoTimer(timer)
    toast(`${item.medicineName} removed — press Backspace to undo`, 'info')
  }

  function doUndo() {
    if (!lastRemoved) return
    addItem(lastRemoved)
    const name = lastRemoved.medicineName
    setLastRemoved(null)
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(null)
    toast(`${name} restored`, 'success')
  }

  useEffect(() => {
    return () => { if (undoTimer) clearTimeout(undoTimer) }
  }, [undoTimer])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const focused = document.activeElement
      const isInput = focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement

      if (e.key === 'Delete') {
        if (isInput) return
        e.preventDefault()
        const nonBorrowed = items.filter(i => !i.isBorrowed)
        if (nonBorrowed.length === 0) return
        if (nonBorrowed.length === 1) {
          doRemove(nonBorrowed[0])
          return
        }
        setDeleteSelectorOpen(true)
      }

      if (e.key === 'Backspace') {
        if (isInput) return
        if (lastRemoved) {
          e.preventDefault()
          doUndo()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items, lastRemoved, undoTimer])

  return (
    <>
      {deleteSelectorOpen && (
        <BatchItemSelector
          items={items.filter(i => !i.isBorrowed)}
          onSelect={(item) => {
            setDeleteSelectorOpen(false)
            doRemove(item)
          }}
          onClose={() => setDeleteSelectorOpen(false)}
          title="Remove Item"
          actionLabel="Remove"
        />
      )}
    </>
  )
}
