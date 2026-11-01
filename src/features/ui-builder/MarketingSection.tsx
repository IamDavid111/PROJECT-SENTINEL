import { Badge, Button, Icon, type IconProps } from '../../components/ui'
import { ColumnGrid, Demo, Row, Section, Stack } from './Shared'

const FEATURES: { icon: IconProps['name']; title: string; text: string }[] = [
  { icon: 'camera', title: 'Digital incident reporting', text: 'Capture near misses to fatalities in the field with GPS, photo, video and voice evidence — online or offline.' },
  { icon: 'inspections', title: 'Inspections & audits', text: 'Digital inspection types, custom templates, pass/fail checklists and audit programmes with a live calendar.' },
  { icon: 'correctiveActions', title: 'Corrective action control', text: 'Every finding becomes a tracked action with owners, due dates, evidence and verification sign-off.' },
  { icon: 'waypoints', title: 'Predictive risk intelligence', text: 'Risk scores per facility using historical incidents, observations and operating context.' },
  { icon: 'aiAssistant', title: 'AI safety copilot', text: 'Ask plain-language questions about your safety data and get summaries, charts and recommendations.' },
  { icon: 'administration', title: 'Enterprise governance', text: 'Multi-tenant organisations, granular roles, full activity logging and exportable audit trails.' },
]

const BENEFITS: { icon: IconProps['name']; title: string; text: string }[] = [
  { icon: 'smartphone', title: 'Frontline adoption', text: 'Glove-friendly mobile reporting with offline sync means events get captured when they happen.' },
  { icon: 'trendingUp', title: 'Executive visibility', text: 'A single safety score, trend and forecast per site, department and contractor.' },
  { icon: 'fileDownload', title: 'Assurance on demand', text: 'Generate inspection, audit and corrective action reports as PDF or Excel in seconds.' },
]

const INDUSTRIES = ['Oil & Gas', 'Mining', 'Construction', 'Utilities', 'Manufacturing', 'Marine']

export function MarketingSection() {
  return (
    <Section
      id="marketing"
      eyebrow="08 · Marketing"
      title="Public page components"
      description="Landing surfaces use the same tokens and primitives as the workspace, so the brand does not fork."
    >
      <Demo title="Section intro" description="Eyebrow + display heading + lede. The standard public-section opener.">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Platform</span>
          </div>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            One operating picture for every shift, site and decision.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            SentinelQHSE connects frontline reporting, corrective actions and risk intelligence so leadership acts on evidence, not anecdotes.
          </p>
          <Row className="mt-6">
            <Button size="lg">Request demo</Button>
            <Button size="lg" variant="outline">Sign in</Button>
            <a href="#marketing" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">Contact sales</a>
          </Row>
        </div>
      </Demo>

      <Demo title="Feature cards" description="Icon tile + title + supporting copy; responsive 3 → 2 → 1.">
        <ColumnGrid>
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-card border border-line bg-surface p-6 shadow-card">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name={feature.icon} size={24} />
              </span>
              <h3 className="font-display text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.text}</p>
            </article>
          ))}
        </ColumnGrid>
      </Demo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Benefit rows" description="Icon + short label + explanation for the outcomes column.">
          <Stack>
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon name={benefit.icon} size={20} />
                </span>
                <div>
                  <strong className="block text-sm font-semibold text-foreground">{benefit.title}</strong>
                  <p className="mt-1 text-sm text-muted">{benefit.text}</p>
                </div>
              </div>
            ))}
          </Stack>
        </Demo>

        <Demo title="Industry cards" description="Compact taxonomy tiles for the industries band.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {INDUSTRIES.map((industry) => (
              <div key={industry} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-4 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon name="factory" size={18} />
                </span>
                <strong className="text-sm font-semibold text-foreground">{industry}</strong>
              </div>
            ))}
          </div>
        </Demo>
      </div>

      <Demo title="Quote cards" description="Testimonial surface for the public page.">
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { quote: 'We finally have one version of the truth for incidents, actions and audit evidence.', name: 'Operations Director', org: 'Energy operator (placeholder)' },
            { quote: 'The closure discipline alone changed how our supervisors sign off corrective actions.', name: 'HSE Manager', org: 'Industrial contractor (placeholder)' },
          ].map((item) => (
            <blockquote key={item.name} className="rounded-card border border-line bg-surface p-6">
              <p className="text-lg leading-relaxed text-foreground">“{item.quote}”</p>
              <footer className="mt-5 grid gap-0.5">
                <strong className="text-sm font-semibold text-foreground">{item.name}</strong>
                <span className="text-xs text-muted">{item.org}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </Demo>

      <Demo title="Status & badge vocabulary" description="Public-page chips reuse the same tones as the workspace.">
        <Row>
          <Badge tone="success">Online</Badge>
          <Badge tone="info">Offline-ready</Badge>
          <Badge tone="warning">Pilot</Badge>
          <Badge tone="neutral">Enterprise</Badge>
          <Badge tone="accent">New</Badge>
        </Row>
      </Demo>
    </Section>
  )
}
