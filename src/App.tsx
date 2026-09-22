import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

import customerBenefitsDashboard from './assets/srcassetscustomer-benefits-dashboard.png'
import authIllustration from './assets/auth-illustration.jpg'
import heroFacility from './assets/hero-facility.jpg'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { registrationSchema } from './lib/schemas'
import { countries, worldRegions } from './lib/locations'
import type { Role } from './types'
import { BASELINE_PERMISSION_KEYS, BUILT_IN_BACKEND_ROLES, SUPER_ADMINISTRATOR_PERMISSION_KEYS, USER_ACTION_OPTIONS, USER_MANAGEMENT_BACKEND_TO_ROLE, USER_MANAGEMENT_PERMISSION_CATALOG, USER_MANAGEMENT_ROLE_DEFINITIONS, USER_MANAGEMENT_ROLE_PERMISSION_MATRIX, hasPermission, permissionsForRole } from './data/userManagementConfig'
import type { PermissionKey } from './data/userManagementConfig'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { IncidentTypeSelectionPage } from './features/incidents/IncidentTypeSelectionPage'
import { MyReportsPage } from './features/incidents/MyReportsPage'
import { IncidentDetailPage } from './features/incidents/IncidentDetailPage'

const navItems = ['Platform', 'Industries', 'Outcomes', 'Product']

const featureCards = [
  { icon: '♧', title: 'Digital incident reporting', text: 'Capture near misses to fatalities in the field with GPS, photo, video and voice evidence — online or offline.' },
  { icon: '✓', title: 'Inspections & audits', text: 'Digital inspection types, custom templates, pass/fail checklists and audit programmes with a live calendar.' },
  { icon: '▱', title: 'Corrective action control', text: 'Every finding becomes a tracked action with owners, due dates, evidence and verification sign-off.' },
  { icon: '◎', title: 'Predictive risk intelligence', text: 'Risk scores per facility using historical incidents, observations and operating context.' },
  { icon: '✦', title: 'AI safety copilot', text: 'Ask plain-language questions about your safety data and get summaries, charts and recommendations.' },
  { icon: '⌑', title: 'Enterprise governance', text: 'Multi-tenant organisations, granular roles, full activity logging and exportable audit trails.' },
]

const benefitItems = [
  { icon: '♧', title: 'Frontline adoption', text: 'Glove-friendly mobile reporting with offline sync means events get captured when they happen.' },
  { icon: '⌁', title: 'Executive visibility', text: 'A single safety score, trend and forecast per site, department and operating team.' },
  { icon: '▥', title: 'Assurance on demand', text: 'Generate inspection, audit and corrective action reports as PDF or Excel in seconds.' },
]

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3.5 19 6v5.7c0 4.2-2.7 7.9-7 9.3-4.3-1.4-7-5.1-7-9.3V6l7-2.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="m9.2 12 1.8 1.8 3.9-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

type AuthRoute = 'sign-in' | 'register' | 'forgot-password' | 'reset-password' | 'change-password' | 'invite-signup' | 'demo'

function getAuthRoute(): AuthRoute | null {
  const route = window.location.hash.replace('#/', '').replace('#', '').split('?')[0]
  if (route === 'contact' || route === 'contact-sales' || route === 'request-demo') {
    return 'demo'
  }
  return route === 'sign-in' || route === 'register' || route === 'forgot-password' || route === 'reset-password' || route === 'change-password' || route === 'invite-signup' || route === 'demo'
    ? route
    : null
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-visual" style={{ backgroundImage: `linear-gradient(110deg, rgba(7, 18, 37, 0.78), rgba(7, 18, 37, 0.32)), url(${authIllustration})` }}>
        <a className="brand auth-brand" href="#top">
          <BrandMark />
          <span className="brand-copy">
            <strong>SentinelQHSE<sup>™</sup></strong>
            <small>SAFETY INTELLIGENCE</small>
          </span>
        </a>
        <div className="auth-visual-copy">
          <div className="eyebrow">SECURE OPERATIONS</div>
          <h1>Safety intelligence for every shift, site and decision.</h1>
          <p>Secure access to the operational workflows your teams rely on.</p>
        </div>
      </div>
      <section className="auth-panel">
        <a className="auth-back" href="#top">← Back to home</a>
        <div className="auth-card">
          <div className="eyebrow">SENTINELQHSE PORTAL</div>
          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  )
}

function AuthMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return <div className={`auth-message ${error ? 'error' : 'success'}`}>{error || success}</div>
}

async function getEdgeFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : 'Unable to complete the request.'
  const response = (error as { context?: Response } | null)?.context
  if (!response) return fallback

  try {
    const payload = await response.clone().json() as { error?: string; message?: string }
    return payload.error || payload.message || fallback
  } catch {
    try {
      return (await response.clone().text()) || fallback
    } catch {
      return fallback
    }
  }
}

function SignInPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    if (!email || !password) {
      setError('Work email and password are required.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      return
    }
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) setError(signInError.message)
    else {
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').eq('id', (await supabase.auth.getUser()).data.user?.id || '').maybeSingle()
      if (profile?.organization_id) await recordActivity(profile.organization_id, profile.id, 'User logged in')
      window.location.hash = '#dashboard'
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your organization credentials to access the safety intelligence platform.">
      <form className="auth-form" onSubmit={submit}>
        <label>Work email<input name="email" type="email" placeholder="you@company.com" autoComplete="email" /></label>
        <label>Password<input name="password" type="password" placeholder="Enter your password" autoComplete="current-password" /></label>
        <div className="auth-options">
          <label className="checkbox-label"><input name="rememberMe" type="checkbox" defaultChecked /> Remember me</label>
          <a href="#forgot-password">Forgot password?</a>
        </div>
        <AuthMessage error={error} />
          <button className="button button-green auth-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In →'}</button>
        <p className="auth-footer-copy">New organization? <a href="#register">Register your company</a></p>
      </form>
    </AuthShell>
  )
}

function ForgotPasswordPage() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') || '')
    if (!email) return setError('Enter your work email.')
    if (!isSupabaseConfigured) return setError('Supabase is not configured. Add the required environment variables first.')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/#/reset-password` })
    if (resetError) setError(resetError.message)
    else setMessage('If an account exists for that email, a password reset link has been sent.')
  }
  return (
    <AuthShell title="Forgot password?" subtitle="Enter your work email and we will send a secure reset link.">
      <form className="auth-form" onSubmit={submit}>
        <label>Work email<input name="email" type="email" placeholder="you@company.com" autoComplete="email" /></label>
        <AuthMessage error={error} success={message} />
          <button className="button button-green auth-submit">Send reset link →</button>
        <p className="auth-footer-copy"><a href="#sign-in">Return to sign in</a></p>
      </form>
    </AuthShell>
  )
}

function PasswordPage({ reset = false }: { reset?: boolean }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '')
    const confirmation = String(form.get('confirmation') || '')
    if (password.length < 8 || password !== confirmation) return setError('Passwords must match and contain at least 8 characters.')
    if (!isSupabaseConfigured) return setError('Supabase is not configured. Add the required environment variables first.')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message)
    else setMessage(reset ? 'Your password has been reset successfully.' : 'Your password has been changed successfully.')
  }
  return (
    <AuthShell title={reset ? 'Reset password' : 'Change password'} subtitle="Create a strong password for your SentinelQHSE account.">
      <form className="auth-form" onSubmit={submit}>
        {!reset && <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" /></label>}
        <label>New password<input name="password" type="password" autoComplete="new-password" /></label>
        <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" /></label>
        <AuthMessage error={error} success={message} />
        <button className="button button-green auth-submit">Update password →</button>
      </form>
    </AuthShell>
  )
}

type InvitationDetails = {
  inviteeEmail: string
  organizationName: string
  department: string | null
  role: string
  expiresAt: string
}

function InviteSignupPage() {
  const [details, setDetails] = useState<InvitationDetails | null>(null)
  const [fullName, setFullName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadInvitation = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        setError('This invitation link must be opened from the invitation email.')
        setLoading(false)
        return
      }

      const { data, error: invitationError } = await supabase.functions.invoke('accept-admin-invitation')
      if (invitationError) setError(invitationError.message || 'This invitation link is invalid or unavailable.')
      else if (!data?.invitation) setError('This invitation is expired, revoked, already accepted, or does not match this email account.')
      else setDetails(data.invitation as InvitationDetails)
      setLoading(false)
    }
    void loadInvitation()
  }, [])

  const completeSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!fullName.trim() || !employeeId.trim()) {
      setError('Full name and employee ID are required.')
      return
    }
    setSubmitting(true)
    const { data, error: acceptanceError } = await supabase.functions.invoke('accept-admin-invitation', {
      body: { fullName: fullName.trim(), employeeId: employeeId.trim() },
    })
    setSubmitting(false)
    if (acceptanceError || !data?.accepted) {
      setError(acceptanceError?.message || 'This invitation could not be accepted.')
      return
    }
    setMessage('Your account is ready. Redirecting to your workspace...')
    window.setTimeout(() => { window.location.hash = '#dashboard' }, 800)
  }

  return (
    <AuthShell title="Complete your invitation" subtitle="Confirm your organization details and finish setting up your account.">
      {loading ? <div className="workspace-empty">Validating invitation...</div> : details ? (
        <form className="auth-form" onSubmit={completeSignup}>
          <label>Work email<input value={details.inviteeEmail} readOnly /></label>
          <label>Organization<input value={details.organizationName} readOnly /></label>
          <label>Department<input value={details.department || 'Not assigned'} readOnly /></label>
          <label>Role<input value={details.role} readOnly /></label>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
          <label>Employee ID<input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} autoComplete="off" required /></label>
          <AuthMessage error={error} success={message} />
          <button className="button button-green auth-submit" disabled={submitting}>{submitting ? 'Completing setup...' : 'Complete setup'}</button>
        </form>
      ) : <div className="auth-form"><AuthMessage error={error} /><a className="button button-outline auth-submit" href="#sign-in">Return to sign in</a></div>}
    </AuthShell>
  )
}

function DemoRequestPage() {
  const [submitted, setSubmitted] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }
  return (
    <AuthShell title="Contact sales & request a demo" subtitle="Tell us about your operation and our team will arrange a SentinelQHSE walkthrough or commercial consultation.">
      {submitted ? (
        <div className="auth-form">
          <AuthMessage success="Thanks. Your request has been recorded for follow-up." />
          <a className="button button-green auth-submit" href="#top">Return to landing page</a>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>Full name<input name="name" placeholder="Your full name" required /></label>
          <label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>
          <label>Company<input name="company" placeholder="Company name" required /></label>
          <label>What would you like to explore?<textarea name="message" rows={4} placeholder="Sites, teams, pricing, or QHSE workflows" /></label>
          <button className="button button-green auth-submit" type="submit">Submit request →</button>
          <p className="auth-footer-copy"><a href="#top">Return to landing page</a></p>
        </form>
      )}
    </AuthShell>
  )
}

type AppRoute = 'dashboard' | 'report-incident' | 'incident-detail' | 'my-reports' | 'ai-assistant' | 'executive-analytics' | 'marketplace' | 'incidents' | 'corrective-actions' | 'inspections' | 'audits' | 'reports' | 'administration' | 'users' | 'roles-permissions' | 'profile' | 'preferences' | 'activity-log' | 'settings'
type Permission = PermissionKey

const primaryNavigation: { route: AppRoute; label: string; icon: string; permission: PermissionKey }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: '▣', permission: 'view_dashboard' },
  { route: 'report-incident', label: 'Report Incident', icon: '+', permission: 'report_incident' },
  { route: 'ai-assistant', label: 'AI Safety Assistant', icon: '✦', permission: 'use_ai_assistant' },
  { route: 'executive-analytics', label: 'Executive Analytics', icon: '◈', permission: 'view_executive_analytics' },
  { route: 'marketplace', label: 'HSE Marketplace', icon: '▱', permission: 'view_marketplace' },
]

const secondaryNavigation: { route: AppRoute; label: string; permission: PermissionKey }[] = [
  { route: 'profile', label: 'User Profile', permission: 'view_profile' },
  { route: 'preferences', label: 'Notification Preferences', permission: 'view_profile' },
  { route: 'activity-log', label: 'Activity Log', permission: 'view_activity' },
  { route: 'administration', label: 'Administration', permission: 'access_administration' },
  { route: 'settings', label: 'Settings', permission: 'manage_settings' },
  { route: 'my-reports', label: 'My Reports', permission: 'view_own_reports' },
]

const futureModuleRoutes: { route: AppRoute; label: string; permission: PermissionKey }[] = [
  { route: 'incidents', label: 'Incident Management', permission: 'view_all_incidents' },
  { route: 'corrective-actions', label: 'Corrective Actions', permission: 'view_dashboard' },
  { route: 'inspections', label: 'Safety Inspections', permission: 'view_dashboard' },
  { route: 'audits', label: 'Audit Management', permission: 'view_dashboard' },
  { route: 'reports', label: 'Reports', permission: 'view_reports' },
  { route: 'users', label: 'User Management', permission: 'view_users' },
  { route: 'roles-permissions', label: 'Roles & Permissions', permission: 'view_roles_permissions' },
]

function getAppRoute(): AppRoute {
  const route = window.location.hash.replace('#/', '').replace('#', '').split('?')[0]
  return route === 'report-incident' || route === 'incident-detail' || route === 'my-reports' || route === 'ai-assistant' || route === 'executive-analytics' || route === 'marketplace' || route === 'incidents' || route === 'corrective-actions' || route === 'inspections' || route === 'audits' || route === 'reports' || route === 'administration' || route === 'users' || route === 'roles-permissions' || route === 'profile' || route === 'preferences' || route === 'activity-log' || route === 'settings' ? route : 'dashboard'
}

