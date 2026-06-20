'use client'

import React, { useState, useCallback } from 'react'
import { User, Search, X, Plus, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { createCustomerQuick } from '@/app/actions/sales'
import { useCart } from '@/lib/pos-context'

interface CustomerRow {
  id:             string
  name:           string
  phone:          string | null
  credit_balance: number
  credit_limit:   number
}

export function CustomerSelector() {
  const { customerId, customerName, setCustomer } = useCart()

  const [open,        setOpen]        = useState(false)
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<CustomerRow[]>([])
  const [searching,   setSearching]   = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newPhone,    setNewPhone]    = useState('')
  const [addError,    setAddError]    = useState<string | null>(null)
  const [adding,      setAdding]      = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, credit_balance, credit_limit')
      .eq('is_deleted', false)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8)
    setResults((data ?? []) as CustomerRow[])
    setSearching(false)
  }, [])

  function handleSelect(c: CustomerRow) {
    setCustomer(c.id, c.name)
    setSelectedCustomer(c)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  async function handleQuickAdd() {
    if (!newName.trim()) { setAddError('Name is required'); return }
    setAdding(true)
    setAddError(null)
    const result = await createCustomerQuick(newName.trim(), newPhone.trim())
    setAdding(false)
    if (result.error) { setAddError(result.error); return }
    if (result.data) {
      setCustomer(result.data.id, result.data.name)
      setSelectedCustomer({ id: result.data.id, name: result.data.name, phone: newPhone || null, credit_balance: 0, credit_limit: 0 })
    }
    setOpen(false)
    setShowQuickAdd(false)
    setNewName('')
    setNewPhone('')
  }

  function handleClear() {
    setCustomer(null, null)
    setSelectedCustomer(null)
  }

  function handleOpen() {
    setOpen(true)
    setQuery('')
    setResults([])
    setShowQuickAdd(false)
  }

  return (
    <>
      {/* Selector button */}
      <div className="mb-3">
        {customerId ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#E1F5EE] border border-[#5DCAA5]">
            <User size={13} className="text-[#0F6E56] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#0F6E56] truncate">{customerName}</p>
              {selectedCustomer && selectedCustomer.credit_balance > 0 && (
                <p className="text-[10px] text-[#854F0B] flex items-center gap-1">
                  <AlertCircle size={9} />
                  Outstanding: Rs {selectedCustomer.credit_balance.toFixed(2)}
                </p>
              )}
            </div>
            <button
              onClick={handleClear}
              className="shrink-0 text-[#0F6E56] hover:text-[#0a5a45] transition-colors"
              aria-label="Remove customer"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleOpen}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[rgba(0,0,0,0.2)] text-[#9ca3af] hover:border-[rgba(0,0,0,0.3)] hover:text-[#6b7280] transition-colors text-[12px]"
          >
            <User size={13} />
            No customer selected
          </button>
        )}
      </div>

      {/* Search modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Select Customer" size="md">
        <div className="space-y-3">
          {!showQuickAdd ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); search(e.target.value) }}
                  placeholder="Search by name or phone…"
                  autoFocus
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-[rgba(0,0,0,0.15)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
                />
              </div>

              {searching && (
                <p className="text-[11px] text-[#9ca3af] text-center py-2">Searching…</p>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-[11px] text-[#9ca3af] text-center py-2">No customers found.</p>
              )}

              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg border border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.2)] hover:bg-[#f9fafb] transition-colors"
                >
                  <User size={13} className="text-[#9ca3af] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[#111827]">{c.name}</p>
                    {c.phone && <p className="text-[10px] text-[#9ca3af]">{c.phone}</p>}
                    {c.credit_balance > 0 && (
                      <p className="text-[10px] text-[#854F0B]">
                        Balance: Rs {c.credit_balance.toFixed(2)}
                      </p>
                    )}
                  </div>
                </button>
              ))}

              <button
                onClick={() => setShowQuickAdd(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-[12px] text-[#0F6E56] hover:underline"
              >
                <Plus size={13} />
                Add new customer
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] font-medium text-[#111827]">Quick Add Customer</p>
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setAddError(null) }}
                placeholder="Full name *"
                autoFocus
                className="w-full h-8 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              />
              <input
                type="text"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full h-8 px-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#0F6E56]"
              />
              {addError && <p className="text-[11px] text-[#A32D2D]">⚠ {addError}</p>}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleQuickAdd}
                  loading={adding}
                  disabled={!newName.trim()}
                  className="flex-1"
                >
                  Save &amp; Select
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowQuickAdd(false); setAddError(null) }}>
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
