'use client'

import React from 'react'
import { CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'
import type { PolicyEvalResult } from '@/app/actions/returns'

interface Props {
  policy:     PolicyEvalResult | null
  loading:    boolean
  packOpened: boolean
  compact?:   boolean
}

type RuleStatus = 'pass' | 'warn' | 'block'

interface Rule {
  label:   string
  status:  RuleStatus
  detail?: string
}

function RuleRow({ rule, compact }: { rule: Rule; compact: boolean }) {
  const icon =
    rule.status === 'pass'  ? <CheckCircle  size={compact ? 11 : 13} style={{ color: '#16A34A', flexShrink: 0 }} /> :
    rule.status === 'warn'  ? <AlertTriangle size={compact ? 11 : 13} style={{ color: '#D97706', flexShrink: 0 }} /> :
                              <XCircle       size={compact ? 11 : 13} style={{ color: '#DC2626', flexShrink: 0 }} />

  const textColor =
    rule.status === 'pass'  ? '#374151' :
    rule.status === 'warn'  ? '#92400E' : '#991B1B'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: compact ? '4px 0' : '6px 0' }}>
      <span style={{ marginTop: 1 }}>{icon}</span>
      <div>
        <p style={{ fontSize: compact ? 11 : 12, color: textColor, fontWeight: rule.status !== 'pass' ? 500 : 400 }}>
          {rule.label}
        </p>
        {!compact && rule.detail && (
          <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{rule.detail}</p>
        )}
      </div>
    </div>
  )
}

export function PolicyCheckCard({ policy, loading, packOpened: _packOpened, compact = false }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', fontSize: 11, color: '#9ca3af' }}>
        <Clock size={12} style={{ animationName: 'pulse' }} />
        Checking policy…
      </div>
    )
  }

  if (!policy) return null

  const rules: Rule[] = compact
    ? [
        {
          label:  policy.flags.includes('window_expired') ? 'Window expired' : 'Window OK',
          status: policy.flags.includes('window_expired') ? 'warn' : 'pass',
        },
        {
          label:  policy.flags.includes('exceeds_limit') ? 'Exceeds limit' : 'Under limit',
          status: policy.flags.includes('exceeds_limit') ? 'warn' : 'pass',
        },
        {
          label:  policy.flags.includes('opened_pack') ? 'Pack opened' : 'Pack sealed',
          status: policy.flags.includes('opened_pack') ? 'warn' : 'pass',
        },
        {
          label:  policy.controlledItems.length > 0 ? 'Controlled!' : 'No controlled',
          status: policy.controlledItems.length > 0 ? 'block' : 'pass',
        },
      ]
    : [
        {
          label:  policy.flags.includes('window_expired') ? 'Outside return window' : 'Within return window',
          status: policy.flags.includes('window_expired') ? 'warn' : 'pass',
          detail: policy.flags.includes('window_expired') ? 'Return window has expired — requires approval' : undefined,
        },
        {
          label:  policy.flags.includes('exceeds_limit') ? 'Exceeds auto-approve limit' : 'Under auto-approve limit',
          status: policy.flags.includes('exceeds_limit') ? 'warn' : 'pass',
          detail: policy.flags.includes('exceeds_limit') ? 'Refund amount too large for auto-approval' : undefined,
        },
        {
          label:  policy.flags.includes('opened_pack') ? 'Pack was opened (requires approval)' : 'Pack condition OK',
          status: policy.flags.includes('opened_pack') ? 'warn' : 'pass',
        },
        {
          label:  policy.controlledItems.length > 0 ? 'Controlled substance — cannot return' : 'No controlled substances',
          status: policy.controlledItems.length > 0 ? 'block' : 'pass',
          detail: policy.controlledItems.length > 0
            ? policy.controlledItems.map(c => c.medicine_name).join(', ')
            : undefined,
        },
      ]

  const hasHardBlock  = policy.controlledItems.length > 0
  const verdictBg     = hasHardBlock ? '#FEE2E2' : policy.wouldAutoApprove ? '#DCFCE7' : '#FEF3C7'
  const verdictBorder = hasHardBlock ? '#FCA5A5' : policy.wouldAutoApprove ? '#86EFAC' : '#FDE68A'
  const verdictColor  = hasHardBlock ? '#991B1B' : policy.wouldAutoApprove ? '#166534' : '#92400E'
  const verdictText   = hasHardBlock
    ? 'Cannot process — remove controlled medicines'
    : policy.wouldAutoApprove
      ? 'Auto-approved — will process immediately'
      : 'Requires superadmin approval — will be queued'

  return (
    <div>
      {!compact && (
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: '#6b7280', marginBottom: 4,
        }}>
          Policy check
        </p>
      )}
      <div style={{ borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: 'white', overflow: 'hidden' }}>
        <div style={{ padding: compact ? '2px 10px' : '4px 12px' }}>
          {rules.map((r, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.05)' }} />}
              <RuleRow rule={r} compact={compact} />
            </React.Fragment>
          ))}
        </div>
        <div style={{
          padding: compact ? '6px 10px' : '8px 12px',
          background: verdictBg,
          borderTop: `1px solid ${verdictBorder}`,
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          color: verdictColor,
        }}>
          {verdictText}
        </div>
      </div>
    </div>
  )
}
