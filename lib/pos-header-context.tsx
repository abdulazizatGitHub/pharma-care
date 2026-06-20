'use client'

import React, { createContext, useContext, useState } from 'react'
import type { ShiftRow } from '@/app/actions/shifts'

export type POSMode = 'sale' | 'return' | 'exchange'

interface POSHeaderCtx {
  posMode:    POSMode
  shift:      ShiftRow | null
  exitFn:     (() => void) | null
  setPosMode: (m: POSMode) => void
  setShift:   (s: ShiftRow | null) => void
  setExitFn:  (fn: (() => void) | null) => void
}

const Ctx = createContext<POSHeaderCtx>({
  posMode:    'sale',
  shift:      null,
  exitFn:     null,
  setPosMode: () => {},
  setShift:   () => {},
  setExitFn:  () => {},
})

export function POSHeaderProvider({ children }: { children: React.ReactNode }) {
  const [posMode, setPosMode] = useState<POSMode>('sale')
  const [shift,   setShiftState] = useState<ShiftRow | null>(null)
  const [exitFn,  setExitFnState] = useState<(() => void) | null>(null)

  function setShift(s: ShiftRow | null) {
    setShiftState(s)
  }

  // wrap in arrow to avoid React treating fn as a state-updater
  function setExitFn(fn: (() => void) | null) {
    setExitFnState(() => fn)
  }

  return (
    <Ctx.Provider value={{ posMode, shift, exitFn, setPosMode, setShift, setExitFn }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePOSHeader(): POSHeaderCtx {
  return useContext(Ctx)
}
