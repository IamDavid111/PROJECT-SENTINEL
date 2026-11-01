import { Card, Icon, PageHeader, buttonVariants } from '../../components/ui'

export const administrationEntries: { title: string; description: string; href: string; action: string; icon: 'profile' | 'administration' }[] = [
  { title: 'User Management', description: 'Manage users, invitations, departments, roles, account status and user access.', href: '#users', action: 'Open user management', icon: 'profile' },
  { title: 'Roles & Permissions', description: 'Review platform roles and the permissions assigned to each role.', href: '#roles-permissions', action: 'Open roles & permissions', icon: 'administration' },
]

export function AdministrationLandingPage({ canViewUsers, canViewRoles }: { canViewUsers: boolean; canViewRoles: boolean }) {
  const visibleEntries = administrationEntries.filter((entry) => entry.href === '#users' ? canViewUsers : canViewRoles)
  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Administration"
        title="Administration"
        description="Manage platform users, roles and access controls."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {visibleEntries.map((entry) => (
          <Card key={entry.href} className="p-5 shadow-none">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name={entry.icon} size={20} />
              </span>
              <div className="grid min-w-0 gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Access control</span>
                <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{entry.title}</h2>
                <p className="text-sm text-muted">{entry.description}</p>
                <a href={entry.href} className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-2 w-fit`}>
                  {entry.action} <Icon name="arrowRight" size={14} />
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
