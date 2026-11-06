import { Button, Field, Input, Toggle } from '../../components/ui'
import type { IncidentCategoryOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function IncidentCategoriesSection({ categories, draft, dirty, onDraftChange, onAdd, onEdit, onToggle, onDelete }: {
  categories: IncidentCategoryOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onEdit: (category: IncidentCategoryOption) => void
  onToggle: (name: string) => void
  onDelete: (category: IncidentCategoryOption) => void
}) {
  const activeCategories = categories.filter((category) => !category.deleted)
  return (
    <SettingsSectionShell
      title="Incident categories"
      description="Enable or disable categories for future use. Delete permanently removes a category from future forms and filters."
      dirty={dirty}
    >
      {activeCategories.length ? (
        <div className="grid gap-2">
          {activeCategories.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{category.name}</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted">{category.active ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={category.active} onCheckedChange={() => onToggle(category.name)} aria-label={`Toggle ${category.name}`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(category)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(category)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No incident categories configured.</p>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); onAdd() }}>
        <Field label="Add incident category" className="min-w-[220px] flex-1">
          <Input value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="e.g. Near Miss" />
        </Field>
        <Button type="submit" variant="outline" size="sm">Add category</Button>
      </form>
    </SettingsSectionShell>
  )
}
