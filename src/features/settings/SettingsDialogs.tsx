import type { Dispatch, SetStateAction } from 'react'

import { Button, Dialog, Field, FormMessage, Input, Toggle } from '../../components/ui'
import type { CompanyShiftSetting, EmergencyContact } from './companySettingsTypes'
import { SiteCodeField } from './SiteCodeField'

export function ShiftDialog({ open, onClose, draft, setDraft, editing, error, onSave }: {
  open: boolean
  onClose: () => void
  draft: CompanyShiftSetting
  setDraft: Dispatch<SetStateAction<CompanyShiftSetting>>
  editing: boolean
  error: string
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit shift' : 'Add shift'}
      description="Define the operating window used by filters, reports, and safety intelligence."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onSave}>Save shift</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Shift name" htmlFor="settings-shift-name" required>
          <Input id="settings-shift-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Day" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start time" htmlFor="settings-shift-start" required>
            <Input id="settings-shift-start" type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} />
          </Field>
          <Field label="End time" htmlFor="settings-shift-end" required>
            <Input id="settings-shift-end" type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div className="grid gap-0.5">
            <strong className="text-sm font-medium text-foreground">Enabled</strong>
            <span className="text-xs text-muted">Show this shift in active options.</span>
          </div>
          <Toggle checked={draft.active} onCheckedChange={(active) => setDraft((current) => ({ ...current, active }))} aria-label="Enable shift" />
        </div>
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}

export function SiteDialog({ open, onClose, organizationId, name, setName, code, setCode, editing, error, onSave }: {
  open: boolean
  onClose: () => void
  organizationId: string
  name: string
  setName: (value: string) => void
  code: string
  setCode: (value: string) => void
  editing: boolean
  error: string
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit site' : 'Add site'}
      description={editing ? 'Update the site name or generate a new organization code.' : 'Add an operational site and generate its organization code.'}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onSave}>{editing ? 'Save site' : 'Add site'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Site name" htmlFor="settings-site-name" required>
          <Input id="settings-site-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Plant" />
        </Field>
        <SiteCodeField organizationId={organizationId} value={code} onChange={setCode} />
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}

export function ConfigurationNameDialog({ open, title, value, onChange, onClose, onSave, error }: {
  open: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  error: string
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Update this option name. Historical records will retain their original values."
      footer={(
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onSave}>Save changes</Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <Field label="Name" htmlFor="settings-configuration-name" required>
          <Input id="settings-configuration-name" value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        </Field>
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}

export function ContactDialog({ open, onClose, draft, setDraft, editing, error, onSave }: {
  open: boolean
  onClose: () => void
  draft: EmergencyContact
  setDraft: Dispatch<SetStateAction<EmergencyContact>>
  editing: boolean
  error: string
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit contact' : 'Add contact'}
      description="This contact appears in the workspace emergency panel."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onSave}>{editing ? 'Save contact' : 'Add contact'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Contact name" htmlFor="settings-contact-name" required>
          <Input id="settings-contact-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Control room" />
        </Field>
        <Field label="Role or service" htmlFor="settings-contact-role">
          <Input id="settings-contact-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Emergency response" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" htmlFor="settings-contact-phone" required>
            <Input id="settings-contact-phone" type="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="+234 ..." />
          </Field>
          <Field label="Email address" htmlFor="settings-contact-email">
            <Input id="settings-contact-email" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="control-room@company.com" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div className="grid gap-0.5">
            <strong className="text-sm font-medium text-foreground">Enabled</strong>
            <span className="text-xs text-muted">Show this contact in the workspace emergency panel.</span>
          </div>
          <Toggle checked={draft.active} onCheckedChange={(active) => setDraft((current) => ({ ...current, active }))} aria-label="Enable emergency contact" />
        </div>
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}
