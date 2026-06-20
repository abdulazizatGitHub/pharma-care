'use client'

import React, { useState, useTransition } from 'react'
import { Modal }   from '@/components/ui/Modal'
import { Button }  from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { createBorrowingTransaction } from '@/app/actions/ledger'
import type { BorrowingTransactionType } from '@/lib/db-types'

interface Props {
  pharmacyId:   string
  pharmacyName: string
  open:         boolean
  onClose:      () => void
}

const TODAY = new Date().toISOString().split('T')[0]

const TX_LABELS: Record<BorrowingTransactionType, string> = {
  borrow_out:  'Borrow Out (we lend)',
  borrow_in:   'Borrow In (we receive)',
  payment_in:  'Payment In (they pay us)',
  payment_out: 'Payment Out (we pay them)',
}

export function BorrowingTransactionModal({ pharmacyId, pharmacyName, open, onClose }: Props) {
  const [txType,       setTxType]       = useState<BorrowingTransactionType>('borrow_out')
  const [medicineName, setMedicineName] = useState('')
  const [quantity,     setQuantity]     = useState('')
  const [unitPrice,    setUnitPrice]    = useState('')
  const [totalAmount,  setTotalAmount]  = useState('')
  const [date,         setDate]         = useState(TODAY)
  const [notes,        setNotes]        = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  const isBorrow = txType === 'borrow_out' || txType === 'borrow_in'

  // Auto-compute total from qty × price when both are filled
  function handleQtyOrPrice(newQty: string, newPrice: string) {
    const q = parseFloat(newQty)
    const p = parseFloat(newPrice)
    if (q > 0 && p > 0) setTotalAmount((q * p).toFixed(2))
  }

  function handleClose() {
    setTxType('borrow_out')
    setMedicineName('')
    setQuantity('')
    setUnitPrice('')
    setTotalAmount('')
    setDate(TODAY)
    setNotes('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const total = parseFloat(totalAmount)
    if (!total || total <= 0) { setError('Enter a valid total amount'); return }
    setError(null)

    startTransition(async () => {
      const result = await createBorrowingTransaction({
        pharmacy_id:      pharmacyId,
        transaction_type: txType,
        medicine_name:    isBorrow && medicineName ? medicineName : undefined,
        quantity:         isBorrow && quantity      ? parseInt(quantity)       : undefined,
        unit_price:       isBorrow && unitPrice     ? parseFloat(unitPrice)    : undefined,
        total_amount:     total,
        notes:            notes || undefined,
        transaction_date: date,
      })
      if (result.error) { setError(result.error); return }
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title={`New Transaction — ${pharmacyName}`} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select
          label="Transaction Type"
          value={txType}
          onChange={e => setTxType(e.target.value as BorrowingTransactionType)}
          required
        >
          {(Object.keys(TX_LABELS) as BorrowingTransactionType[]).map(k => (
            <option key={k} value={k}>{TX_LABELS[k]}</option>
          ))}
        </Select>

        {isBorrow && (
          <>
            <Input
              label="Medicine Name"
              value={medicineName}
              onChange={e => setMedicineName(e.target.value)}
              placeholder="Optional"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => { setQuantity(e.target.value); handleQtyOrPrice(e.target.value, unitPrice) }}
                placeholder="Optional"
              />
              <Input
                label="Unit Price (PKR)"
                type="number"
                min="0.01"
                step="0.01"
                value={unitPrice}
                onChange={e => { setUnitPrice(e.target.value); handleQtyOrPrice(quantity, e.target.value) }}
                placeholder="Optional"
              />
            </div>
          </>
        )}

        <Input
          label="Total Amount (PKR)"
          type="number"
          min="0.01"
          step="0.01"
          value={totalAmount}
          onChange={e => setTotalAmount(e.target.value)}
          required
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
        <Textarea
          label="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional"
        />

        {error && (
          <p className="text-[11px] text-[#A32D2D] flex items-center gap-1">
            <span>⚠</span> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            Record Transaction
          </Button>
        </div>
      </form>
    </Modal>
  )
}
