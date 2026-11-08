import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Badge, Button, ConfirmDialog, PageHeader, Skeleton } from '../../components/ui'
import { ClosureAccessSection } from './ClosureAccessSection'
import { ConfigurationArchiveSection, type ArchivedConfigurationItem } from './ConfigurationArchiveSection'
import { DepartmentsSection } from './DepartmentsSection'
import { EmergencyContactsSection } from './EmergencyContactsSection'
import { IncidentCategoriesSection } from './IncidentCategoriesSection'
import { ConfigurationNameDialog, ContactDialog, ShiftDialog, SiteDialog } from './SettingsDialogs'
import { SeveritySection } from './SeveritySection'
import { ShiftsSection } from './ShiftsSection'
import { SitesSection } from './SitesSection'
import { SafetyPolicySettingsSection } from '../safety-policy/SafetyPolicySettingsSection'
import type {
  CompanyShiftSetting,
  DepartmentOption,
  IncidentCategoryOption,
  SeverityOption,
  SiteOption,
} from './companySettingsTypes'
import { useCompanySettings } from './useCompanySettings'

type SectionKey = 'shifts' | 'departments' | 'sites' | 'contacts' | 'severity' | 'categories' | 'safety-policy' | 'closure' | 'archive'
type DeleteTarget =
  | { category: 'shift'; item: CompanyShiftSetting }
  | { category: 'department'; item: DepartmentOption }
  | { category: 'site'; item: SiteOption }
  | { category: 'severity'; item: SeverityOption }
  | { category: 'incident_category'; item: IncidentCategoryOption }

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
    { key: 'safety-policy', label: 'Safety Policy' },
  ] },
  { label: 'Access', items: [
    { key: 'closure', label: 'Closure access' },
  ] },
  { label: 'Configuration', items: [
    { key: 'archive', label: 'Archive' },
  ] },
]

