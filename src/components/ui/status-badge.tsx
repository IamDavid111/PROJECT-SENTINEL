import type { ReactNode } from 'react'

import { Badge } from './badge'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'info'

/**
 * One tone map for every record status in the app: incidents, actions,
 * knowledge versions, invitations and account states. Lowercase + underscores
 * are normalized, so `pending_review`, `Pending Review` and `PENDING_REVIEW`
 * all resolve to the same chip.
 */
export const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  approved: 'success',
  archived: 'neutral',
  closed: 'success',
  complete: 'success',
  completed: 'success',
  resolved: 'success',
  verified: 'success',
  draft: 'neutral',
  inactive: 'neutral',
  superseded: 'neutral',
  pending: 'warning',
  pending_review: 'warning',
  under_review: 'info',
  submitted: 'info',
  in_progress: 'info',
  sent: 'info',
  open: 'warning',
  overdue: 'danger',
  rejected: 'danger',
  failed: 'danger',
  suspended: 'danger',
  expired: 'danger',
  revoked: 'danger',
}

export function statusLabel(status: string): string {
  return status
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export interface StatusBadgeProps {
  status: string | null | undefined
  /** Override the derived label. */
  label?: ReactNode
  /** Override the mapped tone. */
  tone?: StatusTone
  className?: string
}

/** Universal record-status chip. Never color-only: the word is always shown. */
export function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  if (!status) return <Badge tone="neutral" className={className}>Not set</Badge>
  const key = status.toLowerCase().replace(/\s+/g, '_')
  return (
    <Badge tone={tone ?? STATUS_TONES[key] ?? 'neutral'} className={className}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}
