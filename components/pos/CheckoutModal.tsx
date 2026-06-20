'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CustomerSelector } from './CustomerSelector'
import { ReceiptContent } from './ReceiptView'
import { completeSale, deleteHeldSale } from '@/app/actions/sales'
import { linkExchangeSale } from '@/app/actions/returns'
import { useCart } from '@/lib/pos-context'
import type { ReturnCredit } from '@/lib/pos-types'

interface Props {
  open:              boolean
  onClose:           () => void
  pharmacyName:      string
  pharmacyAddress:   string
  headerNote:        string
  cashierName:       string
  receiptFooter:     string
  returnPolicy:      string
  showCashierName:   boolean
  showReceiptNo:     boolean
  cashierId:         string
  onSaleComplete:    () => void
  returnCredit?:     ReturnCredit | null
  onExchangeComplete?: () => void
}

interface CompletedSale {
  saleId:    string
  receiptNo: string
  total:     number
  change:    number
}

type ModalState = 'form' | 'receipt'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printReceipt(html: string) {
  const pw = window.open('', '_blank', 'width=420,height=640')
  if (!pw) return
  pw.document.write(`<!DOCTYPE html><html><head><style>
    body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0; padding: 8px; }
    .divider { border-top: 2px solid #000; margin: 4px 0; }
    .dashed  { border-top: 1px dashed #000; margin: 4px 0; }
    .row  { display: flex; justify-content: space-between; margin-bottom: 2px; }
    .irow { display: flex; margin-bottom: 2px; }
    .iname { flex: 1; padding-right: 4px; word-break: break-word; }
    .iqty  { width: 24px; text-align: right; margin-right: 6px; flex-shrink: 0; }
    .iamt  { width: 80px; text-align: right; flex-shrink: 0; }
    .bold   { font-weight: bold; }
    .center { text-align: center; }
    .total  { font-size: 13px; font-weight: bold; margin: 2px 0; }
    .muted  { color: #555; }
    .green  { color: #0a7a4f; }
    .small  { font-size: 10px; }
  </style></head><body>${html}</body></html>`)
  pw.document.close()
  pw.focus()
  pw.print()
  pw.close()
}

