import { createClient } from 'npm:@supabase/supabase-js@2'

type InviteRequest = {
  organizationId: string
  email: string
  department?: string | null
  role: string
}

const builtInInviteRoles = new Set([
  'Organization Administrator',
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Authentication is required')

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user: requester }, error: requesterError } = await userClient.auth.getUser()
    if (requesterError || !requester) throw new Error('Invalid authentication token')

    const body = await request.json() as InviteRequest
    const { organizationId, email, department, role } = body
    if (!organizationId || !email || !role) throw new Error('Organization, email, and role are required')
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedRole = role.trim()
    if (!normalizedEmail || !normalizedRole) throw new Error('A valid email and role are required')

    const { data: membership } = await userClient
      .from('memberships')
      .select('role')
      .eq('user_id', requester.id)
      .eq('organization_id', organizationId)
      .in('role', ['Super Administrator', 'Organization Administrator'])
      .maybeSingle()
    if (!membership) throw new Error('Only organization administrators can invite users')

    if (!builtInInviteRoles.has(normalizedRole)) {
      const { data: customRole, error: roleError } = await userClient
        .from('custom_roles')
        .select('name')
        .eq('organization_id', organizationId)
        .eq('name', normalizedRole)
        .eq('is_active', true)
        .maybeSingle()
      if (roleError) throw new Error(roleError.message)
      if (!customRole) throw new Error('The selected role is not active in this organization')
    }

    const normalizedDepartment = typeof department === 'string' ? department.trim() : ''
    if (normalizedDepartment) {
      const { data: settings, error: settingsError } = await userClient
        .from('company_settings')
        .select('departments')
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (settingsError) throw new Error(settingsError.message)

      const configuredDepartments = Array.isArray(settings?.departments) ? settings.departments : []
      const departmentIsActive = configuredDepartments.some((item) => {
        if (typeof item === 'string') return item.trim() === normalizedDepartment
        if (!item || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string') return false
        return item.name.trim() === normalizedDepartment && item.active !== false
      })
      if (!departmentIsActive) throw new Error('The selected department is not active in this organization')
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: existingInvitation } = await adminClient
      .from('admin_invitations')
      .select('id, status, expires_at')
      .eq('organization_id', organizationId)
      .eq('invitee_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()
    if (existingInvitation) {
      if (new Date(existingInvitation.expires_at).getTime() > Date.now()) throw new Error('A pending invitation already exists for this email')
      await adminClient.from('admin_invitations').update({ status: 'expired' }).eq('id', existingInvitation.id).eq('status', 'pending')
    }

    const requestOrigin = request.headers.get('origin')
    const inviteRedirectUrl = Deno.env.get('INVITE_REDIRECT_URL') || (requestOrigin ? `${requestOrigin}/#/invite-signup` : undefined)
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, inviteRedirectUrl ? { redirectTo: inviteRedirectUrl } : undefined)
    if (inviteError || !invited.user) throw new Error(inviteError?.message || 'Unable to invite user')

    const derivedFullName = normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

    const { data: invitation, error: invitationError } = await adminClient.from('admin_invitations').insert({
      organization_id: organizationId,
      invitee_email: normalizedEmail,
      invited_user_id: invited.user.id,
      department: normalizedDepartment || null,
      role: normalizedRole,
      inviter_id: requester.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('id').single()
    if (invitationError || !invitation) {
      await adminClient.auth.admin.deleteUser(invited.user.id)
      throw new Error(invitationError?.message || 'Unable to create invitation record')
    }

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: invited.user.id,
      organization_id: organizationId,
      full_name: derivedFullName || 'Invited user',
      department: normalizedDepartment || null,
      account_status: 'pending',
    })
    if (profileError) {
      await adminClient.from('admin_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', invitation.id)
      await adminClient.auth.admin.deleteUser(invited.user.id)
      throw new Error(profileError.message)
    }

    const { error: membershipError } = await adminClient.from('memberships').insert({
      user_id: invited.user.id,
      organization_id: organizationId,
      role: normalizedRole,
    })
    if (membershipError) {
      await adminClient.from('admin_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', invitation.id)
      await adminClient.from('profiles').delete().eq('id', invited.user.id).eq('organization_id', organizationId)
      await adminClient.auth.admin.deleteUser(invited.user.id)
      throw new Error(membershipError.message)
    }

    return new Response(JSON.stringify({ success: true, invitationId: invitation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
