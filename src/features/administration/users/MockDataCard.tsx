import { Badge, Button, Card, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui'
import type { MockIncidentBatchResult, MockUserBatchResult } from './types'

export function MockDataCard({ visible, userLoading, userResult, incidentLoading, incidentResult, onCreateUsers, onSeedIncidents }: {
  visible: boolean
  userLoading: boolean
  userResult: MockUserBatchResult | null
  incidentLoading: boolean
  incidentResult: MockIncidentBatchResult | null
  onCreateUsers: () => void
  onSeedIncidents: () => void
}) {
  if (!visible) return null

  return (
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-display text-base font-semibold text-foreground">Test data</h2>
          <p className="text-sm text-muted">StarNet-only mock batches for development and demonstrations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={userLoading} onClick={onCreateUsers}>Create test accounts</Button>
          <Button variant="outline" size="sm" loading={incidentLoading} onClick={onSeedIncidents}>Seed 1,000 incidents</Button>
        </div>
      </div>

      {incidentResult && (
        <section className="mt-5 grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Incident batch: {incidentResult.createdCount} created, {incidentResult.alreadyExistingCount} already present</h3>
            <p className="text-xs text-muted">Batch {incidentResult.batchId}. Timestamps span 2023-09-29 to 2026-09-29. No evidence attachments were created.</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Table</TableHead>
                  <TableHead>Rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(incidentResult.tableCounts).map(([table, count]) => (
                  <TableRow key={table}>
                    <TableCell className="text-sm">{table}</TableCell>
                    <TableCell className="font-mono text-sm">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(incidentResult.byStatus).map(([value, count]) => <Badge key={`status-${value}`} tone="neutral">Status: {value} ({count})</Badge>)}
            {Object.entries(incidentResult.bySeverity).map(([value, count]) => <Badge key={`severity-${value}`} tone="neutral">Severity: {value} ({count})</Badge>)}
            {Object.entries(incidentResult.byCategory).map(([value, count]) => <Badge key={`category-${value}`} tone="neutral">Category: {value} ({count})</Badge>)}
          </div>
        </section>
      )}

      {userResult && (
        <section className="mt-5 grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Mock accounts: {userResult.createdCount} created, {userResult.alreadyExistingCount} already existed</h3>
            <p className="text-xs text-muted">New accounts have active status. Temporary passwords are shown once; distribute them securely and rotate them after first sign-in.</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name / ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>One-time password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userResult.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span className="text-sm font-medium text-foreground">{user.fullName}</span>
                        <span className="font-mono text-[11px] text-muted">{user.id} · {user.employeeId}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{user.email}</TableCell>
                    <TableCell className="text-sm">{user.role}</TableCell>
                    <TableCell className="text-sm">{user.department}</TableCell>
                    <TableCell className="text-sm">{user.siteLocation}</TableCell>
                    <TableCell className="font-mono text-xs">{user.temporaryPassword ?? 'Existing account; unchanged'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </section>
      )}
    </Card>
  )
}
