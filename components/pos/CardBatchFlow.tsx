'use client'

import React, { useState, useEffect } from 'react'
import { BatchItemSelector } from '@/components/pos/BatchItemSelector'
import { BatchPicker }       from '@/components/pos/BatchPicker'
import { getBatchesForMedicine } from '@/app/actions/stock'
import { useCart } from '@/lib/pos-context'
import type { BatchForDropdown } from '@/app/actions/stock'
import type { CartItem } from '@/lib/pos-types'

interface Props {
  open:    boolean
  onClose: () => void
}

export default function CardBatchFlow({ open, onClose }: Props) {
  const { items, replaceItemBatch } = useCart()

  const [batchPickerItem,    setBatchPickerItem]    = useState<CartItem | null>(null)
  const [batchPickerBatches, setBatchPickerBatches] = useState<BatchForDropdown[]>([])
  const [batchPickerLoading, setBatchPickerLoading] = useState(false)

  const nonBorrowed = items.filter(i => !i.isBorrowed)

  // When open flips true, handle single-item shortcut or empty-cart guard
  useEffect(() => {
    if (!open) return
    if (nonBorrowed.length === 0) { onClose(); return }
    if (nonBorrowed.length === 1) { handleChangeBatch(nonBorrowed[0]) }
    // length > 1: BatchItemSelector is shown via render below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleChangeBatch(item: CartItem) {
    setBatchPickerLoading(true)
    const { data } = await getBatchesForMedicine(item.medicineId)
    setBatchPickerLoading(false)
    if (!data || data.length === 0) { onClose(); return }
    setBatchPickerBatches(data)
    setBatchPickerItem(item)
  }

  function handleBatchSelected(batch: BatchForDropdown) {
    if (!batchPickerItem) return
    replaceItemBatch(batchPickerItem.id, {
      batchId:      batch.id,
      batchNo:      batch.batch_no,
      expiryDate:   batch.expiry_date,
      mrp:          batch.mrp ?? batchPickerItem.mrp,
      unitPrice:    batch.sale_price ?? batchPickerItem.unitPrice,
      availableQty: batch.quantity,
    })
    setBatchPickerItem(null)
    setBatchPickerBatches([])
    onClose()
  }

  function closeBatchPicker() {
    setBatchPickerItem(null)
    setBatchPickerBatches([])
    onClose()
  }

  if (!open) return null

  if (batchPickerLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1050,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'white', borderRadius: 8,
          padding: '20px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          fontSize: 13, color: '#6b7280',
        }}>
          Loading batches…
        </div>
      </div>
    )
  }

  if (batchPickerItem) {
    return (
      <BatchPicker
        medicineName={batchPickerItem.medicineName}
        medicineId={batchPickerItem.medicineId}
        batches={batchPickerBatches}
        onSelect={handleBatchSelected}
        onClose={closeBatchPicker}
      />
    )
  }

  if (nonBorrowed.length > 1) {
    return (
      <BatchItemSelector
        items={nonBorrowed}
        onSelect={(item) => {
          handleChangeBatch(item)
        }}
        onClose={onClose}
        title="Change Batch"
        actionLabel="Change"
      />
    )
  }

  return null
}
