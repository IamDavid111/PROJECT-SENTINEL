import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Badge, Button, ConfirmDialog, PageHeader, Skeleton } from '../../components/ui'
import { ClosureAccessSection } from './ClosureAccessSection'
import { DepartmentsSection } from './DepartmentsSection'
import { EmergencyContactsSection } from './EmergencyContactsSection'
import { IncidentCategoriesSection } from './IncidentCategoriesSection'
import { ContactDialog, ShiftDialog, SiteDialog } from './SettingsDialogs'
import { SeveritySection } from './SeveritySection'
import { ShiftsSection } from './ShiftsSection'
import { SitesSection } from './SitesSection'
import { useCompanySettings } from './useCompanySettings'

type SectionKey = 'shifts' | 'departments' | 'sites' | 'contacts' | 'severity' | 'categories' | 'closure'

const NAV_GROUPS: { label: string; items: { key: SectionKey; label: string }[] }[] = [
  { label: 'Organization', items: [
    { key: 'shifts', label: 'Shifts' },
    { key: 'departments', label: 'Departments' },
    { key: 'sites', label: 'Sites' },
  ] },
  { label: 'Emergency', items: [
    { key: 'contacts', label: 'Emergency contacts' },
  ] },
  { label: 'Safety', items: [
    { key: 'severity', label: 'Severity levels' },
    { key: 'categories', label: 'Incident categories' },
  ] },
  { label: 'Access', items: [
    { key: 'closure', label: 'Closure access' },
  ] },
]

