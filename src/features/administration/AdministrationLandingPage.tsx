import { ArrowRight } from 'lucide-react'

export const administrationEntries: { title: string; description: string; href: string; action: string }[] = [
  { title: 'User Management', description: 'Manage users, invitations, departments, roles, account status and user access.', href: '#users', action: 'Open User Management' },
  { title: 'Roles & Permissions', description: 'Review platform roles and the permissions assigned to each role.', href: '#roles-permissions', action: 'Open Roles & Permissions' },
]

export function AdministrationLandingPage({ canViewUsers, canViewRoles }: { canViewUsers: boolean; canViewRoles: boolean }) {
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
            <a className="button button-outline button-small" href={entry.href}>{entry.action} <ArrowRight size={15} /></a>
          </article>
        ))}
      </div>
    </div>
  )
}

