import { Button, Field, Input, Toggle } from '../../components/ui'
import type { IncidentCategoryOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function IncidentCategoriesSection({ categories, draft, dirty, onDraftChange, onAdd, onToggle }: {
  categories: IncidentCategoryOption[]
  draft: string
  dirty: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onToggle: (name: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Incident categories"
      description="Categories available on incident forms, filters, and reports."
      dirty={dirty}
    >
      {categories.length ? (
        <div className="grid gap-2">
          {categories.map((category) => (
            <div key={category.name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">{category.name}</span>
              <Toggle checked={category.active} onCheckedChange={() => onToggle(category.name)} aria-label={`Toggle ${category.name}`} />
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
