import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const demoUsers = [
  'Chinedu Okafor',
  'Adebayo Adeyemi',
  'Chiamaka Nwosu',
  'Ibrahim Musa',
  'Ngozi Eze',
  'Emeka Obi',
  'Fatima Bello',
  'Tunde Adebayo',
  'Blessing Ebi',
  'Daniel Okoro',
  'Esther Williams',
  'Samuel Nwachukwu',
  'Halima Abdullahi',
  'Kelechi Umeh',
  'David Alabi',
  'Amarachi Okeke',
  'Yusuf Ibrahim',
  'Mercy Johnson',
  'Kingsley Eze',
  'Favour Odu',
].map((fullName) => ({
  fullName,
  email: `${fullName.toLowerCase().replaceAll(' ', '.').replaceAll("'", '')}.demo@sentinelqhse.example`,
}))

function confirmTarget(url) {
  const parsedUrl = new URL(url)
  const host = parsedUrl.hostname
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host)
  if (isLocal) {
    if (!process.argv.includes('--local')) {
      throw new Error('Local Auth creation requires the explicit --local flag.')
    }
    return
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Remote Auth creation requires an HTTPS Supabase URL.')
  }
  const ref = host.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1]
  const confirmedRef = process.env.DEMO_SUPABASE_PROJECT_REF
  const commandConfirmation = process.argv.find((arg) => arg.startsWith('--confirm-project='))?.split('=', 2)[1]
  if (!ref || !confirmedRef || ref !== confirmedRef || commandConfirmation !== ref) {
    throw new Error('Remote Auth creation blocked: set DEMO_SUPABASE_PROJECT_REF and pass the same value as --confirm-project=<ref>.')
  }
}

async function listUsers(client) {
  const usersByEmail = new Map()
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to inspect Auth users: ${error.message}`)
    for (const user of data.users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user)
    }
    if (data.users.length < 1000) return usersByEmail
  }
}

async function main() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = process.env.DEMO_USER_PASSWORD
  if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Do not use a VITE_-prefixed service-role key. Provide it only as SUPABASE_SERVICE_ROLE_KEY in a server-side terminal.')
  }
  if (!url || !serviceRoleKey || !password) {
    throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DEMO_USER_PASSWORD in the server-side terminal environment.')
  }
  if (password.length < 12) {
    throw new Error('DEMO_USER_PASSWORD must be at least 12 characters.')
  }
  confirmTarget(url)

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const existingUsers = await listUsers(client)
  let createdCount = 0
  let reusedCount = 0

  for (const [index, demoUser] of demoUsers.entries()) {
    const existingUser = existingUsers.get(demoUser.email)
    const matchingDemoUsers = [...existingUsers.values()].filter((user) =>
      user.user_metadata?.sentinel_demo === true
      && user.app_metadata?.sentinel_demo === true
      && Boolean(user.email_confirmed_at)
      && user.user_metadata?.full_name === demoUser.fullName)
    if (matchingDemoUsers.length > 1) {
      throw new Error(`Multiple marked demo Auth accounts match demo-user position ${index + 1}; refusing to choose one automatically.`)
    }

    if (existingUser) {
      if (
        existingUser.user_metadata?.sentinel_demo !== true
        || existingUser.app_metadata?.sentinel_demo !== true
        || existingUser.user_metadata?.full_name !== demoUser.fullName
        || !existingUser.email_confirmed_at
      ) {
        throw new Error(`Refusing to adopt an existing, unmarked, or unconfirmed Auth account at demo-user position ${index + 1}.`)
      }
      reusedCount += 1
      continue
    }

    if (matchingDemoUsers.length === 1) {
      reusedCount += 1
      continue
    }

    const { error } = await client.auth.admin.createUser({
      email: demoUser.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: demoUser.fullName, sentinel_demo: true },
      app_metadata: { sentinel_demo: true },
    })
    if (error) {
      throw new Error(`Unable to create demo Auth account ${index + 1}: ${error.message}. Rerun after resolving the error; existing demo accounts are reused.`)
    }
    createdCount += 1
  }

  console.log(`Demo Auth users ready: ${createdCount} created, ${reusedCount} reused. No invitations or emails were sent.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Demo Auth user creation failed.')
  process.exitCode = 1
})
