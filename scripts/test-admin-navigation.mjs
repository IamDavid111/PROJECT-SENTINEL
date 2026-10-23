import { readFileSync } from 'node:fs'

// This checks for expected source strings only; it does not launch the app or exercise navigation in a browser.
const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const inspection = readFileSync(new URL('../src/features/qhse/InspectionWorkspace.tsx', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../src/features/qhse/ActionsWorkspace.tsx', import.meta.url), 'utf8')
const primaryNavigation = source.split('const primaryNavigation:')[1].split('const secondaryNavigation:')[0]
const checks = [
  ['Administration to User Management link', "href: '#users'"],
  ['Administration to Roles link', "href: '#roles-permissions'"],
  ['Administration hash route', "route === 'administration'"],
  ['User Management hash route', "route === 'users'"],
  ['Roles hash route', "route === 'roles-permissions'"],
  ['Administration permission render', "canAccess('access_administration')"],
  ['User Management permission render', "canAccess('view_users')"],
  ['Roles permission render', "canAccess('view_roles_permissions')"],
  ['Refresh handler', 'onClick={() => void loadUsers()}'],
  ['Protected Administration route', "requestedRoute === 'administration'"],
  ['Protected Roles route', "requestedRoute === 'roles-permissions'"],
  ['Actions absent from primary sidebar', !primaryNavigation.includes("label: 'Actions'")],
  ['Actions route remains registered', "route: 'corrective-actions', label: 'Actions', permission: 'create_corrective_action'"],
  ['Actions-only users can reach Log Inspection navigation', 'canCreateInspections || canManageActions'],
  ['Actions route renders a standalone page', "route === 'corrective-actions' && canManageActions && <ActionsWorkspace"],
  ['Log Inspection passes Actions permission', '<InspectionWorkspace supabase={supabase} canManageActions={canManageActions} />'],
  ['Actions button precedes Dashboard', inspection.includes('href="#corrective-actions" onClick={openActions}>Actions</a>')
    && inspection.includes('href="#dashboard">Dashboard</a>')
    && inspection.indexOf('href="#corrective-actions" onClick={openActions}>Actions</a>') < inspection.indexOf('href="#dashboard">Dashboard</a>'), true],
  ['Actions Back returns through history without looping', actions.includes('window.history.back()')
    && actions.includes("url.hash = '#inspections'") && actions.includes('window.location.replace(url.toString())')],
]

for (const [name, pattern, from] of checks) {
  const haystack = from === true ? inspection : name === 'Actions Back returns to Log Inspection' ? actions
    : name === 'Actions absent from primary sidebar' ? primaryNavigation : source
  const found = typeof pattern === 'boolean' ? pattern : haystack.includes(pattern)
  if (!found) throw new Error(`Missing ${name}`)
}

console.log('PASS: Administration -> User Management navigation')
console.log('PASS: Administration -> Roles & Permissions navigation')
console.log('PASS: direct hash and protected route registration')
console.log('PASS: User Management refresh wiring')
console.log('PASS: Actions removed from sidebar and routed as a standalone permission-gated page')
console.log('PASS: Log Inspection Actions/Dashboard order and Actions Back navigation')
