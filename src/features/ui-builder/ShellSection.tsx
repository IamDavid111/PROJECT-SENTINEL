import { useState } from 'react'

import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Divider,
  Icon,
  IconButton,
  Kbd,
  NavGroup,
  NavItem,
  PageHeader,
  Pagination,
  SearchField,
  Sidebar,
  StatusBadge,
  Tabs,
  Topbar,
} from '../../components/ui'
import { Demo, Row, Section, Stack } from './shared'

export function ShellSection() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  return (
    <Section
      id="shell"
      eyebrow="09 · Navigation & shell"
      title="Workspace shell"
      description="Sidebar, topbar, breadcrumbs and navigation primitives. These replace the legacy .workspace-* markup when the shell is migrated."
    >
      <Demo title="Breadcrumb" description="Trail with a current-page marker and accessible nav landmark." importName="Breadcrumb">
        <div className="grid gap-4">
          <Breadcrumb
            items={[
              { label: 'Operations', href: '#shell' },
              { label: 'QHSE', href: '#shell' },
              { label: 'Incident Management' },
            ]}
          />
          <Breadcrumb items={[{ label: 'Operations', href: '#shell' }, { label: 'Safety Overview' }]} />
          <Breadcrumb items={[{ label: 'Dashboard' }]} />
        </div>
      </Demo>

      <Demo title="Workspace shell" description="Sidebar + topbar + content. Static preview — the real shell keeps its routing and permissions." importName="Sidebar">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex h-[430px]">
            <Sidebar
              className="hidden w-56 shrink-0 md:flex"
              brand={
                <div className="flex items-center gap-2.5 px-1">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
                    <Icon name="administration" size={18} />
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-sm font-semibold text-white">SentinelQHSE</span>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Safety intelligence</span>
                  </span>
                </div>
              }
              footer={
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
                  <Icon name="logout" size={15} />
                  Sign out
                </button>
              }
            >
              <NavGroup title="Operations">
                <NavItem label="Dashboard" icon="dashboard" active href="#shell" />
                <NavItem label="Report Incident" icon="reportIncident" href="#shell" />
                <NavItem label="Log Inspection" icon="inspections" href="#shell" />
                <NavItem label="Safety Intelligence" icon="aiAssistant" href="#shell" />
              </NavGroup>
              <NavGroup title="Account">
                <NavItem label="My Reports" icon="incidents" href="#shell" badge={<Badge tone="warning">12</Badge>} />
                <NavItem label="Assigned Actions" icon="assignedActions" href="#shell" badge={<Badge tone="danger">3</Badge>} />
                <NavItem label="Settings" icon="settings" href="#shell" />
              </NavGroup>
            </Sidebar>

            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                eyebrow="Secure workspace"
                title="Dashboard"
                breadcrumbs={[{ label: 'Operations', href: '#shell' }, { label: 'Safety Overview' }]}
                context={
                  <div className="hidden flex-col gap-0.5 lg:flex">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">For emergency response call</span>
                    <span className="text-xs text-foreground"><strong className="text-danger">HSE Manager</strong> · <a href="tel:+15550100" className="underline underline-offset-2">+1 555 0100</a></span>
                  </div>
                }
                actions={
                  <>
                    <button type="button" className="flex h-9 min-w-48 items-center gap-2 rounded-xl border border-line bg-surface-soft px-3 text-left text-xs text-muted">
                      <Icon name="search" size={14} />
                      <span className="flex-1">Search workspace</span>
                      <Kbd>⌘K</Kbd>
                    </button>
                    <IconButton icon="notifications" label="Notifications" variant="ghost" />
                    <IconButton icon="moon" label="Toggle theme" variant="ghost" />
                    <Avatar name="Jordan Ellis" size="sm" />
                  </>
                }
              />

              <div className="grid flex-1 content-start gap-3 overflow-y-auto bg-surface-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Operational safety overview</p>
                    <h3 className="font-display text-lg font-semibold text-foreground">Good morning, Jordan</h3>
                  </div>
                  <StatusBadge status="active" label="Live snapshot" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Open incidents', value: '18' },
                    { label: 'Overdue actions', value: '7' },
                    { label: 'Risk index', value: '62 / 100' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{stat.label}</p>
                      <p className="font-display text-xl font-semibold tabular-nums text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-xs text-muted">The content area keeps the existing page components. Only the shell chrome changes.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Demo>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Nav items" description="Active, inactive and badged sidebar items." importName="NavItem">
          <div className="grid gap-1 rounded-xl bg-ink p-3">
            <NavItem label="Dashboard" icon="dashboard" active href="#shell" />
            <NavItem label="Report Incident" icon="reportIncident" href="#shell" />
            <NavItem label="Log Inspection" icon="inspections" href="#shell" />
            <NavItem label="My Reports" icon="incidents" href="#shell" badge={<Badge tone="warning">12</Badge>} />
            <NavItem label="Assigned Actions" icon="assignedActions" href="#shell" badge={<Badge tone="danger">3</Badge>} />
          </div>
        </Demo>

        <Demo title="Tabs" description="Accessible tablist for switching views." importName="Tabs">
          <Tabs
            items={[
              { id: 'summary', label: 'Summary', content: <p className="text-sm text-muted">KPI cards, trend and site ranking.</p> },
              { id: 'actions', label: 'Actions', content: <p className="text-sm text-muted">Open, overdue and verified actions.</p> },
              { id: 'evidence', label: 'Evidence', content: <p className="text-sm text-muted">Attached files and closure evidence.</p> },
              { id: 'history', label: 'History', content: <p className="text-sm text-muted">Audit timeline and record changes.</p> },
            ]}
          />
        </Demo>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Pagination" description="Summary and Previous/Next controls for register tables." importName="Pagination">
          <Stack>
            <Pagination page={page} totalPages={4} total={48} itemLabel="incidents" onPageChange={setPage} />
            <Pagination page={1} totalPages={1} total={3} itemLabel="records" onPageChange={() => undefined} />
          </Stack>
        </Demo>

        <Demo title="Search & keyboard hints" description="Search input plus Kbd chips for shortcuts." importName="Kbd">
          <Stack>
            <SearchField value={search} onChange={setSearch} placeholder="Search workspace…" />
            <Row>
              <span className="text-sm text-muted">Open command palette</span>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <span className="text-sm text-muted">or</span>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </Row>
          </Stack>
        </Demo>
      </div>

      <Demo title="Dividers" description="Hairline separators with optional centered labels." importName="Divider">
        <Stack>
          <p className="text-sm text-muted">Section one</p>
          <Divider />
          <p className="text-sm text-muted">Section two</p>
          <Divider label="OR" />
          <div className="flex h-12 items-center gap-4">
            <span className="text-sm text-muted">Left</span>
            <Divider orientation="vertical" />
            <span className="text-sm text-muted">Right</span>
          </div>
        </Stack>
      </Demo>

      <Demo title="Page header" description="The shared rack used by every workspace page." importName="PageHeader">
        <PageHeader
          eyebrow="Operations & QHSE"
          title="Incident Management"
          headingLevel="h3"
          description="48 records match the current filters."
          actions={
            <Row>
              <Button variant="outline" size="sm">Refresh</Button>
              <Button size="sm">Report incident</Button>
            </Row>
          }
        />
      </Demo>
    </Section>
  )
}
