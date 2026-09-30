import { createClient } from 'npm:@supabase/supabase-js@2'

type MockUserInput = {
  fullName: string
  email: string
  role: string
  department: string
  siteLocation: string
}

type SeedRequest = {
  organizationId: string
  organizationCode: string
  batchId: string
  users: MockUserInput[]
}

const allowedRoles = new Set([
  'QHSE Manager',
  'Site Supervisor',
  'Safety Officer / HSE Officer',
  'Auditor',
  'Maintenance Engineer',
  'Field Worker',
  'Contractor',
  'Executive / Management',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isConfiguredEntryActive(entries: unknown, expectedName: string) {
  if (!Array.isArray(entries)) return false
  return entries.some((entry) => {
    if (typeof entry === 'string') return entry.trim().toLowerCase() === expectedName.toLowerCase()
    if (!entry || typeof entry !== 'object') return false
    const item = entry as Record<string, unknown>
    return typeof item.name === 'string'
      && item.name.trim().toLowerCase() === expectedName.toLowerCase()
      && item.active !== false
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return errorResponse('POST is required', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return errorResponse('Mock-user service is not configured', 500)
  if (!authorization) return errorResponse('Authentication is required', 401)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: requester }, error: authError } = await userClient.auth.getUser()
  if (authError || !requester) return errorResponse('Invalid authentication token', 401)

  let body: SeedRequest
  try {
    body = await request.json() as SeedRequest
  } catch {
    return errorResponse('A valid JSON request body is required', 400)
  }

  if (body.organizationCode !== 'SENT-23FKES' || body.batchId !== 'STARNET-20260930') {
    return errorResponse('This endpoint only supports the approved StarNet Tech mock batch', 400)
  }
  if (!body.organizationId || !Array.isArray(body.users) || body.users.length !== 20) {
    return errorResponse('Exactly 20 users and the StarNet Tech organization are required', 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: organization, error: organizationError } = await userClient
    .from('organizations')
    .select('id, company_code, company_name')
    .eq('id', body.organizationId)
    .eq('company_code', body.organizationCode)
    .eq('company_name', 'StarNet Tech')
    .maybeSingle()
  if (organizationError || !organization) return errorResponse('The target organization was not found or is not accessible', 404)

  const { data: requesterProfile, error: profileLookupError } = await userClient
    .from('profiles')
    .select('account_status')
    .eq('id', requester.id)
    .eq('organization_id', organization.id)
    .maybeSingle()
  const { data: requesterMembership, error: membershipLookupError } = await userClient
    .from('memberships')
    .select('role')
    .eq('user_id', requester.id)
    .eq('organization_id', organization.id)
    .in('role', ['Super Administrator', 'Organization Administrator'])
    .maybeSingle()
  if (profileLookupError || membershipLookupError) return errorResponse('Unable to verify administrator access', 403)
  if (requesterProfile?.account_status !== 'active' || !requesterMembership) {
    return errorResponse('Only an active organization administrator can create this mock batch', 403)
  }

  const { data: settings, error: settingsError } = await userClient
    .from('company_settings')
    .select('departments, operational_sites')
    .eq('organization_id', organization.id)
    .single()
  if (settingsError || !settings) return errorResponse('Organization Settings could not be loaded', 400)

  const users = body.users.map((user, index) => {
    const fullName = user.fullName?.trim().replace(/\s+/g, ' ') || ''
    const email = user.email?.trim().toLowerCase() || ''
    const role = user.role?.trim() || ''
    const department = user.department?.trim() || ''
    const siteLocation = user.siteLocation?.trim() || ''
    const nameParts = fullName.split(' ')
    const expectedEmail = nameParts.length === 2 ? `${nameParts[0]}.${nameParts[1]}@example.com`.toLowerCase() : ''
    return {
      fullName,
      email,
      role,
      department,
      siteLocation,
      employeeId: `MOCK-${body.batchId}-${String(index + 1).padStart(2, '0')}`,
      employmentType: role === 'Contractor' ? 'contractor' : 'employee',
      expectedEmail,
    }
  })

  const requestedEmails = new Set<string>()
  const requestedEmployeeIds = new Set<string>()
  for (const user of users) {
    if (!user.fullName || !user.email || user.email !== user.expectedEmail) {
      return errorResponse('Every email must be lowercase firstname.lastname@example.com and match its name', 400)
    }
    if (requestedEmails.has(user.email) || requestedEmployeeIds.has(user.employeeId)) {
      return errorResponse('Duplicate email or mock employee ID in the batch', 400)
    }
    requestedEmails.add(user.email)
    requestedEmployeeIds.add(user.employeeId)
    if (!allowedRoles.has(user.role)) return errorResponse(`Role is not permitted for mock users: ${user.role}`, 400)
    if (!isConfiguredEntryActive(settings.departments, user.department)) {
      return errorResponse(`Department is not active in Settings: ${user.department}`, 400)
    }
    if (!isConfiguredEntryActive(settings.operational_sites, user.siteLocation)) {
      return errorResponse(`Site is not active in Settings: ${user.siteLocation}`, 400)
    }
  }

  const { data: siteRows, error: siteError } = await userClient
    .from('sites')
    .select('name')
    .eq('organization_id', organization.id)
  if (siteError) return errorResponse('Unable to validate organization sites', 400)
  const siteNames = new Set((siteRows ?? []).map((site) => site.name.trim().toLowerCase()))
  const missingSite = users.find((user) => !siteNames.has(user.siteLocation.toLowerCase()))
  if (missingSite) return errorResponse(`Site has no relational site record: ${missingSite.siteLocation}`, 400)

  const existingAuthUsers = new Map<string, { id: string; user_metadata: Record<string, unknown> }>()
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return errorResponse('Unable to preflight existing Auth users', 500)
    for (const existingUser of data.users) {
      if (existingUser.email) existingAuthUsers.set(existingUser.email.toLowerCase(), {
        id: existingUser.id,
        user_metadata: existingUser.user_metadata ?? {},
      })
    }
    if (data.users.length < 1000) break
    if (page === 100) return errorResponse('Auth user preflight exceeded the supported page limit', 500)
  }

  const existingAuthIds = users.map((user) => existingAuthUsers.get(user.email)?.id).filter((id): id is string => Boolean(id))
  const existingProfiles = new Map<string, { id: string; employee_id: string | null; full_name: string; department: string | null; site_location: string | null; account_status: string }>()
  const existingRoles = new Map<string, string>()
  if (existingAuthIds.length) {
    const [{ data: profiles, error: existingProfileError }, { data: memberships, error: existingMembershipError }] = await Promise.all([
      adminClient.from('profiles').select('id, employee_id, full_name, department, site_location, account_status').eq('organization_id', organization.id).in('id', existingAuthIds),
      adminClient.from('memberships').select('user_id, role').eq('organization_id', organization.id).in('user_id', existingAuthIds),
    ])
    if (existingProfileError || existingMembershipError) return errorResponse('Unable to verify existing mock profiles', 500)
    for (const profile of profiles ?? []) existingProfiles.set(profile.id, profile)
    for (const membership of memberships ?? []) existingRoles.set(membership.user_id, membership.role)
  }

  const alreadyExisting: Array<Record<string, string>> = []
  for (const user of users) {
    const existingAuth = existingAuthUsers.get(user.email)
    if (!existingAuth) continue
    const profile = existingProfiles.get(existingAuth.id)
    const isSameBatch = existingAuth.user_metadata.mock_batch_id === body.batchId
      && existingAuth.user_metadata.is_mock === true
      && profile?.employee_id === user.employeeId
      && profile.full_name === user.fullName
      && profile.department === user.department
      && profile.site_location === user.siteLocation
      && profile.account_status === 'active'
      && existingRoles.get(existingAuth.id) === user.role
    if (!isSameBatch) return errorResponse(`Email is already registered and is not this batch's mock account: ${user.email}`, 409)
    alreadyExisting.push({ id: existingAuth.id, fullName: user.fullName, email: user.email, role: user.role, department: user.department, siteLocation: user.siteLocation, employeeId: user.employeeId })
  }

  const newUsers = users.filter((user) => !existingAuthUsers.has(user.email))
  const createdAuthUsers: Array<{ id: string; input: typeof users[number]; temporaryPassword: string }> = []
  for (const user of newUsers) {
    const temporaryPassword = createTemporaryPassword()
    const { data, error } = await adminClient.auth.admin.createUser({
      email: user.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        is_mock: true,
        mock_batch_id: body.batchId,
      },
    })
    if (error || !data.user) {
      await Promise.all(createdAuthUsers.map(({ id }) => adminClient.auth.admin.deleteUser(id)))
      return errorResponse(`Unable to create Auth user ${user.email}: ${error?.message ?? 'No user returned'}`, 500)
    }
    createdAuthUsers.push({ id: data.user.id, input: user, temporaryPassword })
  }

  const profileRows = createdAuthUsers.map(({ id, input }) => ({
    id,
    organization_id: organization.id,
    employee_id: input.employeeId,
    full_name: input.fullName,
    department: input.department,
    job_title: input.role,
    site_location: input.siteLocation,
    employment_type: input.employmentType,
    account_status: 'active',
  }))
  const membershipRows = createdAuthUsers.map(({ id, input }) => ({
    user_id: id,
    organization_id: organization.id,
    role: input.role,
  }))

  if (profileRows.length) {
    const { error } = await adminClient.from('profiles').insert(profileRows)
    if (error) {
      await Promise.all(createdAuthUsers.map(({ id }) => adminClient.auth.admin.deleteUser(id)))
      return errorResponse(`Unable to create mock profiles: ${error.message}`, 500)
    }

    const { error: membershipError } = await adminClient.from('memberships').insert(membershipRows)
    if (membershipError) {
      await adminClient.from('profiles').delete().eq('organization_id', organization.id).in('id', createdAuthUsers.map(({ id }) => id))
      await Promise.all(createdAuthUsers.map(({ id }) => adminClient.auth.admin.deleteUser(id)))
      return errorResponse(`Unable to create mock memberships: ${membershipError.message}`, 500)
    }
  }

  const allUsers = [
    ...alreadyExisting.map((user) => ({ ...user, temporaryPassword: null as string | null })),
    ...createdAuthUsers.map(({ id, input, temporaryPassword }) => ({
      id,
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      department: input.department,
      siteLocation: input.siteLocation,
      employeeId: input.employeeId,
      temporaryPassword,
    })),
  ]
  await adminClient.from('activity_logs').insert({
    organization_id: organization.id,
    user_id: requester.id,
    activity: 'Mock user batch created',
    metadata: { mock_batch_id: body.batchId, created_count: createdAuthUsers.length, already_existing_count: alreadyExisting.length, user_ids: allUsers.map((user) => user.id) },
  })

  return new Response(JSON.stringify({
    success: true,
    organizationId: organization.id,
    batchId: body.batchId,
    createdCount: createdAuthUsers.length,
    alreadyExistingCount: alreadyExisting.length,
    users: allUsers,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

function createTemporaryPassword() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
