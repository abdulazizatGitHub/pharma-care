export const fmtPKR = (n: number): string =>
  `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtShortDate = (s: string): string => {
  try {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-PK', {
      day: '2-digit', month: 'short',
    })
  } catch { return s }
}

export const fmtAxis = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

export function getPreviousPeriod(
  from: string,
  to:   string,
): { from: string; to: string } {
  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const diffMs   = toDate.getTime() - fromDate.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1
  const prevTo   = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - diffDays + 1)
  return {
    from: prevFrom.toISOString().split('T')[0],
    to:   prevTo.toISOString().split('T')[0],
  }
}
