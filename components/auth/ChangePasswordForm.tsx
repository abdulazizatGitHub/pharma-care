'use client'

import React, { useState, useTransition } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { changePassword } from '@/app/actions/auth'

const RULES = [
  { label: 'At least 8 characters',        test: (pw: string) => pw.length >= 8 },
  { label: 'One uppercase letter (A–Z)',    test: (pw: string) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)',    test: (pw: string) => /[a-z]/.test(pw) },
  { label: 'One digit (0–9)',               test: (pw: string) => /\d/.test(pw) },
  { label: 'One special character (!@#…)',  test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
]

function clientValidate(pw: string): string | null {
  if (pw.length < 8)             return 'Minimum 8 characters required'
  if (!/[A-Z]/.test(pw))         return 'Must include an uppercase letter'
  if (!/[a-z]/.test(pw))         return 'Must include a lowercase letter'
  if (!/\d/.test(pw))            return 'Must include a digit'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Must include a special character'
  return null
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [isPending,       startTransition]    = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!currentPassword.trim()) {
      setError('Current password is required')
      return
    }

    const pwError = clientValidate(newPassword)
    if (pwError) { setError(pwError); return }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword)
      if (result?.error) setError(result.error)
      // On success the server action calls redirect() — browser navigates automatically
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        label="Current / Temporary Password"
        type="password"
        autoComplete="current-password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        disabled={isPending}
      />

      <div className="flex flex-col gap-1.5">
        <Input
          label="New Password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isPending}
        />
        {/* Live rule checklist */}
        <ul className="mt-1 space-y-0.5">
          {RULES.map((rule) => {
            const met = newPassword.length > 0 && rule.test(newPassword)
            return (
              <li
                key={rule.label}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  met ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <span className="w-3.5 text-center select-none">{met ? '✓' : '·'}</span>
                {rule.label}
              </li>
            )
          })}
        </ul>
      </div>

      <Input
        label="Confirm New Password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        disabled={isPending}
      />

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full mt-1">
        Change Password
      </Button>
    </form>
  )
}
