'use client'

import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { generateUsername } from '@/lib/user-utils'
import { ChevronRight } from 'lucide-react'

export interface Step1Data {
  firstName: string
  lastName:  string
  phone:     string
  cnic:      string
  joinedAt:  string
}

interface Step1IdentityProps {
  data:              Step1Data
  pharmacyName:      string
  existingUsernames: string[]
  onChange:          (data: Step1Data) => void
  onNext:            () => void
}

function validate(d: Step1Data): Record<string, string> {
  const e: Record<string, string> = {}
  if (!d.firstName || d.firstName.length < 2 || !/^[a-zA-Z]+$/.test(d.firstName))
    e.firstName = 'Letters only, min 2 chars'
  if (!d.lastName || d.lastName.length < 2 || !/^[a-zA-Z]+$/.test(d.lastName))
    e.lastName = 'Letters only, min 2 chars'
  if (!d.phone || !/^03\d{9}$/.test(d.phone))
    e.phone = 'Must be 03XXXXXXXXX (11 digits)'
  if (d.cnic && !/^(\d{5}-\d{7}-\d|\d{13})$/.test(d.cnic))
    e.cnic = 'Must be XXXXX-XXXXXXX-X or 13 digits'
  if (!d.joinedAt)
    e.joinedAt = 'Required'
  return e
}

export function Step1Identity({
  data, pharmacyName, existingUsernames, onChange, onNext,
}: Step1IdentityProps) {
  const errors  = validate(data)
  const isValid = Object.keys(errors).length === 0

  const usernamePreview =
    !errors.firstName && !errors.lastName && data.firstName && data.lastName
      ? generateUsername(data.firstName, data.lastName, pharmacyName, existingUsernames)
      : null

  function set<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[#6b7280]">Step 1 of 3 — Identity</p>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          required
          value={data.firstName}
          error={data.firstName ? errors.firstName : undefined}
          onChange={e => set('firstName', e.target.value)}
        />
        <Input
          label="Last name"
          required
          value={data.lastName}
          error={data.lastName ? errors.lastName : undefined}
          onChange={e => set('lastName', e.target.value)}
        />
      </div>

      <Input
        label="Phone"
        required
        placeholder="03001234567"
        value={data.phone}
        error={data.phone ? errors.phone : undefined}
        onChange={e => set('phone', e.target.value)}
      />

      <Input
        label="CNIC (optional)"
        placeholder="XXXXX-XXXXXXX-X"
        value={data.cnic}
        error={data.cnic ? errors.cnic : undefined}
        onChange={e => set('cnic', e.target.value)}
      />

      <Input
        label="Joining date"
        required
        type="date"
        value={data.joinedAt}
        error={data.joinedAt ? errors.joinedAt : undefined}
        onChange={e => set('joinedAt', e.target.value)}
      />

      {usernamePreview && (
        <p className="text-[11px] text-[#6b7280]">
          Username preview:{' '}
          <span className="font-mono text-[#0F6E56]">{usernamePreview}</span>
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button disabled={!isValid} onClick={onNext} icon={<ChevronRight size={14} />}>
          Next: Role & Permissions
        </Button>
      </div>
    </div>
  )
}
