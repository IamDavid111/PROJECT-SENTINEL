import { Button, Field, Input, Toggle } from '../../components/ui'
import type { DepartmentOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function DepartmentsSection({ departments, draft, dirty, onDraftChange, onAdd, onEdit, onToggle, onDelete }: {
  departments: DepartmentOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onEdit: (department: DepartmentOption) => void
  onToggle: (name: string) => void
  onDelete: (department: DepartmentOption) => void
}) {
  const activeDepartments = departments.filter((department) => !department.deleted)
  return (
    <SettingsSectionShell
      title="Departments"
      description="Enable or disable departments for future use. Delete permanently removes a department from future forms and filters."
      dirty={dirty}
    >
      {activeDepartments.length ? (
        <div className="grid gap-2">
          {activeDepartments.map((department) => (
            <div key={department.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{department.name}</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted">{department.active ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={department.active} onCheckedChange={() => onToggle(department.name)} aria-label={`Toggle ${department.name}`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(department)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(department)}>Delete</Button>
              </div>
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
