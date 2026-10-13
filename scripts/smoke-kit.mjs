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