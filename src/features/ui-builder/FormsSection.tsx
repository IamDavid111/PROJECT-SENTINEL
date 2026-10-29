import { useState } from 'react'

import {
  Button,
  Checkbox,
  Combobox,
  Field,
  FileUpload,
  FilterBar,
  FormActions,
  FormFull,
  FormGrid,
  FormSection,
  Input,
  Label,
  RadioGroup,
  SearchField,
  Select,
  Textarea,
  Toggle,
  type FileUploadItem,
} from '../../components/ui'
import { Demo, Section, Stack } from './shared'

export function FormsSection() {
  const [notes, setNotes] = useState('')
  const [acknowledged, setAcknowledged] = useState(true)
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(false)
  const [reportType, setReportType] = useState('incident')
  const [severity, setSeverity] = useState('high')
  const [site, setSite] = useState<string | null>('north')
  const [search, setSearch] = useState('')
  const [files, setFiles] = useState<FileUploadItem[]>([])

  const SITE_OPTIONS = [
    { value: 'north', label: 'North Field Terminal', description: 'Operations · 12 open reports' },
    { value: 'coastal', label: 'Coastal Processing Unit', description: 'Processing · 8 open reports' },
    { value: 'offshore', label: 'Offshore Platform A', description: 'Marine · 3 open reports' },
    { value: 'depot', label: 'Central Depot', description: 'Logistics · 5 open reports', disabled: true },
  ]

  return (
    <Section
      id="forms"
      eyebrow="03 · Forms"
      title="Fields & inputs"
      description="Every field is a Field wrapper: label, required marker, control, hint and inline error. Native controls keep their keyboard behavior."
    >
      <Demo title="Text inputs" description="text · email · password · search · tel · date · time · datetime-local." importName="Input">
        <FormGrid className="lg:grid-cols-3">
          <Field label="Work email" htmlFor="ui-email" required hint="Use your organization address.">
            <Input id="ui-email" type="email" placeholder="you@company.com" />
          </Field>
          <Field label="Password" htmlFor="ui-password" required>
            <Input id="ui-password" type="password" placeholder="Enter your password" />
          </Field>
          <Field label="Search" htmlFor="ui-search">
            <Input id="ui-search" type="search" placeholder="Search reference, title, site…" />
          </Field>
          <Field label="Phone" htmlFor="ui-phone">
            <Input id="ui-phone" type="tel" placeholder="+1 555 0100" />
          </Field>
          <Field label="Date" htmlFor="ui-date">
            <Input id="ui-date" type="date" />
          </Field>
          <Field label="Due date and time" htmlFor="ui-datetime">
            <Input id="ui-datetime" type="datetime-local" />
          </Field>
        </FormGrid>
      </Demo>

      <Demo title="Input states" description="Default, invalid, disabled and read-only." importName="Input">
        <FormGrid>
          <Field label="Default" htmlFor="ui-default">
            <Input id="ui-default" placeholder="Normal field" />
          </Field>
          <Field label="Invalid" htmlFor="ui-invalid" error="A reference number is required.">
            <Input id="ui-invalid" invalid placeholder="Missing value" />
          </Field>
          <Field label="Disabled" htmlFor="ui-disabled">
            <Input id="ui-disabled" disabled value="Not editable" readOnly />
          </Field>
          <Field label="Managed by administrator" htmlFor="ui-readonly" hint="Contact your administrator to change this.">
            <Input id="ui-readonly" readOnly value="Jordan Ellis" />
          </Field>
        </FormGrid>
      </Demo>

      <Demo title="Select & textarea" description="Native select with kit chevron; textarea with live character count." importName="Select">
        <FormGrid>
          <Field label="Incident category" htmlFor="ui-category" required>
            <Select id="ui-category" defaultValue="">
              <option value="" disabled>Select incident category</option>
              <option>Slip, trip or fall</option>
              <option>Equipment failure</option>
              <option>Environmental release</option>
              <option>Near miss</option>
            </Select>
          </Field>
          <Field label="Severity" htmlFor="ui-severity">
            <Select id="ui-severity" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
          <FormFull>
            <Field label="Description" htmlFor="ui-notes" required hint={`${notes.length}/4,000 characters`}>
              <Textarea
                id="ui-notes"
                rows={4}
                maxLength={4000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What happened, in plain factual language?"
              />
            </Field>
          </FormFull>
        </FormGrid>
      </Demo>

      <Demo title="Checkbox & toggle" description="Checkbox for multi-select and sign-off; Toggle for immediate settings switches." importName="Checkbox">
        <div className="grid gap-5 sm:grid-cols-2">
          <Stack>
            <Label>Checkboxes</Label>
            <Checkbox checked={acknowledged} onChange={setAcknowledged} label="I confirm this report is accurate." />
            <Checkbox checked={false} onChange={() => undefined} label="Notify the site supervisor" />
            <Checkbox checked disabled onChange={() => undefined} label="Disabled option" />
          </Stack>
          <Stack>
            <Label>Switches</Label>
            <Toggle checked={emailAlerts} onCheckedChange={setEmailAlerts} label="Email alerts" />
            <Toggle checked={smsAlerts} onCheckedChange={setSmsAlerts} label="SMS alerts" />
            <Toggle checked={false} disabled onCheckedChange={() => undefined} label="Push (unavailable)" />
          </Stack>
        </div>
      </Demo>

      <Demo title="Radio group" description="Compact list and selectable cards (incident type / sign-in type)." importName="RadioGroup">
        <div className="grid gap-6 lg:grid-cols-2">
          <Stack>
            <Label>Report type</Label>
            <RadioGroup
              name="report-type"
              label="Report type"
              value={reportType}
              onChange={setReportType}
              options={[
                { value: 'incident', label: 'Incident' },
                { value: 'near-miss', label: 'Near miss' },
                { value: 'observation', label: 'Observation' },
                { value: 'environmental', label: 'Environmental', disabled: true },
              ]}
            />
          </Stack>
          <Stack>
            <Label>Actual severity</Label>
            <RadioGroup
              name="severity"
              label="Actual severity"
              variant="card"
              value={severity}
              onChange={setSeverity}
              options={[
                { value: 'low', label: 'Low', description: 'First aid or no injury; contained impact.' },
                { value: 'medium', label: 'Medium', description: 'Medical treatment or limited operational impact.' },
                { value: 'high', label: 'High', description: 'Lost-time injury or major equipment damage.' },
                { value: 'critical', label: 'Critical', description: 'Fatality, permanent disability or major release.' },
              ]}
            />
          </Stack>
        </div>
      </Demo>

      <Demo title="Field states" description="Hint is replaced by the error; the error is announced with role=alert." importName="Field">
        <FormGrid>
          <Field label="With hint" htmlFor="ui-hint" hint="Private, organization-scoped files up to 10 MB.">
            <Input id="ui-hint" placeholder="Attachment reference" />
          </Field>
          <Field label="With error" htmlFor="ui-error" required error="Enter at least 3 characters.">
            <Input id="ui-error" invalid defaultValue="A" />
          </Field>
        </FormGrid>
      </Demo>

      <Demo title="Composed form section" description="FormSection + FormGrid + FormFull + FormActions is the standard form anatomy." importName="FormSection">
        <FormSection
          title="Report an incident"
          description="Drafts save automatically. Required fields are validated before submission."
          actions={<Button variant="outline" size="sm">My Reports</Button>}
        >
          <FormGrid>
            <FormFull>
              <Field label="Incident title" htmlFor="ui-title" required>
                <Input id="ui-title" placeholder="Short factual description" />
              </Field>
            </FormFull>
            <Field label="Site" htmlFor="ui-site" required>
              <Select id="ui-site" defaultValue="">
                <option value="" disabled>Select a site</option>
                <option>North Field Terminal</option>
                <option>Coastal Processing Unit</option>
              </Select>
            </Field>
            <Field label="Department" htmlFor="ui-department">
              <Select id="ui-department" defaultValue="">
                <option value="">Select department</option>
                <option>Operations</option>
                <option>Maintenance</option>
              </Select>
            </Field>
            <FormFull>
              <Field label="Description" htmlFor="ui-description" required>
                <Textarea id="ui-description" rows={3} placeholder="What happened?" />
              </Field>
            </FormFull>
          </FormGrid>
          <FormActions>
            <Button variant="outline" size="sm">Save as draft</Button>
            <Button size="sm">Continue</Button>
          </FormActions>
        </FormSection>
      </Demo>

      <Demo
        title="Combobox"
        description="Searchable select for site, assignee and document pickers."
        importName="Combobox"
      >
        <div className="grid max-w-md gap-2">
          <Label>Site</Label>
          <Combobox
            label="Site"
            options={SITE_OPTIONS}
            value={site}
            onChange={setSite}
            placeholder="Select a site"
            searchPlaceholder="Search sites…"
          />
          <p className="text-xs text-muted">
            Selected: <span className="font-mono text-foreground">{site ?? 'none'}</span>
          </p>
        </div>
      </Demo>

      <Demo
        title="Filter bar"
        description="Filter fields in one toolbar with actions anchored at the end."
        importName="FilterBar"
      >
        <FilterBar
          actions={
            <>
              <Button variant="outline" size="sm">Reset</Button>
              <Button size="sm">Apply filters</Button>
            </>
          }
        >
          <Field label="Site" className="min-w-40 flex-1">
            <Select defaultValue="">
              <option value="">All sites</option>
              <option>North Field Terminal</option>
              <option>Coastal Processing Unit</option>
            </Select>
          </Field>
          <Field label="Severity" className="min-w-36">
            <Select defaultValue="">
              <option value="">All severity</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </Select>
          </Field>
          <Field label="Search" className="min-w-52 flex-1">
            <SearchField value={search} onChange={setSearch} placeholder="Search reference, title, reporter…" />
          </Field>
        </FilterBar>
      </Demo>

      <Demo
        title="File upload"
        description="Dropzone with drag/drop, size validation and a removable file list."
        importName="FileUpload"
      >
        <FileUpload
          files={files}
          accept=".pdf,.docx,.png,.jpg"
          multiple
          maxSizeMb={10}
          onFilesSelected={(selected) => {
            setFiles((current) => [
              ...current,
              ...selected.map((file) => ({
                id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: file.name,
                size: file.size,
                type: file.type,
              })),
            ])
          }}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
        />
        <div className="mt-4 border-t border-line pt-4">
          <FileUpload
            variant="compact"
            files={[]}
            accept="image/*"
            label="Upload evidence photo"
            onFilesSelected={() => undefined}
            onRemove={() => undefined}
          />
        </div>
      </Demo>

      <Demo
        title="Search field"
        description="Controlled search input with a clear button."
        importName="SearchField"
      >
        <div className="grid max-w-md gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Search users, references, sites…" />
          <p className="text-xs text-muted">
            Query: <span className="font-mono text-foreground">{search || '—'}</span>
          </p>
        </div>
      </Demo>
    </Section>
  )
}