const administrationEntries: { title: string; description: string; href: string; action: string }[] = [
  { title: 'User Management', description: 'Manage users, invitations, departments, roles, account status and user access.', href: '#users', action: 'Open User Management' },
  { title: 'Roles & Permissions', description: 'Review platform roles and the permissions assigned to each role.', href: '#roles-permissions', action: 'Open Roles & Permissions' },
]

function AdministrationLandingPage({ canViewUsers, canViewRoles }: { canViewUsers: boolean; canViewRoles: boolean }) {
  const visibleEntries = administrationEntries.filter((entry) => entry.href === '#users' ? canViewUsers : canViewRoles)
  return (
    <div className="workspace-panel administration-panel">
      <div className="eyebrow">ADMINISTRATION</div>
      <h2>Administration</h2>
      <p>Manage platform users, roles and access controls.</p>
      <div className="workspace-module-grid administration-entry-grid">
        {visibleEntries.map((entry) => (
          <article className="workspace-module administration-entry-card" key={entry.href}>
            <div className="eyebrow">ACCESS CONTROL</div>
            <strong>{entry.title}</strong>
            <p>{entry.description}</p>
            <a className="button button-outline button-small" href={entry.href}>{entry.action} →</a>
          </article>
        ))}
      </div>
    </div>
  )
}

function ProtectedApp({ session, isDarkMode, onToggleTheme }: { session: Session; isDarkMode: boolean; onToggleTheme: () => void }) {
  const [route, setRoute] = useState<AppRoute>(() => getAppRoute())
  const [role, setRole] = useState<string | null>(null)
  const [customRolePermissions, setCustomRolePermissions] = useState<string[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [profileName, setProfileName] = useState(session.user.email || 'User')
  const [organizationName, setOrganizationName] = useState('Organization workspace')
  const [loading, setLoading] = useState(true)
  const [loadingGateComplete, setLoadingGateComplete] = useState(false)
  const [proceedToWorkspace, setProceedToWorkspace] = useState(false)
  const [autoProceedSeconds, setAutoProceedSeconds] = useState(5)
  const [error, setError] = useState('')
  const [navResetKey, setNavResetKey] = useState(0)
  const [accountExpanded, setAccountExpanded] = useState<boolean>(false)

  const handleNavClick = (targetRoute: AppRoute) => {
    if (targetRoute === route) {
      setNavResetKey((prev) => prev + 1)
    }
  }

  useEffect(() => {
    const handleHashChange = () => setRoute(getAppRoute())
    window.addEventListener('hashchange', handleHashChange)
    const loadMembership = async () => {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name, organization_id, account_status').eq('id', session.user.id).maybeSingle()
      if (profileError) setError(profileError.message)
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

  const canAccess = (permission: PermissionKey) => role ? hasPermission(role, permission, customRolePermissions) : false
  const legacyFeatureRole = role && BUILT_IN_BACKEND_ROLES.includes(role as typeof BUILT_IN_BACKEND_ROLES[number]) ? role as Role : 'Field Worker'
  const visiblePrimaryNavigation = primaryNavigation.filter((item) => canAccess(item.permission))
  const visibleSecondaryNavigation = secondaryNavigation.filter((item) => canAccess(item.permission))
  const currentNavigation = [...primaryNavigation, ...secondaryNavigation, ...futureModuleRoutes].find((item) => item.route === route)

  useEffect(() => {
    if (!loading && (!currentNavigation || !canAccess(currentNavigation.permission))) {
      const fallback = visiblePrimaryNavigation[0]?.route || 'dashboard'
      if (route !== fallback) window.location.hash = `#${fallback}`
    }
  }, [currentNavigation, loading, route, visiblePrimaryNavigation])

  const signOut = async () => {
    await recordActivity(organizationId, session.user.id, 'User logged out')
    await supabase.auth.signOut()
    window.location.hash = '#top'
  }

  if (loading || !loadingGateComplete || !proceedToWorkspace) return <WorkspaceLoadingState backgroundImage={heroFacility} canProceed={loadingGateComplete} secondsUntilAuto={autoProceedSeconds} onProceed={() => setProceedToWorkspace(true)} />
  if (error) return <div className="protected-state"><div className="auth-message error">Unable to load your organization access: {error}</div></div>
  if (!role) return <div className="protected-state"><div className="auth-message error">Your account is not assigned to an organization yet.</div><a className="button button-green" href="#top">Return to home</a></div>

  return (
    <div className={`workspace-shell${isDarkMode ? ' dark-theme' : ''}`}>
      <aside className="workspace-sidebar">
        <a className="brand workspace-brand" href="#dashboard" onClick={() => handleNavClick('dashboard')}>
          <BrandMark />
          <span className="brand-copy"><strong>SentinelQHSE<sup>™</sup></strong><small>SAFETY INTELLIGENCE</small></span>
        </a>
        <div className="workspace-org"><small>ORGANIZATION</small><strong>{organizationName}</strong><span>{role}</span></div>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          {visiblePrimaryNavigation.map((item) => (
            <a
              className={item.route === route ? 'active' : ''}
              href={`#${item.route}`}
              key={item.route}
              onClick={() => handleNavClick(item.route)}
            >
              <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
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
            <span className={`workspace-account-chevron${accountExpanded ? ' open' : ''}`} aria-hidden="true">▸</span>
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
          <div><small>SECURE WORKSPACE</small><h1>{currentNavigation?.label || 'Dashboard'}</h1><span className="workspace-breadcrumb">Operations / Safety Overview</span></div>
          <div className="workspace-actions">
            <label className="global-search"><span className="sr-only">Global search</span><input placeholder="Search workspace" aria-label="Global search" /></label>
            <a className="workspace-header-action" href="#activity-log" title="Notifications" aria-label="Notifications">♧</a>
            <a className="workspace-header-action" href="#ai-assistant" title="AI Safety Assistant" aria-label="AI Safety Assistant">✦</a>
            <button className="workspace-header-action" type="button" title="Messages coming soon" aria-label="Messages coming soon">▱</button>
            <select className="language-select" aria-label="Language"><option>EN</option><option>FR</option></select>
            <button type="button" className="theme-button" onClick={onToggleTheme} aria-label="Toggle theme"><ThemeIcon /></button>
            <a className="workspace-user" href="#profile">{profileName}</a>
          </div>
        </header>
        <section className="workspace-content">
          {route === 'dashboard' && <DashboardPage organizationId={organizationId} organizationName={organizationName} userName={profileName} role={legacyFeatureRole} canReportIncident={canAccess('report_incident')} canCreateInspection={canAccess('create_inspection')} canCreateCorrectiveAction={canAccess('create_corrective_action')} canStartAudit={canAccess('start_audit')} canViewReports={canAccess('view_reports')} supabase={supabase} />}
          {route === 'report-incident' && canAccess('report_incident') && <IncidentTypeSelectionPage key={`report-incident-${navResetKey}`} role={legacyFeatureRole} supabase={supabase} draftId={new URLSearchParams(window.location.hash.split('?')[1] || '').get('draft')} />}
          {route === 'my-reports' && canAccess('view_own_reports') && <MyReportsPage supabase={supabase} />}
          {route === 'incident-detail' && <IncidentDetailPage supabase={supabase} incidentId={new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')} />}
          {route === 'incidents' && canAccess('view_all_incidents') && <MyReportsPage supabase={supabase} />}
          {route === 'corrective-actions' && <WorkspacePlaceholder title="Corrective Actions" description="Corrective Action Management will connect to incident, inspection, and audit findings." action="Module coming next" />}
          {route === 'inspections' && <WorkspacePlaceholder title="Safety Inspections" description="Inspection performance will become available when the inspection records module is implemented." action="Module coming next" />}
          {route === 'audits' && <WorkspacePlaceholder title="Audit Management" description="Audit metrics will become available when audit records and findings are implemented." action="Module coming next" />}
          {route === 'reports' && canAccess('view_reports') && <WorkspacePlaceholder title="Reports" description="Reporting and exports will connect to validated operational records in the reporting module." action="Module coming next" />}
          {route === 'ai-assistant' && canAccess('use_ai_assistant') && <WorkspacePlaceholder title="AI Safety Assistant" description="AI analysis will appear here once sufficient QHSE data and the AI service are connected." action="Review available data" />}
          {route === 'executive-analytics' && canAccess('view_executive_analytics') && <WorkspacePlaceholder title="Executive Analytics" description="Executive views will connect to validated operational metrics, trends, and site comparisons." action="Open analytics foundation" />}
          {route === 'marketplace' && canAccess('view_marketplace') && <WorkspacePlaceholder title="HSE Marketplace" description="The marketplace is reserved for approved HSE tools, services, and integrations." action="Marketplace coming soon" />}
          {route === 'administration' && canAccess('access_administration') && <AdministrationLandingPage canViewUsers={canAccess('view_users')} canViewRoles={canAccess('view_roles_permissions')} />}
          {route === 'users' && canAccess('view_users') && <UsersWorkspace organizationId={organizationId} currentUserId={session.user.id} canInviteUsers={canAccess('invite_users')} canEditUsers={canAccess('edit_users')} canSuspendUsers={canAccess('suspend_users')} canDeactivateUsers={canAccess('deactivate_users')} canManageUserRoles={canAccess('manage_user_roles')} canManageRolesPermissions={canAccess('manage_roles_permissions')} />}
          {route === 'roles-permissions' && canAccess('view_roles_permissions') && <RolesPermissionsWorkspace organizationId={organizationId} canManage={canAccess('manage_roles_permissions')} />}
          {route === 'profile' && <ProfileWorkspace userId={session.user.id} organizationId={organizationId} email={session.user.email || ''} />}
          {route === 'preferences' && <NotificationPreferencesWorkspace userId={session.user.id} organizationId={organizationId} />}
          {route === 'activity-log' && canAccess('view_activity') && <ActivityLogWorkspace organizationId={organizationId} />}
          {route === 'settings' && canAccess('manage_settings') && <CompanySettingsWorkspace organizationId={organizationId} userId={session.user.id} />}
        </section>
      </main>
    </div>
  )
}

function WorkspaceLoadingState({ backgroundImage, canProceed, secondsUntilAuto, onProceed }: { backgroundImage: string; canProceed: boolean; secondsUntilAuto: number; onProceed: () => void }) {
  const safetyBriefs = [
    'Every incident reported is an opportunity to prevent the next one.',
    'Safe operations begin with visible leadership.',
    'Near misses are early warnings, not minor events.',
    'Every corrective action should prevent recurrence.',
    'Good safety data turns uncertainty into action.',
    'The strongest safety culture makes reporting easy.',
    'Stop work when conditions change.',
    'Report the hazard before it becomes an incident.',
    'Control the immediate risk first.',
    'Verify that the fix actually worked.',
  ]
  const [briefIndex, setBriefIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setBriefIndex((current) => (current + 1) % safetyBriefs.length), 1400)
    return () => window.clearInterval(interval)
  }, [])

  return <div className="workspace-loading-backdrop" style={{ backgroundImage: `linear-gradient(90deg, rgba(4, 13, 28, 0.92), rgba(4, 13, 28, 0.62)), url(${backgroundImage})` }}><div className="workspace-loading-state"><div className="workspace-loading-mark"><BrandMark /></div><div className="eyebrow">FIELD SAFETY BRIEF</div><h2>Preparing your SentinelQHSE workspace</h2><p className="workspace-loading-brief">{safetyBriefs[briefIndex]}</p><div className="workspace-loading-steps"><span className="active">Organization access</span><span>Operational settings</span><span>Applying role permissions</span></div><div className="workspace-loading-line"><span /></div><small>{canProceed ? `Dashboard will open automatically in ${secondsUntilAuto || 1} seconds` : 'Loading securely...'}</small>{canProceed && <button className="button button-green workspace-loading-proceed" type="button" onClick={onProceed}>Proceed to Dashboard</button>}</div></div>
}

function WorkspacePlaceholder({ title, description, action }: { title: string; description: string; action: string }) {
  return <div className="workspace-panel workspace-placeholder"><div className="eyebrow">MODULE FOUNDATION</div><h2>{title}</h2><p>{description}</p><div className="workspace-placeholder-action"><span aria-hidden="true">→</span><strong>{action}</strong></div></div>
}

async function recordActivity(organizationId: string, userId: string, activity: string, metadata: Record<string, unknown> = {}) {
  await supabase.from('activity_logs').insert({ organization_id: organizationId, user_id: userId, activity, metadata })
}

type ActivityRecord = {
  id: string
  created_at: string
  activity: string
  ip_address: string | null
  location: string | null
  user_id: string | null
}

function ActivityLogWorkspace({ organizationId }: { organizationId: string }) {
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
  return <div className="workspace-panel activity-panel"><div className="workspace-panel-heading"><div><div className="eyebrow">AUDIT HISTORY</div><h2>Activity Log</h2><p>Every recorded action in this organization is retained with its actor, time, and context.</p></div></div><div className="user-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, user, or location" /></div>{error && <AuthMessage error={error} />}{loading ? <div className="workspace-empty">Loading audit history...</div> : filteredLogs.length === 0 ? <div className="workspace-empty">No activity matches this search.</div> : <div className="user-table-wrap"><table className="user-table activity-table"><thead><tr><th>Timestamp</th><th>User</th><th>Activity</th><th>IP address</th><th>Location</th></tr></thead><tbody>{filteredLogs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td>{log.user_id ? userNames[log.user_id] || log.user_id : 'System'}</td><td><strong>{log.activity}</strong></td><td>{log.ip_address || 'Not captured'}</td><td>{log.location || 'Not captured'}</td></tr>)}</tbody></table></div>}</div>
}

type PreferenceState = {
  email: boolean
  sms: boolean
  push: boolean
  incident_assignments: boolean
  corrective_action_reminders: boolean
  audit_reminders: boolean
}

function NotificationPreferencesWorkspace({ userId, organizationId }: { userId: string; organizationId: string }) {
  const [preferences, setPreferences] = useState<PreferenceState>({ email: true, sms: false, push: true, incident_assignments: true, corrective_action_reminders: true, audit_reminders: true })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const loadPreferences = async () => {
      const { data, error: preferencesError } = await supabase.from('notification_preferences').select('email, sms, push, incident_assignments, corrective_action_reminders, audit_reminders').eq('user_id', userId).maybeSingle()
      if (preferencesError) setError(preferencesError.message)
      else if (data) setPreferences(data)
      setLoading(false)
    }
    void loadPreferences()
  }, [userId])
  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const { error: saveError } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...preferences })
    if (saveError) setError(saveError.message)
    else {
      await recordActivity(organizationId, userId, 'Notification preferences changed')
      setMessage('Notification preferences saved.')
    }
  }
  if (loading) return <div className="workspace-panel">Loading notification preferences...</div>
  const labels: [keyof PreferenceState, string][] = [['email', 'Email notifications'], ['sms', 'SMS notifications'], ['push', 'Push notifications'], ['incident_assignments', 'Incident assignments'], ['corrective_action_reminders', 'Corrective action reminders'], ['audit_reminders', 'Audit reminders']]
  return <div className="workspace-panel preferences-panel"><div className="eyebrow">PERSONAL SETTINGS</div><h2>Notification Preferences</h2><p>Choose how SentinelQHSE keeps you informed about operational work.</p><form className="preference-form" onSubmit={savePreferences}>{labels.map(([key, label]) => <label className="preference-row" key={key}><span><strong>{label}</strong><small>Receive relevant updates through this channel</small></span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}<AuthMessage error={error} success={message} /><button className="button button-green auth-submit">Save preferences</button></form></div>
}

type CompanyShiftSetting = {
  id: string
  name: string
  start: string
  end: string
  active: boolean
}

type CompanySettingsState = {
  working_hours: string
  departments: string
  operational_sites: string
  emergency_contacts: string
  incident_categories: string
  risk_categories: string
  severity_levels: string
  inspection_templates: string
}

type DepartmentOption = {
  name: string
  active: boolean
}

type SiteOption = {
  name: string
  active: boolean
}

type EmergencyContact = {
  id: string
  name: string
  role: string
  phone: string
  email: string
  active: boolean
}

type SeverityOption = {
  name: string
  active: boolean
}

type IncidentCategoryOption = {
  name: string
  active: boolean
}

const defaultShiftTemplates: CompanyShiftSetting[] = [
  { id: 'day-shift', name: 'Day', start: '07:00', end: '19:00', active: true },
  { id: 'night-shift', name: 'Night', start: '19:00', end: '07:00', active: true },
]

const defaultDepartmentSuggestions = ['Operations', 'Maintenance', 'HSE', 'Security', 'Logistics', 'Procurement', 'Admin'] as const
const defaultSeveritySuggestions = ['Low', 'Medium', 'High', 'Critical'] as const
const defaultIncidentCategorySuggestions = ['Near Miss', 'Unsafe Condition', 'Unsafe Act', 'Environmental Incident', 'Slip/Trip/Fall'] as const

function normalizeDepartmentSettings(value: unknown): DepartmentOption[] {
  const source = Array.isArray(value) ? value : value && typeof value === 'object' ? ((value as Record<string, unknown>).items as unknown[] | undefined) ?? ((value as Record<string, unknown>).departments as unknown[] | undefined) ?? [] : []

  return source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      name,
      active: item.active !== false,
    }]
  })
}

