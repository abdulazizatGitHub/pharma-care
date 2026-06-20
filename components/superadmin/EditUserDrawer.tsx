'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Copy, Check } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { updateUser, resetPassword } from '@/app/actions/users'
import type { UserRow } from './UserTable'

interface EditUserDrawerProps {
  user:    UserRow | null
  onClose: () => void
}

export function EditUserDrawer({ user, onClose }: EditUserDrawerProps) {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [phone,     setPhone]     = useState('')
  const [cnic,      setCnic]      = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [newPw,     setNewPw]     = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)

  const [isPending,   startSave]  = useTransition()
  const [isResetting, startReset] = useTransition()

  // Sync form fields when target user changes
  useEffect(() => {
    if (!user) return
    const parts = (user.full_name ?? '').split(' ')
    setFirstName(parts[0] ?? '')
    setLastName(parts.slice(1).join(' '))
    setPhone(user.phone ?? '')
    setCnic('')
    setError(null)
    setNewPw(null)
    setCopied(false)
  }, [user?.id])

  function handleSave() {
    if (!user) return
    setError(null)
    startSave(async () => {
      const result = await updateUser(user.id, {
        firstName,
        lastName,
        phone,
        cnic: cnic || undefined,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onClose()
    })
  }

  function handleResetPassword() {
    if (!user) return
    setError(null)
    startReset(async () => {
      const result = await resetPassword(user.id)
      if (result.error) { setError(result.error); return }
      setNewPw(result.data!.newPassword)
      router.refresh()
    })
  }

  function handleCopy() {
    if (!newPw) return
    navigator.clipboard.writeText(newPw).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isOpen = !!user

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
      )}
      <div
        className={`
          fixed top-0 right-0 h-full w-[360px] z-40 bg-white shadow-2xl
          flex flex-col transition-transform duration-200 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[14px] font-medium text-[#111827]">Edit User</h2>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#111827] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {user && (
            <>
              <p className="text-[11px] text-[#6b7280]">
                Username:{' '}
                <span className="font-mono text-[#0F6E56]">{user.username ?? '—'}</span>
                {' '}(immutable)
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First name"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
                <Input
                  label="Last name"
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>

              <Input
                label="Phone"
                required
                placeholder="03001234567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />

              <Input
                label="CNIC (optional)"
                placeholder="XXXXX-XXXXXXX-X"
                value={cnic}
                onChange={e => setCnic(e.target.value)}
              />

              {error && (
                <p className="text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {error}
                </p>
              )}

              {/* Password reset section */}
              <div className="pt-2 border-t border-[rgba(0,0,0,0.08)] space-y-3">
                <p className="text-[11px] font-medium text-[#6b7280]">Password management</p>

                {newPw ? (
                  <div className="rounded-[8px] bg-amber-50 border border-amber-200 p-3 space-y-2">
                    <p className="text-[11px] font-medium text-amber-700">New password generated:</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-[#111827] tracking-wide flex-1">
                        {newPw}
                      </span>
                      <button
                        onClick={handleCopy}
                        className="text-[#0F6E56] hover:text-[#0a5a45] transition-colors shrink-0"
                        title="Copy"
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-600">
                      Save this — it will not be shown again.
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isResetting}
                    onClick={handleResetPassword}
                  >
                    Reset Password
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button className="flex-1" loading={isPending} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </>
  )
}
