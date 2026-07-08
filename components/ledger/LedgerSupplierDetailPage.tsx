'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PartyLedgerTable } from '@/components/ledger/PartyLedgerTable'
import { SupplierPaymentModal } from '@/components/ledger/SupplierPaymentModal'
import { getPartyLedger } from '@/app/actions/ledger'
import type { PartyLedgerLine } from '@/app/actions/ledger'
import { getPrintSettings, getPharmacyName } from '@/app/actions/settings'
import { printDocument, FALLBACK_PRINT_SETTINGS, PRINT_STYLES, printNumber, printCurrency } from '@/lib/print-utils'

interface Props {
  supplierId:   string
  supplierName: string
  phone:        string | null
  lines:        PartyLedgerLine[]
  dateFrom:     string
  dateTo:       string
}

const fmt = (n: number) =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtDisplay(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function buildSupplierLedgerBodyHtml(
  supplierName: string,
  phone:        string | null,
  lines:        PartyLedgerLine[],
  dateFrom:     string,
  dateTo:       string,
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const S = PRINT_STYLES

  const isShowAll = dateFrom === '' && dateTo === ''
  const fmtDate = (iso: string) => iso
    ? new Date(iso + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
  const today  = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
  const period = isShowAll ? 'All Transactions' : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`

  // Section 1 — Title
  const titleHtml = `<div style="${S.docTitle}">Supplier Ledger</div>`

  // Section 2 — Metadata
  const metaHtml = `
    <table style="${S.metaTable}"><tr>
      <td style="${S.metaCellLeft}">
        <div style="${S.metaLabel}">Supplier</div>
        <div style="${S.metaValueLarge}">${esc(supplierName)}</div>
        ${phone ? `<div style="${S.metaLabelSpaced}">Phone</div><div style="${S.metaValue}">${esc(phone)}</div>` : ''}
      </td>
      <td style="${S.metaCellRight}">
        <div style="${S.metaLabel}">Statement Date</div>
        <div style="${S.metaValue}">${today}</div>
        <div style="${S.metaLabelSpaced}">Period</div>
        <div style="${S.metaValue}">${period}</div>
      </td>
    </tr></table>`

  if (lines.length === 0) {
    return titleHtml + metaHtml + `<p style="text-align:center;color:#9ca3af;font-size:13px;padding:32px">No transactions in this period.</p>`
  }

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_amount),  0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit_amount), 0)
  const lastBalance = Number(lines[lines.length - 1].running_balance)

  // Section 3 — Data table
  const rows = lines.map((line, i) => {
    const bal = Number(line.running_balance)
    // Supplier: negative = we owe them (Payable, normal=green), positive = they owe us (Receivable, red)
    const balColor = bal > 0.005 ? S.red : bal < -0.005 ? S.green : S.gray
    const balLabel = bal > 0.005 ? ' Receivable' : bal < -0.005 ? ' Payable' : ''
    const dr = Number(line.debit_amount)
    const cr = Number(line.credit_amount)
    const bg = i % 2 === 0 ? S.rowOdd : S.rowEven
    return `<tr style="${bg}">
      <td style="${S.TD};white-space:nowrap">${esc(line.entry_date)}</td>
      <td style="${S.TD};font-family:monospace;font-size:11px;white-space:nowrap">${esc(line.entry_no)}</td>
      <td style="${S.TD}">${esc(line.description)}</td>
      <td style="${dr > 0 ? S.TDR : S.TDE}">${dr > 0 ? printNumber(dr) : '—'}</td>
      <td style="${cr > 0 ? S.TDR : S.TDE}">${cr > 0 ? printNumber(cr) : '—'}</td>
      <td style="${S.TDR};font-weight:500;color:${balColor}">
        ${printNumber(Math.abs(bal))}${balLabel ? `<span style="font-size:9px;font-weight:400;margin-left:3px">${balLabel}</span>` : ''}
      </td>
    </tr>`
  }).join('')

  const tableHtml = `
    <table style="${S.dataTable}">
      <thead><tr>
        <th style="${S.TH};width:90px">Date</th>
        <th style="${S.TH};width:140px">Ref</th>
        <th style="${S.TH}">Description</th>
        <th style="${S.THR};width:110px">Debit</th>
        <th style="${S.THR};width:110px">Credit</th>
        <th style="${S.THR};width:130px">Balance</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`

  // Section 4 — Summary
  const netBal   = Math.abs(lastBalance)
  const netLabel = lastBalance > 0.005 ? 'Receivable' : lastBalance < -0.005 ? 'Payable' : ''
  const netColor = lastBalance > 0.005 ? S.red : S.green

  const summaryHtml = `
    <div style="${S.summaryWrap}">
      <div style="${S.summaryTitle}">Summary</div>
      <table style="${S.summaryTable}">
        <tr>
          <td style="${S.summaryRow}">Total Debits</td>
          <td style="${S.summaryRowRight}">${printNumber(totalDebit)}</td>
        </tr>
        <tr>
          <td style="${S.summaryRow}">Total Credits</td>
          <td style="${S.summaryRowRight}">${printNumber(totalCredit)}</td>
        </tr>
        <tr>
          <td style="${S.summaryGrandLeft};color:${netColor}">Net Balance</td>
          <td style="${S.summaryGrandRight};color:${netColor}">${printCurrency(netBal)}${netLabel ? ` ${netLabel}` : ''}</td>
        </tr>
      </table>
    </div>`

  return titleHtml + metaHtml + tableHtml + summaryHtml
}

export function LedgerSupplierDetailPage({
  supplierId,
  supplierName,
  phone,
  lines,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter()
  const [payOpen,       setPayOpen]       = useState(false)
  const [localFrom,     setLocalFrom]     = useState(dateFrom)
  const [localTo,       setLocalTo]       = useState(dateTo)
  const [isPrinting,    setIsPrinting]    = useState(false)
  const [isPrintingFull, setIsPrintingFull] = useState(false)

  useEffect(() => {
    setLocalFrom(dateFrom)
    setLocalTo(dateTo)
  }, [dateFrom, dateTo])

  const isShowAll   = dateFrom === '' && dateTo === ''
  const isFiltered  = !isShowAll

  // Last line's running_balance: negative = we owe them (AP context)
  const lastBalance = lines.length > 0 ? Number(lines[lines.length - 1].running_balance) : 0
  const outstanding = -lastBalance  // positive = we owe them

  async function handlePrint() {
    setIsPrinting(true)
    try {
      const [printResult, pharmacyName] = await Promise.all([
        getPrintSettings(),
        getPharmacyName(),
      ])
      const isShowAll = dateFrom === '' && dateTo === ''
      const subtitle  = isShowAll
        ? 'All Transactions'
        : `${dateFrom} – ${dateTo}`
      const bodyHtml = buildSupplierLedgerBodyHtml(supplierName, phone, lines, dateFrom, dateTo)
      printDocument({
        documentTitle:    'Supplier Ledger',
        documentSubtitle: subtitle,
        bodyHtml,
        printSettings:    printResult.data ?? FALLBACK_PRINT_SETTINGS,
        pharmacyName,
      })
    } finally {
      setIsPrinting(false)
    }
  }

  async function handlePrintFull() {
    setIsPrintingFull(true)
    try {
      const [printResult, pharmacyName, ledgerResult] = await Promise.all([
        getPrintSettings(),
        getPharmacyName(),
        getPartyLedger('supplier', supplierId),
      ])
      const allLines = ledgerResult.data ?? []
      const bodyHtml = buildSupplierLedgerBodyHtml(supplierName, phone, allLines, '', '')
      printDocument({
        documentTitle:    'Supplier Ledger',
        documentSubtitle: 'Complete Ledger',
        bodyHtml,
        printSettings:    printResult.data ?? FALLBACK_PRINT_SETTINGS,
        pharmacyName,
      })
    } finally {
      setIsPrintingFull(false)
    }
  }

  function applyFilter() {
    const params = new URLSearchParams()
    if (localFrom) params.set('from', localFrom)
    if (localTo)   params.set('to',   localTo)
    router.push('?' + params.toString())
  }

  function showAll() {
    router.push('?from=&to=')
  }

  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Back link */}
      <Link
        href="/superadmin/ledger/suppliers"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', textDecoration: 'none', marginBottom: 16 }}
      >
        <ArrowLeft size={13} /> Back to Suppliers
      </Link>

      {/* Header */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{supplierName}</h1>
          {phone && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{phone}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Outstanding</p>
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: outstanding > 0.005 ? '#A32D2D' : '#6b7280',
                margin: 0,
                fontFamily: 'monospace',
              }}
            >
              {outstanding > 0.005 ? fmt(outstanding) : '—'}
            </p>
            {outstanding > 0.005 && (
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>We owe this supplier</p>
            )}
          </div>
          {outstanding > 0.005 && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setPayOpen(true)}
            >
              Record Payment
            </Button>
          )}
        </div>
      </div>

      {/* Date-range filter bar */}
      <div style={{
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.08)',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginRight: 4 }}>Period:</span>
        <input
          type="date"
          value={localFrom}
          onChange={e => setLocalFrom(e.target.value)}
          style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
        <input
          type="date"
          value={localTo}
          onChange={e => setLocalTo(e.target.value)}
          style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <button
          onClick={applyFilter}
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Apply
        </button>
        <button
          onClick={showAll}
          style={{ padding: '5px 10px', fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}
        >
          Show All
        </button>
        <button
          onClick={handlePrint}
          disabled={isPrinting || lines.length === 0}
          title={lines.length === 0 ? 'No transactions to print' : undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            background: (isPrinting || lines.length === 0) ? '#e5e7eb' : '#fff',
            color: (isPrinting || lines.length === 0) ? '#9ca3af' : '#374151',
            border: '1px solid #d1d5db', borderRadius: 6,
            cursor: (isPrinting || lines.length === 0) ? 'default' : 'pointer',
            opacity: lines.length === 0 ? 0.5 : 1,
          }}
        >
          <Printer size={13} />
          {isPrinting ? 'Preparing…' : 'Print'}
        </button>
        <button
          onClick={handlePrintFull}
          disabled={isPrintingFull}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            background: isPrintingFull ? '#e5e7eb' : '#f0fdf4',
            color: isPrintingFull ? '#9ca3af' : '#0F6E56',
            border: '1px solid #a7f3d0', borderRadius: 6,
            cursor: isPrintingFull ? 'default' : 'pointer',
          }}
        >
          <Printer size={13} />
          {isPrintingFull ? 'Preparing…' : 'Print Full Ledger'}
        </button>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
          {isShowAll
            ? 'Showing all transactions'
            : `Showing transactions from ${fmtDisplay(dateFrom)} to ${fmtDisplay(dateTo)}`}
        </span>
      </div>

      <PartyLedgerTable lines={lines} />

      <SupplierPaymentModal
        supplierId={supplierId}
        supplierName={supplierName}
        open={payOpen}
        onClose={() => setPayOpen(false)}
      />
    </div>
  )
}
