import { Button, Field, Input, Toggle } from '../../components/ui'
import type { SeverityOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function SeveritySection({ severities, draft, dirty, onDraftChange, onAdd, onToggle }: {
  severities: SeverityOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onToggle: (name: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Severity levels"
      description="Severity values available on incident records and filters."
      dirty={dirty}
    >
      {severities.length ? (
        <div className="grid gap-2">
          {severities.map((severity) => (
            <div key={severity.name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{severity.name}</span>
              <Toggle checked={severity.active} onCheckedChange={() => onToggle(severity.name)} aria-label={`Toggle ${severity.name}`} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No severity levels configured.</p>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); onAdd() }}>
        <Field label="Add severity level" className="min-w-[220px] flex-1">
          <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="e.g. High" />
        </Field>
        <Button type="submit" variant="outline" size="sm">Add severity</Button>
      </form>
    </SettingsSectionShell>
  )
}
