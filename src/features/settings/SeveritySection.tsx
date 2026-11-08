import { Button, Field, Input, Toggle } from '../../components/ui'
import type { SeverityOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function SeveritySection({ severities, draft, dirty, onDraftChange, onAdd, onEdit, onToggle, onDelete }: {
  severities: SeverityOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onEdit: (severity: SeverityOption) => void
  onToggle: (name: string) => void
  onDelete: (severity: SeverityOption) => void
}) {
  const activeSeverities = severities.filter((severity) => !severity.deleted)
  return (
    <SettingsSectionShell
      title="Severity levels"
      description="Enable or disable severities for future use. Delete permanently removes a severity from future forms and filters."
      dirty={dirty}
    >
      {activeSeverities.length ? (
        <div className="grid gap-2">
          {activeSeverities.map((severity) => (
            <div key={severity.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{severity.name}</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted">{severity.active ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={severity.active} onCheckedChange={() => onToggle(severity.name)} aria-label={`Toggle ${severity.name}`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(severity)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(severity)}>Delete</Button>
              </div>
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
