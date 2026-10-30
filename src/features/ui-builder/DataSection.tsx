import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartCard,
  CitationCard,
  CoverageBanner,
  DataTable,
  DetailList,
  KpiCard,
  MapCard,
  Pagination,
  SearchField,
  SeverityBadge,
  SignalBar,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Timeline,
  type DataTableColumn,
  type DataTableSort,
} from '../../components/ui'
import { SEVERITY_LEVELS } from '../../components/ui/severity'
import { ColumnGrid, Demo, Row, Section, Stack } from './Shared'

const TREND = [
  { label: 'Jun', incidents: 14, nearMisses: 22, closed: 9 },
  { label: 'Jul', incidents: 11, nearMisses: 19, closed: 12 },
  { label: 'Aug', incidents: 16, nearMisses: 25, closed: 13 },
  { label: 'Sep', incidents: 9, nearMisses: 27, closed: 15 },
  { label: 'Oct', incidents: 12, nearMisses: 31, closed: 14 },
]

const SEVERITY_SPLIT = [
  { name: 'Low', value: 18, color: '#12a94f' },
  { name: 'Medium', value: 11, color: '#f59e0b' },
  { name: 'High', value: 7, color: '#f97316' },
  { name: 'Critical', value: 3, color: '#dc2626' },
]

const REPORT_ROWS = [
  { reference: 'INC-2026-0042', title: 'Hydraulic line failure', severity: 'high', status: 'open', site: 'North Field' },
  { reference: 'INC-2026-0041', title: 'Slip on wet decking', severity: 'medium', status: 'under_review', site: 'Coastal Unit' },
  { reference: 'INC-2026-0039', title: 'Near miss — dropped tool', severity: 'low', status: 'closed', site: 'North Field' },
  { reference: 'INC-2026-0037', title: 'Gas detection alarm', severity: 'critical', status: 'overdue', site: 'Processing Unit' },
]

