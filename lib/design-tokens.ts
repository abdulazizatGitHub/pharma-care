export const BRAND = {
  primary: '#0F6E56',
  hover: '#0a5a45',
  light: '#E1F5EE',
  mid: '#1D9E75',
  border: '#5DCAA5',
} as const

export const SIDEBAR = {
  bg: '#0a1628',
  sectionLabel: 'rgba(255,255,255,0.25)',
  iconInactive: 'rgba(255,255,255,0.55)',
  hoverBg: 'rgba(255,255,255,0.08)',
  activeBg: '#0F6E56',
  activeFg: '#ffffff',
  textInactive: 'rgba(255,255,255,0.55)',
  widthCollapsed: '52px',
  widthExpanded: '200px',
} as const

export const PAGE = {
  bg: '#f0f2f5',
  surface: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.15)',
} as const

export const TEXT = {
  primary: '#111827',
  secondary: '#6b7280',
  muted: '#9ca3af',
} as const

export const BADGE_COLORS = {
  success: { bg: '#E1F5EE', color: '#0F6E56' },
  warning: { bg: '#FAEEDA', color: '#854F0B' },
  danger:  { bg: '#FCEBEB', color: '#A32D2D' },
  info:    { bg: '#E6F1FB', color: '#185FA5' },
  neutral: { bg: '#f3f4f6', color: '#374151' },
  amber:   { bg: '#FAEEDA', color: '#854F0B' },
} as const

export const RADIUS = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '10px',
} as const

export const FONT = {
  statLabel:    '11px',
  statValue:    '20px',
  statTrend:    '11px',
  cardTitle:    '12px',
  tableHeader:  '10px',
  tableCell:    '12px',
  navLabel:     '12px',
  navSection:   '10px',
  topbarTitle:  '14px',
  pageHeading:  '20px',
  pageSubhead:  '13px',
} as const

// Sidebar icon size (px) — used where icon sizes are passed as numbers
export const ICON_SIZE = {
  xs: 13,
  sm: 15,
  nav: 17,
  md: 16,
  lg: 20,
} as const
