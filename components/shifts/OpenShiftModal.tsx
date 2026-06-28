'use client'

import React, { useState } from 'react'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { openShift } from '@/app/actions/shifts'

interface Props {
  open:      boolean
  onClose:   () => void
  onSuccess: () => void
}

export function OpenShiftModal({ open, onClose, onSuccess }: Props) {
  const [openingCash, setOpeningCash] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(openingCash)
    if (isNaN(amount) || amount < 0) {
      setError('Enter a valid opening cash amount')
      return
    }
    setLoading(true)
    setError(null)
    const result = await openShift(amount)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setOpeningCash('')
      onSuccess()
      onClose()
    }
  }

  function handleClose() {
    setOpeningCash('')
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Open Shift" size="sm">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          Count the cash in your drawer before opening the shift.
        </p>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Opening Cash (Rs)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: '#9ca3af', pointerEvents: 'none', fontSize: 13, fontWeight: 500,
            }}>
              Rs
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              placeholder="0.00"
              autoFocus
              style={{
                width: '100%', padding: '8px 10px 8px 32px', fontSize: 14,
                border: '1px solid #d1d5db', borderRadius: 6,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" type="button" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Opening…' : 'Open Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