export function DataSection() {
  const [sort, setSort] = useState<DataTableSort>({ columnId: 'reference', direction: 'desc' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filteredRows = REPORT_ROWS.filter((row) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return [row.reference, row.title, row.status, row.site].some((value) => value.toLowerCase().includes(query))
  })

  const sortedRows = [...filteredRows].sort((a, b) => {
    const key = sort.columnId as keyof typeof a
    const left = String(a[key] ?? '')
    const right = String(b[key] ?? '')
    return sort.direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
  })

  const pageSize = 3
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const columns: readonly DataTableColumn<(typeof REPORT_ROWS)[number]>[] = [
    { id: 'reference', header: 'Reference', sortable: true, cell: (row) => <span className="font-mono text-xs text-muted">{row.reference}</span> },
    { id: 'title', header: 'Incident', sortable: true, cell: (row) => <span className="font-medium">{row.title}</span> },
    { id: 'severity', header: 'Severity', cell: (row) => <SeverityBadge severity={row.severity} /> },
    { id: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'site', header: 'Site', sortable: true, cell: (row) => <span className="text-muted">{row.site}</span> },
    {
      id: 'action',
      header: 'Action',
      align: 'right',
      cell: () => <Button variant="ghost" size="sm">View</Button>,
    },
  ]

  return (
    <Section
      id="data"
      eyebrow="04 · Data display"
      title="Badges, tables & records"
      description="Status is never color-only: every chip carries a word, severity carries the signal bar, and field codes use mono."
    >
      <Demo title="Badge tones" description="neutral · success · warning · danger · accent · info.">
        <Row>
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="info">Info</Badge>
        </Row>
      </Demo>

      <Demo title="Status badges" description="One tone map for incidents, actions, knowledge versions, invitations and accounts.">
        <Row>
          {['draft', 'pending_review', 'submitted', 'under_review', 'approved', 'rejected', 'open', 'overdue', 'closed', 'archived', 'active', 'suspended'].map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </Row>
      </Demo>

      <Demo title="Severity" description="The signature signal bar: Low 1 · Medium 2 · High 3 · Critical 4.">
        <div className="grid gap-5">
          <Row>
            {SEVERITY_LEVELS.map((level) => (
              <div key={level} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <SignalBar severity={level} />
                <SeverityBadge severity={level} />
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <SeverityBadge severity={null} />
            </div>
          </Row>
          <Row>
            <SignalBar severity="low" segments={8} />
            <SignalBar severity="medium" segments={8} />
            <SignalBar severity="high" segments={8} />
            <SignalBar severity="critical" segments={8} />
            <span className="text-xs text-muted">8-segment variant</span>
          </Row>
        </div>
      </Demo>

      <Demo title="KPI cards" description="Display-face numerals, tabular figures, optional severity gutter and change chip.">
        <ColumnGrid className="xl:grid-cols-4">
          <KpiCard label="Total incidents" value="48" hint="Across 6 authorized sites" change="+12%" changeTone="down" icon="incidents" />
          <KpiCard label="Open actions" value="23" hint="7 overdue" change="-4" changeTone="up" icon="correctiveActions" />
          <KpiCard label="Risk index" value="62 / 100" hint="High band · 30-day window" severity="high" />
          <KpiCard label="Avg. resolution" value="4.2 days" hint="12 closure samples" icon="clock" />
        </ColumnGrid>
      </Demo>

      <Demo title="Card anatomy" description="Card + CardHeader/Title/Description/Content/Footer.">
        <ColumnGrid>
          <Card>
            <CardHeader>
              <CardTitle>Incident closure</CardTitle>
              <CardDescription>Evidence is required before an incident can be closed.</CardDescription>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: 'Root cause', value: 'Hydraulic hose chafing against the guard.' },
                  { label: 'Corrective action', value: 'Hose replaced and guard re-routed.' },
                ]}
              />
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">Cancel</Button>
              <Button size="sm">Confirm closure</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Document control</CardTitle>
              <CardDescription>QHSE-KM-0042 · v3 · Approved</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Row>
                <StatusBadge status="approved" />
                <Badge tone="neutral">Procedure</Badge>
                <Badge tone="info">Organization</Badge>
              </Row>
              <p className="text-sm text-muted">Effective 01 Oct 2026 · Review 01 Oct 2027</p>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">Version history</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Empty-safe card</CardTitle>
              <CardDescription>Use EmptyState inside when there is no data.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                No linked actions yet.
              </div>
            </CardContent>
          </Card>
        </ColumnGrid>
      </Demo>

      <Demo title="Data table" description="Toolbar, header, rows, status chips and row actions share one shell." contentClassName="p-0">
        <div className="border-b border-line p-4">
          <Row className="justify-between">
            <Row>
              <Button variant="outline" size="sm">All sites</Button>
              <Button variant="outline" size="sm">All severities</Button>
              <Button variant="outline" size="sm">All statuses</Button>
            </Row>
            <Row>
              <Button variant="outline" size="sm">Refresh</Button>
              <Button size="sm">Report incident</Button>
            </Row>
          </Row>
        </div>
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Incident</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REPORT_ROWS.map((row) => (
                <TableRow key={row.reference}>
                  <TableCell className="font-mono text-xs text-muted">{row.reference}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell><SeverityBadge severity={row.severity} /></TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="text-muted">{row.site}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>Page 1 of 3 · 48 incidents</span>
          <Row>
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm">Next</Button>
          </Row>
        </div>
      </Demo>

      <Demo
        title="DataTable"
        description="Generic table: toolbar, search, sortable headers, loading rows, empty slot and pagination."
        importName="DataTable"
      >
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.reference}
          sort={sort}
          onSortChange={(next) => {
            setSort(next)
            setPage(1)
          }}
          toolbar={
            <TableToolbar
              actions={
                <>
                  <Button variant="outline" size="sm">Refresh</Button>
                  <Button size="sm">Report incident</Button>
                </>
              }
            >
              <SearchField
                value={search}
                onChange={(value) => {
                  setSearch(value)
                  setPage(1)
                }}
                placeholder="Search reference, title, site…"
                className="max-w-sm"
              />
            </TableToolbar>
          }
          pagination={
            <div className="border-t border-line px-4 py-3">
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={sortedRows.length}
                itemLabel="incidents"
                onPageChange={setPage}
              />
            </div>
          }
        />
      </Demo>

      <Demo
        title="DataTable states"
        description="Skeleton loading rows and the empty-state slot."
        importName="DataTable"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <DataTable
            columns={columns}
            rows={[]}
            rowKey={() => ''}
            loading
            loadingRows={3}
          />
          <DataTable
            columns={columns}
            rows={[]}
            rowKey={() => ''}
            empty={
              <div className="grid justify-items-center gap-1">
                <strong className="text-sm text-foreground">No incidents match these filters</strong>
                <span className="text-xs text-muted">Clear a filter or report a new incident.</span>
              </div>
            }
          />
        </div>
      </Demo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Detail list" description="Read-only key/value rows for record panels.">
          <DetailList
            items={[
              { label: 'Reference', value: <span className="font-mono text-xs">INC-2026-0042</span> },
              { label: 'Reported', value: '29 Oct 2026 · 14:20 UTC' },
              { label: 'Reporter', value: 'Jordan Ellis' },
              { label: 'Site', value: 'North Field Terminal' },
              { label: 'Department', value: 'Maintenance' },
              { label: 'Severity', value: <SeverityBadge severity="high" /> },
            ]}
          />
        </Demo>

        <Demo title="Timeline" description="Audit/activity feed with tone-coded markers.">
          <Timeline
            items={[
              { time: '29 Oct · 14:20', title: 'Incident reported', meta: 'Jordan Ellis · North Field', tone: 'brand' },
              { time: '29 Oct · 15:02', title: 'Corrective action assigned', meta: 'Assigned to Sam Okafor', tone: 'accent' },
              { time: '30 Oct · 09:14', title: 'Evidence uploaded', meta: '3 files · 8.4 MB', tone: 'neutral' },
              { time: '31 Oct · 16:40', title: 'Closure verification failed', meta: 'Action proof missing', tone: 'danger' },
            ]}
          />
        </Demo>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Ranked list" description="High-risk sites: rank bubble, counts and total pill.">
          <ol className="grid gap-3">
            {[
              { name: 'Processing Unit', critical: 2, high: 4, total: 14 },
              { name: 'North Field Terminal', critical: 1, high: 3, total: 11 },
              { name: 'Coastal Processing Unit', critical: 0, high: 3, total: 8 },
            ].map((site, index) => (
              <li key={site.name} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-caution/15 text-xs font-semibold text-caution">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-foreground">{site.name}</h4>
                    <p className="text-xs text-muted">{site.critical} open critical · {site.high} open high</p>
                  </div>
                  <span className="rounded-full bg-caution/15 px-2.5 py-1 text-xs font-semibold text-caution">{site.total}</span>
                </div>
              </li>
            ))}
          </ol>
        </Demo>

        <Demo title="Version history" description="Document versions with status and contextual actions.">
          <ol className="grid gap-3">
            {[
              { version: 'v3', title: 'Permit to work procedure', status: 'approved' },
              { version: 'v2', title: 'Permit to work procedure', status: 'superseded' },
              { version: 'v4', title: 'Permit to work procedure', status: 'pending_review' },
            ].map((item) => (
              <li key={item.version} className="grid gap-2 rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.version} · {item.title}</span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="font-mono text-[11px] text-muted">PTW-v{item.version.replace('v', '')}.pdf · 1.8 MB · effective 01 Oct 2026</p>
                <Row>
                  <Button variant="ghost" size="sm">Download</Button>
                  <Button variant="outline" size="sm">Approve</Button>
                </Row>
              </li>
            ))}
          </ol>
        </Demo>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Evidence list" description="Attached files with type, size and row actions.">
          <Stack>
            {[
              { name: 'hydraulic-line.jpg', meta: 'image/jpeg · 2.4 MB' },
              { name: 'inspection-report.pdf', meta: 'application/pdf · 812 KB' },
              { name: 'site-photo.png', meta: 'image/png · 1.1 MB' },
            ].map((file) => (
              <div key={file.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted">{file.meta}</p>
                </div>
                <Row>
                  <Button variant="outline" size="sm">Download</Button>
                  <Button variant="ghost" size="sm">Remove</Button>
                </Row>
              </div>
            ))}
          </Stack>
        </Demo>

        <Demo title="Citation card" description="Grounded answer source with excerpt and deep link." importName="CitationCard">
          <CitationCard
            title="Permit to work procedure (v3)"
            meta="Procedure · Effective 01 Oct 2026"
            status={<Badge tone="success">Approved</Badge>}
            badges={
              <>
                <Badge tone="info">Organization</Badge>
                <Badge tone="neutral">Confidential</Badge>
              </>
            }
            excerpt="“A permit must be revalidated at the start of every shift and when the scope of work changes…”"
            footer="Excerpt 3 of 18 · characters 4,200–5,100"
            href="#data"
          />
        </Demo>
      </div>

      <Demo title="Avatars" description="Initials by default; photo when available." importName="Avatar">
        <Row>
          <Avatar name="Jordan Ellis" size="sm" />
          <Avatar name="Sam Okafor" size="md" />
          <Avatar name="Priya Raman" size="lg" />
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3">
            <Avatar name="Jordan Ellis" size="sm" />
            <span className="text-sm font-medium text-foreground">Jordan Ellis</span>
            <Badge tone="neutral">Super Admin</Badge>
          </div>
        </Row>
      </Demo>

      <Demo title="Coverage banner" description="Analytics header strip: scope, window, UTC snapshot and coverage state." importName="CoverageBanner">
        <div className="grid gap-3">
          <CoverageBanner scope="Organization coverage" windowLabel="30-day window" snapshot="2026-10-29 14:20" status="complete" />
          <CoverageBanner scope="My reports" windowLabel="90-day window" snapshot="2026-10-29 14:20" status="partial" />
          <CoverageBanner scope="Organization coverage" windowLabel="All Time" snapshot="2026-10-29 14:20" status="empty" />
        </div>
      </Demo>

      <Demo title="Map card" description="Map frame with configuration, empty and populated states. The real page mounts Mapbox." importName="MapCard">
        <div className="grid gap-4 lg:grid-cols-2">
          <MapCard
            sites={[
              { id: 'north', name: 'North Field Terminal', status: 'ok', x: 32, y: 38 },
              { id: 'coastal', name: 'Coastal Processing Unit', status: 'warning', x: 64, y: 56 },
              { id: 'processing', name: 'Processing Unit', status: 'critical', x: 76, y: 28 },
            ]}
          />
          <div className="grid gap-4">
            <MapCard configured={false} />
          </div>
        </div>
      </Demo>

      <Demo title="Charts" description="ChartCard shell + Recharts. Colors come from the palette.">
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Incident trend"
            description="Incidents, near misses and closures · 30 days"
            actions={<Badge tone="neutral">Grouped by month</Badge>}
            footer="Source: authorized incident snapshot · 29 Oct 2026 14:20 UTC"
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TREND} barGap={4}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                  <ChartTooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar dataKey="incidents" name="Incidents" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false} />
                  <Bar dataKey="nearMisses" name="Near misses" fill="#529fe3" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false} />
                  <Bar dataKey="closed" name="Closed" fill="#12a94f" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Risk mix" description="Reported severity distribution" footer="Low · Medium · High · Critical">
            <div className="grid items-center gap-4 sm:grid-cols-[1fr_160px]">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={SEVERITY_SPLIT} dataKey="value" nameKey="name" innerRadius={54} outerRadius={80} paddingAngle={3} isAnimationActive={false}>
                      {SEVERITY_SPLIT.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <ChartTooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid gap-2 text-sm">
                {SEVERITY_SPLIT.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                    <span className="flex-1">{entry.name}</span>
                    <span className="font-mono text-foreground">{entry.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>

          <ChartCard title="Monthly comparison" description="Line view for longer horizons" className="xl:col-span-2">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={TREND}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                  <ChartTooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="incidents" name="Incidents" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="nearMisses" name="Near misses" stroke="#12a94f" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Demo>
    </Section>
  )
}
