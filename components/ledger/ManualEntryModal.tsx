'use client'

import React, { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { createManualJournalEntry, createDraftJournalEntry } from '@/app/actions/ledger'
import type { Account } from '@/lib/db-types'

interface LineRow {
  key:          string
  account_code: string
  direction:    'debit' | 'credit'
  amount:       string
}

interface Props {
  open:     boolean
  onClose:  () => void
  accounts: Account[]
}

const TODAY = new Date().toISOString().split('T')[0]
let _key = 0
const newKey = () => String(++_key)

function emptyLine(): LineRow {
  return { key: newKey(), account_code: '', direction: 'debit', amount: '' }
}

const fmtPKR = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ManualEntryModal({ open, onClose, accounts }: Props) {
  const [date,        setDate]        = useState(TODAY)
  const [description, setDescription] = useState('')
  const [lines,       setLines]       = useState<LineRow[]>([emptyLine(), emptyLine()])
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  const totalDebits  = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0) * (l.direction === 'debit'  ? 1 : 0), 0)
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0) * (l.direction === 'credit' ? 1 : 0), 0)
  const difference   = Math.abs(totalDebits - totalCredits)
  const isBalanced   = difference < 0.01

  function addLine() {
    setLines(prev => [...prev, emptyLine()])
  }

  function removeLine(key: string) {
    if (lines.length <= 2) return
    setLines(prev => prev.filter(l => l.key !== key))
  }

  function updateLine(key: string, field: keyof LineRow, value: string) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l))
  }

  function buildLinesPayload() {
    return lines.map(l => ({
      account_code: l.account_code.trim(),
      direction:    l.direction,
      amount:       parseFloat(l.amount) || 0,
    }))
  }

  function handleClose() {
    setDate(TODAY)
    setDescription('')
    setLines([emptyLine(), emptyLine()])
    setError(null)
    setSuccess(null)
    onClose()
  }

  function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError('Description is required'); return }
    if (!isBalanced) { setError(`Entry does not balance (difference: ${fmtPKR(difference)})`); return }
    setError(null)

    startTransition(async () => {
      const result = await createManualJournalEntry({
        entry_date:  date,
        description: description.trim(),
        lines:       buildLinesPayload(),
      })
      if (result.error) { setError(result.error); return }
      setSuccess(`Posted: ${result.data?.entryNo}`)
      setTimeout(handleClose, 1500)
    })
  }

  function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError('Description is required'); return }
    setError(null)

    startTransition(async () => {
      const result = await createDraftJournalEntry({
        entry_date:  date,
        description: description.trim(),
        lines:       buildLinesPayload(),
      })
      if (result.error) { setError(result.error); return }
      setSuccess('Saved as draft')
      setTimeout(handleClose, 1500)
    })
  }

  // Account options for datalist
  const accountOptions = accounts
    .filter(a => a.is_active && !a.is_deleted)
    .map(a => ({ value: a.code, label: `${a.code} — ${a.name}` }))

  return (
    <Modal open={open} onClose={handleClose} title="New Manual Journal Entry" size="xl">
      {/* datalist for account autocomplete */}
      <datalist id="account-codes">
        {accountOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </datalist>

      <div className="flex flex-col gap-4">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Entry Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={TODAY}
            required
          />
          <div className="flex flex-col gap-1 col-span-1">
            <label className="text-[11px] font-medium text-[#6b7280]">
              Description <span className="text-[#E24B4A]">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Opening balance adjustment"
              className="h-8 w-full rounded-md px-2.5 text-[12px] text-[#111827] border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent"
            />
          </div>
        </div>

        {/* Lines */}
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 100px 28px',
              gap: 4,
              marginBottom: 4,
            }}
          >
            {['Account', 'Direction', 'Amount (PKR)', ''].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 2px' }}>
                {h}
              </span>
            ))}
          </div>

          {lines.map(line => (
            <div
              key={line.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 100px 28px',
                gap: 4,
                marginBottom: 4,
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                list="account-codes"
                value={line.account_code}
                onChange={e => updateLine(line.key, 'account_code', e.target.value)}
                placeholder="e.g. 1000"
                className="h-8 w-full rounded-md px-2.5 text-[12px] text-[#111827] border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:border-transparent"
              />
              <select
                value={line.direction}
                onChange={e => updateLine(line.key, 'direction', e.target.value)}
                className="h-8 w-full rounded-md px-2 text-[12px] text-[#111827] border border-[rgba(0,0,0,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line.amount}
                onChange={e => updateLine(line.key, 'amount', e.target.value)}
                placeholder="0.00"
                className="h-8 w-full rounded-md px-2.5 text-[12px] text-[#111827] text-right border border-[rgba(0,0,0,0.15)] hover:border-[rgba(0,0,0,0.25)] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              />
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                disabled={lines.length <= 2}
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  cursor: lines.length <= 2 ? 'not-allowed' : 'pointer',
                  color: lines.length <= 2 ? '#d1d5db' : '#9ca3af',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#0F6E56',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 2px',
              marginTop: 2,
            }}
          >
            <Plus size={12} /> Add Line
          </button>
        </div>

        {/* Balance check */}
        <div
          style={{
            background: isBalanced ? '#E1F5EE' : '#FAEEDA',
            borderRadius: 6,
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
          }}
        >
          {[
            { label: 'Total Debits',  value: totalDebits },
            { label: 'Total Credits', value: totalCredits },
            { label: 'Difference',    value: difference },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  margin: '2px 0 0',
                  fontFamily: 'monospace',
                  color: label === 'Difference'
                    ? (isBalanced ? '#0F6E56' : '#A32D2D')
                    : '#111827',
                }}
              >
                {fmtPKR(value)}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-[11px] text-[#A32D2D] flex items-center gap-1">
            <span>⚠</span> {error}
          </p>
        )}
        {success && (
          <p className="text-[11px] text-[#0F6E56] font-medium">{success}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={isPending}
            onClick={handleSaveDraft}
          >
            Save as Draft
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={isPending}
            disabled={!isBalanced}
            onClick={handlePost}
          >
            Post Entry
          </Button>
        </div>
      </div>
    </Modal>
  )
}