function normalizeSiteSettings(value: unknown): SiteOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).sites as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).operational_sites as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ name, active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      name,
      active: item.active !== false,
    }]
  })
}

function normalizeEmergencyContacts(value: unknown): EmergencyContact[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).contacts as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ id: `contact-${index}-${name.toLowerCase().replace(/\s+/g, '-')}`, name, role: '', phone: '', email: '', active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `contact-${index}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      role: typeof item.role === 'string' ? item.role.trim() : '',
      phone: typeof item.phone === 'string' ? item.phone.trim() : '',
      email: typeof item.email === 'string' ? item.email.trim() : '',
      active: item.active !== false,
    }]
  })
}

function normalizeSeveritySettings(value: unknown): SeverityOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).levels as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).severity_levels as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ name, active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return name ? [{ name, active: item.active !== false }] : []
  })
}

function normalizeIncidentCategoryName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const legacyMap: Record<string, string> = {
    'near miss': 'Near Miss',
    'near-miss': 'Near Miss',
    'unsafe condition': 'Unsafe Condition',
    'unsafe act': 'Unsafe Act',
    'environmental incident': 'Environmental Incident',
    'environmental event': 'Environmental Incident',
    'slip trip fall': 'Slip/Trip/Fall',
    'slip/trip/fall': 'Slip/Trip/Fall',
  }
  return legacyMap[normalized] || value.trim()
}

function normalizeIncidentCategorySettings(value: unknown): IncidentCategoryOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).categories as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).incident_categories as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    const rawName = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).name === 'string' ? (entry as Record<string, unknown>).name as string : ''
    const name = normalizeIncidentCategoryName(rawName)
    if (!name) return []
    return [{ name, active: typeof entry === 'object' && entry !== null && 'active' in entry ? (entry as Record<string, unknown>).active !== false : true }]
  })
}

function normalizeShiftSettings(value: unknown): CompanyShiftSetting[] {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>
      if (Array.isArray(candidate.shifts)) return candidate.shifts
    }
    return []
  })()

  return source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const start = typeof item.start === 'string' ? item.start : ''
    const end = typeof item.end === 'string' ? item.end : ''
    if (!name) return []
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(16).slice(2)}`,
      name,
      start,
      end,
      active: item.active !== false,
    }]
  })
}

function isValidTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function hasDuplicateNames(items: Array<{ name: string }>) {
  const names = new Set<string>()
  return items.some((item) => {
    const name = item.name.trim().toLowerCase()
    if (!name || names.has(name)) return Boolean(name)
    names.add(name)
    return false
  })
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function CompanySettingsWorkspace({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [settings, setSettings] = useState<CompanySettingsState>({ working_hours: '{}', departments: '[]', operational_sites: '[]', emergency_contacts: '[]', incident_categories: '[]', risk_categories: '[]', severity_levels: '[]', inspection_templates: '[]' })
  const [shiftSettings, setShiftSettings] = useState<CompanyShiftSetting[]>(defaultShiftTemplates)
  const [departmentSettings, setDepartmentSettings] = useState<DepartmentOption[]>(defaultDepartmentSuggestions.map((name) => ({ name, active: true })))
  const [siteSettings, setSiteSettings] = useState<SiteOption[]>([])
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])
  const [severitySettings, setSeveritySettings] = useState<SeverityOption[]>(defaultSeveritySuggestions.map((name) => ({ name, active: true })))
  const [incidentCategorySettings, setIncidentCategorySettings] = useState<IncidentCategoryOption[]>(defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })))
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [siteDraft, setSiteDraft] = useState('')
  const [severityDraft, setSeverityDraft] = useState('')
  const [incidentCategoryDraft, setIncidentCategoryDraft] = useState('')
  const [contactDraft, setContactDraft] = useState<EmergencyContact>({ id: '', name: '', role: '', phone: '', email: '', active: true })
  const [shiftDraft, setShiftDraft] = useState<CompanyShiftSetting>({ id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [siteModalOpen, setSiteModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactToRemove, setContactToRemove] = useState<EmergencyContact | null>(null)
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      const { data, error: settingsError } = await supabase.from('company_settings').select('working_hours, departments, operational_sites, emergency_contacts, incident_categories, risk_categories, severity_levels, inspection_templates').eq('organization_id', organizationId).maybeSingle()
      if (settingsError) setError(settingsError.message)
      else if (data) {
        const nextSettings = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value, null, 2)])) as CompanySettingsState
        setSettings(nextSettings)
        const loadedShifts = normalizeShiftSettings(data.working_hours)
        setShiftSettings(loadedShifts.length ? loadedShifts : defaultShiftTemplates)
        const loadedDepartments = normalizeDepartmentSettings(data.departments)
        setDepartmentSettings(loadedDepartments.length ? loadedDepartments : defaultDepartmentSuggestions.map((name) => ({ name, active: true })))
        const loadedSites = normalizeSiteSettings(data.operational_sites)
        setSiteSettings(loadedSites)
        setEmergencyContacts(normalizeEmergencyContacts(data.emergency_contacts))
        const loadedSeverities = normalizeSeveritySettings(data.severity_levels)
        setSeveritySettings(data.severity_levels == null ? defaultSeveritySuggestions.map((name) => ({ name, active: true })) : loadedSeverities)
        const loadedCategories = normalizeIncidentCategorySettings(data.incident_categories)
        setIncidentCategorySettings(data.incident_categories == null ? defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })) : loadedCategories)
      }
      setLoading(false)
    }
    void loadSettings()
  }, [organizationId])

  const syncDepartmentSettings = (next: DepartmentOption[]) => {
    setDepartmentSettings(next)
    setSettings((current) => ({ ...current, departments: JSON.stringify(next, null, 2) }))
  }

  const addDepartment = () => {
    const name = departmentDraft.trim()
    if (!name) {
      setError('Department name is required.')
      return
    }
    if (departmentSettings.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setError('That department already exists.')
      return
    }

    const next = [...departmentSettings, { name, active: true }]
    syncDepartmentSettings(next)
    setDepartmentDraft('')
    setMessage('Department added.')
  }

  const toggleDepartment = (name: string) => {
    setDepartmentSettings((current) => {
      const next = current.map((department) => department.name.toLowerCase() === name.toLowerCase() ? { ...department, active: !department.active } : department)
      setSettings((currentSettings) => ({ ...currentSettings, departments: JSON.stringify(next, null, 2) }))
      return next
    })
  }

  const syncSiteSettings = (next: SiteOption[]) => {
    setSiteSettings(next)
    setSettings((current) => ({ ...current, operational_sites: JSON.stringify(next, null, 2) }))
  }

  const addSite = () => {
    const name = siteDraft.trim()
    if (!name) {
      setError('Site name is required.')
      return
    }
    if (siteSettings.some((site) => site.name.toLowerCase() === name.toLowerCase())) {
      setError('That site already exists.')
      return
    }

    const next = [...siteSettings, { name, active: true }]
    syncSiteSettings(next)
    setSiteDraft('')
    setSiteModalOpen(false)
    setMessage('Site added.')
  }

  const toggleSite = (name: string) => {
    setSiteSettings((current) => {
      const next = current.map((site) => site.name.toLowerCase() === name.toLowerCase() ? { ...site, active: !site.active } : site)
      setSettings((currentSettings) => ({ ...currentSettings, operational_sites: JSON.stringify(next, null, 2) }))
      return next
    })
  }

  const openContactEditor = (contact?: EmergencyContact) => {
    setContactDraft(contact ? { ...contact } : { id: '', name: '', role: '', phone: '', email: '', active: true })
    setError('')
    setMessage('')
    setContactModalOpen(true)
  }

  const saveContact = () => {
    const name = contactDraft.name.trim()
    const phone = contactDraft.phone.trim()
    const email = contactDraft.email.trim()
    if (!name || !phone) {
      setError('Contact name and phone number are required.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid contact email address.')
      return
    }
    if (emergencyContacts.some((contact) => contact.id !== contactDraft.id && contact.name.toLowerCase() === name.toLowerCase())) {
      setError('That emergency contact already exists.')
      return
    }

    const nextContact: EmergencyContact = { ...contactDraft, id: contactDraft.id || `contact-${Date.now()}`, name, role: contactDraft.role.trim(), phone, email }
    setEmergencyContacts((current) => {
      const next = contactDraft.id ? current.map((contact) => contact.id === contactDraft.id ? nextContact : contact) : [...current, nextContact]
      setSettings((currentSettings) => ({ ...currentSettings, emergency_contacts: JSON.stringify(next, null, 2) }))
      return next
    })
    setContactModalOpen(false)
    setMessage('Emergency contact saved.')
  }

  const removeContact = () => {
    if (!contactToRemove) return
    setEmergencyContacts((current) => {
      const next = current.filter((contact) => contact.id !== contactToRemove.id)
      setSettings((currentSettings) => ({ ...currentSettings, emergency_contacts: JSON.stringify(next, null, 2) }))
      return next
    })
    setContactToRemove(null)
    setMessage('Emergency contact removed.')
  }

  const addSeverity = () => {
    const name = severityDraft.trim()
    if (!name) {
      setError('Severity name is required.')
      return
    }
    if (severitySettings.some((severity) => severity.name.toLowerCase() === name.toLowerCase())) {
      setError('That severity level already exists.')
      return
    }
    setSeveritySettings((current) => [...current, { name, active: true }])
    setSeverityDraft('')
    setMessage('Severity level added.')
  }

  const toggleSeverity = (name: string) => {
    setSeveritySettings((current) => current.map((severity) => severity.name.toLowerCase() === name.toLowerCase() ? { ...severity, active: !severity.active } : severity))
  }

  const addIncidentCategory = () => {
    const name = normalizeIncidentCategoryName(incidentCategoryDraft)
    if (!name) {
      setError('Incident category is required.')
      return
    }
    if (incidentCategorySettings.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setError('That incident category already exists.')
      return
    }
    setIncidentCategorySettings((current) => [...current, { name, active: true }])
    setIncidentCategoryDraft('')
    setMessage('Incident category added.')
  }

  const toggleIncidentCategory = (name: string) => {
    setIncidentCategorySettings((current) => current.map((category) => category.name.toLowerCase() === name.toLowerCase() ? { ...category, active: !category.active } : category))
  }

  const openShiftEditor = (shift?: CompanyShiftSetting) => {
    setShiftDraft(shift ? { ...shift } : { id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
    setEditingShiftId(shift ? shift.id : null)
    setError('')
    setMessage('')
    setShiftModalOpen(true)
  }

  const saveShift = () => {
    const name = shiftDraft.name.trim()
    const start = shiftDraft.start.trim()
    const end = shiftDraft.end.trim()
    if (!name) {
      setError('Shift name is required.')
      return
    }
    if (!start || !end) {
      setError('Both start and end times are required.')
      return
    }
    if (!isValidTime(start) || !isValidTime(end) || start === end) {
      setError('Use valid 24-hour times with different start and end values.')
      return
    }
    if (shiftSettings.some((shift) => shift.id !== editingShiftId && shift.name.toLowerCase() === name.toLowerCase())) {
      setError('That shift already exists.')
      return
    }

    const nextShift: CompanyShiftSetting = {
      ...shiftDraft,
      id: shiftDraft.id || `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name,
      start,
      end,
      active: shiftDraft.active !== false,
    }

    setShiftSettings((current) => {
      const next = editingShiftId ? current.map((shift) => shift.id === editingShiftId ? nextShift : shift) : [...current, nextShift]
      setSettings((currentSettings) => ({ ...currentSettings, working_hours: JSON.stringify({ shifts: next }, null, 2) }))
      return next
    })

    setShiftModalOpen(false)
    setEditingShiftId(null)
    setShiftDraft({ id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
    setMessage('Shift saved.')
  }

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const nextWorkingHours = { shifts: shiftSettings }
    const nextDepartments = departmentSettings.filter((department) => department.name.trim())
    const nextSites = siteSettings.filter((site) => site.name.trim())
    const nextContacts = emergencyContacts.filter((contact) => contact.name.trim() && contact.phone.trim())
    const nextSeverities = severitySettings.filter((severity) => severity.name.trim())
    const nextCategories = incidentCategorySettings.filter((category) => category.name.trim())
    if (hasDuplicateNames(nextDepartments) || hasDuplicateNames(nextSites) || hasDuplicateNames(nextSeverities) || hasDuplicateNames(nextCategories) || hasDuplicateNames(nextContacts)) {
      setError('Duplicate configuration names are not allowed.')
      return
    }
    if (shiftSettings.some((shift) => !shift.name.trim() || !isValidTime(shift.start) || !isValidTime(shift.end) || shift.start === shift.end)) {
      setError('Each shift must have a name and valid different start and end times.')
      return
    }
    if (emergencyContacts.some((contact) => !contact.name.trim() || !contact.phone.trim() || !isValidEmail(contact.email.trim()))) {
      setError('Each emergency contact requires a name, phone number, and valid email if provided.')
      return
    }
    const mergedSettings = { ...settings, working_hours: JSON.stringify(nextWorkingHours, null, 2), departments: JSON.stringify(nextDepartments, null, 2), operational_sites: JSON.stringify(nextSites, null, 2), emergency_contacts: JSON.stringify(nextContacts, null, 2), incident_categories: JSON.stringify(nextCategories, null, 2), severity_levels: JSON.stringify(nextSeverities, null, 2) }

    let parsed: Record<string, unknown>
    try {
      parsed = Object.fromEntries(Object.entries(mergedSettings).map(([key, value]) => [key, JSON.parse(value)]))
    } catch {
      setError('Each settings field must contain valid JSON.')
      return
    }

    const { error: saveError } = await supabase.from('company_settings').upsert({ organization_id: organizationId, ...parsed })
    if (saveError) setError(saveError.message)
    else {
      await recordActivity(organizationId, userId, 'Company settings changed')
      window.dispatchEvent(new CustomEvent('company-settings-updated'))
      setMessage('Company settings saved.')
    }
  }

  if (loading) return <div className="workspace-panel">Loading company settings...</div>

  const fields: [keyof CompanySettingsState, string][] = []

  return <div className="workspace-panel settings-panel"><div className="eyebrow">ORGANIZATION CONFIGURATION</div><h2>Company Settings</h2><p>Maintain the organization reference data used by operational workflows. Values are stored as structured JSON.</p><form className="settings-form" onSubmit={saveSettings}><label>Shift<div className="shift-config-list">{shiftSettings.length ? shiftSettings.map((shift) => <div className="shift-config-item" key={shift.id}><div><strong>{shift.name}</strong><small>{shift.start} - {shift.end}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={shift.active} onChange={() => setShiftSettings((current) => current.map((item) => item.id === shift.id ? { ...item, active: !item.active } : item))} /><span /></label><button className="button button-outline button-small" type="button" onClick={() => openShiftEditor(shift)}>Change shift</button></div></div>) : <div className="workspace-empty">No shifts configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => openShiftEditor()}>Add shift</button></div></label><label>Departments<div className="shift-config-list">{departmentSettings.length ? departmentSettings.map((department) => <div className="shift-config-item" key={department.name}><div><strong>{department.name}</strong><small>{department.active ? 'Active' : 'Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={department.active} onChange={() => toggleDepartment(department.name)} /><span /></label></div></div>) : <div className="workspace-empty">No departments configured.</div>}</div><div className="shift-config-footer"><input value={departmentDraft} onChange={(event) => setDepartmentDraft(event.target.value)} placeholder="Add custom department" /><button className="button button-outline button-small" type="button" onClick={addDepartment}>Add department</button></div></label><label>Sites<div className="shift-config-list">{siteSettings.length ? siteSettings.map((site) => <div className="shift-config-item" key={site.name}><div><strong>{site.name}</strong><small>{site.active ? 'Active' : 'Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={site.active} onChange={() => toggleSite(site.name)} /><span /></label></div></div>) : <div className="workspace-empty">No sites configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => { setSiteDraft(''); setError(''); setMessage(''); setSiteModalOpen(true) }}>Add site</button></div></label><label>Emergency contacts<div className="shift-config-list">{emergencyContacts.length ? emergencyContacts.map((contact) => <div className="shift-config-item" key={contact.id}><div><strong>{contact.name}</strong><small>{[contact.role, contact.phone].filter(Boolean).join(' · ') || 'Contact details not set'}{contact.active ? '' : ' · Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={contact.active} onChange={() => setEmergencyContacts((current) => current.map((item) => item.id === contact.id ? { ...item, active: !item.active } : item))} /><span /></label><button className="button button-outline button-small" type="button" onClick={() => openContactEditor(contact)}>Edit</button><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(contact)}>Remove</button></div></div>) : <div className="workspace-empty">No emergency contacts configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => openContactEditor()}>Add contact</button></div></label><label>Severity levels<div className="shift-config-list">{severitySettings.map((severity) => <div className="shift-config-item" key={severity.name}><div><strong>{severity.name}</strong><small>{severity.active ? 'Enabled' : 'Disabled'}</small></div><label className="switch"><input type="checkbox" checked={severity.active} onChange={() => toggleSeverity(severity.name)} /><span /></label></div>)}</div><div className="shift-config-footer"><input value={severityDraft} onChange={(event) => setSeverityDraft(event.target.value)} placeholder="Add custom severity" /><button className="button button-outline button-small" type="button" onClick={addSeverity}>Add severity</button></div></label><label>Incident categories<div className="shift-config-list">{incidentCategorySettings.map((category) => <div className="shift-config-item" key={category.name}><div><strong>{category.name}</strong><small>{category.active ? "Enabled" : "Disabled"}</small></div><label className="switch"><input type="checkbox" checked={category.active} onChange={() => toggleIncidentCategory(category.name)} /><span /></label></div>)}</div><div className="shift-config-footer"><input value={incidentCategoryDraft} onChange={(event) => setIncidentCategoryDraft(event.target.value)} placeholder="Add custom category" /><button className="button button-outline button-small" type="button" onClick={addIncidentCategory}>Add category</button></div></label>{fields.map(([key, label]) => <label key={key}>{label}<textarea value={settings[key]} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} rows={4} spellCheck={false} /></label>)}<AuthMessage error={error} success={message} /><button className="button button-green auth-submit">Save company settings</button></form>{shiftModalOpen && <div className="role-creator-backdrop" onClick={() => setShiftModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">SHIFT SETTINGS</div><h3>{editingShiftId ? 'Edit shift' : 'Add shift'}</h3></div><button className="button button-outline button-small" type="button" onClick={() => setShiftModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Shift name<input value={shiftDraft.name} onChange={(event) => setShiftDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Day" required /></label><div className="shift-time-row"><label>Start time<select value={shiftDraft.start} onChange={(event) => setShiftDraft((current) => ({ ...current, start: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => hour).flatMap((hour) => { const value = `${String(hour).padStart(2, '0')}:00`; return [<option key={`${value}-start`} value={value}>{value}</option>] })}</select></label><label>End time<select value={shiftDraft.end} onChange={(event) => setShiftDraft((current) => ({ ...current, end: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => hour).flatMap((hour) => { const value = `${String(hour).padStart(2, '0')}:00`; return [<option key={`${value}-end`} value={value}>{value}</option>] })}</select></label></div><label className="preference-row"><span><strong>Enabled</strong><small>Show this shift in active options</small></span><input type="checkbox" checked={shiftDraft.active} onChange={(event) => setShiftDraft((current) => ({ ...current, active: event.target.checked }))} /></label></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setShiftModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={saveShift}>Save shift</button></div></div></div>}{siteModalOpen && <div className="role-creator-backdrop" onClick={() => setSiteModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">SITE SETTINGS</div><h3>New site</h3></div><button className="button button-outline button-small" type="button" onClick={() => setSiteModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Site name<input value={siteDraft} onChange={(event) => setSiteDraft(event.target.value)} placeholder="Main Plant" required /></label></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setSiteModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={addSite}>Add site</button></div></div></div>}{contactModalOpen && <div className="role-creator-backdrop" onClick={() => setContactModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">EMERGENCY CONTACTS</div><h3>{contactDraft.id ? 'Edit contact' : 'Add contact'}</h3></div><button className="button button-outline button-small" type="button" onClick={() => setContactModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Contact name<input value={contactDraft.name} onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Control room" required /></label><label>Role or service<input value={contactDraft.role} onChange={(event) => setContactDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Emergency response" /></label><label>Phone number<input value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="+234 ..." required /></label><label>Email address<input value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} type="email" placeholder="control-room@company.com" /></label><label className="preference-row"><span><strong>Enabled</strong><small>Show this contact on the dashboard</small></span><input type="checkbox" checked={contactDraft.active} onChange={(event) => setContactDraft((current) => ({ ...current, active: event.target.checked }))} /></label></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setContactModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={saveContact}>Save contact</button></div></div></div>}{contactToRemove && <div className="role-creator-backdrop" onClick={() => setContactToRemove(null)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">CONFIRM REMOVAL</div><h3>Remove {contactToRemove.name}?</h3></div><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(null)}>Close</button></div><div className="role-creator-body"><p>This contact will be removed from the organization emergency contacts list.</p></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(null)}>Cancel</button><button className="button button-green button-small" type="button" onClick={removeContact}>Remove contact</button></div></div></div>}</div>
}

type ManagedUserStatus = 'active' | 'pending' | 'suspended' | 'inactive'

type ManagedUser = {
  id: string
  full_name: string
  employee_id: string | null
  department: string | null
  job_title: string | null
  account_status: ManagedUserStatus
  role: string
}

type ManagedUserFilters = {
  query: string
  role: string
  department: string
  status: string
}

type ExportFormat = 'csv' | 'pdf' | 'xlsx' | 'docx'

type ExportAdmin = {
  fullName: string
  role: string
  department: string | null
}

type ExportUserRow = {
  userId: string
  name: string
  employeeId: string
  department: string
  jobTitle: string
  role: string
  status: string
  action: string
}

const exportIntroduction = 'This User Management Register provides an administrative overview of user accounts configured within the SentinelQHSE platform. It presents the user identification details, assigned departments, roles, account statuses, and relevant administrative actions included in the export.\n\nThe register is intended to support user-account administration, access oversight, recordkeeping, and internal review. It reflects the information available in the platform at the time of export and should be interpreted in accordance with the organization\'s applicable access-control procedures and information-management requirements.\n\nThis document is intended for authorized administrative use. Its contents should be handled in accordance with applicable organizational confidentiality and data-protection requirements.'

function exportFileName(format: ExportFormat, date: Date) {
  const datePart = date.toISOString().slice(0, 10)
  return `SentinelQHSE_User_Management_Register_${datePart}.${format}`
}

function downloadExport(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function exportCsv(rows: ExportUserRow[], generatedAt: Date) {
  const headers = ['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']
  const values = rows.map((row) => [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action])
  const csvValue = (value: string) => `"${value.replaceAll('"', '""')}"`
  const csv = [headers, ...values].map((row) => row.map((value) => csvValue(String(value ?? ''))).join(',')).join('\n')
  downloadExport(new Blob([csv], { type: 'text/csv;charset=utf-8' }), exportFileName('csv', generatedAt))
}

function exportPdf(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const pdf = new jsPDF({ orientation: 'landscape' })
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(18)
  pdf.text('SentinelQHSE', 14, 16)
  pdf.setFontSize(14)
  pdf.text('User Management Register', 14, 25)
  pdf.setFontSize(10)
  pdf.setTextColor('#475569')
  pdf.text('User Access, Roles and Status Report', 14, 32)
  pdf.text(`Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length} | Scope: Current filtered users`, 14, 39)
  pdf.setFontSize(8)
  const introLines = pdf.splitTextToSize(exportIntroduction, 265)
  pdf.text(introLines, 14, 47)
  const tableStart = 47 + introLines.length * 4 + 5
  autoTable(pdf, {
    startY: tableStart,
    head: [['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']],
    body: rows.map((row) => [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 74, 62] },
    didDrawPage: (data) => {
      pdf.setFontSize(8)
      pdf.setTextColor('#64748b')
      pdf.text(`SentinelQHSE User Management Register | Page ${data.pageNumber}`, 14, pdf.internal.pageSize.height - 8)
    },
  })
  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStart
  const signoffY = finalY + 14
  if (signoffY > pdf.internal.pageSize.height - 42) {
    pdf.addPage()
  }
  const visibleSignoffY = signoffY > pdf.internal.pageSize.height - 42 ? 18 : signoffY
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(10)
  pdf.text('AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', 14, visibleSignoffY)
  pdf.setFontSize(8)
  pdf.text(`Authorized / Exported By: ${admin.fullName}`, 14, visibleSignoffY + 7)
  pdf.text(`Role: ${admin.role}`, 14, visibleSignoffY + 13)
  pdf.text(`Department: ${getDepartmentLabel(admin.department)}`, 14, visibleSignoffY + 19)
  pdf.text(`Date and Time of Export: ${generatedAt.toLocaleString()}`, 14, visibleSignoffY + 25)
  pdf.save(exportFileName('pdf', generatedAt))
}

async function exportExcel(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('User Register')
  sheet.mergeCells('A1:H1')
  sheet.getCell('A1').value = 'SentinelQHSE — User Management Register'
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: '0F172A' } }
  sheet.mergeCells('A2:H2')
  sheet.getCell('A2').value = 'User Access, Roles and Status Report'
  sheet.getCell('A3').value = 'Exported'
  sheet.getCell('B3').value = generatedAt.toLocaleString()
  sheet.getCell('D3').value = 'Records'
  sheet.getCell('E3').value = rows.length
  sheet.mergeCells('A5:H7')
  sheet.getCell('A5').value = exportIntroduction
  sheet.getCell('A5').alignment = { wrapText: true, vertical: 'top' }
  const headerRow = sheet.addRow(['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4A3E' } }
  rows.forEach((row) => sheet.addRow([row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action]))
  sheet.addRow([])
  sheet.addRow(['AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF'])
  sheet.addRow(['Authorized / Exported By', admin.fullName])
  sheet.addRow(['Role', admin.role])
  sheet.addRow(['Department', getDepartmentLabel(admin.department)])
  sheet.addRow(['Date and Time of Export', generatedAt.toLocaleString()])
  sheet.columns = [{ width: 24 }, { width: 24 }, { width: 18 }, { width: 22 }, { width: 24 }, { width: 28 }, { width: 14 }, { width: 16 }]
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true } }))
  const buffer = await workbook.xlsx.writeBuffer()
  downloadExport(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportFileName('xlsx', generatedAt))
}

