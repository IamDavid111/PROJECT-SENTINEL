import { Button, Card, DataTable, StatusBadge, type DataTableColumn } from '../../../components/ui'
import { getDepartmentLabel } from './userHelpers'
import { describeInvitationExpiry, type OrganizationInvitation } from './types'

export function InvitationsCard({ invitations, loading, resendingEmail, onRefresh, onResend }: {
  invitations: OrganizationInvitation[]
  loading: boolean
  resendingEmail: string | null
  onRefresh: () => void
  onResend: (invitation: OrganizationInvitation) => void
}) {
  const columns: DataTableColumn<OrganizationInvitation>[] = [
    {
      id: 'invitee',
      header: 'Invitee',
      cell: (invitation) => <span className="text-sm font-medium text-foreground">{invitation.invitee_email}</span>,
    },
    {
      id: 'department',
      header: 'Department',
      cell: (invitation) => <span className="text-sm text-muted">{getDepartmentLabel(invitation.department)}</span>,
    },
    {
      id: 'role',
      header: 'Role',
      cell: (invitation) => <span className="text-sm">{invitation.role}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (invitation) => {
        const expiryLabel = describeInvitationExpiry(invitation)
        return (
          <div className="grid gap-0.5">
            <StatusBadge status={invitation.status} tone={invitation.status === 'accepted' ? 'success' : undefined} />
            {expiryLabel && <span className="text-[11px] text-muted">{expiryLabel}</span>}
          </div>
        )
      },
    },
    {
      id: 'invitedBy',
      header: 'Invited by',
      cell: (invitation) => <span className="text-sm text-muted">{invitation.invited_by_name || '—'}</span>,
    },
    {
      id: 'sent',
      header: 'Sent',
      cell: (invitation) => <span className="text-sm text-muted">{new Date(invitation.created_at).toLocaleString()}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (invitation) => {
        const expiryLabel = describeInvitationExpiry(invitation)
        const canResend = invitation.status === 'pending' && expiryLabel !== 'Expired'
        if (!canResend) return <span className="text-xs text-muted">—</span>
        return (
          <Button
            variant="outline"
            size="sm"
            loading={resendingEmail === invitation.invitee_email}
            onClick={() => onResend(invitation)}
          >
            Resend
          </Button>
        )
      },
    },
  ]

  return (
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-display text-base font-semibold text-foreground">Invitations</h2>
          <p className="text-sm text-muted">Pending and recent invitations. Links expire 24 hours after they are sent.</p>
        </div>
        <Button variant="outline" size="sm" loading={loading} onClick={onRefresh}>Refresh</Button>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={invitations}
          rowKey={(invitation) => invitation.id}
          loading={loading && invitations.length === 0}
          loadingRows={4}
          empty={
            <div className="grid justify-items-center gap-1 py-4">
              <strong className="text-sm font-semibold text-foreground">No invitations have been sent yet</strong>
              <span className="text-sm text-muted">Invite a user to see it listed here.</span>
            </div>
          }
        />
      </div>
    </Card>
  )
}
