'use client'

import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { getPrintSettings, getPharmacyName } from '@/app/actions/settings'
import { printDocument, FALLBACK_PRINT_SETTINGS, PRINT_STYLES, printNumber, printCurrency } from '@/lib/print-utils'

interface CashEntry {
  entry_time:      string
  entry_id:        string
  entry_no:        string
  description:     string
  in_amount:       number
  out_amount:      number
  running_balance: number
  date:            string
}

interface Props {
  from:           string
  to:             string
  openingBalance: number
  cashIn:         number
  cashOut:        number
  closingBalance: number
  allEntries:     CashEntry[]
}

function buildCashBookBodyHtml(
  from:           string,
  to:             string,
  openingBalance: number,
  cashIn:         number,
  cashOut:        number,
  closingBalance: number,
  allEntries:     CashEntry[],
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const S   = PRINT_STYLES

  const isSingleDay = from === to
  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
  const fmtTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }) }
    catch { return ts }
  }
  const fmtDateHeading = (d: string) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-PK', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      })
    } catch { return d }
  }

  const period = isSingleDay ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`

  // Section 1 — Title
  const titleHtml = `<div style="${S.docTitle}">Cash Book</div>`

  // Section 2 — Metadata (period left, opening balance right)
  const metaHtml = `
    <table style="${S.metaTable}"><tr>
      <td style="${S.metaCellLeft}">
        <div style="${S.metaLabel}">Period</div>
        <div style="${S.metaValueLarge}">${period}</div>
        <div style="${S.metaLabelSpaced}">Account</div>
        <div style="${S.metaValue}">1000 — Cash</div>
      </td>
      <td style="${S.metaCellRight}">
        <div style="${S.metaLabel}">Opening Balance</div>
        <div style="font-size:18px;font-weight:700;color:${S.green};font-variant-numeric:tabular-nums">${printCurrency(openingBalance)}</div>
      </td>
    </tr></table>`

  // Section 3 — Transaction table
  if (allEntries.length === 0) {
    const emptySummary = `
      <div style="${S.summaryWrap}">
        <div style="${S.summaryTitle}">Summary</div>
        <table style="${S.summaryTable}">
          <tr><td style="${S.summaryRow}">Opening Balance</td><td style="${S.summaryRowRight}">${printCurrency(openingBalance)}</td></tr>
          <tr><td style="${S.summaryRow}">Total Receipts</td><td style="${S.summaryRowRight}">0.00</td></tr>
          <tr><td style="${S.summaryRow}">Total Payments</td><td style="${S.summaryRowRight}">0.00</td></tr>
          <tr>
            <td style="${S.summaryGrandLeft};color:${S.green}">Closing Balance</td>
            <td style="${S.summaryGrandRight};color:${S.green}">${printCurrency(openingBalance)}</td>
          </tr>
        </table>
      </div>`
    return titleHtml + metaHtml + `<p style="text-align:center;color:#9ca3af;font-size:13px;padding:32px">No cash transactions in this date range.</p>` + emptySummary
  }

  const rows: string[] = []
  let lastDate = ''
  let rowIdx   = 0

  for (const e of allEntries) {
    if (e.date !== lastDate) {
      rows.push(`<tr>
        <td colspan="6" style="padding:8px 12px;font-size:11px;font-weight:600;color:${S.green};background:#f0fdf4;border:1px solid #E5E7EB">
          ${esc(fmtDateHeading(e.date))}
        </td>
      </tr>`)
      lastDate = e.date
    }
    const bal = Number(e.running_balance)
    const dr  = Number(e.in_amount)
    const cr  = Number(e.out_amount)
    const bg  = rowIdx % 2 === 0 ? S.rowOdd : S.rowEven
    rows.push(`<tr style="${bg}">
      <td style="${S.TD};white-space:nowrap;color:${S.gray}">${esc(fmtTime(e.entry_time))}</td>
      <td style="${S.TD};font-family:monospace;font-size:11px;white-space:nowrap;color:${S.gray}">${esc(e.entry_no)}</td>
      <td style="${S.TD}">${esc(e.description)}</td>
      <td style="${dr > 0 ? S.TDR + ';color:' + S.green : S.TDE}">${dr > 0 ? printNumber(dr) : '—'}</td>
      <td style="${cr > 0 ? S.TDR + ';color:' + S.red   : S.TDE}">${cr > 0 ? printNumber(cr) : '—'}</td>
      <td style="${S.TDR};font-weight:500;color:${bal >= 0 ? S.dark : S.red}">${printCurrency(bal)}</td>
    </tr>`)
    rowIdx++
  }

  const tableHtml = `
    <table style="${S.dataTable}">
      <thead><tr>
        <th style="${S.TH};width:80px">Time</th>
        <th style="${S.TH};width:130px">Entry No</th>
        <th style="${S.TH}">Description</th>
        <th style="${S.THR};width:120px">Cash In</th>
        <th style="${S.THR};width:120px">Cash Out</th>
        <th style="${S.THR};width:130px">Balance</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot>
        <tr style="background:#F9FAFB;font-weight:600">
          <td colspan="3" style="${S.TD};font-size:11px;color:${S.gray}">
            ${allEntries.length} transaction${allEntries.length !== 1 ? 's' : ''}
          </td>
          <td style="${S.TDR};font-weight:700;color:${S.green}">${printNumber(cashIn)}</td>
          <td style="${S.TDR};font-weight:700;color:${S.red}">${printNumber(cashOut)}</td>
          <td style="${S.TDR};font-weight:700;color:${closingBalance >= 0 ? S.green : S.red}">${printCurrency(closingBalance)}</td>
        </tr>
      </tfoot>
    </table>`

  // Section 4 — Summary
  const closingColor = closingBalance >= 0 ? S.green : S.red
  const summaryHtml = `
    <div style="${S.summaryWrap}">
      <div style="${S.summaryTitle}">Summary</div>
      <table style="${S.summaryTable}">
        <tr><td style="${S.summaryRow}">Opening Balance</td><td style="${S.summaryRowRight}">${printCurrency(openingBalance)}</td></tr>
        <tr><td style="${S.summaryRow}">Total Receipts</td><td style="${S.summaryRowRight};color:${S.green}">${printCurrency(cashIn)}</td></tr>
        <tr><td style="${S.summaryRow}">Total Payments</td><td style="${S.summaryRowRight};color:${S.red}">${printCurrency(cashOut)}</td></tr>
        <tr>
          <td style="${S.summaryGrandLeft};color:${closingColor}">Closing Balance</td>
          <td style="${S.summaryGrandRight};color:${closingColor}">${printCurrency(closingBalance)}</td>
        </tr>
      </table>
    </div>`

  return titleHtml + metaHtml + tableHtml + summaryHtml
}

export function CashBookPrintButton({
  from,
  to,
  openingBalance,
  cashIn,
  cashOut,
  closingBalance,
  allEntries,
}: Props) {
  const [isPrinting, setIsPrinting] = useState(false)

  async function handlePrint() {
    setIsPrinting(true)
    try {
      const [printResult, pharmacyName] = await Promise.all([
        getPrintSettings(),
        getPharmacyName(),
      ])
      const isSingleDay = from === to
      const fmtDate = (iso: string) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
      const subtitle = isSingleDay ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`
      const bodyHtml = buildCashBookBodyHtml(from, to, openingBalance, cashIn, cashOut, closingBalance, allEntries)
      printDocument({
        documentTitle:    'Cash Book',
        documentSubtitle: subtitle,
        bodyHtml,
        printSettings:    printResult.data ?? FALLBACK_PRINT_SETTINGS,
        pharmacyName,
      })
    } finally {
      setIsPrinting(false)
    }
  }

  const isDisabled = isPrinting || allEntries.length === 0

  return (
    <button
      onClick={handlePrint}
      disabled={isDisabled}
      title={allEntries.length === 0 ? 'No transactions to print' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', fontSize: 12, fontWeight: 600,
        background: isDisabled ? '#e5e7eb' : '#fff',
        color: isDisabled ? '#9ca3af' : '#374151',
        border: '1px solid #d1d5db', borderRadius: 6,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: allEntries.length === 0 ? 0.5 : 1,
      }}
    >
      <Printer size={14} />
      {isPrinting ? 'Preparing…' : 'Print'}
    </button>
  )
}
