// Severity model shared by the UI kit (signal bar, badges, KPI cards).
// Colors stay on the SentinelQHSE palette — no drifting from the tokens.

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export const SEVERITY_LEVELS: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

export const SEVERITY_META: Record<
  SeverityLevel,
  { label: string; level: number; segmentClass: string }
> = {
  low: { label: 'Low', level: 1, segmentClass: 'bg-brand' },
  medium: { label: 'Medium', level: 2, segmentClass: 'bg-caution' },
  high: { label: 'High', level: 3, segmentClass: 'bg-accent' },
  critical: { label: 'Critical', level: 4, segmentClass: 'bg-danger' },
}

export function isSeverityLevel(value: string | null | undefined): value is SeverityLevel {
  return value !== null && SEVERITY_LEVELS.includes(value as SeverityLevel)
}