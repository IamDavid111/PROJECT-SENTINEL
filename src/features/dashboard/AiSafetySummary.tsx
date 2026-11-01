import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import type { Role } from '../../types'

export type AiSafetySummaryProps = {
  organizationId: string
  role: Role
  hasAuthorizedQhseData: boolean
}

const sections = [
  ['Top risks this week', 'Top-risk analysis will appear when authorized incident and risk data is available.'],
  ['High-risk locations', 'Location-level risk analysis will appear when site and incident records are available.'],
  ['Most common hazards', 'Hazard patterns will appear when validated incident and observation records are available.'],
  ['Recent incident summary', 'Incident summaries will appear when incident records are available.'],
] as const

// This panel is a foundation placeholder: it explains planned analysis but does not call an AI service yet.
export function AiSafetySummary({ organizationId, role, hasAuthorizedQhseData }: AiSafetySummaryProps) {
  void organizationId
  void role
  return (
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">AI Safety Intelligence</span>
          </div>
          <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-foreground">AI Safety Summary</h2>
        </div>
        <Badge tone="warning">Foundation</Badge>
      </div>

      <div className="mt-4 grid gap-1 rounded-l-none rounded-r-xl border-l-2 border-brand bg-surface-soft p-4">
        <strong className="text-sm text-foreground">AI analysis will appear here once sufficient QHSE data is available.</strong>
        <span className="text-xs text-muted">
          {hasAuthorizedQhseData ? 'The authorized data layer is ready for an AI provider.' : 'No authorized QHSE data is available for analysis yet.'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map(([title, description]) => (
          <section key={title} className="rounded-xl border border-line bg-surface-soft p-4">
            <strong className="text-sm text-foreground">{title}</strong>
            <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
          </section>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">Future flow: authorized QHSE data → secured retrieval layer → AI Safety Intelligence → dashboard and assistant.</p>
    </Card>
  )
}