export function SettingsPage({ client, organizationId, userId }: {
  client: SupabaseClient
  organizationId: string
  userId: string
}) {
  const settings = useCompanySettings({ organizationId, userId })
  const [activeSection, setActiveSection] = useState<SectionKey>('shifts')
  const lastSavedLabel = settings.lastSavedAt
    ? settings.lastSavedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null

  const counts: Record<SectionKey, number | null> = {
    shifts: settings.shifts.length,
    departments: settings.departments.length,
    sites: settings.sites.length,
    contacts: settings.contacts.length,
    severity: settings.severities.length,
    categories: settings.categories.length,
    closure: null,
  }
  const isDirty = (key: SectionKey) => settings.dirtySections.includes(key)

  const openSiteEditor = () => {
    settings.clearFeedback()
    settings.setSiteDraft('')
    settings.setSiteCodeDraft('')
    settings.setSiteOpen(true)
  }

  const section = (() => {
    switch (activeSection) {
      case 'shifts':
        return (
          <ShiftsSection
            shifts={settings.shifts}
            dirty={isDirty('shifts')}
            onAdd={() => settings.openShiftEditor()}
            onEdit={settings.openShiftEditor}
            onToggle={settings.toggleShift}
          />
        )
      case 'departments':
        return (
          <DepartmentsSection
            departments={settings.departments}
            draft={settings.departmentDraft}
            dirty={isDirty('departments')}
            onDraftChange={settings.setDepartmentDraft}
            onAdd={settings.addDepartment}
            onToggle={settings.toggleDepartment}
          />
        )
      case 'sites':
        return (
          <SitesSection
            sites={settings.sites}
            dirty={isDirty('sites')}
            onAdd={openSiteEditor}
            onToggle={settings.toggleSite}
          />
        )
      case 'contacts':
        return (
          <EmergencyContactsSection
            contacts={settings.contacts}
            dirty={isDirty('contacts')}
            onAdd={() => settings.openContactEditor()}
            onEdit={settings.openContactEditor}
            onRemove={(contact) => settings.setContactToRemove(contact)}
            onToggle={settings.toggleContact}
          />
        )
      case 'severity':
        return (
          <SeveritySection
            severities={settings.severities}
            draft={settings.severityDraft}
            dirty={isDirty('severity')}
            onDraftChange={settings.setSeverityDraft}
            onAdd={settings.addSeverity}
            onToggle={settings.toggleSeverity}
          />
        )
      case 'categories':
        return (
          <IncidentCategoriesSection
            categories={settings.categories}
            draft={settings.categoryDraft}
            dirty={isDirty('categories')}
            onDraftChange={settings.setCategoryDraft}
            onAdd={settings.addIncidentCategory}
            onToggle={settings.toggleCategory}
          />
        )
      case 'closure':
        return <ClosureAccessSection client={client} organizationId={organizationId} userId={userId} />
    }
  })()

  if (settings.loading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Organization configuration" title="Settings" description="Manage the reference data used across SentinelQHSE." />
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Skeleton className="h-[320px] rounded-card" />
          <Skeleton className="h-[420px] rounded-card" />
        </div>
      </div>
    )
  }

  const navButton = (item: { key: SectionKey; label: string }, mobile = false) => {
    const active = activeSection === item.key
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => setActiveSection(item.key)}
        aria-current={active ? 'page' : undefined}
        className={mobile
          ? `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-brand bg-brand/10 text-brand-dark' : 'border-line bg-surface text-muted hover:text-foreground'}`
          : `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? 'bg-brand/10 font-medium text-brand-dark' : 'text-muted hover:bg-surface-soft hover:text-foreground'}`}
      >
        <span className="truncate">{item.label}</span>
        <span className="flex items-center gap-1.5">
          {isDirty(item.key) && <span className="h-1.5 w-1.5 rounded-full bg-caution" role="img" aria-label="Unsaved changes" />}
          {typeof counts[item.key] === 'number' && <span className="font-mono text-[11px] text-muted">{counts[item.key]}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Organization configuration"
        title="Settings"
        description="Manage the reference data used across SentinelQHSE."
        actions={lastSavedLabel ? <Badge tone="neutral">Last saved {lastSavedLabel}</Badge> : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-card border border-line bg-surface p-3 lg:sticky lg:top-24 lg:block">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="grid gap-1 border-b border-line py-2 first:pt-0 last:border-0 last:pb-0">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</span>
              {group.items.map((item) => navButton(item))}
            </div>
          ))}
        </aside>

        <div className="grid min-w-0 gap-5">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => navButton(item, true))}
          </div>

          {settings.error && <Alert tone="danger">{settings.error}</Alert>}
          {settings.message && <Alert tone="success">{settings.message}</Alert>}

          {section}

          {settings.dirty && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <span className="h-2 w-2 rounded-full bg-caution" aria-hidden="true" />
                Unsaved company changes in {settings.dirtySections.length} section{settings.dirtySections.length === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={settings.discardChanges}>Discard</Button>
                <Button size="sm" loading={settings.saving} onClick={() => void settings.saveSettings()}>Save changes</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ShiftDialog
        open={settings.shiftOpen}
        onClose={() => { settings.setShiftOpen(false); settings.clearFeedback() }}
        draft={settings.shiftDraft}
        setDraft={settings.setShiftDraft}
        editing={Boolean(settings.editingShiftId)}
        error={settings.error}
        onSave={settings.saveShift}
      />

      <SiteDialog
        open={settings.siteOpen}
        onClose={() => { settings.setSiteOpen(false); settings.clearFeedback() }}
        organizationId={organizationId}
        name={settings.siteDraft}
        setName={settings.setSiteDraft}
        code={settings.siteCodeDraft}
        setCode={settings.setSiteCodeDraft}
        error={settings.error}
        onSave={settings.addSite}
      />

      <ContactDialog
        open={settings.contactOpen}
        onClose={() => { settings.setContactOpen(false); settings.clearFeedback() }}
        draft={settings.contactDraft}
        setDraft={settings.setContactDraft}
        editing={Boolean(settings.contactDraft.id)}
        error={settings.error}
        onSave={settings.saveContact}
      />

      <ConfirmDialog
        open={Boolean(settings.contactToRemove)}
        onClose={() => settings.setContactToRemove(null)}
        onConfirm={settings.removeContact}
        title="Remove emergency contact?"
        description={settings.contactToRemove ? `Remove ${settings.contactToRemove.name} from the emergency contacts list?` : undefined}
        confirmLabel="Remove contact"
      />
    </div>
  )
}
