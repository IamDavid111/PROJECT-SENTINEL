import { useEffect, useState } from 'react'

import { FormMessage } from '../../components/ui/form-message'
import { supabase } from '../../lib/supabase'

export type ActivityRecord = {
  id: string
  created_at: string
  activity: string
  ip_address: string | null
  location: string | null
  user_id: string | null
}

export function ActivityLogWorkspace({ organizationId }: { organizationId: string }) {
  const [logs, setLogs] = useState<ActivityRecord[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadLogs = async () => {
      const { data, error: logsError } = await supabase.from('activity_logs').select('id, created_at, activity, ip_address, location, user_id').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200)
      if (logsError) setError(logsError.message)
      else {
        setLogs(data || [])
        const userIds = [...new Set((data || []).map((log) => log.user_id).filter((id): id is string => Boolean(id)))]
        if (userIds.length) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
          setUserNames(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])))
        }
      }
      setLoading(false)
    }
    void loadLogs()
  }, [organizationId])

  const filteredLogs = logs.filter((log) => `${log.activity} ${log.location || ''} ${userNames[log.user_id || ''] || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="workspace-panel activity-panel"><div className="workspace-panel-heading"><div><div className="eyebrow">AUDIT HISTORY</div><h2>Activity Log</h2><p>Every recorded action in this organization is retained with its actor, time, and context.</p></div></div><div className="user-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, user, or location" /></div>{error && <FormMessage error={error} />}{loading ? <div className="workspace-empty">Loading audit history...</div> : filteredLogs.length === 0 ? <div className="workspace-empty">No activity matches this search.</div> : <div className="user-table-wrap"><table className="user-table activity-table"><thead><tr><th>Timestamp</th><th>User</th><th>Activity</th><th>IP address</th><th>Location</th></tr></thead><tbody>{filteredLogs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td>{log.user_id ? userNames[log.user_id] || log.user_id : 'System'}</td><td><strong>{log.activity}</strong></td><td>{log.ip_address || 'Not captured'}</td><td>{log.location || 'Not captured'}</td></tr>)}</tbody></table></div>}</div>
}

