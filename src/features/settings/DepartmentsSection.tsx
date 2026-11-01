import { Button, Field, Input, Toggle } from '../../components/ui'
import type { DepartmentOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function DepartmentsSection({ departments, draft, dirty, onDraftChange, onAdd, onToggle }: {
  departments: DepartmentOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onToggle: (name: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Departments"
      description="Departments used by incident forms, filters, and user assignments."
      dirty={dirty}
    >
      {departments.length ? (
        <div className="grid gap-2">
          {departments.map((department) => (
            <div key={department.name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{department.name}</span>
              <Toggle checked={department.active} onCheckedChange={() => onToggle(department.name)} aria-label={`Toggle ${department.name}`} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No departments configured.</p>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); onAdd() }}>
        <Field label="Add department" className="min-w-[220px] flex-1">
          <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="e.g. Maintenance" />
        </Field>
        <Button type="submit" variant="outline" size="sm">Add department</Button>
      </form>
    </SettingsSectionShell>
  )
}
