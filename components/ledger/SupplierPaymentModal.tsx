'use client'

import React, { useState, useTransition } from 'react'
import { Modal }   from '@/components/ui/Modal'
import { Button }  from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { recordSupplierPayment } from '@/app/actions/ledger'

interface Props {
  supplierId:   string
  supplierName: string
  open:         boolean
  onClose:      () => void
}

const TODAY = new Date().toISOString().split('T')[0]

export function SupplierPaymentModal({ supplierId, supplierName, open, onClose }: Props) {
  const [amount,      setAmount]      = useState('')
  const [date,        setDate]        = useState(TODAY)
  const [method,      setMethod]      = useState<'cash' | 'bank_transfer' | 'cheque'>('cash')
  const [reference,   setReference]   = useState('')
  const [notes,       setNotes]       = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  function handleClose() {
    setAmount('')
    setDate(TODAY)
    setMethod('cash')
    setReference('')
    setNotes('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setError(null)

    startTransition(async () => {
      const result = await recordSupplierPayment({
        supplier_id:    supplierId,
        amount:         amt,
        payment_date:   date,
        payment_method: method,
        reference_no:   reference || undefined,
        notes:          notes     || undefined,
      })
      if (result.error) { setError(result.error); return }
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Record Payment — ${supplierName}`} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Amount (PKR)"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          required
        />
        <Input
          label="Payment Date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
        <Select
          label="Payment Method"
          value={method}
          onChange={e => setMethod(e.target.value as typeof method)}
        >
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
        </Select>
        <Input
          label="Reference No."
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="Optional"
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
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
