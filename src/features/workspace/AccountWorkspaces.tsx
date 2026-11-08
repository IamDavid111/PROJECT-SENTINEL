import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Badge, Tabs } from '../../components/ui'
import { ActivityLogWorkspace } from '../administration/ActivityLogWorkspace'
import { NotificationPreferencesWorkspace } from '../administration/NotificationPreferencesWorkspace'
import { ProfileWorkspace } from '../administration/ProfileWorkspace'
import { MyReportsPage } from '../incidents/MyReportsPage'
import { ActionsWorkspace } from '../qhse/ActionsWorkspace'

type AccountTab = 'user-profile' | 'notification-preferences' | 'activity-log'
type WorkspaceTab = 'my-reports' | 'assigned-actions'

function requestedTab(): string | null {
  const [route, query = ''] = window.location.hash.slice(1).split('?')
  if (route === 'profile') return 'user-profile'
  if (route === 'preferences') return 'notification-preferences'
  if (route === 'activity-log') return 'activity-log'
  if (route === 'my-reports') return 'my-reports'
  if (route === 'assigned-actions') return 'assigned-actions'
  return new URLSearchParams(query).get('tab')
}

export function MyAccountWorkspace({ userId, organizationId, email, canViewProfile, canViewActivity }: {
  userId: string
  organizationId: string
  email: string
  canViewProfile: boolean
  canViewActivity: boolean
}) {
  const availableTabs: { id: AccountTab; label: string }[] = [
    ...(canViewProfile ? [
      { id: 'user-profile' as const, label: 'User Profile' },
      { id: 'notification-preferences' as const, label: 'Notification Preferences' },
    ] : []),
    ...(canViewActivity ? [{ id: 'activity-log' as const, label: 'Activity Log' }] : []),
  ]
  const [activeTab, setActiveTab] = useState<AccountTab>(() => {
    const requested = requestedTab()
    return availableTabs.some((tab) => tab.id === requested) ? requested as AccountTab : availableTabs[0]?.id ?? 'user-profile'
  })

  const selectTab = (tab: string) => {
    setActiveTab(tab as AccountTab)
    window.location.hash = `#my-account?tab=${tab}`
  }

  const items = availableTabs.map((tab) => ({
    ...tab,
    content: activeTab !== tab.id ? null : tab.id === 'user-profile'
      ? <ProfileWorkspace userId={userId} organizationId={organizationId} email={email} />
      : tab.id === 'notification-preferences'
        ? <NotificationPreferencesWorkspace userId={userId} organizationId={organizationId} />
        : <ActivityLogWorkspace organizationId={organizationId} />,
  }))

  return <Tabs items={items} value={activeTab} onChange={selectTab} />
}

export function MyWorkspace({ client, organizationId, userId, canViewAllIncidents, canCloseIncidents, canExportReports, canManageActions, canViewAllAssignedActions }: {
  client: SupabaseClient
  organizationId: string
  userId: string
  canViewAllIncidents: boolean
  canCloseIncidents: boolean
  canExportReports: boolean
  canManageActions: boolean
  canViewAllAssignedActions: boolean
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const requested = requestedTab()
    return requested === 'assigned-actions' ? 'assigned-actions' : 'my-reports'
  })
  const assignedCount = useQuery({
    queryKey: ['assigned-action-count', organizationId, userId],
    queryFn: async () => {
    const { count, error } = await client
      .from('actions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('assignee_id', userId)
      .eq('status', 'open')
    if (error) throw error
    return count ?? 0
    },
    refetchOnWindowFocus: true,
  })

  const selectTab = (tab: string) => {
    setActiveTab(tab as WorkspaceTab)
    window.location.hash = `#my-workspace?tab=${tab}`
    if (tab === 'assigned-actions') void assignedCount.refetch()
  }

  const items = [
    {
      id: 'my-reports',
      label: 'My Reports',
      content: activeTab === 'my-reports'
        ? <MyReportsPage supabase={client} scope="own" canViewAll={canViewAllIncidents} canClose={canCloseIncidents} canExport={canExportReports} />
        : null,
    },
    {
      id: 'assigned-actions',
      label: <span className="inline-flex items-center gap-2">Assigned Actions {assignedCount.data !== undefined && <Badge tone="neutral" aria-label={`${assignedCount.data} open assigned actions`}>{assignedCount.data}</Badge>}</span>,
      content: activeTab === 'assigned-actions'
        ? <ActionsWorkspace supabase={client} canManage={canManageActions} assignedOnly canViewAllAssignedActions={canViewAllAssignedActions} />
        : null,
    },
  ]

  return <Tabs items={items} value={activeTab} onChange={selectTab} />
}