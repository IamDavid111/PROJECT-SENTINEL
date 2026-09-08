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
  ['Safety recommendations', 'Recommendations will appear after the AI service is connected to approved QHSE data.'],
  ['Recent incident summary', 'Incident summaries will appear when incident records are available.'],
] as const

export function AiSafetySummary({ organizationId, role, hasAuthorizedQhseData }: AiSafetySummaryProps) {
  void organizationId
  void role
  return <article className="dashboard-card ai-safety-summary"><div className="dashboard-card-heading"><div><div className="eyebrow">AI SAFETY INTELLIGENCE</div><h3>AI Safety Summary</h3></div><span className="ai-status">Foundation</span></div><div className="ai-summary-intro"><strong>AI analysis will appear here once sufficient QHSE data is available.</strong><span>{hasAuthorizedQhseData ? 'The authorized data layer is ready for an AI provider.' : 'No authorized QHSE data is available for analysis yet.'}</span></div><div className="ai-summary-grid">{sections.map(([title, description]) => <section key={title}><strong>{title}</strong><p>{description}</p></section>)}</div><p className="ai-summary-note">Future flow: authorized QHSE data → secured retrieval layer → AI Safety Intelligence → dashboard and assistant.</p></article>
}