export function CheckoutModal({
  open,
  onClose,
  pharmacyName,
  pharmacyAddress,
  headerNote,
  cashierName,
  receiptFooter,
  returnPolicy,
  showCashierName,
  showReceiptNo,
  cashierId,
  onSaleComplete,
  returnCredit,
  onExchangeComplete,
}: Props) {
  const {
    items, customerId, customerName,
    subtotal, discountAmount, serviceFee, serviceFeeLabel, serviceFeeEnabled,
    total, notes, heldSaleId, clearCart,
  } = useCart()

  const [modalState,    setModalState]    = useState<ModalState>('form')
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [saleTime,      setSaleTime]      = useState<Date>(new Date())

  const [paymentType,   setPaymentType]   = useState<'cash' | 'credit'>('cash')
  const [amountPaidStr, setAmountPaidStr] = useState('')
  const [saleNote,      setSaleNote]      = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    if (open) {
      setModalState('form')
      setCompletedSale(null)
      setAmountPaidStr('')
      setError(null)
      setPaymentType('cash')
      setSaleNote('')
    }
  }, [open])

  // Return credit calculations
  const creditAmount      = returnCredit?.amount ?? 0
  const effectiveTotal    = Math.max(0, total - creditAmount)
  const refundToCustomer  = Math.max(0, creditAmount - total)
  const isCreditCovered   = effectiveTotal <= 0  // credit covers everything

  const amountPaid  = parseFloat(amountPaidStr) || 0
  const hasAmount   = amountPaidStr.trim() !== '' && amountPaid > 0
  const change      = isCreditCovered ? 0 : Math.max(0, amountPaid - effectiveTotal)
  const isShort     = !isCreditCovered && paymentType === 'cash' && hasAmount && amountPaid < effectiveTotal
  const canComplete = isCreditCovered || paymentType === 'credit' || (hasAmount && amountPaid >= effectiveTotal)

  function buildReceiptHtml(receiptNo: string, receiptChange: number): string {
    const now     = new Date()
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

    const showSubtotal = discountAmount > 0 || (serviceFeeEnabled && serviceFee > 0)

    const itemRows = items.map(item => {
      const itemDiscAmt = item.discountPct > 0
        ? item.quantity * item.unitPrice - item.totalPrice
        : 0
      const discLine = item.discountPct > 0
        ? `<div class="irow green small" style="padding-left:10px;">
             <span>Discount ${item.discountPct}%</span>
             <span style="margin-left:auto;">-Rs ${itemDiscAmt.toFixed(2)}</span>
           </div>`
        : ''
      return `
        <div class="irow">
          <span class="iname">${escHtml(item.medicineName)}</span>
          <span class="iqty">${item.quantity}</span>
          <span class="iamt">Rs ${item.totalPrice.toFixed(2)}</span>
        </div>
        ${discLine}`
    }).join('')

    const headerNoteRow  = headerNote.trim()
      ? `<div class="center small">${escHtml(headerNote.trim())}</div>`
      : ''
    const addressRow     = pharmacyAddress.trim()
      ? `<div class="center small">${escHtml(pharmacyAddress.trim())}</div>`
      : ''
    const cashierRow     = showCashierName
      ? `<div class="row"><span>Cashier:</span><span>${escHtml(cashierName)}</span></div>`
      : ''
    const receiptNoRow   = showReceiptNo
      ? `<div class="row"><span>Receipt No:</span><span class="bold">${escHtml(receiptNo)}</span></div>`
      : ''
    const customerRow    = customerName
      ? `<div class="row"><span>Customer:</span><span>${escHtml(customerName)}</span></div>`
      : ''
    const subtotalRow    = showSubtotal
      ? `<div class="row muted"><span>Subtotal:</span><span>Rs ${subtotal.toFixed(2)}</span></div>`
      : ''
    const discountRow    = discountAmount > 0
      ? `<div class="row green"><span>Discount:</span><span>-Rs ${discountAmount.toFixed(2)}</span></div>`
      : ''
    const serviceFeeRow  = serviceFeeEnabled && serviceFee > 0
      ? `<div class="row muted"><span>${escHtml(serviceFeeLabel)}:</span><span>Rs ${serviceFee.toFixed(2)}</span></div>`
      : ''
    const paymentRows    = paymentType === 'cash'
      ? `<div class="row"><span>Cash received:</span><span>Rs ${amountPaid.toFixed(2)}</span></div>
         <div class="row"><span>Change:</span><span>Rs ${receiptChange.toFixed(2)}</span></div>`
      : `<div class="row"><span>Payment:</span><span>Credit (Udhaar)</span></div>`
    const returnRow      = returnPolicy.trim()
      ? `<div class="center small" style="margin-top:4px;">${escHtml(returnPolicy.trim())}</div>`
      : ''

    return `
      <div class="center bold" style="font-size:14px;">${escHtml(pharmacyName)}</div>
      ${headerNoteRow}
      ${addressRow}
      <div class="divider"></div>
      <div class="row"><span>Date:</span><span>${dateStr}</span></div>
      <div class="row"><span>Time:</span><span>${timeStr}</span></div>
      ${receiptNoRow}
      ${cashierRow}
      ${customerRow}
      <div class="dashed"></div>
      <div class="irow" style="font-weight:bold; font-size:10px;">
        <span class="iname">ITEM</span>
        <span class="iqty">QTY</span>
        <span class="iamt">AMOUNT</span>
      </div>
      <div class="dashed"></div>
      ${itemRows}
      <div class="dashed"></div>
      ${subtotalRow}
      ${discountRow}
      ${serviceFeeRow}
      <div class="divider"></div>
      <div class="row total"><span>TOTAL:</span><span>Rs ${total.toFixed(2)}</span></div>
      ${paymentRows}
      <div class="divider"></div>
      <div class="center" style="font-size:11px;">${escHtml(receiptFooter)}</div>
      ${returnRow}`
  }

  async function handleComplete(print: boolean) {
    if (items.length === 0 && !returnCredit) { setError('Cart is empty'); return }
    if (!isCreditCovered && paymentType === 'cash' && !canComplete) {
      setError(hasAmount
        ? `Amount short by Rs ${(effectiveTotal - amountPaid).toFixed(2)}`
        : 'Enter the amount received')
      return
    }

    setError(null)
    setLoading(true)

    const borrowedCartItems = items.filter(i => i.isBorrowed)

    const result = await completeSale({
      cashierId,
      customerId,
      paymentType,
      items: items.map(item => ({
        medicine_id:  item.medicineId,
        batch_id:     item.batchId,
        quantity:     item.quantity,
        unit_price:   item.unitPrice,
        discount_pct: item.discountPct,
      })),
      discountAmt: discountAmount,
      serviceFee,
      amountPaid: isCreditCovered ? 0 : amountPaid,
      notes: saleNote.trim() || notes,
      borrowedItems: borrowedCartItems.length > 0
        ? borrowedCartItems.map(i => ({
            medicineId:   i.medicineId,
            medicineName: i.medicineName,
            batchId:      i.batchId,
            borrowedFrom: i.borrowedFrom!,
            borrowCost:   i.borrowCost!,
            quantity:     i.quantity,
          }))
        : undefined,
    })

    setLoading(false)

    if (result.error || !result.data) {
      setError(result.error ?? 'Sale failed')
      return
    }

    // Link return to exchange sale (fire-and-forget)
    if (returnCredit) {
      linkExchangeSale(returnCredit.returnId, result.data.saleId)
      onExchangeComplete?.()
    }

    // Held sale cleanup is fire-and-forget once the real sale is created
    if (heldSaleId) deleteHeldSale(heldSaleId)

    const now = new Date()
    setSaleTime(now)
    setCompletedSale(result.data)
    setModalState('receipt')

    // Auto-print if requested — cashier still sees the receipt preview to verify
    if (print) {
      printReceipt(buildReceiptHtml(result.data.receiptNo, result.data.change))
    }
  }

  function handlePrintFromPreview() {
    if (!completedSale) return
    printReceipt(buildReceiptHtml(completedSale.receiptNo, completedSale.change))
  }

  function handleDone() {
    clearCart()
    onSaleComplete()
    onClose()
  }

  function handleClose() {
    if (modalState === 'receipt') {
      clearCart()
      onSaleComplete()
    }
    onClose()
  }

  const modalTitle = (
    <div className="flex items-center gap-3">
      <span>{modalState === 'receipt' ? 'Sale Complete' : 'Complete Sale'}</span>
      {modalState === 'receipt' && completedSale && (
        <span className="text-[12px] font-normal text-[#9ca3af]">{completedSale.receiptNo}</span>
      )}
      {modalState === 'form' && (
        <span className="text-[12px] font-normal text-[#9ca3af]">SR—</span>
      )}
    </div>
  )

  return (
    <Modal open={open} onClose={handleClose} title={modalTitle} size="xl">

      {/* ── RECEIPT PREVIEW STATE ── */}
      {modalState === 'receipt' && completedSale && (
        <div className="flex flex-col items-center gap-5">
          <div
            className="font-mono text-[11px] leading-snug w-full"
            style={{ maxWidth: '320px', maxHeight: '55vh', overflowY: 'auto' }}
          >
            <div className="bg-[#fafafa] border border-[rgba(0,0,0,0.1)] rounded-lg p-4">
              <ReceiptContent
                pharmacyName={pharmacyName}
                pharmacyAddress={pharmacyAddress}
                headerNote={headerNote}
                cashierName={cashierName}
                showCashierName={showCashierName}
                customerName={customerName}
                receiptNo={completedSale.receiptNo}
                showReceiptNo={showReceiptNo}
                saleTime={saleTime}
                items={items}
                subtotal={subtotal}
                discountAmount={discountAmount}
                serviceFee={serviceFee}
                serviceFeeLabel={serviceFeeLabel}
                serviceFeeEnabled={serviceFeeEnabled}
                total={total}
                paymentType={paymentType}
                amountPaid={amountPaid}
                change={completedSale.change}
                returnPolicy={returnPolicy}
                receiptFooter={receiptFooter}
              />
            </div>
          </div>

          <div className="flex gap-3" style={{ width: '100%', maxWidth: '320px' }}>
            <Button
              variant="secondary"
              onClick={handlePrintFromPreview}
              className="flex-1"
            >
              Print Receipt
            </Button>
            <Button onClick={handleDone} className="flex-1">
              Done — New Sale
            </Button>
          </div>
        </div>
      )}

      {/* ── FORM STATE ── */}
      {modalState === 'form' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '44% 1fr',
            gap: '24px',
          }}
        >
          {/* ── Left: Order summary ── */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">
              Order summary
            </p>

            <div style={{ overflowY: 'auto', maxHeight: '26vh' }} className="space-y-1">
              {items.length === 0 ? (
                <p className="text-[12px] text-[#9ca3af] text-center pt-4">Cart is empty</p>
              ) : items.map(item => (
                <div key={item.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] text-[#374151] truncate flex-1 min-w-0">
                    {item.medicineName}
                    {item.isBorrowed && (
                      <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 uppercase align-middle">Borrow</span>
                    )}
                    <span className="text-[#9ca3af]"> ×{item.quantity}</span>
                  </span>
                  <span className="text-[12px] text-[#111827] font-medium shrink-0">
                    Rs {item.totalPrice.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Borrowed items info — pharmacist-facing only, not on receipt */}
            {items.some(i => i.isBorrowed) && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 space-y-0.5">
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">
                  Borrowed items (internal)
                </p>
                {items.filter(i => i.isBorrowed).map(i => (
                  <p key={i.id} className="text-[10px] text-amber-700">
                    • {i.medicineName} ×{i.quantity} from {i.borrowedFromName ?? '—'}
                    {i.borrowCost != null && (
                      <span className="text-amber-600"> (cost: Rs {(i.borrowCost * i.quantity).toFixed(2)})</span>
                    )}
                  </p>
                ))}
              </div>
            )}

            <div className="border-t border-[rgba(0,0,0,0.08)] pt-2 space-y-1">
              <div className="flex justify-between text-[12px] text-[#6b7280]">
                <span>Subtotal</span>
                <span>Rs {subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[12px] text-[#6b7280]">
                  <span>Discount</span>
                  <span>−Rs {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {serviceFeeEnabled && serviceFee > 0 && (
                <div className="flex justify-between text-[12px] text-[#6b7280]">
                  <span>{serviceFeeLabel}</span>
                  <span>Rs {serviceFee.toFixed(2)}</span>
                </div>
              )}
              {returnCredit && (
                <div className="flex justify-between text-[12px]" style={{ color: '#D97706' }}>
                  <span>Return credit ({returnCredit.returnNo})</span>
                  <span>−Rs {returnCredit.amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-[rgba(0,0,0,0.08)] pt-2 mt-1">
                <span className="text-[13px] font-semibold text-[#111827]">
                  {returnCredit ? 'Net total' : 'Total'}
                </span>
                <span className="text-[17px] font-bold" style={{ color: refundToCustomer > 0 ? '#D97706' : '#0F6E56' }}>
                  {refundToCustomer > 0
                    ? `Refund Rs ${refundToCustomer.toFixed(2)}`
                    : `Rs ${effectiveTotal.toFixed(2)}`
                  }
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-[#6b7280] mb-1">Customer (optional)</p>
              <CustomerSelector />
            </div>
          </div>

          {/* ── Right: Payment ── */}
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">
              Payment
            </p>

            {/* Credit covered: skip payment type selector */}
            {isCreditCovered ? (
              <div className="rounded-lg p-3 text-center" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                {refundToCustomer > 0 ? (
                  <>
                    <p className="text-[11px] text-[#166534] mb-1">Return credit exceeds sale total</p>
                    <p className="text-[20px] font-bold text-[#166534]">Refund Rs {refundToCustomer.toFixed(2)}</p>
                    <p className="text-[10px] text-[#166534] mt-1">Pharmacy returns the difference to customer</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-[#166534] mb-1">Even exchange — no payment needed</p>
                    <p className="text-[20px] font-bold text-[#166534]">Rs 0.00</p>
                  </>
                )}
              </div>
            ) : (
            <div className="flex gap-2">
              {(['cash', 'credit'] as const).map(pt => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => { setPaymentType(pt); setError(null) }}
                  className={`flex-1 py-2 rounded-md text-[12px] font-medium border transition-colors ${
                    paymentType === pt
                      ? 'bg-[#0F6E56] text-white border-[#0F6E56]'
                      : 'bg-white text-[#374151] border-[rgba(0,0,0,0.15)] hover:bg-[#f9fafb]'
                  }`}
                >
                  {pt === 'cash' ? 'Cash' : 'Credit (Udhaar)'}
                </button>
              ))}
            </div>
            )}

            {!isCreditCovered && paymentType === 'cash' && (
              <>
                <div>
                  <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
                    Amount received (Rs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaidStr}
                    onChange={e => { setAmountPaidStr(e.target.value); setError(null) }}
                    placeholder="Enter amount…"
                    autoFocus
                    className="w-full h-12 px-3 rounded-md border border-[rgba(0,0,0,0.15)] text-[20px] font-medium text-[#111827] placeholder:text-[16px] placeholder:text-[#d1d5db] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-0"
                  />
                </div>

                <div
                  className="rounded-lg border px-4 py-3 text-center"
                  style={{
                    borderColor: !hasAmount ? 'rgba(0,0,0,0.08)' : isShort ? '#fca5a5' : '#86efac',
                    background:  !hasAmount ? '#f9fafb'           : isShort ? '#fff5f5' : '#f0fdf4',
                  }}
                >
                  {!hasAmount ? (
                    <p className="text-2xl font-medium text-[#d1d5db]">—</p>
                  ) : isShort ? (
                    <>
                      <p className="text-[10px] text-[#A32D2D] mb-0.5">Short by</p>
                      <p className="text-3xl font-medium text-[#A32D2D]">
                        Rs {(total - amountPaid).toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-[#6b7280] mb-0.5">Change to return</p>
                      <p
                        className="text-3xl font-medium"
                        style={{ color: change > 0 ? '#0F6E56' : '#6b7280' }}
                      >
                        Rs {change.toFixed(2)}
                      </p>
                    </>
                  )}
                </div>
              </>
            )}

            {!isCreditCovered && paymentType === 'credit' && (
              <div className="rounded-lg bg-[#FAEEDA] border border-[#f3c98a] p-3 text-[11px] text-[#854F0B]">
                ⚠ This sale will be recorded to the customer ledger. Payment can be collected later.
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-[#6b7280] block mb-1">
                Note (optional)
              </label>
              <textarea
                value={saleNote}
                onChange={e => setSaleNote(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full px-2.5 py-2 rounded-md border border-[rgba(0,0,0,0.12)] text-[12px] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-[#0F6E56] focus:ring-offset-0 resize-none"
              />
            </div>

            {error && (
              <p className="text-[11px] text-[#A32D2D]">⚠ {error}</p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button
                onClick={() => handleComplete(true)}
                loading={loading}
                disabled={!canComplete || loading}
                className="w-full"
              >
                {isCreditCovered ? 'Complete Exchange' : 'Complete & Print'}
              </Button>
              {!isCreditCovered && (
                <Button
                  variant="secondary"
                  onClick={() => handleComplete(false)}
                  loading={loading}
                  disabled={!canComplete || loading}
                  className="w-full"
                >
                  Complete without Print
                </Button>
              )}
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="w-full py-1.5 text-[12px] text-[#6b7280] hover:text-[#374151] disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
