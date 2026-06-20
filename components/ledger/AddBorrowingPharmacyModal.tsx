'use client'

import React, { useState, useTransition } from 'react'
import { Modal }   from '@/components/ui/Modal'
import { Button }  from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { createBorrowingPharmacy } from '@/app/actions/ledger'

interface Props {
  open:    boolean
  onClose: () => void
}

export function AddBorrowingPharmacyModal({ open, onClose }: Props) {
  const [name,    setName]    = useState('')
  const [contact, setContact] = useState('')
  const [phone,   setPhone]   = useState('')
  const [address, setAddress] = useState('')
  const [notes,   setNotes]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setName('')
    setContact('')
    setPhone('')
    setAddress('')
    setNotes('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError(null)

    startTransition(async () => {
      const result = await createBorrowingPharmacy({
        name:           name.trim(),
        contact_person: contact || undefined,
        phone:          phone   || undefined,
        address:        address || undefined,
        notes:          notes   || undefined,
      })
      if (result.error) { setError(result.error); return }
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Borrowing Pharmacy" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Pharmacy Name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <Input
          label="Contact Person"
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder="Optional"
        />
        <Input
          label="Phone"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Optional"
        />
        <Input
          label="Address"
          value={address}
          onChange={e => setAddress(e.target.value)}
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
            Add Pharmacy
          </Button>
        </div>
      </form>
    </Modal>
  )
}
