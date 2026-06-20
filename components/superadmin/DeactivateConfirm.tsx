'use client'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface DeactivateConfirmProps {
  open: boolean
  fullName: string
  role: 'admin' | 'pharmacist'
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeactivateConfirm({
  open, fullName, role, loading, onConfirm, onClose,
}: DeactivateConfirmProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Deactivate user?"
      message={`${fullName} (${role}) will lose access immediately. Their data is preserved and they can be reactivated later.`}
      confirmLabel="Deactivate"
      loading={loading}
    />
  )
}
