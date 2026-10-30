import { Badge, Button, EmptyState, Toggle } from '../../components/ui'
import type { SiteOption } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function SitesSection({ sites, dirty, onAdd, onToggle }: {
  sites: SiteOption[]
  dirty: boolean
  onAdd: () => void
  onToggle: (name: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Sites"
      description="Operational sites available to incidents, inspections, and actions."
      dirty={dirty}
      action={<Button size="sm" onClick={onAdd}>Add site</Button>}
    >
      {sites.length ? (
        <div className="grid gap-2">
          {sites.map((site) => (
            <div key={site.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium text-foreground">{site.name}</span>
                <span className="font-mono text-[11px] text-muted">{site.code || 'Code not set'}</span>
              </div>
              <div className="flex items-center gap-3">
                {!site.code && <Badge tone="warning">No code</Badge>}
                <Toggle checked={site.active} onCheckedChange={() => onToggle(site.name)} aria-label={`Toggle ${site.name}`} />
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