async function exportWord(rows: ExportUserRow[], admin: ExportAdmin, generatedAt: Date) {
  const header = ['User ID', 'Name', 'Employee ID', 'Department', 'Job Title', 'Role', 'Status', 'Action']
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: header.map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }),
      ...rows.map((row) => new TableRow({ children: [row.userId, row.name, row.employeeId, row.department, row.jobTitle, row.role, row.status, row.action].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
    ],
  })
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: 'SentinelQHSE', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'User Management Register', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: 'User Access, Roles and Status Report' }),
    new Paragraph({ text: `Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length} | Scope: Current filtered users` }),
    new Paragraph({ text: exportIntroduction, spacing: { after: 240 } }),
    table,
    new Paragraph({ text: 'AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', heading: HeadingLevel.HEADING_2, spacing: { before: 360 } }),
    new Paragraph({ text: `Authorized / Exported By: ${admin.fullName}` }),
    new Paragraph({ text: `Role: ${admin.role}` }),
    new Paragraph({ text: `Department: ${getDepartmentLabel(admin.department)}` }),
    new Paragraph({ text: `Date and Time of Export: ${generatedAt.toLocaleString()}` }),
  ] }] })
  const buffer = await Packer.toBlob(document)
  downloadExport(buffer, exportFileName('docx', generatedAt))
}

function matchesManagedUserFilters(user: ManagedUser, filters: ManagedUserFilters) {
  const displayRole = USER_MANAGEMENT_BACKEND_TO_ROLE[user.role] || user.role
  const searchableText = `${user.id} ${user.full_name} ${user.employee_id || ''} ${user.department || ''} ${user.role} ${displayRole}`.toLowerCase()
  const matchesQuery = searchableText.includes(filters.query.trim().toLowerCase())
  const matchesRole = filters.role === 'all' || user.role === filters.role
  const matchesDepartment = filters.department === 'all'
    || (filters.department === '__unset__' ? !user.department : user.department === filters.department)
  const matchesStatus = filters.status === 'all' || user.account_status === filters.status
  return matchesQuery && matchesRole && matchesDepartment && matchesStatus
}

function getDepartmentLabel(department: string | null) {
  return department?.trim() || 'Department not set'
}

const permissionCatalog: Permission[] = USER_MANAGEMENT_PERMISSION_CATALOG.map((permission) => permission.key)

type CustomRoleRecord = {
  id?: string
  organization_id?: string
  name: string
  description?: string | null
  permissions: string[]
  scope?: Record<string, unknown> | null
  is_system?: boolean
  is_active?: boolean
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function ProfileWorkspace({ userId, organizationId, email }: { userId: string; organizationId: string; email: string }) {
  const [profile, setProfile] = useState<Record<string, string>>({ full_name: '', employee_id: '', department: '', job_title: '', phone: '', emergency_contact: '', site_location: '', supervisor: '', certification_status: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error: profileError } = await supabase.from('profiles').select('full_name, employee_id, department, job_title, phone, emergency_contact, site_location, supervisor, certification_status').eq('id', userId).single()
      if (profileError) setError(profileError.message)
      else if (data) setProfile(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value || ''])))
      setLoading(false)
    }
    void loadProfile()
  }, [userId])

  const updateField = (field: string, value: string) => setProfile((current) => ({ ...current, [field]: value }))
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.from('profiles').update(profile).eq('id', userId).eq('organization_id', organizationId)
    if (updateError) setError(updateError.message)
    else {
      await recordActivity(organizationId, userId, 'Profile updated')
      setMessage('Profile updated successfully.')
    }
  }

  if (loading) return <div className="workspace-panel">Loading profile...</div>
  return (
    <div className="workspace-panel">
      <div className="eyebrow">ACCOUNT PROFILE</div>
      <h2>My Profile</h2>
      <p>Maintain the identity and contact information used across your organization.</p>
      <form className="workspace-form" onSubmit={saveProfile}>
        <label>Full name<input value={profile.full_name} onChange={(event) => updateField('full_name', event.target.value)} required /></label>
        <label>Work email<input value={email} disabled /></label>
        <label>Employee ID<input value={profile.employee_id} onChange={(event) => updateField('employee_id', event.target.value)} /></label>
        <label>Department<input value={profile.department} onChange={(event) => updateField('department', event.target.value)} /></label>
        <label>Job title<input value={profile.job_title} onChange={(event) => updateField('job_title', event.target.value)} /></label>
        <label>Phone number<input value={profile.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
        <label>Emergency contact<input value={profile.emergency_contact} onChange={(event) => updateField('emergency_contact', event.target.value)} /></label>
        <label>Site location<input value={profile.site_location} onChange={(event) => updateField('site_location', event.target.value)} /></label>
        <label>Supervisor<input value={profile.supervisor} onChange={(event) => updateField('supervisor', event.target.value)} /></label>
        <label>Certification status<input value={profile.certification_status} onChange={(event) => updateField('certification_status', event.target.value)} /></label>
        <AuthMessage error={error} success={message} />
        <button className="button button-green auth-submit">Save profile</button>
      </form>
    </div>
  )
}

type RoleSummary = {
  name: string
  description: string
  permissions: readonly string[]
  isSystem: boolean
  customRole?: CustomRoleRecord
}

const permissionGroupOrder = [
  { label: 'Platform Access', sourceGroups: ['Dashboard', 'Platform', 'Administration'] },
  { label: 'Incident Management', sourceGroups: ['Incident Management'] },
  { label: 'User Management', sourceGroups: ['User Management'] },
  { label: 'Roles & Permissions', sourceGroups: ['Roles & Permissions'] },
  { label: 'Reports', sourceGroups: ['Reports'] },
  { label: 'QHSE', sourceGroups: ['QHSE'] },
] as const

function groupedPermissions(permissions: readonly string[]) {
  return permissionGroupOrder.map((group) => ({
    group: group.label,
    permissions: USER_MANAGEMENT_PERMISSION_CATALOG.filter((permission) => (group.sourceGroups as readonly string[]).includes(permission.group) && permissions.includes(permission.key)),
  })).filter((section) => section.permissions.length > 0)
}

const roleDescriptions: Record<string, string> = {
  'Organization Admin': 'Manage organization users, access controls, roles and settings.',
  'QHSE Manager': 'Review and manage QHSE incidents, reports and corrective actions.',
  'Site Supervisor': 'Oversee site operations, incidents and corrective actions.',
  'Safety Officer / HSE Officer': 'Manage safety operations, incidents and facility risks.',
  Worker: 'Access core dashboard, analytics and personal reporting workflows.',
  'Executive/Management': 'Review organization-level operational visibility and reports.',
  Contractor: 'Access core operational reporting and personal work information.',
  'Maintenance Engineer': 'Review operational records and maintenance-related actions.',
}