export function SettingsPage({ client, organizationId, userId, safetyPolicyOnly = false }: {
  client: SupabaseClient
  organizationId: string
  userId: string
  safetyPolicyOnly?: boolean
}) {
  const settings = useCompanySettings({ organizationId, userId })
  const [activeSection, setActiveSection] = useState<SectionKey>(safetyPolicyOnly ? 'safety-policy' : 'shifts')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<ArchivedConfigurationItem | null>(null)
  const [archiveVersion, setArchiveVersion] = useState(0)
  const lastSavedLabel = settings.lastSavedAt
    ? settings.lastSavedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null

  const counts: Record<SectionKey, number | null> = {
    shifts: settings.shifts.filter((item) => !item.deleted).length,
    departments: settings.departments.filter((item) => !item.deleted).length,
    sites: settings.sites.filter((item) => !item.deleted).length,
    contacts: settings.contacts.length,
    severity: settings.severities.filter((item) => !item.deleted).length,
    categories: settings.categories.filter((item) => !item.deleted).length,
    'safety-policy': null,
    closure: null,
    archive: null,
  }
  const isDirty = (key: SectionKey) => settings.dirtySections.includes(key)
  const visibleNavGroups = safetyPolicyOnly
    ? NAV_GROUPS.flatMap((group) => {
        const items = group.items.filter((item) => item.key === 'safety-policy')
        return items.length ? [{ ...group, items }] : []
      })
    : NAV_GROUPS

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
            onDelete={(item) => setDeleteTarget({ category: 'shift', item })}
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
            onEdit={(item) => settings.openNameEditor('department', item)}
            onToggle={settings.toggleDepartment}
            onDelete={(item) => setDeleteTarget({ category: 'department', item })}
          />
        )
      case 'sites':
        return (
          <SitesSection
            sites={settings.sites}
            dirty={isDirty('sites')}
            onAdd={() => settings.openSiteEditor()}
            onEdit={settings.openSiteEditor}
            onToggle={settings.toggleSite}
            onDelete={(item) => setDeleteTarget({ category: 'site', item })}
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
            onEdit={(item) => settings.openNameEditor('severity', item)}
            onToggle={settings.toggleSeverity}
            onDelete={(item) => setDeleteTarget({ category: 'severity', item })}
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
            onEdit={(item) => settings.openNameEditor('incident_category', item)}
            onToggle={settings.toggleCategory}
            onDelete={(item) => setDeleteTarget({ category: 'incident_category', item })}
          />
        )
      case 'safety-policy':
        return <SafetyPolicySettingsSection client={client} />
      case 'closure':
        return <ClosureAccessSection client={client} organizationId={organizationId} userId={userId} />
      case 'archive':
        return (
          <ConfigurationArchiveSection
            key={`${organizationId}:${archiveVersion}`}
            organizationId={organizationId}
            restoring={settings.restoring}
            onRestore={setRestoreTarget}
          />
        )
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
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="grid gap-1 border-b border-line py-2 first:pt-0 last:border-0 last:pb-0">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</span>
              {group.items.map((item) => navButton(item))}
            </div>
          ))}
        </aside>

        <div className="grid min-w-0 gap-5">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleNavGroups.flatMap((group) => group.items).map((item) => navButton(item, true))}
          </div>

          {settings.error && <Alert tone="danger">{settings.error}</Alert>}
          {settings.message && <Alert tone="success">{settings.message}</Alert>}

          {section}

          {!safetyPolicyOnly && settings.dirty && (
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
        onClose={settings.closeSiteEditor}
        organizationId={organizationId}
        name={settings.siteDraft}
        setName={settings.setSiteDraft}
        code={settings.siteCodeDraft}
        setCode={settings.setSiteCodeDraft}
        editing={Boolean(settings.editingSiteId)}
        error={settings.error}
        onSave={settings.addSite}
      />

      <ConfigurationNameDialog
        open={Boolean(settings.nameEditTarget)}
        title={settings.nameEditTarget?.category === 'department'
          ? 'Edit department'
          : settings.nameEditTarget?.category === 'severity'
            ? 'Edit severity level'
            : 'Edit incident category'}
        value={settings.nameEditDraft}
        onChange={settings.setNameEditDraft}
        onClose={settings.closeNameEditor}
        onSave={() => void settings.saveNameEdit()}
        error={settings.error}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => { if (!settings.deleting) setDeleteTarget(null) }}
        onConfirm={() => {
          if (!deleteTarget) return
          void settings.deleteSettingItem(deleteTarget.category, deleteTarget.item).then((deleted) => {
            if (deleted) setDeleteTarget(null)
          })
        }}
        title={deleteTarget ? `Delete ${deleteTarget.item.name}?` : 'Delete configuration item?'}
        description={deleteTarget
          ? `${deleteTarget.item.name} will no longer be available in future forms and filters. Historical records, reports, and exports will retain the original displayed name. This action cannot be undone.`
          : undefined}
        confirmLabel="Confirm Delete"
        cancelLabel="Cancel"
        loading={settings.deleting}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget || settings.pendingRestore)}
        onClose={() => {
          if (settings.restoring) return
          setRestoreTarget(null)
          settings.clearPendingRestore()
        }}
        onConfirm={() => {
          if (restoreTarget) {
            void settings.restoreSettingItem(restoreTarget.category, restoreTarget.id, restoreTarget.name).then((restored) => {
              if (!restored) return
              setRestoreTarget(null)
              setArchiveVersion((version) => version + 1)
            })
            return
          }
          void settings.restorePendingItem()
        }}
        title={restoreTarget ? `Restore ${restoreTarget.name}?` : 'Restore archived configuration?'}
        description={settings.pendingRestore && !restoreTarget
          ? 'A previously archived configuration item with this name already exists. Would you like to restore its original configuration?'
          : restoreTarget
            ? `${restoreTarget.name} will be restored with its original configuration and available again in its company settings section.`
            : undefined}
        confirmLabel={settings.pendingRestore && !restoreTarget ? 'Restore Existing Item' : 'Restore'}
        cancelLabel="Cancel"
        tone="default"
        loading={settings.restoring}
      />
    </div>
  )
}
