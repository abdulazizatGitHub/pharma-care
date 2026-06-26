'use client'

import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import { SearchPanel } from '@/components/pos/SearchPanel'
import type { POSMedicineResult, ParkedSale } from '@/lib/pos-types'

export interface CardLayoutHandle {
  focusSearch: () => void
}

interface Props {
  initialMedicines: POSMedicineResult[]
  parkedSales:      ParkedSale[]
  onResume:         (saleId: string) => void
}

export const CardLayout = forwardRef<CardLayoutHandle, Props>(
  function CardLayout({ initialMedicines, parkedSales, onResume }, ref) {
    const searchRef = useRef<HTMLInputElement | null>(null)

    useImperativeHandle(ref, () => ({
      focusSearch: () => searchRef.current?.focus(),
    }))

    return (
      <SearchPanel
        initialMedicines={initialMedicines}
        parkedSales={parkedSales}
        onResume={onResume}
        searchRef={searchRef}
      />
    )
  }
)
