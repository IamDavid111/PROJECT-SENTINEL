import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import heroFacility from '../../assets/hero-facility.jpg'
import { executiveAnalyticsAccessMessage } from '../../app/messages'
import { futureModuleRoutes, primaryNavigation, secondaryNavigation } from '../../app/navigation'
import { getAppRoute, type AppRoute } from '../../app/routes'
import { BrandMark } from '../../components/brand/BrandMark'
import { Alert } from '../../components/ui'
import { CommandPalette, type CommandItem } from '../../components/ui/command-palette'
import { Icon } from '../../components/ui/icon'
import { BUILT_IN_BACKEND_ROLES, USER_MANAGEMENT_BACKEND_TO_ROLE, hasPermission } from '../../data/userManagementConfig'
import type { PermissionKey } from '../../data/userManagementConfig'
import { recordActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types'
import { hasOrganizationIncidentVisibility } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { AdministrationLandingPage } from '../administration/AdministrationLandingPage'
import { ActivityLogWorkspace } from '../administration/ActivityLogWorkspace'
import { NotificationPreferencesWorkspace } from '../administration/NotificationPreferencesWorkspace'
import { ProfileWorkspace } from '../administration/ProfileWorkspace'
import { RolesPermissionsWorkspace } from '../administration/roles/RolesPermissionsWorkspace'
import { UsersWorkspace } from '../administration/users/UsersWorkspace'
import { DashboardPage } from '../dashboard/DashboardPage'
import { SettingsPage } from '../settings/SettingsPage'
import { IncidentDetailPage } from '../incidents/IncidentDetailPage'
import { IncidentTypeSelectionPage } from '../incidents/IncidentTypeSelectionPage'
import { MyReportsPage } from '../incidents/MyReportsPage'
import { useIncidentClosureAccess, useIncidentOfflineSync } from '../incidents/useIncidentData'
import { KnowledgePage } from '../knowledge/KnowledgePage'
import { MarketplacePage } from '../marketplace/MarketplacePage'
import { ActionsWorkspace } from '../qhse/ActionsWorkspace'
import { InspectionWorkspace } from '../qhse/InspectionWorkspace'
import { SafetyIntelligencePage } from '../safety-intelligence/SafetyIntelligencePage'
import { normalizeEmergencyContacts, type EmergencyContact } from '../settings/companySettingsTypes'
import { OrganizationSetupPage } from '../setup/OrganizationSetupPage'
import { WorkspaceLoadingState } from './WorkspaceLoadingState'
import { WorkspacePlaceholder } from './WorkspacePlaceholder'

export function ProtectedApp({ session, isDarkMode, onToggleTheme }: { session: Session; isDarkMode: boolean; onToggleTheme: () => void }) {
  useIncidentOfflineSync(supabase)
  const [route, setRoute] = useState<AppRoute>(() => getAppRoute())

  const [role, setRole] = useState<string | null>(null)
  const [customRolePermissions, setCustomRolePermissions] = useState<string[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const closureAccess = useIncidentClosureAccess(supabase, organizationId, session.user.id)
  const [profileName, setProfileName] = useState(session.user.email || 'User')
  const [organizationName, setOrganizationName] = useState('Organization workspace')
  const [loading, setLoading] = useState(true)
  const [loadingGateComplete, setLoadingGateComplete] = useState(false)
  const [proceedToWorkspace, setProceedToWorkspace] = useState(false)
  const [autoProceedSeconds, setAutoProceedSeconds] = useState(5)
  const [error, setError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [navResetKey, setNavResetKey] = useState(0)
  const [accountExpanded, setAccountExpanded] = useState<boolean>(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])

  const canManageCompanySettings = role === 'Super Administrator'
  const visibleEmergencyContacts = emergencyContacts.filter((contact) => contact.active && contact.name.trim() && contact.phone.trim())
  const primaryEmergencyContact = visibleEmergencyContacts[0] ?? null

  const handleNavClick = (targetRoute: AppRoute) => {
    if (targetRoute === route) {
      setNavResetKey((prev) => prev + 1)
    }
  }

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getAppRoute())
    }
    window.addEventListener('hashchange', handleHashChange)
    // A valid sign-in does not by itself identify the user's organization or app role.
    // Load the profile first, then use its organization ID to fetch membership and organization details.
    // The membership role is used below to build the workspace's permission-aware navigation.
    const loadMembership = async () => {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name, organization_id, account_status').eq('id', session.user.id).maybeSingle()
      if (profileError) setError(profileError.message)
      else if (!profile) setNeedsSetup(true)
      else if (profile.account_status === 'pending') {
        setLoading(false)
        window.location.hash = '#/invite-signup'
        return
      }
      if (profile?.full_name) setProfileName(profile.full_name)
      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id)
        const [{ data: membership }, { data: organization }] = await Promise.all([
          supabase.from('memberships').select('role').eq('user_id', session.user.id).eq('organization_id', profile.organization_id).maybeSingle(),
          supabase.from('organizations').select('company_name').eq('id', profile.organization_id).maybeSingle(),
        ])
        if (membership?.role) {
          const membershipRole = String(membership.role)
          setRole(membershipRole)
          if (!USER_MANAGEMENT_BACKEND_TO_ROLE[membershipRole] && membershipRole !== 'Super Administrator') {
            const { data: customRole } = await supabase.from('custom_roles').select('permissions').eq('organization_id', profile.organization_id).eq('name', membershipRole).eq('is_active', true).maybeSingle()
            setCustomRolePermissions(Array.isArray(customRole?.permissions) ? customRole.permissions as string[] : [])
          } else {
            setCustomRolePermissions([])
          }
        }
        if (organization?.company_name) setOrganizationName(organization.company_name)
      }
      setLoading(false)
    }
    void loadMembership()
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [session.user.email, session.user.id])

  useEffect(() => {
    if (loading) {
      setLoadingGateComplete(false)
      setProceedToWorkspace(false)
      return
    }
    const gateTimer = window.setTimeout(() => setLoadingGateComplete(true), 5000)
    return () => window.clearTimeout(gateTimer)
  }, [loading])

  useEffect(() => {
    if (!loadingGateComplete || proceedToWorkspace) return
    setAutoProceedSeconds(5)
    const countdown = window.setInterval(() => setAutoProceedSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    const autoProceed = window.setTimeout(() => setProceedToWorkspace(true), 5000)
    return () => {
      window.clearInterval(countdown)
      window.clearTimeout(autoProceed)
    }
  }, [loadingGateComplete, proceedToWorkspace])

// Closure authority comes from the database's user delegation, not a frontend role checkbox.
  // Inspections and corrective actions are gated purely on their catalog permissions, matching the
  // database gates (has_inspection_action_permission / can_create_corrective_action).
  const canAccess = (permission: PermissionKey) => {
    if (permission === 'close_incidents') return closureAccess.data === true
    if (permission === 'view_all_incidents' && closureAccess.data === true) return true
    return role ? hasPermission(role, permission, customRolePermissions) : false
  }
  const canCreateInspections = canAccess('create_inspection')
  const canManageActions = canAccess('create_corrective_action')
  const legacyFeatureRole = role && BUILT_IN_BACKEND_ROLES.includes(role as typeof BUILT_IN_BACKEND_ROLES[number]) ? role as Role : 'Field Worker'
  const visiblePrimaryNavigation = primaryNavigation.filter((item) => item.route === 'inspections'
    ? canCreateInspections || canManageActions : canAccess(item.permission))
  const visibleSecondaryNavigation = secondaryNavigation.filter((item) => item.route === 'settings' ? canManageCompanySettings && canAccess(item.permission) : canAccess(item.permission))
  const currentNavigation = [...primaryNavigation, ...secondaryNavigation, ...futureModuleRoutes].find((item) => item.route === route)
  const currentRouteAuthorized = route === 'inspections'
    ? canCreateInspections || canManageActions
    : route === 'incident-detail'
    ? canAccess('view_own_reports') || canAccess('view_all_incidents')
    : Boolean(currentNavigation && canAccess(currentNavigation.permission))
  const fallbackRoute = visiblePrimaryNavigation[0]?.route || 'dashboard'

  // Global search (⌘K / Ctrl+K) over the routes the current user can reach.
  const paletteItems: CommandItem[] = [
    ...visiblePrimaryNavigation.map((item) => ({
      id: `nav-${item.route}`,
      label: item.label,
      hint: item.route,
      icon: item.icon,
      onSelect: () => { window.location.hash = `#${item.route}` },
    })),
    ...visibleSecondaryNavigation.map((item) => ({
      id: `nav-${item.route}`,
      label: item.label,
      hint: item.route,
      onSelect: () => { window.location.hash = `#${item.route}` },
    })),
    ...futureModuleRoutes
      .filter((item) => canAccess(item.permission))
      .map((item) => ({
        id: `nav-${item.route}`,
        label: item.label,
        hint: item.route,
        onSelect: () => { window.location.hash = `#${item.route}` },
      })),
    ...(import.meta.env.DEV
      ? [
          {
            id: 'route-ui-builder',
            label: 'UI Builder',
            hint: 'ui-builder',
            icon: 'layers' as const,
            onSelect: () => { window.location.hash = '#ui-builder' },
          },
        ]
      : []),
  ]

  useEffect(() => {
    if (!loading && route === 'settings' && !canManageCompanySettings) {
      if (route !== fallbackRoute) window.location.hash = `#${fallbackRoute}`
      return
    }

// Analytics has its own denial screen; a direct link must not redirect away from it.
    if (!loading && route !== 'executive-analytics' && !(route === 'incidents' && closureAccess.isPending) && !currentRouteAuthorized) {
      if (route !== fallbackRoute) window.location.hash = `#${fallbackRoute}`
    }
  }, [canManageCompanySettings, closureAccess.isPending, currentRouteAuthorized, fallbackRoute, loading, route])

  useEffect(() => {
    if (!organizationId || !role) return

    let active = true

    const loadEmergencyContacts = async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('emergency_contacts')
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (!active) return
      setEmergencyContacts(normalizeEmergencyContacts(data?.emergency_contacts ?? []))
    }

    const handleSettingsUpdated = () => {
      void loadEmergencyContacts()
    }

    void loadEmergencyContacts()
    window.addEventListener('company-settings-updated', handleSettingsUpdated)

    return () => {
      active = false
      window.removeEventListener('company-settings-updated', handleSettingsUpdated)
    }
  }, [organizationId, role])

  const signOut = async () => {
    await recordActivity(organizationId, session.user.id, 'User logged out')
    await supabase.auth.signOut()
    window.location.hash = '#top'
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (loading || !loadingGateComplete || !proceedToWorkspace) return <WorkspaceLoadingState backgroundImage={heroFacility} canProceed={loadingGateComplete} secondsUntilAuto={autoProceedSeconds} onProceed={() => setProceedToWorkspace(true)} isDarkMode={isDarkMode} />
  if (error) return <div className="protected-state"><div className="auth-message error">Unable to load your organization access: {error}</div></div>
  if (needsSetup) return <OrganizationSetupPage email={session.user.email || ''} />
  if (!role) return <div className="protected-state"><div className="auth-message error">Your account is not assigned to an organization yet.</div><a className="button button-green" href="#top">Return to home</a></div>

  return (
    <div className={`workspace-shell${isDarkMode ? ' dark-theme' : ''}`}>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <aside className="workspace-sidebar">
        <a className="brand workspace-brand" href="#dashboard" onClick={() => handleNavClick('dashboard')}>   
          <BrandMark size="md" className="rounded-lg" />
          <span className="brand-copy"><strong>SentinelQHSE<sup>™</sup></strong><small>SAFETY INTELLIGENCE</small></span>
        </a>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          {visiblePrimaryNavigation.map((item) => (
            <a
              className={item.route === route ? 'active' : ''}
              href={`#${item.route}`}
              key={item.route}
              onClick={() => handleNavClick(item.route)}
            >
              <span className="workspace-nav-icon" aria-hidden="true"><Icon name={item.icon} size={16} /></span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="workspace-secondary-links">
          <button
            type="button"
            className="workspace-account-toggle"
            onClick={() => setAccountExpanded((open) => !open)}
            aria-expanded={accountExpanded}
          >
            <span>ACCOUNT</span>
            <span className={`workspace-account-chevron${accountExpanded ? ' open' : ''}`} aria-hidden="true"><Icon name="chevronRight" size={14} /></span>
          </button>
          <div className={`workspace-account-items${accountExpanded ? ' expanded' : ''}`}>
            <div className="workspace-account-items-inner">
              {visibleSecondaryNavigation.map((item) => (
                <a
                  className={item.route === route ? 'active' : ''}
                  href={`#${item.route}`}
                  key={item.route}
                  onClick={() => handleNavClick(item.route)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <button className="workspace-signout" type="button" onClick={signOut}>Sign out</button>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            {primaryEmergencyContact && (
              <div className="workspace-emergency-panel">
                <div className="workspace-emergency-label">FOR EMERGENCY RESPONSE CALL:</div>
                <div className="workspace-emergency-contact">
                  <span>{primaryEmergencyContact.role?.trim() || 'Admin'}</span>
                  <strong>{primaryEmergencyContact.name}</strong>
                  <small><a href={`tel:${primaryEmergencyContact.phone}`}>{primaryEmergencyContact.phone}</a></small>
                </div>
              </div>
            )}
          </div>
          <div className="workspace-actions">
            <button type="button" className="global-search-button" onClick={() => setPaletteOpen(true)} aria-label="Search workspace">
              <Icon name="search" size={15} />
              <span className="flex-1 text-left">Search workspace</span>
              <kbd className="global-search-kbd">⌘K</kbd>
            </button>
            <a className="workspace-header-action" href="#activity-log" title="Notifications" aria-label="Notifications"><Icon name="notifications" size={17} /></a>
            {canAccess('view_executive_analytics') && <a className="workspace-header-action" href="#executive-analytics" title="Executive Analytics" aria-label="Executive Analytics"><Icon name="executiveAnalytics" size={17} /></a>}
            <button className="workspace-header-action" type="button" title="Messages coming soon" aria-label="Messages coming soon"><Icon name="messages" size={17} /></button>
            <button type="button" className="theme-button" onClick={onToggleTheme} aria-label="Toggle theme"><Icon name={isDarkMode ? 'sun' : 'moon'} size={17} /></button>
            <a className="workspace-user" href="#profile">{profileName}</a>
          </div>
        </header>
        <section className="workspace-content">
{closureAccess.isError && <Alert tone="danger">{closureAccess.error.message}</Alert>}
          {route === 'dashboard' && <DashboardPage organizationId={organizationId} currentUserId={session.user.id} organizationName={organizationName} userName={profileName} role={legacyFeatureRole} canReportIncident={canAccess('report_incident')} canCreateInspection={canCreateInspections} canCreateCorrectiveAction={canManageActions} canStartAudit={canAccess('start_audit')} canViewReports={canAccess('view_reports')} supabase={supabase} />}
          {route === 'report-incident' && canAccess('report_incident') && <IncidentTypeSelectionPage key={`report-incident-${navResetKey}`} role={legacyFeatureRole} supabase={supabase} draftId={new URLSearchParams(window.location.hash.split('?')[1] || '').get('draft') || undefined} />}
          {route === 'my-reports' && canAccess('view_own_reports') && <MyReportsPage key="own" supabase={supabase} scope="own" canViewAll={canAccess('view_all_incidents')} canClose={canAccess('close_incidents')} canExport={canAccess('export_reports')} />}
          {route === 'incident-detail' && <IncidentDetailPage supabase={supabase} canClose={canAccess('close_incidents')} incidentId={new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')} />}
          {route === 'incidents' && canAccess('view_all_incidents') && <MyReportsPage key="organization" supabase={supabase} scope="organization" canViewAll canClose={canAccess('close_incidents')} canExport={canAccess('export_reports')} />}

          {route === 'corrective-actions' && canManageActions && <ActionsWorkspace supabase={supabase} canManage showInspectionBack />}
          {route === 'assigned-actions' && canAccess('view_own_reports') && <ActionsWorkspace supabase={supabase} canManage={canManageActions} assignedOnly canViewAllAssignedActions={canAccess('view_all_assigned_actions')} />}
          {route === 'inspections' && (canCreateInspections || canManageActions) && <InspectionWorkspace supabase={supabase} canManageActions={canManageActions} canCreate={canCreateInspections} />}
          {/* Navigation exists for these modules, but each route currently shows a placeholder instead of a working feature workflow. */}
          {route === 'audits' && <WorkspacePlaceholder title="Audit Management" description="Audit metrics will become available when audit records and findings are implemented." action="Module coming next" />}
          {route === 'reports' && canAccess('view_reports') && <WorkspacePlaceholder title="Reports" description="Reporting and exports will connect to validated operational records in the reporting module." action="Module coming next" />}
          {route === 'ai-assistant' && canAccess('use_ai_assistant') && (
            closureAccess.isPending ? <div className="workspace-panel" role="status">Verifying intelligence coverage...</div>
              : !closureAccess.isError && <SafetyIntelligencePage client={supabase} canViewKnowledge={canAccess('view_knowledge_documents')} scope={{
                organizationId, userId: session.user.id,
                visibility: hasOrganizationIncidentVisibility(role, closureAccess.data === true) ? 'organization' : 'personal',
                siteAssignmentEnforced: false,
              }} />
          )}
          {route === 'knowledge' && canAccess('view_knowledge_documents') && <KnowledgePage key={`${organizationId}:${session.user.id}`} client={supabase} scope={{ organizationId, userId: session.user.id }} />}
          {/* Keep direct route requests visible so missing access gets an explicit denial; the Edge Function rechecks before data reads. */}
          {route === 'executive-analytics' && (
            !canAccess('view_executive_analytics')
              ? <Alert tone="danger">{executiveAnalyticsAccessMessage}</Alert>
              : closureAccess.isPending
                ? <div className="workspace-panel" role="status">Verifying intelligence coverage...</div>
                : !closureAccess.isError && <SafetyIntelligencePage view="executive-analytics" canExportAnalytics={canAccess('view_executive_analytics')} client={supabase} scope={{
                  organizationId, userId: session.user.id,
                  visibility: hasOrganizationIncidentVisibility(role, closureAccess.data === true) ? 'organization' : 'personal',
                  siteAssignmentEnforced: false,
                }} />
          )}
          {route === 'marketplace' && canAccess('view_marketplace') && <MarketplacePage />}
          {route === 'administration' && canAccess('access_administration') && <AdministrationLandingPage canViewUsers={canAccess('view_users')} canViewRoles={canAccess('view_roles_permissions')} />}
          {route === 'users' && canAccess('view_users') && <UsersWorkspace organizationId={organizationId} currentUserId={session.user.id} canInviteUsers={canAccess('invite_users')} canEditUsers={canAccess('edit_users')} canSuspendUsers={canAccess('suspend_users')} canDeactivateUsers={canAccess('deactivate_users')} canManageUserRoles={canAccess('manage_user_roles')} canManageRolesPermissions={canAccess('manage_roles_permissions')} />}
          {route === 'roles-permissions' && canAccess('view_roles_permissions') && <RolesPermissionsWorkspace organizationId={organizationId} canManage={canAccess('manage_roles_permissions')} />}
          {route === 'profile' && <ProfileWorkspace userId={session.user.id} organizationId={organizationId} email={session.user.email || ''} />}
          {route === 'preferences' && <NotificationPreferencesWorkspace userId={session.user.id} organizationId={organizationId} />}
          {route === 'activity-log' && canAccess('view_activity') && <ActivityLogWorkspace organizationId={organizationId} />}
          {route === 'settings' && canManageCompanySettings && <SettingsPage client={supabase} organizationId={organizationId} userId={session.user.id} />}
        </section>
      </main>
    </div>
  )
}

