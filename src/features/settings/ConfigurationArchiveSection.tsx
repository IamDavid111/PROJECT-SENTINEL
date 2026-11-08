import { useCallback, useEffect, useMemo, useState } from 'react'

import { Alert, Badge, Button, EmptyState, Input, Select, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { SettingsSectionShell } from './SettingsSectionShell'

export type ConfigurationCategory = 'site' | 'department' | 'shift' | 'severity' | 'incident_category'

export type ArchivedConfigurationItem = {
  id: string
  name: string
  category: ConfigurationCategory
  archivedAt: string
  archivedBy: string
  details?: string
}

type ArchiveRow = {
  item_id: string
  item_name: string
  item_category: ConfigurationCategory
  archived_at: string
  archived_by: string
  item: { code?: string; start?: string; end?: string }
}

const categoryLabels: Record<ConfigurationCategory, string> = {
  site: 'Site',
  department: 'Department',
  shift: 'Shift',
  severity: 'Severity level',
  incident_category: 'Incident category',
}

const categoryOrder: ConfigurationCategory[] = ['site', 'department', 'shift', 'severity', 'incident_category']

function formatArchivedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function mapArchiveRows(rows: ArchiveRow[] | null): ArchivedConfigurationItem[] {
  return (rows || []).map((row) => ({
    id: row.item_id,
    name: row.item_name,
    category: row.item_category,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    details: row.item_category === 'shift' && row.item.start && row.item.end
      ? `${row.item.start}–${row.item.end}`
      : row.item_category === 'site' && row.item.code
        ? `Code ${row.item.code}`
        : undefined,
  }))
}

function archiveLoadErrorMessage(code?: string) {
  if (code === 'PGRST202' || code === '42883') {
    return 'The configuration archive database migration has not been applied yet. Apply migration 202611040002_company_configuration_archive_restore.sql after 202611040001_company_configuration_soft_delete.sql, then retry.'
  }
  if (code === '42501') {
    return 'You do not have permission to access the configuration archive.'
  }
  return 'Unable to load the configuration archive. Check your connection and try again.'
}

export function ConfigurationArchiveSection({
  organizationId,
  restoring,
  onRestore,
}: {
  organizationId: string
  restoring: boolean
  onRestore: (item: ArchivedConfigurationItem) => void
}) {
  const [items, setItems] = useState<ArchivedConfigurationItem[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ConfigurationCategory | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadArchive = useCallback(async () => {
    try {
      const { data, error: archiveError } = await supabase.rpc('list_company_configuration_archive', {
        p_organization_id: organizationId,
      })
      if (archiveError) {
        setError(archiveLoadErrorMessage(archiveError.code))
      } else {
        const rows = data as ArchiveRow[] | null
        setItems(mapArchiveRows(rows))
        setError('')
      }
    } catch {
      setError('Unable to load the configuration archive. Check your permissions or connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    let active = true
    void supabase.rpc('list_company_configuration_archive', {
      p_organization_id: organizationId,
    }).then(({ data, error: archiveError }) => {
      if (!active) return
      if (archiveError) {
        setError(archiveLoadErrorMessage(archiveError.code))
      } else {
        const rows = data as ArchiveRow[] | null
        setItems(mapArchiveRows(rows))
        setError('')
      }
      setLoading(false)
    }, () => {
      if (!active) return
      setError(archiveLoadErrorMessage())
      setLoading(false)
    })
    return () => { active = false }
  }, [organizationId])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items.filter((item) =>
      (category === 'all' || item.category === category)
      && item.name.toLowerCase().includes(normalizedQuery),
    )
  }, [category, items, query])

  return (
    <SettingsSectionShell
      title="Configuration archive"
      description="Review and restore archived sites, departments, shifts, severity levels, and incident categories."
      action={<Badge tone={error ? 'warning' : 'neutral'}>{error ? 'Archive unavailable' : loading ? 'Loading archive' : `${items.length} archived`}</Badge>}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search configuration name"
            aria-label="Search archived configuration by name"
          />
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as ConfigurationCategory | 'all')}
            aria-label="Filter archived configuration by category"
          >
            <option value="all">All categories</option>
            {categoryOrder.map((option) => <option key={option} value={option}>{categoryLabels[option]}</option>)}
          </Select>
        </div>

        {error && (
          <div className="grid gap-3">
            <Alert tone="danger">{error}</Alert>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setLoading(true)
                void loadArchive()
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {loading ? (
          <div className="grid gap-2" aria-label="Loading archive">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : error ? null : filteredItems.length ? (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="bg-surface-soft text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Configuration name</th>
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Date archived</th>
                  <th scope="col" className="px-4 py-3">Archived by</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => (
                  <tr key={`${item.category}:${item.id}`} className="bg-surface">
                    <td className="px-4 py-3">
                      <div className="grid gap-0.5">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        {item.details && <span className="text-xs text-muted">{item.details}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{categoryLabels[item.category]}</td>
                    <td className="px-4 py-3 text-sm text-muted">{formatArchivedAt(item.archivedAt)}</td>
                    <td className="px-4 py-3 text-sm text-muted">{item.archivedBy}</td>
                    <td className="px-4 py-3"><Badge tone="warning">Archived</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" disabled={restoring} onClick={() => onRestore(item)}>Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={items.length ? 'No matching archived items' : 'Archive is empty'}
            description={items.length
              ? 'Try another name or category filter.'
              : 'Deleted configuration items will appear here and can be restored by an administrator.'}
          />
        )}
      </div>
    </SettingsSectionShell>
  )
}
