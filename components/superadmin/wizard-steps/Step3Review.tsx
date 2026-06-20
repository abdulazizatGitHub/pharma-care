'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { createUser } from '@/app/actions/users'
import type { Step1Data } from './Step1Identity'
import type { Step2Data } from './Step2RolePermissions'
import {
  ADMIN_ADDITIONAL,
  PHARMACIST_ADDITIONAL,
} from './Step2RolePermissions'
import { ADMIN_BASE_PERMISSIONS, PHARMACIST_BASE_PERMISSIONS } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { ChevronLeft, Copy, Check } from 'lucide-react'

interface Step3ReviewProps {
  step1:           Step1Data
  step2:           Step2Data
  usernamePreview: string
  onBack:          () => void
  onDone:          () => void
}

type Phase = 'review' | 'credentials'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-3 py-2.5 text-[12px]">
      <span className="w-24 shrink-0 text-[#6b7280]">{label}</span>
      <span className="text-[#111827]">{value}</span>
    </div>
  )
}

export function Step3Review({ step1, step2, usernamePreview, onBack, onDone }: Step3ReviewProps) {
  const [phase, setPhase]       = useState<Phase>('review')
  const [credentials, setCreds] = useState<{ username: string; password: string } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [passwordSeen, setSeen] = useState(false)
  const [copied, setCopied]     = useState(false)
  const [isPending, startTransition] = useTransition()

  // Auto-mark passwordSeen after 3 seconds on credentials screen
  useEffect(() => {
    if (phase !== 'credentials') return
    const t = setTimeout(() => setSeen(true), 3000)
    return () => clearTimeout(t)
  }, [phase])

  const base       = step2.role === 'admin' ? ADMIN_BASE_PERMISSIONS : PHARMACIST_BASE_PERMISSIONS
  const additional = step2.role === 'admin' ? ADMIN_ADDITIONAL : PHARMACIST_ADDITIONAL

  const grants       = additional.filter(p => step2.checkedPermissions.has(p as Permission))
  const restrictions = base.filter(p => !step2.checkedPermissions.has(p))

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const result = await createUser({
        firstName:    step1.firstName,
        lastName:     step1.lastName,
        phone:        step1.phone,
        cnic:         step1.cnic || undefined,
        joinedAt:     step1.joinedAt,
        role:         step2.role,
        grants,
        restrictions,
      })
      if (result.error) { setError(result.error); return }
      setCreds({ username: result.data!.username, password: result.data!.password })
      setPhase('credentials')
    })
  }

  function handleCopy() {
    if (!credentials) return
    navigator.clipboard.writeText(credentials.password).catch(() => {})
    setSeen(true)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (phase === 'credentials' && credentials) {
    return (
      <div className="space-y-4">
        <div className="rounded-[8px] bg-[#f0faf7] border border-[#b6e3d5] p-4 space-y-3">
          <p className="text-[13px] font-semibold text-[#0F6E56]">User created successfully</p>
          <div className="divide-y divide-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.06)] rounded-[6px]">
            <Row label="Username" value={<span className="font-mono">{credentials.username}</span>} />
            <Row
              label="Password"
              value={
                <div className="flex items-center gap-2">
                  <span className="font-mono tracking-wider">{credentials.password}</span>
                  <button
                    onClick={handleCopy}
                    className="text-[#0F6E56] hover:text-[#0a5a45] transition-colors"
                    title="Copy password"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              }
            />
          </div>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Save this password — it will not be shown again. The user must change it on first login.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={onDone} disabled={!passwordSeen} variant="secondary">
            {passwordSeen ? 'Close' : 'Copy or wait 3 s…'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[#6b7280]">Step 3 of 3 — Review & Confirm</p>

      <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] divide-y divide-[rgba(0,0,0,0.06)]">
        <Row label="Name"     value={`${step1.firstName} ${step1.lastName}`} />
        <Row label="Username" value={<span className="font-mono text-[#0F6E56]">{usernamePreview}</span>} />
        <Row label="Phone"    value={step1.phone} />
        {step1.cnic && <Row label="CNIC"    value={step1.cnic} />}
        <Row label="Joined"   value={step1.joinedAt} />
        <Row label="Role"     value={<span className="capitalize">{step2.role}</span>} />
        {grants.length       > 0 && <Row label="Grants"       value={grants.join(', ')} />}
        {restrictions.length > 0 && <Row label="Restrictions" value={restrictions.join(', ')} />}
      </div>

      {error && (
        <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} disabled={isPending} icon={<ChevronLeft size={14} />}>
          Back
        </Button>
        <Button loading={isPending} onClick={handleCreate}>
          Create User
        </Button>
      </div>
    </div>
  )
}
