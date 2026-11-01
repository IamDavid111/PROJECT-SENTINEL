import { useState } from 'react'

import {
  Button,
  DropdownMenu,
  ExportMenu,
  IconButton,
  SegmentedControl,
  Stepper,
  buttonVariants,
} from '../../components/ui'
import { cn } from '../../lib/utils'
import { Demo, Row, Section, Stack } from './Shared'

const WINDOW_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All Time' },
] as const

const STEPS = [
  { id: 'event', label: 'Event' },
  { id: 'location', label: 'Location & context' },
  { id: 'people', label: 'People' },
  { id: 'evidence', label: 'Evidence & sign-off' },
]

export function ActionsSection() {
  const [windowValue, setWindowValue] = useState<'30' | '90' | 'all'>('90')
  const [step, setStep] = useState(1)

  return (
    <Section
      id="actions"
      eyebrow="02 · Actions"
      title="Buttons & triggers"
      description="One Button owns every action style. SegmentedControl owns view switches; DropdownMenu owns overflow actions."
    >
      <Demo title="Button variants" description="default · secondary · outline · ghost · danger · accent. `inverse` is for dark surfaces." importName="Button">
        <Stack>
          <Row>
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="accent">Review</Button>
          </Row>
          <div className="rounded-xl bg-ink p-4">
            <Button variant="inverse">Inverse / on dark</Button>
          </div>
        </Stack>
      </Demo>

      <Demo title="Sizes" description="sm (h-8) · default (h-9) · lg (h-10) · icon (36×36)." importName="Button">
        <Row>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <span className="text-lg leading-none">+</span>
          </Button>
        </Row>
      </Demo>

      <Demo title="States" description="Loading uses the spinner icon and aria-busy; disabled dims and blocks pointer events." importName="Button">
        <Row>
          <Button loading>Loading…</Button>
          <Button variant="outline" loading>Refreshing…</Button>
          <Button disabled>Disabled</Button>
          <Button variant="danger" disabled>Disabled danger</Button>
          <Button>
            Continue
            <span aria-hidden="true">→</span>
          </Button>
        </Row>
      </Demo>

      <Demo title="Icon buttons" description="Every icon-only control requires a `label` for the accessible name and tooltip." importName="IconButton">
        <Row>
          <IconButton icon="search" label="Search" variant="ghost" />
          <IconButton icon="notifications" label="Notifications" variant="ghost" />
          <IconButton icon="messages" label="Messages" variant="ghost" />
          <IconButton icon="settings" label="Settings" variant="outline" />
          <IconButton icon="refresh" label="Refresh" variant="outline" />
          <IconButton icon="trash" label="Remove" variant="outline" />
        </Row>
      </Demo>

      <Demo title="Link actions" description="Anchor styled as a button; inline links stay underlined and inherit the brand color." importName="Button">
        <Row>
          <a href="#actions" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Open register</a>
          <a href="#actions" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>Back to dashboard</a>
          <a href="#actions" className="text-sm font-medium text-brand-dark underline underline-offset-4">Forgot password?</a>
          <button type="button" className="text-sm font-medium text-muted underline-offset-4 hover:underline">Clear filters</button>
        </Row>
      </Demo>

      <Demo title="Segmented control" description="Reporting window, date basis, My/Organization views. Radio-group semantics, not page tabs." importName="SegmentedControl">
        <Stack>
          <SegmentedControl label="Reporting window" options={WINDOW_OPTIONS} value={windowValue} onChange={setWindowValue} />
          <p className="text-xs text-muted">
            Selected: <span className="font-mono text-foreground">{windowValue}</span>
          </p>
          <SegmentedControl
            label="Density"
            size="md"
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
              { value: 'dense', label: 'Dense', disabled: true },
            ]}
            value="comfortable"
            onChange={() => undefined}
          />
        </Stack>
      </Demo>

      <Demo title="Stepper" description="Incident wizard stages. Completed stages are clickable; future stages are locked." importName="Stepper">
        <Stepper steps={STEPS} activeIndex={step} onStepClick={setStep} />
      </Demo>

      <Demo title="Dropdown menu" description="Overflow actions built on native details: Escape and outside-click close it." importName="DropdownMenu">
        <Row>
          <DropdownMenu
            label="Export Report"
            items={[
              { id: 'pdf', label: 'PDF', icon: 'fileDownload' },
              { id: 'docx', label: 'Word document (.docx)', icon: 'file' },
              { id: 'print', label: 'Print', icon: 'print' },
            ]}
          />
          <DropdownMenu
            label="Row actions"
            variant="outline"
            items={[
              { id: 'view', label: 'View details', icon: 'eye' },
              { id: 'edit', label: 'Edit', icon: 'edit' },
              { id: 'close', label: 'Close incident', icon: 'check' },
              { id: 'delete', label: 'Delete', icon: 'trash', tone: 'danger' },
            ]}
          />
        </Row>
      </Demo>

      <Demo title="Export menu" description="PDF / Word / Excel / CSV / Print with a busy label." importName="ExportMenu">
        <Row>
          <ExportMenu onExport={() => undefined} />
          <ExportMenu busy onExport={() => undefined} label="Export Report" />
          <ExportMenu disabled onExport={() => undefined} label="Export (unavailable)" />
        </Row>
      </Demo>
    </Section>
  )
}