function RolesPermissionsWorkspace({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleSummary | null>(null)
  const [editingRoleName, setEditingRoleName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRoles = async () => {
    setLoading(true)
    setError('')
    const { data, error: roleError } = await supabase.from('custom_roles').select('*').eq('organization_id', organizationId).eq('is_active', true).order('name')
    if (roleError) {
      setCustomRoles([])
      setError('Unable to load roles and permissions. Please try again.')
      setLoading(false)
      return
    }
    setCustomRoles((data ?? []).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
      description: typeof role.description === 'string' ? role.description : null,
      is_active: role.is_active !== false,
    })) as CustomRoleRecord[])
    setLoading(false)
  }

  useEffect(() => {
    void loadRoles()
  }, [organizationId])

  const summaries: RoleSummary[] = [
    ...USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => ({
      name: role.name,
      description: roleDescriptions[role.name] || 'Platform role with centrally configured permissions.',
      permissions: USER_MANAGEMENT_ROLE_PERMISSION_MATRIX[role.name],
      isSystem: true,
    })),
    {
      name: 'Super Administrator',
      description: 'Unrestricted platform administrator with authority to make supported changes and additions.',
      permissions: SUPER_ADMINISTRATOR_PERMISSION_KEYS,
      isSystem: true,
    },
    ...customRoles.map((role) => ({
      name: role.name,
      description: role.description || 'Custom organization role.',
      permissions: role.permissions,
      isSystem: false,
      customRole: role,
    })),
  ]

  return (
    <div className="workspace-panel role-management-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION / ROLES &amp; PERMISSIONS</div>
          <h2>Roles &amp; Permissions</h2>
          <p>Review platform roles and the permissions assigned to each role.</p>
        </div>
        <a className="button button-outline button-small" href="#administration">Back to Administration</a>
      </div>
      {error && <div className="role-state-message"><AuthMessage error={error} /><button className="button button-outline button-small" type="button" onClick={() => void loadRoles()}>Try again</button></div>}
      {loading ? <div className="workspace-empty">Loading roles and permissions...</div> : summaries.length === 0 ? <div className="workspace-empty">No roles configured.</div> : (
        <div className="role-summary-table-wrap">
          <table className="role-summary-table">
            <thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th>Actions</th></tr></thead>
            <tbody>{summaries.map((role) => <tr key={`${role.isSystem ? 'system' : 'custom'}-${role.name}`}>
              <td><strong>{role.name}</strong><small>{role.isSystem ? 'System role' : 'Custom role'}</small></td>
              <td>{role.description}</td>
              <td>{role.permissions.length}</td>
              <td className="role-summary-actions">
                <button className="button button-outline button-small" type="button" onClick={() => setSelectedRole(role)}>View</button>
                {!role.isSystem && canManage && <button className="button button-green button-small" type="button" onClick={() => { setSelectedRole(role); setEditingRoleName(role.name) }}>Edit</button>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {selectedRole && <div className="role-detail-panel">
        <div className="eyebrow">ROLE DETAILS</div>
        <h3>{selectedRole.name}</h3>
        <p>{selectedRole.description}</p>
        {selectedRole.isSystem && <p className="workspace-note">Protected platform default. Changes shown here are not presented as organization-persisted edits.</p>}
        <div className="permission-group-list">{groupedPermissions(selectedRole.permissions).map((section) => <section className="permission-group" key={`${selectedRole.name}-${section.group}`}><strong>{section.group}</strong><div className="role-permission-list">{section.permissions.map((permission) => <span title={permission.description} key={`${selectedRole.name}-${permission.key}`}>{permission.label}</span>)}</div></section>)}</div>
      </div>}
      {editingRoleName && canManage && <RoleManagementSection organizationId={organizationId} focusRoleName={editingRoleName} canManage />}
    </div>
  )
}

function RoleManagementSection({ organizationId, focusRoleName, canManage = true }: { organizationId: string; focusRoleName?: string; canManage?: boolean }) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  const [saving, setSaving] = useState(false)
  const allEditablePermissions = permissionCatalog

  const loadCustomRoles = async () => {
    setLoading(true)
    setError('')

    const { data, error: roleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })

    if (roleError) {
      setError('Unable to load roles and permissions. Please try again.')
      setCustomRoles([])
      setLoading(false)
      return
    }

    const normalizedRoles = (data ?? []).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? (role.permissions as string[]) : [],
      description: typeof role.description === 'string' ? role.description : null,
      scope: role.scope && typeof role.scope === 'object' ? (role.scope as Record<string, unknown>) : {},
      is_system: Boolean(role.is_system),
      is_active: role.is_active !== false,
    })) as CustomRoleRecord[]

    setCustomRoles(normalizedRoles)
    setLoading(false)
  }

  useEffect(() => {
    void loadCustomRoles()
  }, [organizationId])

  const resetForm = () => {
    setSelectedRoleId(null)
    setRoleForm({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  }

  const togglePermission = (permission: Permission) => {
    if (BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  const setAllPermissions = (enabled: boolean) => {
    setRoleForm((current) => ({
      ...current,
      permissions: enabled ? [...allEditablePermissions] : [...BASELINE_PERMISSION_KEYS] as Permission[],
    }))
  }

  const handleEditRole = (role: CustomRoleRecord) => {
    setSelectedRoleId(role.id ?? null)
    setRoleForm({
      name: role.name,
      description: role.description ?? '',
      permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...(Array.isArray(role.permissions) ? role.permissions : [])])) as Permission[],
    })
  }

  useEffect(() => {
    if (!focusRoleName) return
    const role = customRoles.find((item) => item.name === focusRoleName)
    if (role) handleEditRole(role)
  }, [customRoles, focusRoleName])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)

    try {
      if (!roleForm.name.trim()) {
        setError('Role name is required.')
        return
      }

      if (!roleForm.permissions.length) {
        setError('Choose at least one permission before saving.')
        return
      }

      const payload = {
        p_name: roleForm.name.trim(),
        p_description: roleForm.description.trim() || null,
        p_permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...roleForm.permissions])),
        p_scope: { organizationId },
      }

      if (selectedRoleId) {
        const { error: updateError } = await supabase.rpc('update_custom_role', {
          p_role_id: selectedRoleId,
          p_name: payload.p_name,
          p_description: payload.p_description,
          p_permissions: payload.p_permissions,
          p_scope: payload.p_scope,
          p_is_active: true,
        })

        if (updateError) throw updateError
        setMessage('Custom role updated successfully.')
      } else {
        const { error: createError } = await supabase.rpc('create_custom_role', {
          p_organization_id: organizationId,
          p_name: payload.p_name,
          p_description: payload.p_description,
          p_permissions: payload.p_permissions,
          p_scope: payload.p_scope,
        })

        if (createError) throw createError
        setMessage('Custom role created successfully.')
      }

      resetForm()
      await loadCustomRoles()
    } catch (saveError) {
      const operation = selectedRoleId ? 'update' : 'create'
      const detail = saveError instanceof Error ? ` ${saveError.message}` : ''
      setError(`Unable to ${operation} the custom role.${detail}`)
    } finally {
      setSaving(false)
    }
  }

  const builtInRoleCards = BUILT_IN_BACKEND_ROLES.map((role) => {
    const configuredPermissions = permissionsForRole(role)
    return {
      name: role,
      description: 'System-defined role protected by the platform configuration.',
      permissions: configuredPermissions,
      is_system: true,
      is_active: true,
      scope: { restricted: true },
    }
  })

  return (
    <div className="workspace-panel role-management-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ROLE MANAGEMENT</div>
          <h2>Custom Roles & Permissions</h2>
          <p>Review system roles, create organization-specific roles, and maintain permission scopes.</p>
        </div>
      </div>

      <p className="workspace-note">Built-in platform roles are protected defaults. Custom organization roles are persisted through the existing secure role backend.</p>

      {canManage && <form className="role-manager-form" onSubmit={handleSubmit}>
        <div className="role-form-grid">
          <label>
            Role name
            <input value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Permit Coordinator" required />
          </label>
          <label>
            Description
            <input value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
          </label>
        </div>

        <div className="permission-group-list">
          {groupedPermissions(permissionCatalog).map((section) => <section className="permission-group" key={section.group}><strong>{section.group}</strong><div className="permission-grid">{section.permissions.map((permission) => { const required = BASELINE_PERMISSION_KEYS.includes(permission.key as typeof BASELINE_PERMISSION_KEYS[number]); return <label className={`permission-toggle${required ? ' permission-required' : ''}`} key={permission.key}><input type="checkbox" checked={roleForm.permissions.includes(permission.key as Permission)} disabled={required} onChange={() => togglePermission(permission.key as Permission)} /><span><b>{permission.label}{required ? ' · Required' : ''}</b><small>{permission.description}</small></span></label> })}</div></section>)}
        </div>

        <label className="permission-toggle permission-select-all">
          <input type="checkbox" checked={roleForm.permissions.length === allEditablePermissions.length} onChange={(event) => setAllPermissions(event.target.checked)} />
          <span>Select all permissions</span>
        </label>

        <div className="role-form-actions">
          <button className="button button-green button-small" type="submit" disabled={saving}>{saving ? (selectedRoleId ? 'Saving...' : 'Creating...') : (selectedRoleId ? 'Save role' : 'Create role')}</button>
          {selectedRoleId && <button className="button button-outline workspace-refresh" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
      </form>}

      <AuthMessage error={error} success={message} />

      {loading ? (
        <div className="workspace-empty">Loading roles...</div>
      ) : (
        <div className="role-card-list">
          {[...builtInRoleCards, ...customRoles.map((role) => ({
            name: role.name,
            description: role.description ?? 'Custom organization role.',
            permissions: role.permissions as Permission[],
            is_system: false,
            is_active: role.is_active !== false,
            scope: role.scope ?? {},
            id: role.id,
          }))].map((role) => (
            <div className="role-card" key={`${role.is_system ? 'system' : 'custom'}-${role.name}`}>
              <div className="role-card-header">
                <div>
                  <strong>{role.name}</strong>
                  <small>{role.is_system ? 'System role' : 'Custom role'}</small>
                </div>
                {!role.is_system && (
                  <button className="button button-outline button-small" type="button" onClick={() => { const selectedRole = customRoles.find((item) => item.name === role.name); if (selectedRole) handleEditRole(selectedRole) }}>Edit</button>
                )}
              </div>
              <p>{role.description}</p>
              <div className="role-permission-list">
                {role.permissions.map((permission) => <span key={`${role.name}-${permission}`}>{permission.replaceAll('_', ' ')}</span>)}
              </div>
              <div className="role-scope">
                <span>Scope</span>
                <strong>{Object.keys(role.scope ?? {}).length ? JSON.stringify(role.scope) : 'Organization-wide access'}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UsersWorkspace({ organizationId, currentUserId, canInviteUsers, canEditUsers, canSuspendUsers, canDeactivateUsers, canManageUserRoles, canManageRolesPermissions }: { organizationId: string; currentUserId: string; canInviteUsers: boolean; canEditUsers: boolean; canSuspendUsers: boolean; canDeactivateUsers: boolean; canManageUserRoles: boolean; canManageRolesPermissions: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('Field Worker')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showRoleManagement, setShowRoleManagement] = useState(false)
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  const [roleDraftLoading, setRoleDraftLoading] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false)
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [departmentLoading, setDepartmentLoading] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
  const [exportAdmin, setExportAdmin] = useState<ExportAdmin | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  const loadDepartments = async () => {
    const { data, error: settingsError } = await supabase
      .from('company_settings')
      .select('departments')
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (settingsError) {
      setError(settingsError.message)
      return
    }

    const configuredDepartments = normalizeDepartmentSettings(data?.departments)
    setDepartments(configuredDepartments.filter((department) => department.active))
  }

  const loadCustomRoles = async () => {
    const { data, error: customRoleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })

    if (customRoleError) {
      setError(customRoleError.message)
      setCustomRoles([])
      return
    }

    setCustomRoles((data ?? []).filter((role) => role.is_active !== false).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
      description: typeof role.description === 'string' ? role.description : null,
      scope: role.scope && typeof role.scope === 'object' ? role.scope as Record<string, unknown> : {},
      is_system: Boolean(role.is_system),
      is_active: role.is_active !== false,
    })))
  }

  const loadUsers = async () => {
    setLoading(true)
    const [{ data: profiles, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, employee_id, department, job_title, account_status').eq('organization_id', organizationId).order('full_name'),
      supabase.from('memberships').select('user_id, role').eq('organization_id', organizationId),
    ])
    if (profileError || membershipError) setError(profileError?.message || membershipError?.message || 'Unable to load users.')
    else {
      const roleByUser = new Map((memberships || []).map((membership) => [membership.user_id, String(membership.role)]))
      setUsers((profiles || []).map((profile) => ({ ...profile, role: roleByUser.get(profile.id) || 'Field Worker' })))
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadCustomRoles()
    void loadDepartments()
    void loadUsers()
    void (async () => {
      const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
        supabase.from('profiles').select('full_name, department').eq('id', currentUserId).eq('organization_id', organizationId).maybeSingle(),
        supabase.from('memberships').select('role').eq('user_id', currentUserId).eq('organization_id', organizationId).maybeSingle(),
      ])
      if (profileError || membershipError || !profile?.full_name || !membership?.role) {
        setExportAdmin(null)
        setError('Unable to verify the authenticated administrator identity for export.')
        return
      }
      setExportAdmin({ fullName: profile.full_name, role: String(membership.role), department: profile.department })
    })()
  }, [currentUserId, organizationId])

  const roleComboOptions = [
    ...USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => ({ id: role.id, label: role.name, value: role.backendName })),
    ...customRoles.map((role) => ({ id: `custom-${role.id || role.name}`, label: role.name, value: role.name })),
  ]

  const openRoleCreator = () => {
    setRoleDraft({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
    setError('')
    setMessage('')
    setRoleModalOpen(true)
  }

  const toggleRolePermission = (permission: Permission) => {
    if (BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setRoleDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  const saveCustomRole = async () => {
    if (!roleDraft.name.trim()) {
      setError('Role name is required.')
      return
    }

    if (!roleDraft.permissions.length) {
      setError('Select at least one permission before saving.')
      return
    }

    setRoleDraftLoading(true)
    setError('')
    setMessage('')

    const { data, error: createError } = await supabase.rpc('create_custom_role', {
      p_organization_id: organizationId,
      p_name: roleDraft.name.trim(),
      p_description: roleDraft.description.trim() || null,
      p_permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...roleDraft.permissions])),
      p_scope: { organizationId },
    })

    setRoleDraftLoading(false)

    if (createError) {
      setError(createError.message)
      return
    }

    const createdName = typeof data?.name === 'string' ? data.name : roleDraft.name.trim()
    setInviteRole(createdName)
    setRoleModalOpen(false)
    setRoleDraft({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
    await loadCustomRoles()
    setMessage(`Custom role "${createdName}" created and selected.`)
  }

  const inviteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canInviteUsers) {
      setError('You are not authorized to invite users.')
      return
    }
    setError('')
    setMessage('')
    setInviteLoading(true)
    const { error: inviteError } = await supabase.functions.invoke('admin-invite-user', {
      body: { organizationId, email: inviteEmail, department: inviteDepartment || null, role: inviteRole },
    })
    setInviteLoading(false)
    if (inviteError) setError(await getEdgeFunctionErrorMessage(inviteError))
    else {
      await recordActivity(organizationId, currentUserId, 'Invitation sent', { has_department: Boolean(inviteDepartment), role: inviteRole })
      setMessage(`Invitation sent to ${inviteEmail}.`)
      setInviteEmail('')
      setInviteDepartment('')
      void loadUsers()
    }
  }

  const saveDepartment = async () => {
    const name = departmentDraft.trim()
    if (!name) {
      setError('Department name is required.')
      return
    }
    if (departments.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setError('That department already exists.')
      return
    }

    setDepartmentLoading(true)
    setError('')
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('departments')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (settingsError) {
      setDepartmentLoading(false)
      setError(settingsError.message)
      return
    }

    const currentDepartments = normalizeDepartmentSettings(settings?.departments)
    const nextDepartments = [...currentDepartments.filter((department) => department.name.toLowerCase() !== name.toLowerCase()), { name, active: true }]
    const { error: saveError } = await supabase
      .from('company_settings')
      .upsert({ organization_id: organizationId, departments: nextDepartments })
    setDepartmentLoading(false)
    if (saveError) {
      setError(saveError.message)
      return
    }

    await loadDepartments()
    setInviteDepartment(name)
    setDepartmentDraft('')
    setDepartmentModalOpen(false)
    await recordActivity(organizationId, currentUserId, 'Department created', { department_name: name })
    setMessage(`Department "${name}" created and selected.`)
  }

  const updateUser = async (user: ManagedUser, field: 'role' | 'account_status', value: string) => {
    setError('')
    setMessage('')
    if (field === 'role') {
      if (!canManageUserRoles) return setError('You are not authorized to change user roles.')
      const { error: updateError } = await supabase.rpc('update_user_role', { p_organization_id: organizationId, p_target_user_id: user.id, p_role: value })
      if (updateError) return setError(updateError.message)
    } else {
      if (value === 'suspended' && !canSuspendUsers) return setError('You are not authorized to suspend users.')
      if (value === 'inactive' && !canDeactivateUsers && !canEditUsers) return setError('You are not authorized to deactivate users.')
      if ((value === 'active' || value === 'pending') && !canEditUsers) return setError('You are not authorized to edit user status.')
      const { error: updateError } = await supabase.from('profiles').update({ account_status: value }).eq('id', user.id).eq('organization_id', organizationId)
      if (updateError) return setError(updateError.message)
    }
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, [field]: value } as ManagedUser : item))
    await recordActivity(organizationId, currentUserId, `User ${field} changed`, { target_user_id: user.id, value })
    setMessage(`${user.full_name} updated successfully.`)
  }

  const exportUsers = async () => {
    if (!exportAdmin) {
      setError('Unable to identify the authenticated administrator for this export.')
      return
    }
    setExportLoading(true)
    setError('')
    const generatedAt = new Date()
    const rows: ExportUserRow[] = filteredUsers.map((user) => ({
      userId: user.id,
      name: user.full_name,
      employeeId: user.employee_id || '',
      department: getDepartmentLabel(user.department),
      jobTitle: user.job_title || '',
      role: USER_MANAGEMENT_BACKEND_TO_ROLE[user.role] || user.role,
      status: user.account_status,
      action: user.account_status === 'suspended' ? 'Suspended' : user.account_status === 'inactive' ? 'Deactivated' : '—',
    }))
    try {
      if (exportFormat === 'csv') exportCsv(rows, generatedAt)
      if (exportFormat === 'pdf') exportPdf(rows, exportAdmin, generatedAt)
      if (exportFormat === 'xlsx') await exportExcel(rows, exportAdmin, generatedAt)
      if (exportFormat === 'docx') await exportWord(rows, exportAdmin, generatedAt)
      await recordActivity(organizationId, currentUserId, 'User register exported', { format: exportFormat, record_count: rows.length })
      setMessage(`${exportFormat.toUpperCase()} user register downloaded.`)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to generate the user register.')
    } finally {
      setExportLoading(false)
    }
  }

  const filteredUsers = users.filter((user) => matchesManagedUserFilters(user, {
    query,
    role: roleFilter,
    department: departmentFilter,
    status: statusFilter,
  }))

  return (
    <div className="workspace-panel users-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h2>User Management</h2>
          <p>Manage organization members, roles, and account status.</p>
        </div>
        <div className="workspace-panel-actions">
          <a className="button button-outline button-small" href="#administration">Back to Administration</a>
          {canManageRolesPermissions && <button className="button button-outline button-small" type="button" onClick={() => setShowRoleManagement((current) => !current)}>
            {showRoleManagement ? 'Hide roles' : 'Manage roles'}
          </button>}
          <select className="export-format-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)} aria-label="Export format">
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="docx">Word</option>
            <option value="csv">CSV</option>
          </select>
          <button className="button button-green button-small" type="button" onClick={() => void exportUsers()} disabled={exportLoading}>{exportLoading ? 'Generating...' : 'Export users'}</button>
        </div>
      </div>
      {canInviteUsers && <form className="invite-form" onSubmit={inviteUser}>
        <div><strong>Invite a user</strong><span>Invitation emails are sent through Supabase Auth.</span></div>
        <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" placeholder="Work email" required />
        <select value={inviteDepartment} onChange={(event) => {
          if (event.target.value === '__create_new_department__') {
            setDepartmentDraft('')
            setError('')
            setMessage('')
            setDepartmentModalOpen(true)
            return
          }
          setInviteDepartment(event.target.value)
        }}>
          <option value="">Select department</option>
          {departments.map((department) => <option value={department.name} key={department.name}>{department.name}</option>)}
          <option value="__create_new_department__">Create New Department...</option>
        </select>
        <select
          value={inviteRole}
          onChange={(event) => {
            const selectedValue = event.target.value
            if (selectedValue === '__create_new_role__') {
              openRoleCreator()
              return
            }
            setInviteRole(selectedValue)
          }}
        >
          {roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}
          {canManageRolesPermissions && <option value="__create_new_role__">Create New Role...</option>}
        </select>
        <button className="button button-green button-small" disabled={inviteLoading}>{inviteLoading ? 'Sending...' : 'Send invite'}</button>
      </form>}
      <div className="user-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, department, or role" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}</select><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.filter((department) => department.active).map((department) => <option value={department.name} key={department.name}>{department.name}</option>)}<option value="__unset__">Department not set</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select><button className="button button-outline workspace-refresh" type="button" onClick={() => void loadUsers()}>Refresh</button></div>
      <AuthMessage error={error} success={message} />
      {loading ? <div className="workspace-empty">Loading organization users...</div> : filteredUsers.length === 0 ? <div className="workspace-empty">No users match the current filters.</div> : <div className="user-table-wrap"><table className="user-table"><thead><tr><th>User</th><th>Department</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.full_name}</strong><small>{user.employee_id || user.id}</small></td><td>{getDepartmentLabel(user.department)}</td><td><select value={user.role} disabled={user.id === currentUserId || !canManageUserRoles} onChange={(event) => void updateUser(user, 'role', event.target.value)}>{roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}</select></td><td><select value={user.account_status} disabled={user.id === currentUserId || !canEditUsers} onChange={(event) => void updateUser(user, 'account_status', event.target.value)}>{!['active', 'inactive'].includes(user.account_status) && <option value={user.account_status} disabled>{user.account_status.charAt(0).toUpperCase() + user.account_status.slice(1)}</option>}<option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><select aria-label={`Actions for ${user.full_name}`} defaultValue="" disabled={user.id === currentUserId || (!canSuspendUsers && !canDeactivateUsers)} onChange={(event) => { const action = event.target.value; if (action === 'Suspend' && canSuspendUsers) void updateUser(user, 'account_status', 'suspended'); if (action === 'Deactivate' && canDeactivateUsers) void updateUser(user, 'account_status', 'inactive'); event.currentTarget.value = '' }}><option value="">Select action</option>{USER_ACTION_OPTIONS.filter((action) => action === 'Suspend' ? canSuspendUsers : canDeactivateUsers).map((action) => <option value={action} key={action}>{action}</option>)}</select></td></tr>)}</tbody></table></div>}
      {showRoleManagement && canManageRolesPermissions && <RoleManagementSection organizationId={organizationId} canManage />}
      {roleModalOpen && canManageRolesPermissions && (
        <div className="role-creator-backdrop" onClick={() => setRoleModalOpen(false)}>
          <div className="role-creator-modal" onClick={(event) => event.stopPropagation()}>
            <div className="role-creator-header">
              <div>
                <div className="eyebrow">CREATE ROLE</div>
                <h3>New custom role</h3>
              </div>
              <button className="button button-outline button-small" type="button" onClick={() => setRoleModalOpen(false)}>Close</button>
            </div>
            <div className="role-creator-body">
              <label>
                Role name
                <input value={roleDraft.name} onChange={(event) => setRoleDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Permit Coordinator" required />
              </label>
              <label>
                Description
                <input value={roleDraft.description} onChange={(event) => setRoleDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
              </label>
              <div className="permission-grid">
                {permissionCatalog.map((permission) => { const definition = USER_MANAGEMENT_PERMISSION_CATALOG.find((item) => item.key === permission); const required = BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number]); return (
                  <label className={`permission-toggle${required ? ' permission-required' : ''}`} key={permission}>
                    <input type="checkbox" checked={roleDraft.permissions.includes(permission)} disabled={required} onChange={() => toggleRolePermission(permission)} />
                    <span><b>{definition?.label || permission.replaceAll('_', ' ')}{required ? ' · Required' : ''}</b><small>{definition?.description}</small></span>
                  </label>
                )})}
              </div>
            </div>
            <div className="role-creator-actions">
              <button className="button button-outline button-small" type="button" onClick={() => setRoleModalOpen(false)}>Cancel</button>
              <button className="button button-green button-small" type="button" onClick={() => void saveCustomRole()} disabled={roleDraftLoading}>{roleDraftLoading ? 'Saving...' : 'Save role'}</button>
            </div>
          </div>
        </div>
      )}
      {departmentModalOpen && (
        <div className="role-creator-backdrop" onClick={() => setDepartmentModalOpen(false)}>
          <div className="role-creator-modal" onClick={(event) => event.stopPropagation()}>
            <div className="role-creator-header">
              <div>
                <div className="eyebrow">ORGANIZATION SETTINGS</div>
                <h3>New department</h3>
              </div>
              <button className="button button-outline button-small" type="button" onClick={() => setDepartmentModalOpen(false)}>Close</button>
            </div>
            <div className="role-creator-body">
              <label>
                Department name
                <input value={departmentDraft} onChange={(event) => setDepartmentDraft(event.target.value)} placeholder="e.g. Process Safety" autoFocus required />
              </label>
            </div>
            <div className="role-creator-actions">
              <button className="button button-outline button-small" type="button" onClick={() => setDepartmentModalOpen(false)}>Cancel</button>
              <button className="button button-green button-small" type="button" onClick={() => void saveDepartment()} disabled={departmentLoading}>{departmentLoading ? 'Saving...' : 'Save department'}</button>
            </div>
          </div>
        </div>
      )}
      <p className="workspace-note">Password resets remain server-side through Supabase Auth. The browser never receives the service-role credential.</p>
    </div>
  )
}

