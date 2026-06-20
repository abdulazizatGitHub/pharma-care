'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { approvePO, rejectPO } from '@/app/actions/procurement'

interface POApprovalBannerProps {
  poId: string
}

export function POApprovalBanner({ poId }: POApprovalBannerProps) {
  const router = useRouter()
  const [rejectOpen,    setRejectOpen]    = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      const result = await approvePO(poId)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleReject() {
    if (!rejectionNote.trim()) { setError('Rejection note is required'); return }
    setError(null)
    startTransition(async () => {
      const result = await rejectPO(poId, rejectionNote)
      if (result.error) { setError(result.error); return }
      setRejectOpen(false)
      setRejectionNote('')
      router.refresh()
    })
  }

  return (
    <div
      className="rounded-xl border overflow-hidden mb-4"
      style={{ borderColor: '#F5CC8A', background: '#FFFBF0' }}
    >
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        <div className="flex items-center gap-2">
          <AlertCircle size={15} className="text-[#854F0B] shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[#854F0B]">Approval Required</p>
            <p className="text-[11px] text-[#92600A]">
              This purchase order exceeds the auto-approval threshold and requires superadmin review.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            icon={<XCircle size={13} />}
            onClick={() => { setRejectOpen(r => !r); setError(null) }}
            disabled={isPending}
          >
            Reject
          </Button>
          <Button
            size="sm"
            icon={<CheckCircle size={13} />}
            loading={isPending && !rejectOpen}
            onClick={handleApprove}
          >
            Approve
          </Button>
        </div>
      </div>

      {rejectOpen && (
        <div className="px-4 pb-4 border-t border-[#F5CC8A] pt-3 space-y-3">
          <Textarea
            label="Rejection note"
            placeholder="Explain why this PO is being returned to draft…"
            rows={2}
            value={rejectionNote}
            onChange={e => setRejectionNote(e.target.value)}
          />
          {error && (
            <p className="text-[11px] text-[#A32D2D]">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setRejectOpen(false); setError(null); setRejectionNote('') }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={isPending}
              onClick={handleReject}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      )}

      {error && !rejectOpen && (
        <p className="px-4 pb-3 text-[11px] text-[#A32D2D]">{error}</p>
      )}
    </div>
  )
}
