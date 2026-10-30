import { useCallback, useEffect, useState } from 'react'

import { Alert, Avatar, Badge, Button, Card, DataTable, PageHeader, SearchField, type DataTableColumn } from '../../components/ui'
import { supabase } from '../../lib/supabase'

export type ActivityRecord = {
  id: string
  created_at: string
  activity: string
  ip_address: string | null
  location: string | null
  user_id: string | null
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-line sm:border-l sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
    </div>
  )
}

export function ActivityLogWorkspace({ organizationId }: { organizationId: string }) {
  const [logs, setLogs] = useState<ActivityRecord[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    const { data, error: logsError } = await supabase
      .from('activity_logs')
      .select('id, created_at, activity, ip_address, location, user_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (logsError) {
      setError(logsError.message)
    } else {
      const nextLogs = (data || []) as ActivityRecord[]
      setLogs(nextLogs)
      setError('')
      const userIds = [...new Set(nextLogs.map((log) => log.user_id).filter((id): id is string => Boolean(id)))]
      if (userIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
        setUserNames(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])))
      } else {
        setUserNames({})
      }
    }
    setLoading(false)
    setRefreshing(false)
  }, [organizationId])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const filteredLogs = logs.filter((log) => `${log.activity} ${log.location || ''} ${userNames[log.user_id || ''] || ''}`.toLowerCase().includes(query.toLowerCase()))
  const peopleCount = new Set(logs.map((log) => log.user_id).filter(Boolean)).size
  const systemCount = logs.filter((log) => !log.user_id).length
  const lastEvent = logs[0]?.created_at
  const lastEventLabel = lastEvent
    ? `${new Date(lastEvent).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${formatTime(lastEvent)}`
    : '—'

  const columns: DataTableColumn<ActivityRecord>[] = [
    {
      id: 'when',
      header: 'Timestamp',
      cell: (log) => (
        <div className="grid gap-0.5">
          <span className="text-sm font-medium text-foreground">{formatDay(log.created_at)}</span>
          <span className="font-mono text-[11px] text-muted">{formatTime(log.created_at)}</span>
        </div>
      ),
    },
    {
      id: 'user',
      header: 'User',
      cell: (log) => {
        if (!log.user_id) return <Badge tone="neutral">System</Badge>
        const name = userNames[log.user_id] || 'Unknown user'
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={name} size="sm" />
            <span className="truncate text-sm text-foreground">{name}</span>
          </div>
        )
      },
    },
    {
      id: 'activity',
      header: 'Activity',
      cell: (log) => <span className="text-sm font-medium text-foreground">{log.activity}</span>,
    },
    {
      id: 'ip',
      header: 'IP address',
      cell: (log) => <span className="font-mono text-xs text-muted">{log.ip_address || '—'}</span>,
    },
    {
      id: 'location',
      header: 'Location',
      cell: (log) => <span className="text-sm text-muted">{log.location || '—'}</span>,
    },
  ]

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Audit history"
        title="Activity log"
        description="Every recorded action in this organization, retained with its actor, time, and context."
      />

      <section className="border-y border-line bg-surface">
        <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <SummaryStat label="Events loaded" value={String(logs.length)} />
          <SummaryStat label="People" value={String(peopleCount)} />
          <SummaryStat label="System events" value={String(systemCount)} />
          <SummaryStat label="Last event" value={lastEventLabel} />
        </div>
      </section>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card className="p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="min-w-[240px] flex-1"
            value={query}
            onChange={setQuery}
            placeholder="Search activity, user, or location"
            label="Search activity log"
          />
          <span className="text-xs text-muted">{filteredLogs.length} of {logs.length} events</span>
          <Button variant="outline" size="sm" loading={refreshing} onClick={() => void loadLogs(true)}>
            Refresh
          </Button>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={filteredLogs}
        rowKey={(log) => log.id}
        loading={loading}
        loadingRows={8}
        empty={
          <div className="grid justify-items-center gap-1 py-4">
            <strong className="text-sm font-semibold text-foreground">No activity matches this search</strong>
            <span className="text-sm text-muted">Clear the search to see the full audit history.</span>
          </div>
        }
      />
    </div>
  )
}