function RegistrationPage() {
  const [companyCode, setCompanyCode] = useState(`SENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
  const [region, setRegion] = useState('')
  const [country, setCountry] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const form = new FormData(event.currentTarget)
    const values = {
      companyCode: companyCode.trim().toUpperCase(),
      companyName: String(form.get('companyName') || ''),
      companyRegistrationNumber: String(form.get('companyRegistrationNumber') || ''),
      companyType: String(form.get('companyType') || ''),
      industry: String(form.get('industry') || ''),
      companySize: String(form.get('companySize') || ''),
      region,
      country,
      state: selectedState,
      address: String(form.get('address') || ''),
      contactEmail: String(form.get('contactEmail') || ''),
      contactPhone: String(form.get('contactPhone') || ''),
      adminName: String(form.get('adminName') || ''),
      adminEmail: String(form.get('adminEmail') || ''),
      password: String(form.get('password') || ''),
      passwordConfirmation: String(form.get('passwordConfirmation') || ''),
      acceptTerms: form.get('acceptTerms') === 'on',
    }
    const parsed = registrationSchema.safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check the registration details and try again.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      return
    }

    setLoading(true)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.adminEmail,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.adminName } },
    })
    if (signUpError) {
      setLoading(false)
      setError(signUpError.message)
      return
    }
    if (!signUpData.user) {
      setLoading(false)
      setError('The administrator account could not be created.')
      return
    }
    if (!signUpData.session) {
      setLoading(false)
      setMessage('Account created. Confirm the administrator email, then sign in to complete organization setup.')
      return
    }

    const { data: organization, error: organizationError } = await supabase.rpc('create_organization_with_owner', {
      organization_data: {
        company_code: parsed.data.companyCode,
        company_name: parsed.data.companyName,
        logo_url: '',
        industry: parsed.data.industry,
        company_registration_number: parsed.data.companyRegistrationNumber,
        company_type: parsed.data.companyType,
        company_size: parsed.data.companySize,
        region: parsed.data.region,
        country: parsed.data.country,
        state: parsed.data.state,
        address: parsed.data.address,
        contact_email: parsed.data.contactEmail,
        contact_phone: parsed.data.contactPhone,
      },
      owner_full_name: parsed.data.adminName,
    })
    if (organizationError || !organization) {
      setLoading(false)
      setError(organizationError?.message || 'The organization could not be created.')
      return
    }

    const logo = form.get('logo')
    if (logo instanceof File && logo.size > 0) {
      if (!logo.type.startsWith('image/') || logo.size > 5 * 1024 * 1024) {
        setLoading(false)
        setError('Organization created, but the logo must be an image smaller than 5 MB.')
        return
      }
      const logoPath = `${organization.id}/${crypto.randomUUID()}-${logo.name}`
      const { error: uploadError } = await supabase.storage.from('organization-assets').upload(logoPath, logo, { upsert: false })
      if (uploadError) {
        setLoading(false)
        setError(`Organization created, but logo upload failed: ${uploadError.message}`)
        return
      }
      const { error: logoUpdateError } = await supabase.from('organizations').update({ logo_url: logoPath }).eq('id', organization.id)
      if (logoUpdateError) {
        setLoading(false)
        setError(`Organization created, but logo linking failed: ${logoUpdateError.message}`)
        return
      }
    }

    setLoading(false)
    setMessage(`Organization created. ${parsed.data.adminName} is now the Super Administrator. You can sign in.`)
  }

  return (
    <AuthShell title="Register your organization" subtitle="Create your company workspace and become its first Super Administrator.">
      <form className="auth-form registration-form" onSubmit={submit}>
        <div className="form-section-title">Company details</div>
        <div className="form-grid">
          <label>Company name<input name="companyName" placeholder="Acme Energy Ltd" /></label>
          <label>Company code<input value={companyCode} onChange={(event) => setCompanyCode(event.target.value.toUpperCase())} maxLength={20} /></label>
          <label>Industry<select name="industry" defaultValue=""><option value="" disabled>Select industry</option><option>Oil & Gas</option><option>Mining</option><option>Power & Utilities</option><option>Construction</option><option>Manufacturing</option></select></label>
          <label>Company type<input name="companyType" placeholder="Private limited" /></label>
          <label>Company size<select name="companySize" defaultValue=""><option value="" disabled>Select size</option><option>1-50</option><option>51-250</option><option>251-1,000</option><option>1,001+</option></select></label>
          <label>Registration number<input name="companyRegistrationNumber" placeholder="Optional" /></label>
          <label>Region<select name="region" value={region} onChange={(event) => setRegion(event.target.value)}><option value="" disabled>Select region</option>{worldRegions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label>Country<select name="country" value={country} onChange={(event) => { setCountry(event.target.value); setSelectedState('') }}><option value="" disabled>Select country</option>{countries.map((option) => <option value={option.name} key={option.code}>{option.name}</option>)}</select></label>
          <label>State / Province<select name="state" value={selectedState} onChange={(event) => setSelectedState(event.target.value)} disabled={!country}><option value="" disabled>{country ? 'Select state or province' : 'Select a country first'}</option>{countries.find((option) => option.name === country)?.regions.map(([name, code]) => <option value={name} key={code}>{name}</option>)}</select></label>
        </div>
        <label>Address<input name="address" placeholder="Company address" /></label>
        <div className="form-grid">
          <label>Contact email<input name="contactEmail" type="email" placeholder="contact@company.com" /></label>
          <label>Contact phone<input name="contactPhone" type="tel" placeholder="+234 ..." /></label>
        </div>
        <label>Company logo <input name="logo" type="file" accept="image/*" /></label>
        <div className="form-section-title">Administrator account</div>
        <div className="form-grid">
          <label>Full name<input name="adminName" placeholder="Your full name" autoComplete="name" /></label>
          <label>Work email<input name="adminEmail" type="email" placeholder="admin@company.com" autoComplete="email" /></label>
        </div>
        <div className="form-grid">
          <label>Password<input name="password" type="password" autoComplete="new-password" /></label>
          <label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" /></label>
        </div>
        <label className="checkbox-label"><input name="acceptTerms" type="checkbox" /> I agree to the platform terms and privacy policy.</label>
        <AuthMessage error={error} success={message} />
        <button className="button button-green auth-submit" disabled={loading}>{loading ? 'Creating workspace...' : 'Create organization →'}</button>
        <p className="auth-footer-copy">Already registered? <a href="#sign-in">Sign in</a></p>
      </form>
    </AuthShell>
  )
}

export default function App() {
  const [authRoute, setAuthRoute] = useState<AuthRoute | null>(() => getAuthRoute())
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('sentinel-theme') === 'dark')

  useEffect(() => {
    const handleHashChange = () => setAuthRoute(getAuthRoute())
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session)
      setSessionLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setSessionLoading(false)
      if (event === 'PASSWORD_RECOVERY') setAuthRoute('reset-password')
    })
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      data.subscription.unsubscribe()
    }
  }, [])

  const toggleTheme = () => {
    setIsDarkMode((current) => {
      const next = !current
      localStorage.setItem('sentinel-theme', next ? 'dark' : 'light')
      return next
    })
  }

  if (authRoute === 'sign-in') return <SignInPage />
  if (authRoute === 'register') return <RegistrationPage />
  if (authRoute === 'forgot-password') return <ForgotPasswordPage />
  if (authRoute === 'reset-password') return <PasswordPage reset />
  if (authRoute === 'change-password') return <PasswordPage />
  if (authRoute === 'invite-signup') return <InviteSignupPage />
  if (authRoute === 'demo') return <DemoRequestPage />

  const requestedRoute = window.location.hash.replace('#/', '').replace('#', '')
  if (requestedRoute === 'mfa') {
    window.location.hash = '#dashboard'
    return <div className="protected-state">Opening your workspace...</div>
  }
  const protectedRoute = requestedRoute === 'dashboard' || requestedRoute === 'report-incident' || requestedRoute === 'incident-detail' || requestedRoute === 'my-reports' || requestedRoute === 'ai-assistant' || requestedRoute === 'executive-analytics' || requestedRoute === 'marketplace' || requestedRoute === 'incidents' || requestedRoute === 'corrective-actions' || requestedRoute === 'inspections' || requestedRoute === 'audits' || requestedRoute === 'reports' || requestedRoute === 'administration' || requestedRoute === 'users' || requestedRoute === 'roles-permissions' || requestedRoute === 'profile' || requestedRoute === 'preferences' || requestedRoute === 'activity-log' || requestedRoute === 'settings'
  if (protectedRoute) {
    if (sessionLoading) return <div className="protected-state">Checking your session...</div>
    if (!session) return <SignInPage />
    return <ProtectedApp session={session} isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />
  }

  return (
    <div className={`app-shell${isDarkMode ? ' dark-theme' : ''}`}>
      <header className="site-header">
        <div className="container nav-wrap">
          <a className="brand" href="#top" aria-label="SentinelQHSE home">
            <BrandMark />
            <span className="brand-copy">
              <strong>
                SentinelQHSE<sup>™</sup>
              </strong> 
              <small>SAFETY INTELLIGENCE</small>
            </span>
          </a> 

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}>
                {item}
              </a>
            ))}
          </nav>

          <div className="nav-actions">
            <button
              className="theme-button"
              type="button"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={isDarkMode}
              onClick={toggleTheme}
            >
              <ThemeIcon />
            </button>
            <a className="signup-link" href="#register">
              Sign Up
            </a>
            <a className="signin-link" href="#sign-in">
              Sign In
            </a>
            <a className="button button-green button-small" href="#demo">
              Request Demo
            </a>
          </div>

          <details className="mobile-menu">
            <summary aria-label="Open navigation">☰</summary>
            <div className="mobile-menu-panel">
              {navItems.map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`}>
                  {item}
                </a>
              ))}
              <a href="#register">Sign Up</a>
              <a href="#sign-in">Sign In</a>
              <a className="button button-green" href="#demo">
                Request Demo
              </a>
            </div>
          </details>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-overlay" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow hero-eyebrow">AI-Powered Operational Safety Intelligence Platform</div>
              <h1>From reactive incident reports to predictive safety intelligence.</h1>
              <p className="hero-text">
                SentinelQHSE™ helps energy companies capture every event in the field, close every corrective action,
                and forecast where the next incident is most likely to happen.
              </p>

              <div className="hero-actions">
                <a className="button button-green button-large" href="#demo">
                  Request Demo
                  <span aria-hidden="true">→</span>
                </a>
                <a className="button button-outline button-large" href="#sign-in">
                  Sign In
                </a>
                <a className="text-link" href="#demo">
                  Contact Sales
                </a>
              </div>

              <div className="hero-metrics" aria-label="Platform outcomes">
                <div>
                  <strong>48%</strong>
                  <span>reduction in recordable incidents within four quarters</span>
                </div>
                <div>
                  <strong>3.1x</strong>
                  <span>increase in near-miss reporting from frontline crews</span>
                </div>
                <div>
                  <strong>62%</strong>
                  <span>faster corrective action closure across operating teams</span>
                </div>
                <div>
                  <strong>100%</strong>
                  <span>auditable trail for regulator and client assurance</span>
                </div>
              </div>
            </div>

            <div className="dashboard-frame" aria-label="SentinelQHSE dashboard preview">
              <div className="dashboard-window">
                <div className="dash-sidebar">
                  <div className="dash-brand">
                    <span className="mini-mark">✓</span>
                    <span>
                      Sentinel<span>QHSE</span>
                    </span>
                  </div>
                  <div className="dash-nav active">Overview</div>
                  <div className="dash-nav">Incidents</div>
                  <div className="dash-nav">Observations</div>
                  <div className="dash-nav">Risk Management</div>
                  <div className="dash-nav">Audits &amp; Inspections</div>
                  <div className="dash-nav">Training</div>
                  <div className="dash-nav">Reports</div>
                  <div className="dash-nav">Analytics</div>
                  <div className="dash-nav">Alerts</div>
                </div>

                <div className="dash-main">
                  <div className="dash-top">
                    <strong>Overview</strong>
                    <span>All Locations</span>
                    <span>May 12 – Jun 8, 2026</span>
                    <span className="dash-filter">Filters</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-card">
                      <small>Total Recordable Incidents</small>
                      <b>0.73</b>
                      <em>↓ 18% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Lost Time Incident Rate</small>
                      <b>0.23</b>
                      <em>↓ 23% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Near Misses</small>
                      <b>152</b>
                      <em>↑ 12% vs prior period</em>
                    </div>
                    <div className="stat-card">
                      <small>Safety Observations</small>
                      <b>621</b>
                      <em>↑ 8% vs prior period</em>
                    </div>
                    <div className="stat-card warning-stat">
                      <small>High Risks</small>
                      <b>28</b>
                      <em>Needs attention</em>
                    </div>
                  </div>

                  <div className="dash-grid">
                    <div className="dash-card trend-card">
                      <div className="card-heading">
                        <strong>Safety trend</strong>
                        <span>Q2</span>
                      </div>
                      <div className="fake-chart">
                        <span className="chart-line line-one" />
                        <span className="chart-line line-two" />
                        <span className="chart-label l1">J</span>
                        <span className="chart-label l2">F</span>
                        <span className="chart-label l3">M</span>
                        <span className="chart-label l4">A</span>
                      </div>
                    </div>

                    <div className="dash-card donut-card">
                      <div className="card-heading">
                        <strong>Risk mix</strong>
                        <span>Live</span>
                      </div>
                      <div className="donut-wrap">
                        <div className="donut">
                          <span>34%</span>
                        </div>
                        <div className="legend">
                          <div>
                            <i style={{ background: '#20c96b' }} /> Operating
                          </div>
                          <div>
                            <i style={{ background: '#f4a51a' }} /> Process
                          </div>
                          <div>
                            <i style={{ background: '#8261d7' }} /> Culture
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dash-card heat-card">
                      <div className="card-heading">
                        <strong>Hotspots</strong>
                        <span>Sites</span>
                      </div>
                      <div className="heat-map">
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5</span>
                        <span>6</span>
                        <span>7</span>
                        <span>8</span>
                        <span>9</span>
                        <span>10</span>
                        <span>11</span>
                        <span>12</span>
                        <span>13</span>
                        <span>14</span>
                        <span>15</span>
                      </div>
                    </div>

                    <div className="dash-card bars-card">
                      <div className="card-heading">
                        <strong>Closure rate</strong>
                        <span>30d</span>
                      </div>
                      <div className="bars">
                        <i style={{ height: '45%' }} />
                        <i style={{ height: '58%' }} />
                        <i style={{ height: '62%' }} />
                        <i style={{ height: '74%' }} />
                        <i style={{ height: '82%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="dash-alerts">
                    <strong>Safety alerts</strong>
                    <span>3 high-priority actions due this week</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="section section-light">
          <div className="container">
            <div className="section-intro">
              <div className="eyebrow">PLATFORM</div>
              <h2>One operating system for QHSE performance</h2>
              <p>
                Built to the workflows international oil and gas operators already run — and to the standards their
                regulators and clients audit against.
              </p>
            </div>

            <div className="feature-grid">
              {featureCards.map((card) => (
                <article key={card.title} className="feature-card">
                  <div className="icon-tile">{card.icon}</div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="section industries">
          <div className="container">
            <div className="section-intro compact">
              <h2>Industries served</h2>
            </div>
            <div className="industry-grid">
              <div className="industry-card">
                <span>◫</span>
                <strong>Upstream E&amp;P</strong>
              </div>
              <div className="industry-card">
                <span>⚓</span>
                <strong>Offshore &amp; Marine</strong>
              </div>
              <div className="industry-card">
                <span>▥</span>
                <strong>
                  Refining &amp;
                  <br />
                  Petrochemical
                </strong>
              </div>
              <div className="industry-card">
                <span>≋</span>
                <strong>Pipelines &amp; Terminals</strong>
              </div>
              <div className="industry-card">
                <span>♙</span>
                <strong>Drilling Operations</strong>
              </div>
              <div className="industry-card">
                <span>◉</span>
                <strong>Energy Services</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="outcomes" className="section outcomes">
          <div className="container outcome-grid">
            <div className="outcome-copy">
              <div className="eyebrow">CUSTOMER BENEFITS</div>
              <h2>Safety leaders get answers, not archives</h2>

              {benefitItems.map((item) => (
                <div className="benefit" key={item.title}>
                  <span className="benefit-icon">{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="outcome-dashboard">
              <img
                className="customer-benefits-image"
                src={customerBenefitsDashboard}
                alt="SentinelQHSE safety analytics dashboard"
              />
            </div>
          </div>
        </section>

        <section id="product" className="section testimonials">
          <div className="container quote-grid">
            <blockquote>
              <p>
                “We stopped chasing spreadsheets. Every finding now has an owner, a due date and evidence attached to it
                before it closes.”
              </p>
              <footer>
                <strong>HSE Director</strong>
                <span>West African upstream operator (placeholder)</span>
              </footer>
            </blockquote>
            <blockquote>
              <p>
                “The risk forecast flagged heat stress at our flow station a week before we would have noticed the pattern
                ourselves.”
              </p>
              <footer>
                <strong>Operations Manager</strong>
                <span>Gas processing joint venture (placeholder)</span>
              </footer>
            </blockquote>
          </div>
        </section>
      </main>

      <footer id="contact" className="site-footer">
        <div className="container footer-grid">
          <div>
            <a className="brand footer-brand" href="#top">
              <BrandMark />
              <span className="brand-copy">
                <strong>
                  SentinelQHSE<sup>™</sup>
                </strong>
                <small>SAFETY INTELLIGENCE</small>
              </span>
            </a>
            <p>AI-Powered Operational Safety Intelligence Platform for the energy industry.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <a href="#sign-in">Dashboard</a>
            <a href="#sign-in">Incidents</a>
            <a href="#sign-in">Audits</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="#demo">Contact sales</a>
            <a href="#register">Register organization</a>
          </div>
          <div>
            <h4>Access</h4>
            <a href="#sign-in">Sign in</a>
            <a href="#forgot-password">Forgot password</a>
          </div>
        </div>
        <div className="container footer-bottom">© 2026 SentinelQHSE™. All rights reserved.</div>
      </footer>
    </div>
  )
}
