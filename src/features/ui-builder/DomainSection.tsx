import { useState } from 'react'

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChatBubble,
  ChatComposer,
  ChatMessageList,
  ConfigList,
  ConfigRow,
  CoverageBanner,
  DataTable,
  DetailList,
  DropdownMenu,
  Field,
  FormGrid,
  Icon,
  Input,
  MasterDetail,
  PermissionMatrix,
  Progress,
  PromptChip,
  SearchField,
  StatusBadge,
  TableToolbar,
  Toggle,
  type DataTableColumn,
  type DropdownMenuItem,
  type PermissionGroup,
} from '../../components/ui'
import { cn } from '../../lib/utils'
import { Demo, Row, Section, Stack } from './shared'

const REPORT_TYPES = [
  { id: 'incident', label: 'Incident', description: 'An event that caused or could have caused harm.', icon: 'reportIncident' as const },
  { id: 'near-miss', label: 'Near miss', description: 'An unplanned event that did not cause harm.', icon: 'eye' as const },
  { id: 'observation', label: 'Observation', description: 'A hazard, unsafe act or positive practice.', icon: 'check' as const },
  { id: 'environmental', label: 'Environmental', description: 'A release, spill or environmental impact.', icon: 'leaf' as const },
]

const DOCUMENTS = [
  { id: 'km-42', title: 'Permit to work procedure', code: 'QHSE-KM-0042', status: 'approved', type: 'Procedure', version: 'v3' },
  { id: 'km-41', title: 'Lifting operations standard', code: 'QHSE-KM-0041', status: 'pending_review', type: 'Standard', version: 'v2' },
  { id: 'km-39', title: 'Emergency response plan', code: 'QHSE-KM-0039', status: 'draft', type: 'Plan', version: 'v1' },
]

type DirectoryUser = {
  id: string
  name: string
  email: string
  role: string
  status: string
}

const DIRECTORY_USERS: DirectoryUser[] = [
  { id: 'u1', name: 'Jordan Ellis', email: 'jordan.ellis@company.com', role: 'Super Administrator', status: 'active' },
  { id: 'u2', name: 'Sam Okafor', email: 'sam.okafor@company.com', role: 'HSE Manager', status: 'active' },
  { id: 'u3', name: 'Priya Raman', email: 'priya.raman@company.com', role: 'Field Worker', status: 'pending' },
  { id: 'u4', name: 'Luis Ortega', email: 'luis.ortega@company.com', role: 'Supervisor', status: 'suspended' },
]

function userActionItems(user: DirectoryUser): DropdownMenuItem[] {
  return [
    { id: `${user.id}-view`, label: 'View profile', icon: 'profile', onSelect: () => undefined },
    { id: `${user.id}-reset`, label: 'Send password reset', icon: 'mail', onSelect: () => undefined },
    { id: `${user.id}-suspend`, label: 'Suspend account', icon: 'lock', tone: 'danger', onSelect: () => undefined },
  ]
}

const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    id: 'platform',
    label: 'Platform access',
    items: [
      { key: 'view_dashboard', label: 'View dashboard', required: true, description: 'Controls access to this capability.' },
      { key: 'view_all_incidents', label: 'View all incidents', description: 'Controls access to this capability.' },
      { key: 'view_executive_analytics', label: 'View Executive Analytics', description: 'Controls access to this capability.' },
    ],
  },
  {
    id: 'incidents',
    label: 'Incident management',
    items: [
      { key: 'report_incident', label: 'Report incident', required: true, description: 'Controls access to this capability.' },
      { key: 'close_incidents', label: 'Close incidents', description: 'Controls access to this capability.' },
      { key: 'export_reports', label: 'Export reports', description: 'Controls access to this capability.' },
    ],
  },
]

