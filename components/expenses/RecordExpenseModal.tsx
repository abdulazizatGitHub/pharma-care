'use client'

import React, { useState, useTransition } from 'react'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { recordExpense } from '@/app/actions/expenses'
import { EXPENSE_ACCOUNT_LABELS } from '@/lib/expense-constants'

const TODAY = new Date().toISOString().split('T')[0]

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque',        label: 'Cheque' },
]

interface Props {
  open:    boolean
  onClose: () => void
}

export function RecordExpenseModal({ open, onClose }: Props) {
  const [date,          setDate]          = useState(TODAY)
  const [accountCode,   setAccountCode]   = useState('6000')
  const [amount,        setAmount]        = useState('')
  const [description,   setDescription]   = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [referenceNo,   setReferenceNo]   = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()

  function handleClose() {
    setDate(TODAY)
    setAccountCode('6000')
    setAmount('')
    setDescription('')
    setPaymentMethod('cash')
    setReferenceNo('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!description.trim()) { setError('Description is required'); return }
    setError(null)

    startTransition(async () => {
      const result = await recordExpense({
        expense_date:   date,
        account_code:   accountCode,
        amount:         amt,
        description:    description.trim(),
        payment_method: paymentMethod,
        reference_no:   referenceNo.trim() || undefined,
      })
      if (result.error) { setError(result.error); return }
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Record Expense" size="md">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3">
          {/* Date */}
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={TODAY}
            required
          />

          {/* Category (account_code) */}
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Category <span style={{ color: '#E24B4A' }}>*</span>
            </label>
            <select
              value={accountCode}
              onChange={e => setAccountCode(e.target.value)}
              style={{
                height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
                background: '#fff', outline: 'none',
              }}
              required
            >
              {Object.entries(EXPENSE_ACCOUNT_LABELS).map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Amount (PKR) <span style={{ color: '#E24B4A' }}>*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
              style={{
                height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
                textAlign: 'right', outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Description <span style={{ color: '#E24B4A' }}>*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              required
              style={{
                height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)', color: '#111827', outline: 'none',
              }}
            />
          </div>

          {/* Payment method */}
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              style={{
                height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)', color: '#111827',
                background: '#fff', outline: 'none',
              }}
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Reference No */}
          <Input
            label="Reference No (optional)"
            type="text"
            value={referenceNo}
            onChange={e => setReferenceNo(e.target.value)}
            placeholder="Receipt / bill number"
          />

          {error && (
            <p style={{ fontSize: 11, color: '#A32D2D' }}>⚠ {error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              Record Expense
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
