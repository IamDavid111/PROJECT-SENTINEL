import { Button, Icon, PageHeader } from '../../components/ui'
import { ICONS, type IconName } from '../../lib/icons'
import { ColumnGrid, Demo, Row, Section, Swatch, TypeSpec } from './Shared'

const PALETTE = [
  { name: 'brand', value: '#12a94f', role: 'Primary action · success' },
  { name: 'brand-dark', value: '#0f8d43', role: 'Hover / active green' },
  { name: 'ink', value: '#071225', role: 'Dark surfaces · sidebar' },
  { name: 'ink-2', value: '#0a1528', role: 'Dark surface step' },
  { name: 'ink-3', value: '#172337', role: 'Dark surface step' },
  { name: 'accent', value: '#f97316', role: 'Attention · high severity' },
  { name: 'danger', value: '#dc2626', role: 'Destructive · critical' },
  { name: 'caution', value: '#f59e0b', role: 'Warning · medium' },
  { name: 'foreground', value: '#0f172a', role: 'Primary text' },
  { name: 'muted', value: '#61718b', role: 'Secondary text' },
  { name: 'line', value: '#dfe5ec', role: 'Hairlines · borders' },
  { name: 'surface', value: '#f8f9fa', role: 'Page surface' },
  { name: 'surface-soft', value: '#f7f9fb', role: 'Sunken surface' },
]

const ICON_SAMPLE: IconName[] = [
  'dashboard',
  'reportIncident',
  'inspections',
  'correctiveActions',
  'aiAssistant',
  'executiveAnalytics',
  'knowledge',
  'marketplace',
  'search',
  'filter',
  'download',
  'upload',
  'check',
  'warning',
  'danger',
  'clock',
  'calendar',
  'location',
  'file',
  'archive',
  'history',
  'chatBot',
  'camera',
  'spinner',
]

export function FoundationsSection() {
  return (
    <Section
      id="foundations"
      eyebrow="01 · Foundations"
      title="Tokens & type"
      description="The frozen palette, three typefaces and one radius/shadow language. Every component below consumes these tokens — never inline hex."
    >
      <Demo title="Page header rack" description="Eyebrow → display title → description → actions. The same rack opens every workspace page.">
        <PageHeader
          eyebrow="Operations & QHSE"
          title="Incident Management"
          headingLevel="h3"
          description="48 records match the current filters. Organization coverage · 30-day window."
          actions={
            <>
              <Button variant="outline" size="sm">Refresh</Button>
              <Button size="sm">Report incident</Button>
            </>
          }
        />
      </Demo>

      <Demo title="Palette" description="Values are mirrored 1:1 into Tailwind v4 @theme tokens.">
        <ColumnGrid className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {PALETTE.map((color) => (
            <Swatch key={color.name} {...color} />
          ))}
        </ColumnGrid>
      </Demo>

      <Demo title="Type ramp" description="Space Grotesk for display, Inter for UI, IBM Plex Mono for field codes.">
        <div className="grid gap-4">
          <TypeSpec label="Display / KPI numeral" sample="2,418" className="font-display text-5xl font-semibold tabular-nums tracking-tight text-foreground" />
          <TypeSpec label="Page title" sample="Incident Management" className="font-display text-3xl font-semibold tracking-tight text-foreground" />
          <TypeSpec label="Section title" sample="High-risk locations" className="font-display text-xl font-semibold text-foreground" />
          <TypeSpec label="Body" sample="Capture every event in the field, close every corrective action, and forecast where the next incident is most likely to happen." className="text-sm leading-relaxed text-foreground" />
          <TypeSpec label="Caption / muted" sample="Snapshot 2026-10-29 14:20 UTC · Organization coverage" className="text-xs text-muted" />
          <TypeSpec label="Field code / mono" sample="INC-2026-0042 · 51.5072, -0.1276 · 2026-10-29T14:20Z" className="font-mono text-xs text-foreground" />
          <TypeSpec label="Eyebrow" sample="OPERATIONS & QHSE" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" />
        </div>
      </Demo>

      <Demo title="Radius, elevation & focus" description="One card radius (18px), one card shadow, one green focus ring.">
        <Row className="items-stretch">
          <div className="grid gap-2">
            <div className="h-20 w-32 rounded-lg border border-line bg-surface-soft" />
            <span className="text-xs text-muted">rounded-lg · 8px</span>
          </div>
          <div className="grid gap-2">
            <div className="h-20 w-32 rounded-xl border border-line bg-surface-soft" />
            <span className="text-xs text-muted">rounded-xl · 12px</span>
          </div>
          <div className="grid gap-2">
            <div className="h-20 w-32 rounded-card border border-line bg-surface shadow-card" />
            <span className="text-xs text-muted">rounded-card · 18px</span>
          </div>
          <div className="grid gap-2">
            <button type="button" className="h-20 w-32 rounded-xl border border-line bg-surface text-sm font-medium text-foreground">
              Focus me
            </button>
            <span className="text-xs text-muted">focus-visible ring</span>
          </div>
        </Row>
      </Demo>

      <Demo title="Icon vocabulary" description={`${Object.keys(ICONS).length} registered HugeIcons, rendered offline through <Icon>.`}>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {ICON_SAMPLE.map((name) => (
            <div key={name} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-2 py-3 text-center">
              <Icon name={name} size={20} className="text-foreground" />
              <code className="w-full truncate font-mono text-[10px] text-muted" title={name}>{name}</code>
            </div>
          ))}
        </div>
      </Demo>
    </Section>
  )
}
