import { Badge, Button, EmptyState, Toggle } from '../../components/ui'
import type { SiteOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function SitesSection({ sites, dirty, onAdd, onEdit, onToggle, onDelete }: {
  sites: SiteOption[]
  dirty: boolean
  onAdd: () => void
  onEdit: (site: SiteOption) => void
  onToggle: (name: string) => void
  onDelete: (site: SiteOption) => void
}) {
  const activeSites = sites.filter((site) => !site.deleted)
  return (
    <SettingsSectionShell
      title="Sites"
      description="Enable or disable sites for future use. Delete permanently removes a site from future forms and filters."
      dirty={dirty}
      action={<Button size="sm" onClick={onAdd}>Add site</Button>}
    >
      {activeSites.length ? (
        <div className="grid gap-2">
          {activeSites.map((site) => (
            <div key={site.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium text-foreground">{site.name}</span>
                <span className="font-mono text-[11px] text-muted">{site.code || 'Code not set'}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!site.code && <Badge tone="warning">No code</Badge>}
                <span className="text-xs text-muted">{site.active ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={site.active} onCheckedChange={() => onToggle(site.name)} aria-label={`Toggle ${site.name}`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(site)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(site)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="location"
          title="No sites configured"
          description="Add the first operational site and generate its code."
          action={<Button size="sm" onClick={onAdd}>Add site</Button>}
        />
      )}
    </SettingsSectionShell>
  )
}
