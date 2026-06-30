'use client'

import React from 'react'

interface PaginationProps {
  currentPage:  number
  totalPages:   number
  totalCount:   number
  pageSize:     number
  onPageChange: (page: number) => void
  className?:   string
}

function getPageNumbers(
  currentPage: number,
  totalPages:  number,
): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages: (number | '...')[] = [1]
  if (currentPage > 3) pages.push('...')
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
    pages.push(i)
  }
  if (currentPage < totalPages - 2) pages.push('...')
  pages.push(totalPages)
  return pages
}

const BASE_BTN: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  background: 'white',
  cursor: 'pointer',
  color: '#374151',
  minWidth: 32,
  textAlign: 'center',
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const from  = (currentPage - 1) * pageSize + 1
  const to    = Math.min(currentPage * pageSize, totalCount)
  const pages = getPageNumbers(currentPage, totalPages)

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderTop: '1px solid #e5e7eb',
        marginTop: 8,
      }}
    >
      <span style={{ fontSize: 12, color: '#6b7280' }}>
        Showing {from}–{to} of {totalCount} results
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            ...BASE_BTN,
            opacity: currentPage === 1 ? 0.4 : 1,
            cursor:  currentPage === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Prev
        </button>

        {pages.map((entry, i) =>
          entry === '...' ? (
            <span
              key={`ellipsis-${i}`}
              style={{ padding: '4px 6px', fontSize: 12, color: '#9ca3af' }}
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              onClick={() => onPageChange(entry)}
              disabled={entry === currentPage}
              style={{
                ...BASE_BTN,
                background: entry === currentPage ? '#0F6E56' : 'white',
                color:      entry === currentPage ? 'white'   : '#374151',
                border:     entry === currentPage ? '1px solid #0F6E56' : '1px solid #e5e7eb',
                cursor:     entry === currentPage ? 'default' : 'pointer',
              }}
            >
              {entry}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            ...BASE_BTN,
            opacity: currentPage === totalPages ? 0.4 : 1,
            cursor:  currentPage === totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
