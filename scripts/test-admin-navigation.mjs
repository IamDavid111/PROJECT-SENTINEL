import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
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
]

for (const [name, pattern] of checks) {
  if (!source.includes(pattern)) throw new Error(`Missing ${name}`)
}

console.log('PASS: Administration -> User Management navigation')
console.log('PASS: Administration -> Roles & Permissions navigation')
console.log('PASS: direct hash and protected route registration')
console.log('PASS: User Management refresh wiring')