export function DomainSection() {
  const [reportType, setReportType] = useState('incident')
  const [draft, setDraft] = useState('')
  const [permissions, setPermissions] = useState<string[]>(['view_dashboard', 'report_incident', 'view_all_incidents'])
  const [selectedDoc, setSelectedDoc] = useState('km-42')
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const users = DIRECTORY_USERS.filter((user) => {
    const query = userSearch.trim().toLowerCase()
    if (!query) return true
    return [user.name, user.email, user.role, user.status].some((value) => value.toLowerCase().includes(query))
  })

  const userColumns: readonly DataTableColumn<DirectoryUser>[] = [
    {
      id: 'user',
      header: 'User',
      cell: (user) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} size="sm" />
          <div className="grid min-w-0">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-[11px] text-muted">{user.email}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: (user) => (
        <select
          defaultValue={user.role}
          aria-label={`Role for ${user.name}`}
          className="h-9 min-w-32 rounded-lg border border-line bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <option>Super Administrator</option>
          <option>HSE Manager</option>
          <option>Supervisor</option>
          <option>Field Worker</option>
        </select>
      ),
    },
    { id: 'status', header: 'Status', cell: (user) => <StatusBadge status={user.status} /> },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (user) => (
        <DropdownMenu
          label="Manage"
          items={userActionItems(user)}
        />
      ),
    },
  ]

  const document = DOCUMENTS.find((item) => item.id === selectedDoc) ?? DOCUMENTS[0]

  return (
    <Section
      id="patterns"
      eyebrow="07 · Domain patterns"
      title="Composed surfaces"
      description="The patterns built from the primitives: incident reporting, copilot chat, document control, permissions and settings."
    >
      <Demo title="Incident type selection" description="Selectable cards with icon, title, description and a check affordance.">
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORT_TYPES.map((type) => {
            const selected = reportType === type.id
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setReportType(type.id)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                  selected ? 'border-brand bg-brand/5 ring-2 ring-brand/15' : 'border-line bg-surface hover:border-brand/40',
                )}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', selected ? 'bg-brand text-white' : 'bg-surface-soft text-muted')}>
                  <Icon name={type.icon} size={20} />
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="text-sm font-semibold text-foreground">{type.label}</span>
                  <span className="text-xs text-muted">{type.description}</span>
                </span>
                <span className={cn('mt-1 flex h-5 w-5 items-center justify-center rounded-full border', selected ? 'border-brand bg-brand text-white' : 'border-line text-muted')}>
                  <Icon name={selected ? 'check' : 'plus'} size={12} />
                </span>
              </button>
            )
          })}
        </div>
      </Demo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Copilot conversation" description="Bubbles, advisory badge, prompt chips and a character-counted composer." importName="ChatBubble">
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon name="chatBot" size={16} className="text-brand" />Conversation</h4>
              <Badge tone="success"><Icon name="lock" size={11} />Private · Advisory</Badge>
            </div>
            <ChatMessageList busy className="max-h-72">
              <ChatBubble
                role="assistant"
                author="Safety Copilot · Advisory"
                avatar={<span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand-dark"><Icon name="chatBot" size={15} /></span>}
              >
                Processing Unit has 2 open Critical and 4 open High reports. North Field Terminal follows with 1 Critical and 3 High.
              </ChatBubble>
              <ChatBubble role="user" avatar={<Avatar name="Jordan Ellis" size="sm" />}>
                Which sites have the highest open high-risk reports this month?
              </ChatBubble>
            </ChatMessageList>
            <div className="flex flex-wrap gap-2">
              {['Summarize this week', 'Which actions are overdue?', 'Top risks by site'].map((prompt) => (
                <PromptChip key={prompt}>{prompt}</PromptChip>
              ))}
            </div>
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSend={() => setDraft('')}
              placeholder="Ask about your authorized operational data…"
              footnote="Human review required"
            />
          </div>
        </Demo>

        <Demo title="Document master–detail" description="Selectable list on the left, controlled document and version metadata on the right." importName="MasterDetail">
          <MasterDetail
            master={
              <div className="grid gap-2">
                {DOCUMENTS.map((doc) => {
                  const selected = doc.id === selectedDoc
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedDoc(doc.id)}
                      className={cn(
                        'grid gap-1 rounded-xl border p-3 text-left transition-colors',
                        selected ? 'border-brand ring-2 ring-brand/15' : 'border-line hover:border-brand/40',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                          <Icon name="file" size={15} className="shrink-0 text-muted" />
                          <span className="truncate">{doc.title}</span>
                        </span>
                        <StatusBadge status={doc.status} />
                      </span>
                      <span className="font-mono text-[11px] text-muted">{doc.code} · {doc.version} · {doc.type}</span>
                    </button>
                  )
                })}
              </div>
            }
            detail={
              <Card className="shadow-none">
                <CardHeader className="gap-2 p-4">
                  <CardTitle className="text-base">{document.title}</CardTitle>
                  <CardDescription>{document.code} · {document.version} · {document.type}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 pt-0">
                  <Row>
                    <StatusBadge status={document.status} />
                    <Badge tone="info">Organization</Badge>
                    <Badge tone="neutral">Confidential</Badge>
                  </Row>
                  <DetailList
                    columns={2}
                    items={[
                      { label: 'Owner', value: 'Priya Raman' },
                      { label: 'Effective', value: '01 Oct 2026' },
                      { label: 'Review', value: '01 Oct 2027' },
                      { label: 'Expires', value: '—' },
                    ]}
                  />
                  <Row>
                    <Button size="sm" variant="outline">New version</Button>
                    <Button size="sm" variant="outline">Archive</Button>
                  </Row>
                </CardContent>
              </Card>
            }
          />
        </Demo>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Permission matrix" description="Grouped tiles, required baseline permissions disabled, select-all." importName="PermissionMatrix">
          <PermissionMatrix groups={PERMISSION_GROUPS} value={permissions} onChange={setPermissions} />
        </Demo>

        <Demo title="Settings config row" description="Label + status + switch + edit. Reused for shifts, departments, sites, contacts, severities and categories." importName="ConfigRow">
          <Stack>
            <ConfigList>
              {[
                { name: 'Day shift', meta: '07:00–19:00', active: true },
                { name: 'Night shift', meta: '19:00–07:00', active: true },
                { name: 'Maintenance window', meta: 'Weekends · disabled', active: false },
              ].map((row) => (
                <ConfigRow
                  key={row.name}
                  title={row.name}
                  description={row.meta}
                  enabled={row.active}
                  onEnabledChange={() => undefined}
                  action={<Button variant="outline" size="sm">Change</Button>}
                />
              ))}
            </ConfigList>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add department" htmlFor="ui-new-dept" className="min-w-48 flex-1">
                <Input id="ui-new-dept" placeholder="Add custom department" />
              </Field>
              <Button variant="outline" size="sm">Add department</Button>
            </div>
          </Stack>
        </Demo>
      </div>

      <Demo title="User management table" description="Composed DataTable with Avatar, inline role select, StatusBadge and row actions." importName="DataTable">
        <DataTable
          columns={userColumns}
          rows={users}
          rowKey={(user) => user.id}
          toolbar={
            <TableToolbar actions={<Button size="sm">Invite user</Button>}>
              <SearchField
                value={userSearch}
                onChange={setUserSearch}
                placeholder="Search name, email, role…"
                className="max-w-xs"
              />
            </TableToolbar>
          }
          empty={
            <div className="grid justify-items-center gap-1">
              <strong className="text-sm text-foreground">No users match this search</strong>
              <span className="text-xs text-muted">Try a different name, email or role.</span>
            </div>
          }
        />
      </Demo>

      <Demo title="Notification preferences" description="Grouped switches with explicit save — not save-on-toggle." importName="Toggle">
        <FormGrid>
          <Field label="Email">
            <div className="flex h-9 items-center justify-between rounded-xl border border-line bg-surface px-3">
              <span className="text-sm text-foreground">Email alerts</span>
              <Toggle checked={emailAlerts} onCheckedChange={setEmailAlerts} aria-label="Email alerts" />
            </div>
          </Field>
          <Field label="SMS">
            <div className="flex h-9 items-center justify-between rounded-xl border border-line bg-surface px-3">
              <span className="text-sm text-foreground">SMS alerts</span>
              <Toggle checked={smsAlerts} onCheckedChange={setSmsAlerts} aria-label="SMS alerts" />
            </div>
          </Field>
          <Field label="Push">
            <div className="flex h-9 items-center justify-between rounded-xl border border-line bg-surface px-3">
              <span className="text-sm text-foreground">Push notifications</span>
              <Toggle checked disabled onCheckedChange={() => undefined} aria-label="Push notifications" />
            </div>
          </Field>
          <Field label="Digest">
            <div className="flex h-9 items-center justify-between rounded-xl border border-line bg-surface px-3">
              <span className="text-sm text-foreground">Weekly digest</span>
              <Toggle checked onCheckedChange={() => undefined} aria-label="Weekly digest" />
            </div>
          </Field>
        </FormGrid>
      </Demo>

      <Demo title="Workspace loading gate" description="Brief + progress line + explicit proceed action. Reduced-motion safe." importName="Progress">
        <div className="grid gap-4 rounded-card border border-line bg-ink p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand"><Icon name="dashboard" size={18} /></span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Field safety brief</p>
              <h3 className="font-display text-lg font-semibold">Preparing your workspace</h3>
            </div>
          </div>
          <p className="max-w-lg text-sm text-slate-300">Loading authorized sites, open actions and the latest incident snapshot.</p>
          <Progress value={70} label="Workspace loading" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Auto-proceeding in 3 seconds…</span>
            <Button variant="inverse" size="sm">Proceed to Dashboard</Button>
          </div>
        </div>
      </Demo>

      <Demo title="Coverage banner" description="Compact analytics coverage strip with scope, window and snapshot state." importName="CoverageBanner">
        <CoverageBanner scope="Organization coverage" windowLabel="30-day window" snapshot="2026-10-29 14:20" status="partial" />
      </Demo>
    </Section>
  )
}
