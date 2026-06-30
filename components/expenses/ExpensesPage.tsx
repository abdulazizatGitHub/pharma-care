'use client'

import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ExpenseTable }       from '@/components/expenses/ExpenseTable'
import { ExpenseSummaryCard } from '@/components/expenses/ExpenseSummaryCard'
import { RecordExpenseModal } from '@/components/expenses/RecordExpenseModal'
import type { ExpenseInitialValues } from '@/components/expenses/RecordExpenseModal'
import { useDashboardUser }   from '@/lib/dashboard-context'
import { hasPermission }      from '@/lib/permissions'
import type { ExpenseRow, ExpenseSummary } from '@/app/actions/expenses'

interface Props {
  expenses:           ExpenseRow[]
  summary:            ExpenseSummary | null
  monthLabel:         string
  total:              number
  currentPage:        number
  pageSize:           number
  defaultSearch:      string
  defaultAccountCode: string
}

export function ExpensesPage({
  expenses, summary, monthLabel,
  total, currentPage, pageSize, defaultSearch, defaultAccountCode,
}: Props) {
  const { role, permissions } = useDashboardUser()
  const isSuperadmin = role === 'superadmin'
  const canWrite     = isSuperadmin || hasPermission(permissions, 'expenses')

  const [modalOpen,    setModalOpen]    = useState(false)
  const [prefillValues, setPrefillValues] = useState<ExpenseInitialValues | undefined>(undefined)

  function handleVoidAndReRecord(expense: ExpenseRow) {
    setPrefillValues({
      expense_date:   expense.expense_date,
      account_code:   expense.account_code ?? undefined,
      amount:         String(expense.amount),
      description:    expense.description,
      payment_method: expense.payment_method ?? undefined,
      reference_no:   expense.reference_no   ?? undefined,
    })
    setModalOpen(true)
  }

  function handleModalClose() {
    setModalOpen(false)
    setPrefillValues(undefined)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 24px 40px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>Expenses</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            Operating expenses with double-entry accounting
          </p>
        </div>
        {canWrite && (
          <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
            <Plus size={13} style={{ marginRight: 4 }} />
            Record Expense
          </Button>
        )}
      </div>

      {/* Monthly summary */}
      <ExpenseSummaryCard summary={summary} monthLabel={monthLabel} />

      {/* Expense list */}
      <ExpenseTable
        expenses={expenses}
        isSuperadmin={isSuperadmin}
        onVoidAndReRecord={handleVoidAndReRecord}
        currentPage={currentPage}
        total={total}
        pageSize={pageSize}
        defaultSearch={defaultSearch}
        defaultAccountCode={defaultAccountCode}
      />

      {/* Record modal */}
      <RecordExpenseModal
        open={modalOpen}
        onClose={handleModalClose}
        initialValues={prefillValues}
      />
    </div>
  )
}
