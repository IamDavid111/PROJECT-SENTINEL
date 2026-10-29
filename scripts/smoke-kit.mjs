// Smoke-renders every UI kit primitive through Vite's SSR module loader so
// import resolution and first render are exercised (type-check alone misses
// runtime issues). Skips portal/async-heavy pieces (ToastProvider, open Dialog),
// which need a real DOM.
import { createServer } from 'vite'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const kit = await server.ssrLoadModule('/src/components/ui/index.ts')

const cases = [
  ['Button', h(kit.Button, { size: 'sm' }, 'Save changes')],
  ['Button loading', h(kit.Button, { loading: true }, 'Saving...')],
  ['IconButton', h(kit.IconButton, { icon: 'close', label: 'Close' })],
  ['Card', h(kit.Card, null, h(kit.CardHeader, null, h(kit.CardTitle, null, 'Title'), h(kit.CardDescription, null, 'desc')), h(kit.CardContent, null, 'body'), h(kit.CardFooter, null, 'footer'))],
  ['Badge', h(kit.Badge, { tone: 'success' }, 'Active')],
  ['SeverityBadge', h(kit.SeverityBadge, { severity: 'high' })],
  ['SeverityBadge unknown', h(kit.SeverityBadge, { severity: 'nope' })],
  ['SignalBar', h(kit.SignalBar, { severity: 'critical' })],
  ['Field', h(kit.Field, { label: 'Site', htmlFor: 'site', hint: 'Pick one' }, h(kit.Input, { id: 'site' }))],
  ['Input invalid', h(kit.Input, { invalid: true, placeholder: 'x' })],
  ['Select', h(kit.Select, null, h('option', null, 'A'))],
  ['Textarea', h(kit.Textarea, { placeholder: 'notes' })],
  ['Toggle', h(kit.Toggle, { checked: true, label: 'Enabled' })],
  ['Checkbox', h(kit.Checkbox, { checked: true, label: 'Agree' })],
  ['Label', h(kit.Label, { required: true }, 'Name')],
  ['PageHeader', h(kit.PageHeader, { eyebrow: 'OPERATIONS & QHSE', title: 'Incident Management', description: 'desc', actions: h(kit.Button, null, 'Go') })],
  ['EmptyState', h(kit.EmptyState, { title: 'Nothing here', description: 'Try again', action: h(kit.Button, null, 'Report') })],
  ['KpiCard', h(kit.KpiCard, { label: 'Open actions', value: '12', severity: 'high', icon: 'target', change: '+12%' })],
  ['Alert', h(kit.Alert, { tone: 'danger', title: 'Permission denied' }, 'Ask your admin.')],
  ['Table', h(kit.Table, null, h(kit.TableHeader, null, h('tr', null, h(kit.TableHead, null, 'Ref'), h(kit.TableHead, null, 'Title'))), h(kit.TableBody, null, h(kit.TableRow, null, h(kit.TableCell, null, 'INC-001'), h(kit.TableCell, null, 'Slip'))))],
  ['Tabs', h(kit.Tabs, { items: [{ id: 'a', label: 'A', content: h('p', null, 'a') }, { id: 'b', label: 'B' }] })],
  ['Tooltip', h(kit.Tooltip, { label: 'Help' }, h('span', null, 'hover'))],
  ['Skeleton', h(kit.Skeleton, { variant: 'text' })],
  ['Spinner', h(kit.Spinner, {})],
  ['SpinnerCenter', h(kit.SpinnerCenter, {})],
  ['Icon', h(kit.Icon, { name: 'reportIncident', size: 16 })],
  ['StatusBadge', h(kit.StatusBadge, { status: 'pending_review' })],
  ['SegmentedControl', h(kit.SegmentedControl, { label: 'Window', value: '30', onChange: () => undefined, options: [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }] })],
  ['Accordion', h(kit.Accordion, { title: 'Methodology' }, h('p', null, 'Details'))],
  ['Progress', h(kit.Progress, { value: 42, label: 'Upload' })],
  ['Avatar', h(kit.Avatar, { name: 'Jordan Ellis' })],
  ['FormSection', h(kit.FormSection, { title: 'Details', description: 'desc' }, h(kit.FormGrid, null, h(kit.Field, { label: 'Site' }, h(kit.Input, null))))],
  ['DetailList', h(kit.DetailList, { items: [{ label: 'Reference', value: 'INC-001' }, { label: 'Site', value: 'North Field' }] })],
  ['Timeline', h(kit.Timeline, { items: [{ time: '14:20', title: 'Reported' }, { time: '15:02', title: 'Assigned' }] })],
  ['ChartCard', h(kit.ChartCard, { title: 'Trend', description: 'desc' }, h('p', null, 'plot'))],
  ['Stepper', h(kit.Stepper, { steps: [{ id: 'a', label: 'Event' }, { id: 'b', label: 'Evidence' }], activeIndex: 0 })],
  ['RadioGroup', h(kit.RadioGroup, { name: 'type', label: 'Type', value: 'a', onChange: () => undefined, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })],
  ['Pagination', h(kit.Pagination, { page: 1, totalPages: 3, total: 24, onPageChange: () => undefined })],
  ['DropdownMenu', h(kit.DropdownMenu, { label: 'Export', items: [{ id: 'pdf', label: 'PDF' }] })],
  ['Kbd', h(kit.Kbd, null, '⌘K')],
  ['Divider', h(kit.Divider, { label: 'OR' })],
  ['Breadcrumb', h(kit.Breadcrumb, { items: [{ label: 'Operations', href: '#' }, { label: 'Dashboard' }] })],
  ['NavItem', h(kit.NavItem, { label: 'Dashboard', icon: 'dashboard', active: true })],
  ['Topbar', h(kit.Topbar, { eyebrow: 'Secure workspace', title: 'Dashboard', breadcrumbs: [{ label: 'Operations' }, { label: 'Dashboard' }] })],
  ['Sidebar', h(kit.Sidebar, { brand: h('span', null, 'Brand'), children: h(kit.NavItem, { label: 'Dashboard', icon: 'dashboard' }) })],
  ['ConfirmDialog closed', h(kit.ConfirmDialog, { open: false, onClose: () => undefined, onConfirm: () => undefined, title: 'Remove?' })],
  ['Combobox', h(kit.Combobox, { label: 'Site', value: 'a', onChange: () => undefined, options: [{ value: 'a', label: 'Site A' }, { value: 'b', label: 'Site B' }] })],
  ['FileUpload', h(kit.FileUpload, { files: [], onFilesSelected: () => undefined, onRemove: () => undefined })],
  ['SearchField', h(kit.SearchField, { value: '', onChange: () => undefined })],
  ['FilterBar', h(kit.FilterBar, null, h(kit.Field, { label: 'Site' }, h(kit.Input, null)))],
  ['MasterDetail', h(kit.MasterDetail, { master: h('p', null, 'list'), detail: h('p', null, 'detail') })],
  ['DataTable', h(kit.DataTable, { columns: [{ id: 'ref', header: 'Ref', cell: (row) => row.ref }], rows: [{ ref: 'INC-1' }], rowKey: (row) => row.ref })],
  ['CitationCard', h(kit.CitationCard, { title: 'Procedure', excerpt: 'Excerpt', footer: 'Excerpt 1' })],
  ['ChatBubble', h(kit.ChatBubble, { role: 'assistant' }, 'Hello')],
  ['ChatComposer', h(kit.ChatComposer, { value: '', onChange: () => undefined, onSend: () => undefined })],
  ['ChatMessageList', h(kit.ChatMessageList, null, h('p', null, 'message'))],
  ['PromptChip', h(kit.PromptChip, null, 'Summarize')],
  ['PermissionMatrix', h(kit.PermissionMatrix, { groups: [{ id: 'g', label: 'Group', items: [{ key: 'a', label: 'A' }] }], value: ['a'], onChange: () => undefined })],
  ['ConfigRow', h(kit.ConfigRow, { title: 'Day shift', description: '07:00–19:00', enabled: true })],
  ['ExportMenu', h(kit.ExportMenu, { onExport: () => undefined })],
  ['MapCard', h(kit.MapCard, { configured: false })],
  ['CoverageBanner', h(kit.CoverageBanner, { scope: 'Organization', windowLabel: '30 days', snapshot: '2026-10-29 14:20' })],
]

let failures = 0
for (const [name, element] of cases) {
  try {
    renderToString(element)
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}:`, error?.message ?? error)
  }
}

await server.close()
if (failures) process.exit(1)
console.log(`\n${cases.length - failures}/${cases.length} primitives rendered`)