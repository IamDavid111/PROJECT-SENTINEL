import { useState } from 'react'

import {
  Accordion,
  Alert,
  Button,
  CommandPalette,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  Tooltip,
  type CommandItem,
} from '../../components/ui'
import { Demo, Row, Section, Stack } from './shared'

const COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'dashboard', icon: 'dashboard', onSelect: () => undefined },
  { id: 'report', label: 'Report Incident', hint: 'report-incident', icon: 'reportIncident', onSelect: () => undefined },
  { id: 'actions', label: 'Actions', hint: 'corrective-actions', icon: 'correctiveActions', onSelect: () => undefined },
  { id: 'knowledge', label: 'QHSE Knowledge', hint: 'knowledge', icon: 'knowledge', onSelect: () => undefined },
  { id: 'analytics', label: 'Executive Analytics', hint: 'executive-analytics', icon: 'executiveAnalytics', onSelect: () => undefined },
]

export function OverlaysSection() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  return (
    <Section
      id="overlays"
      eyebrow="06 · Overlays"
      title="Dialogs, disclosures & search"
      description="Interactive layers share one focus/escape/backdrop contract. No native window.confirm, no hand-rolled backdrops."
    >
      <Demo title="Dialog" description="Focus moves into the panel, Escape and backdrop close, focus returns to the trigger, body scroll locks." importName="Dialog">
        <Row>
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>Open confirm dialog</Button>
          <Button variant="outline" onClick={() => setPaletteOpen(true)}>Open command palette</Button>
        </Row>

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Add emergency contact"
          description="This contact appears in the workspace header for everyone in your organization."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => setDialogOpen(false)}>Save contact</Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Field label="Contact name" htmlFor="contact-name" required>
              <Input id="contact-name" placeholder="Full name" />
            </Field>
            <Field label="Role or service" htmlFor="contact-role">
              <Input id="contact-role" placeholder="Site supervisor" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number" htmlFor="contact-phone" required>
                <Input id="contact-phone" type="tel" placeholder="+1 555 0100" />
              </Field>
              <Field label="Email address" htmlFor="contact-email">
                <Input id="contact-email" type="email" placeholder="name@company.com" />
              </Field>
            </div>
          </div>
        </Dialog>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Remove this contact?"
          description="The contact will stop appearing in the emergency panel. This cannot be undone."
          confirmLabel="Remove contact"
        >
          <Alert tone="warning" title="Emergency coverage">
            Confirm another active contact is available before removing this one.
          </Alert>
        </ConfirmDialog>
      </Demo>

      <Demo title="Confirm dialog" description="The destructive confirm pattern that replaces window.confirm." importName="ConfirmDialog">
        <Row>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Remove contact</Button>
        </Row>
      </Demo>

      <Demo title="Command palette" description="Keyboard-first workspace search. Opens with ⌘K / Ctrl+K." importName="CommandPalette">
        <Row>
          <Button variant="outline" onClick={() => setPaletteOpen(true)}>Open palette</Button>
        </Row>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={COMMANDS} />
      </Demo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Accordion / disclosure" description="Native details for methodology, history and secondary explainers." importName="Accordion">
          <Stack>
            <Accordion title="Snapshot coverage and reporting methodology" icon="info" defaultOpen>
              <p>Reporting uses UTC half-open windows. Near misses compare month-to-date with the same elapsed portion of the previous month.</p>
              <p className="mt-2">Read-only and advisory. No records are changed by viewing this panel.</p>
            </Accordion>
            <Accordion title="Why this recommendation · 3 supported drivers" icon="help">
              <ul className="grid list-disc gap-2 pl-4">
                <li>Open Critical reports at the site.</li>
                <li>Unfinished Critical-linked actions past their due date.</li>
                <li>High-severity reports closed in the last 90 days.</li>
              </ul>
            </Accordion>
            <Accordion title="Your conversations · 12" icon="history">
              <p>Private chats expire 30 days after creation. Context is bounded; this is not permanent memory.</p>
            </Accordion>
          </Stack>
        </Demo>

        <Demo title="Tooltips" description="Hover and keyboard focus reveal the same explanation. Icon-only controls already include a label." importName="Tooltip">
          <Row className="min-h-24 items-center">
            <Tooltip label="Refresh authorized snapshot">
              <Button variant="outline" size="sm">Hover me</Button>
            </Tooltip>
            <Tooltip label="Export is read-only and makes no provider calls" side="bottom">
              <Button variant="ghost" size="sm">Methodology</Button>
            </Tooltip>
            <Tooltip label="Critical severity" side="right">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-sm font-semibold text-danger">4</span>
            </Tooltip>
          </Row>
        </Demo>
      </div>

      <Demo title="Select inside a dialog" description="Native select keeps its keyboard behavior inside the focus-managed panel.">
        <Row>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>Open form dialog</Button>
          <Select aria-label="Dialog select example" defaultValue="high" className="max-w-48">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          <Textarea aria-label="Dialog textarea example" rows={1} placeholder="Inline textarea" className="max-w-64" />
        </Row>
      </Demo>
    </Section>
  )
}
