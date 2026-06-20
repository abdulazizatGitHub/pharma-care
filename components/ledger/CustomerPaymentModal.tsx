'use client'

import React, { useState, useTransition } from 'react'
import { Modal }   from '@/components/ui/Modal'
import { Button }  from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { recordCustomerPayment } from '@/app/actions/ledger'

interface Props {
  customerId:   string
  customerName: string
  maxAmount:    number
  open:         boolean
  onClose:      () => void
}

const TODAY = new Date().toISOString().split('T')[0]

export function CustomerPaymentModal({ customerId, customerName, maxAmount, open, onClose }: Props) {
  const [amount,    setAmount]    = useState('')
  const [date,      setDate]      = useState(TODAY)
  const [method,    setMethod]    = useState('cash')
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setAmount('')
    setDate(TODAY)
    setMethod('cash')
    setNotes('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > maxAmount + 0.01) {
      setError(`Amount exceeds outstanding balance of Rs ${maxAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`)
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await recordCustomerPayment({
        customer_id:    customerId,
        amount:         amt,
        payment_date:   date,
        payment_method: method,
        notes:          notes || undefined,
      })
      if (result.error) { setError(result.error); return }
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Collect Payment — ${customerName}`} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-[12px] text-[#6b7280]">
          Outstanding: <span className="font-medium text-[#111827]">
            Rs {maxAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </span>
        </p>

        <Input
          label="Amount (PKR)"
          type="number"
          min="0.01"
          step="0.01"
          max={maxAmount}
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
          onChange={e => setMethod(e.target.value)}
        >
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
        </Select>
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
            Collect Payment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
