import {
  Alert,
  Button,
  EmptyState,
  Progress,
  Skeleton,
  Spinner,
  SpinnerCenter,
  useToast,
} from '../../components/ui'
import { ColumnGrid, Demo, Row, Section, Stack } from './shared'

export function FeedbackSection() {
  const { toast } = useToast()

  return (
    <Section
      id="feedback"
      eyebrow="05 · Feedback"
      title="Alerts, loading & empty states"
      description="One Alert for inline messages, one toast for transient confirmation, one EmptyState for every dead end."
    >
      <Demo title="Inline alerts" description="success · info · warning · danger. Announced with role=alert.">
        <Stack>
          <Alert tone="success" title="Company settings saved">Your changes are visible to the organization.</Alert>
          <Alert tone="info" title="Snapshot refreshed">Authorized operational data is connected.</Alert>
          <Alert tone="warning" title="Partial coverage">Some site counts are incomplete; review the limitations before planning.</Alert>
          <Alert tone="danger" title="Unable to close this incident">A completed corrective action is required.</Alert>
        </Stack>
      </Demo>

      <Demo title="Toasts" description="Transient confirmation, auto-dismissed. Use for save success — not for errors that need action.">
        <Row>
          <Button
            size="sm"
            onClick={() => toast({ tone: 'success', title: 'Changes saved', description: 'Incident closure delegation updated.' })}
          >
            Success toast
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast({ tone: 'info', title: 'Refresh queued', description: 'The snapshot will update in a moment.' })}
          >
            Info toast
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast({ tone: 'warning', title: 'Coverage incomplete', description: 'Some records could not be retrieved.' })}
          >
            Warning toast
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => toast({ tone: 'danger', title: 'Export failed', description: 'No file was downloaded. Try again.' })}
          >
            Danger toast
          </Button>
        </Row>
      </Demo>

      <Demo title="Empty states" description="Direction, not a dead end: say what the screen is for and offer the next action.">
        <ColumnGrid>
          <EmptyState
            title="No incident reports found"
            description="Start by reporting your first incident. Drafts save automatically."
            action={<Button size="sm">Report incident</Button>}
          />
          <EmptyState
            icon="folder"
            title="No documents visible"
            description="No approved QHSE documents are available to your account yet."
            action={<Button size="sm" variant="outline">Request access</Button>}
          />
          <EmptyState
            icon="inbox"
            title="No actions assigned"
            description="When a corrective action is assigned to you, it will appear here."
          />
        </ColumnGrid>
      </Demo>

      <Demo title="Loading" description="Solid arc spinner. Default fill is white; pass fill='currentColor' on light surfaces." importName="Spinner">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="grid gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Inline</span>
            <Row><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink"><Spinner /></span> <span className="text-sm text-muted">Default white fill</span></Row>
            <Row><Spinner fill="currentColor" className="text-brand" /> <span className="text-sm text-muted">currentColor fill</span></Row>
            <Row><Button size="sm" loading>Refreshing…</Button></Row>
          </div>
          <div className="rounded-xl border border-line bg-surface">
            <span className="block px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Centered</span>
            <SpinnerCenter label="Loading dashboard data…" fill="currentColor" className="text-brand" />
          </div>
          <div className="grid gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Skeleton</span>
            <Skeleton variant="text" className="w-2/3" />
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="line" />
            <div className="flex items-center gap-3">
              <Skeleton variant="circle" className="h-10 w-10" />
              <div className="grid flex-1 gap-2">
                <Skeleton variant="text" className="w-1/2" />
                <Skeleton variant="text" className="w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </Demo>

      <Demo title="Progress" description="Determinate bars for wizard stages, uploads and loading gates.">
        <div className="grid gap-5">
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>Report completion</span><span className="font-mono">2 / 4</span></div>
            <Progress value={2} max={4} label="Report completion" />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>Upload</span><span className="font-mono">68%</span></div>
            <Progress value={68} label="Upload" tone="accent" />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>Coverage</span><span className="font-mono">92%</span></div>
            <Progress value={92} label="Coverage" />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>Storage</span><span className="font-mono">98%</span></div>
            <Progress value={98} label="Storage" tone="danger" />
          </div>
        </div>
      </Demo>

      <Demo title="Error & retry state" description="State what happened, what it means, and the next action.">
        <div className="grid gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-danger">⚠</span>
            <div className="grid gap-1">
              <strong className="text-sm font-semibold text-foreground">Unable to load analytics</strong>
              <p className="text-sm text-muted">The authorized snapshot endpoint did not respond. No partial results are displayed.</p>
              <p className="font-mono text-[11px] text-muted">Request reference: 8f3c-2026-10-29</p>
            </div>
          </div>
          <Row className="justify-end">
            <Button size="sm" variant="outline">Refresh</Button>
          </Row>
        </div>
      </Demo>
    </Section>
  )
}
