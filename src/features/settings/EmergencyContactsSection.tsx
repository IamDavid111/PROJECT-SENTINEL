import { Avatar, Button, EmptyState, Toggle } from '../../components/ui'
import type { EmergencyContact } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

export function EmergencyContactsSection({ contacts, dirty, onAdd, onEdit, onRemove, onToggle }: {
  contacts: EmergencyContact[]
  dirty: boolean
  onAdd: () => void
  onEdit: (contact: EmergencyContact) => void
  onRemove: (contact: EmergencyContact) => void
  onToggle: (id: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Emergency contacts"
      description="Contacts shown in the workspace emergency panel and on the dashboard."
      dirty={dirty}
      action={<Button size="sm" onClick={onAdd}>Add contact</Button>}
    >
      {contacts.length ? (
        <div className="grid gap-2">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={contact.name} size="sm" />
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{contact.name}</span>
                  <span className="truncate text-xs text-muted">{contact.role || 'Role not set'}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {contact.phone && <a href={`tel:${contact.phone}`} className="text-brand-dark hover:underline">{contact.phone}</a>}
                    {contact.email && <a href={`mailto:${contact.email}`} className="text-brand-dark hover:underline">{contact.email}</a>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle checked={contact.active} onCheckedChange={() => onToggle(contact.id)} aria-label={`Toggle ${contact.name}`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(contact)}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => onRemove(contact)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="ambulance"
          title="No emergency contacts configured"
          description="Add the person or service the workspace should call first."
          action={<Button size="sm" onClick={onAdd}>Add contact</Button>}
        />
      )}
    </SettingsSectionShell>
  )
}
