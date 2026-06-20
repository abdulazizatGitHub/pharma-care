'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Step1Identity, type Step1Data } from './wizard-steps/Step1Identity'
import { Step2RolePermissions, type Step2Data } from './wizard-steps/Step2RolePermissions'
import { Step3Review } from './wizard-steps/Step3Review'
import { ADMIN_BASE_PERMISSIONS, PHARMACIST_BASE_PERMISSIONS } from '@/lib/permissions'
import { generateUsername } from '@/lib/user-utils'

interface CreateUserWizardProps {
  open:              boolean
  pharmacyName:      string
  existingUsernames: string[]
  onClose:           () => void
  lockedRole?:       'pharmacist'
}

const defaultStep1 = (): Step1Data => ({
  firstName: '',
  lastName:  '',
  phone:     '',
  cnic:      '',
  joinedAt:  new Date().toISOString().slice(0, 10),
})

function defaultStep2(lockedRole?: 'pharmacist'): Step2Data {
  if (lockedRole === 'pharmacist') {
    return { role: 'pharmacist', checkedPermissions: new Set(PHARMACIST_BASE_PERMISSIONS) }
  }
  return { role: 'admin', checkedPermissions: new Set(ADMIN_BASE_PERMISSIONS) }
}

export function CreateUserWizard({
  open, pharmacyName, existingUsernames, onClose, lockedRole,
}: CreateUserWizardProps) {
  const router = useRouter()
  const [step,  setStep]  = useState<1 | 2 | 3>(1)
  const [step1, setStep1] = useState<Step1Data>(defaultStep1)
  const [step2, setStep2] = useState<Step2Data>(() => defaultStep2(lockedRole))

  function reset() {
    setStep(1)
    setStep1(defaultStep1())
    setStep2(defaultStep2(lockedRole))
  }

  function handleClose() { reset(); onClose() }
  function handleDone()  { router.refresh(); reset(); onClose() }

  const usernamePreview =
    step1.firstName && step1.lastName
      ? generateUsername(step1.firstName, step1.lastName, pharmacyName, existingUsernames)
      : ''

  return (
    <Modal open={open} onClose={handleClose} title="Create New User" size="md">
      {step === 1 && (
        <Step1Identity
          data={step1}
          pharmacyName={pharmacyName}
          existingUsernames={existingUsernames}
          onChange={setStep1}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2RolePermissions
          data={step2}
          onChange={setStep2}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
          lockedRole={lockedRole}
        />
      )}
      {step === 3 && (
        <Step3Review
          step1={step1}
          step2={step2}
          usernamePreview={usernamePreview}
          onBack={() => setStep(2)}
          onDone={handleDone}
        />
      )}
    </Modal>
  )
}
