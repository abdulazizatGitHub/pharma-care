'use client'

import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ExpenseTable }       from '@/components/expenses/ExpenseTable'
import { ExpenseSummaryCard } from '@/components/expenses/ExpenseSummaryCard'
import { RecordExpenseModal } from '@/components/expenses/RecordExpenseModal'
import { useDashboardUser }   from '@/lib/dashboard-context'
import { hasPermission }      from '@/lib/permissions'
import type { ExpenseRow, ExpenseSummary } from '@/app/actions/expenses'

interface Props {
  expenses:   ExpenseRow[]
  summary:    ExpenseSummary | null
  monthLabel: string
}

export function ExpensesPage({ expenses, summary, monthLabel }: Props) {
  const { role, permissions } = useDashboardUser()
  const isSuperadmin = role === 'superadmin'
  const canWrite     = isSuperadmin || hasPermission(permissions, 'expenses')

  const [modalOpen, setModalOpen] = useState(false)

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
      <ExpenseTable expenses={expenses} isSuperadmin={isSuperadmin} />

      {/* Record modal */}
      <RecordExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
