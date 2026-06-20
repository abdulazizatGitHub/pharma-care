'use client'

import React, { useState, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { Upload, FileText, Download, AlertCircle, CheckCircle, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PAGE, TEXT, BADGE_COLORS } from '@/lib/design-tokens'
import { importMedicinesCSV } from '@/app/actions/medicines'
import type { CSVRow, ImportResult } from '@/app/actions/medicines'

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof CSVRow)[] = ['name', 'manufacturer', 'mrp']
const PREVIEW_LIMIT = 10

const PREVIEW_COLS: { key: keyof CSVRow; label: string }[] = [
  { key: 'name',          label: 'Name' },
  { key: 'generic_name',  label: 'Generic' },
  { key: 'manufacturer',  label: 'Manufacturer' },
  { key: 'code',          label: 'Code' },
  { key: 'category',      label: 'Category' },
  { key: 'subcategory',   label: 'Sub-category' },
  { key: 'schedule',      label: 'Schedule' },
  { key: 'pack_size',     label: 'Pack Size' },
  { key: 'unit',          label: 'Unit' },
  { key: 'mrp',           label: 'MRP' },
  { key: 'reorder_level', label: 'Reorder' },
]

function rowHasError(row: CSVRow): boolean {
  if (!row.name?.trim()) return true
  if (!row.manufacturer?.trim()) return true
  const mrp = parseFloat(row.mrp ?? '')
  if (isNaN(mrp) || mrp <= 0) return true
  return false
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'upload' | 'preview' | 'importing' | 'results'

interface BulkImportModalProps {
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkImportModal({ onClose }: BulkImportModalProps) {
  const router = useRouter()

  const [phase,        setPhase]        = useState<Phase>('upload')
  const [rows,         setRows]         = useState<CSVRow[]>([])
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [isDragging,   setIsDragging]   = useState(false)
  const [fileName,     setFileName]     = useState<string | null>(null)
  const [result,       setResult]       = useState<ImportResult | null>(null)
  const [isPending,    startTransition] = useTransition()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── CSV parsing ───────────────────────────────────────────────────────────

  function parseFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a .csv file')
      return
    }
    setParseError(null)
    setFileName(file.name)

    Papa.parse<CSVRow>(file, {
      header:              true,
      skipEmptyLines:      true,
      transformHeader:     h => h.trim().toLowerCase().replace(/\s+/g, '_'),
      transform:           v => v.trim(),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError(`CSV parse error: ${results.errors[0].message}`)
          return
        }
        if (results.data.length === 0) {
          setParseError('CSV file is empty or has no data rows')
          return
        }
        setRows(results.data)
        setPhase('preview')
      },
      error: (err) => {
        setParseError(`Failed to read file: ${err.message}`)
      },
    })
  }

  // ─── Drag-and-drop handlers ────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  function handleImport() {
    setPhase('importing')
    startTransition(async () => {
      const res = await importMedicinesCSV(rows)
      if (res.error) {
        setParseError(res.error)
        setPhase('preview')
        return
      }
      setResult(res.data!)
      setPhase('results')
    })
  }

  function handleDone() {
    router.refresh()
    onClose()
  }

  function handleReset() {
    setPhase('upload')
    setRows([])
    setFileName(null)
    setParseError(null)
    setResult(null)
  }

  // ─── Derived counts ────────────────────────────────────────────────────────

  const errorRows  = rows.filter(rowHasError)
  const readyRows  = rows.length - errorRows.length
  const previewRows = rows.slice(0, PREVIEW_LIMIT)

  // ─── Render helpers ────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: TEXT.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${PAGE.border}`,
    background: '#fafbfc',
    textAlign: 'left',
  }

  const tdStyle: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: 11,
    color: TEXT.primary,
    borderBottom: `1px solid ${PAGE.border}`,
    whiteSpace: 'nowrap',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  // ─── Phase: Upload ─────────────────────────────────────────────────────────

  const uploadPhase = (
    <>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#0F6E56' : PAGE.border}`,
          borderRadius: 8,
          padding: '32px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? '#E1F5EE' : PAGE.bg,
          transition: 'all 0.15s',
        }}
      >
        <Upload size={28} style={{ color: isDragging ? '#0F6E56' : TEXT.secondary, margin: '0 auto 10px' }} />
        <p style={{ fontSize: 13, color: TEXT.primary, fontWeight: 500, margin: '0 0 4px' }}>
          Drop CSV file here or click to browse
        </p>
        <p style={{ fontSize: 11, color: TEXT.secondary, margin: 0 }}>
          .csv files only — header row required
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {parseError && (
        <p className="flex items-center gap-1.5 text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
          <AlertCircle size={12} /> {parseError}
        </p>
      )}

      {/* Template download */}
      <div className="flex items-center gap-1.5 mt-4">
        <Download size={13} style={{ color: TEXT.secondary }} />
        <a
          href="/templates/medicines_import_template.csv"
          download
          style={{ fontSize: 12, color: '#0F6E56', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          Download sample CSV template
        </a>
      </div>

      {/* CSV format reference */}
      <div style={{ marginTop: 16, padding: '10px 12px', background: PAGE.bg, borderRadius: 6, border: `1px solid ${PAGE.border}` }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: TEXT.secondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Expected columns (header row required)
        </p>
        <p style={{ fontSize: 11, color: TEXT.secondary, fontFamily: 'monospace', margin: 0, lineHeight: 1.6 }}>
          name*, generic_name, manufacturer*, code, drap_reg_no,
          category, subcategory, schedule, pack_size, unit,
          mrp*, reorder_level, instructions, precautions
        </p>
        <p style={{ fontSize: 10, color: TEXT.secondary, margin: '6px 0 0' }}>
          * required &nbsp;·&nbsp; schedule values: OTC / prescription / controlled
        </p>
      </div>
    </>
  )

  // ─── Phase: Preview ────────────────────────────────────────────────────────

  const previewPhase = (
    <>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={14} style={{ color: TEXT.secondary }} />
          <span style={{ fontSize: 12, color: TEXT.primary, fontWeight: 500 }}>{fileName}</span>
        </div>
        <span style={{ fontSize: 11, color: TEXT.secondary }}>·</span>
        <span style={{ fontSize: 11, color: TEXT.primary }}>
          <strong>{rows.length}</strong> rows total
        </span>
        <span
          style={{ fontSize: 11, color: readyRows > 0 ? '#0F6E56' : TEXT.secondary,
            background: readyRows > 0 ? '#E1F5EE' : PAGE.bg,
            padding: '2px 8px', borderRadius: 3, fontWeight: 500 }}
        >
          {readyRows} ready
        </span>
        {errorRows.length > 0 && (
          <span style={{ fontSize: 11, color: BADGE_COLORS.danger.color, background: BADGE_COLORS.danger.bg, padding: '2px 8px', borderRadius: 3, fontWeight: 500 }}>
            {errorRows.length} have errors
          </span>
        )}
        <button onClick={handleReset} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: TEXT.secondary, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <X size={12} /> Change file
        </button>
      </div>

      {rows.length > PREVIEW_LIMIT && (
        <p style={{ fontSize: 11, color: TEXT.secondary, marginBottom: 8 }}>
          Showing first {PREVIEW_LIMIT} of {rows.length} rows
        </p>
      )}

      {/* Preview table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${PAGE.border}`, borderRadius: 6, marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 28 }}>#</th>
              {PREVIEW_COLS.map(c => (
                <th key={c.key} style={thStyle}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => {
              const hasErr = rowHasError(row)
              return (
                <tr
                  key={i}
                  style={{ background: hasErr ? '#FFF5F5' : 'transparent' }}
                >
                  <td style={{ ...tdStyle, color: TEXT.secondary, textAlign: 'center' }}>
                    {hasErr
                      ? <AlertCircle size={12} style={{ color: BADGE_COLORS.danger.color }} />
                      : <span style={{ color: TEXT.secondary }}>{i + 1}</span>
                    }
                  </td>
                  {PREVIEW_COLS.map(c => {
                    const val = row[c.key] ?? ''
                    const isRequired = REQUIRED_FIELDS.includes(c.key)
                    const isEmpty = !val.toString().trim()
                    const isMrpBad = c.key === 'mrp' && val && (isNaN(parseFloat(val as string)) || parseFloat(val as string) <= 0)
                    const cellError = (isRequired && isEmpty) || isMrpBad
                    return (
                      <td
                        key={c.key}
                        style={{
                          ...tdStyle,
                          color: cellError ? BADGE_COLORS.danger.color : TEXT.primary,
                          fontWeight: cellError ? 500 : undefined,
                        }}
                        title={val as string}
                      >
                        {val || (isRequired ? <span style={{ color: BADGE_COLORS.danger.color }}>required</span> : '—')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {parseError && (
        <p className="flex items-center gap-1.5 text-[11px] text-[#A32D2D] bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
          <AlertCircle size={12} /> {parseError}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={handleReset}>Back</Button>
        <Button
          variant="primary"
          loading={isPending}
          disabled={readyRows === 0}
          onClick={handleImport}
        >
          Import {readyRows} row{readyRows !== 1 ? 's' : ''}
        </Button>
      </div>
    </>
  )

  // ─── Phase: Importing ──────────────────────────────────────────────────────

  const importingPhase = (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid #E1F5EE', borderTopColor: '#0F6E56',
          margin: '0 auto 16px',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: 13, color: TEXT.primary, fontWeight: 500, margin: '0 0 4px' }}>
        Importing medicines…
      </p>
      <p style={{ fontSize: 11, color: TEXT.secondary, margin: 0 }}>
        Processing {rows.length} rows — please do not close this window
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  // ─── Phase: Results ────────────────────────────────────────────────────────

  const resultsPhase = result && (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 8, background: '#E1F5EE', border: '1px solid #5DCAA5', textAlign: 'center' }}>
          <CheckCircle size={18} style={{ color: '#0F6E56', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 22, fontWeight: 700, color: '#0F6E56', margin: '0 0 2px' }}>{result.imported}</p>
          <p style={{ fontSize: 11, color: '#0a5a45', margin: 0 }}>Imported</p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 8, background: '#FAEEDA', border: '1px solid #f5c87a', textAlign: 'center' }}>
          <AlertCircle size={18} style={{ color: '#854F0B', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 22, fontWeight: 700, color: '#854F0B', margin: '0 0 2px' }}>{result.skipped}</p>
          <p style={{ fontSize: 11, color: '#6b3d08', margin: 0 }}>Skipped</p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 8, background: BADGE_COLORS.danger.bg, border: '1px solid #f09595', textAlign: 'center' }}>
          <X size={18} style={{ color: BADGE_COLORS.danger.color, margin: '0 auto 6px' }} />
          <p style={{ fontSize: 22, fontWeight: 700, color: BADGE_COLORS.danger.color, margin: '0 0 2px' }}>{result.errors.length}</p>
          <p style={{ fontSize: 11, color: BADGE_COLORS.danger.color, margin: 0 }}>Errors</p>
        </div>
      </div>

      {/* Error list */}
      {result.errors.length > 0 && (
        <div style={{ border: `1px solid ${PAGE.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '6px 10px', background: '#fafbfc', borderBottom: `1px solid ${PAGE.border}` }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT.secondary, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Error details
            </p>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '6px 0' }}>
            {result.errors.map((err, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 10px', borderBottom: i < result.errors.length - 1 ? `1px solid ${PAGE.border}` : undefined }}
              >
                <AlertCircle size={12} style={{ color: BADGE_COLORS.danger.color, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11, color: TEXT.primary }}>{err}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {result.imported === 0 && (
          <Button variant="secondary" onClick={handleReset}>Try Again</Button>
        )}
        <Button variant="primary" onClick={handleDone}>
          Done — View Medicines
        </Button>
      </div>
    </>
  )

  // ─── Modal titles per phase ────────────────────────────────────────────────

  const TITLES: Record<Phase, string> = {
    upload:    'Import Medicines from CSV',
    preview:   'Preview Import',
    importing: 'Importing…',
    results:   'Import Complete',
  }

  return (
    <Modal open title={TITLES[phase]} onClose={phase === 'importing' ? () => {} : onClose} size="lg">
      {phase === 'upload'    && uploadPhase}
      {phase === 'preview'   && previewPhase}
      {phase === 'importing' && importingPhase}
      {phase === 'results'   && resultsPhase}
    </Modal>
  )
}
