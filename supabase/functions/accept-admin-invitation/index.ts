import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function recordActivity(client: ReturnType<typeof createClient>, organizationId: string, userId: string, activity: string, metadata: Record<string, unknown> = {}) {
  await client.from('activity_logs').insert({ organization_id: organizationId, user_id: userId, activity, metadata })
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
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user || !user.email) throw new Error('Invalid authentication token')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const normalizedEmail = user.email.trim().toLowerCase()
    const { data: pendingInvitation, error: invitationError } = await adminClient
      .from('admin_invitations')
      .select('id, organization_id, invited_user_id, invitee_email, expires_at, status')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (invitationError) throw new Error(invitationError.message)
    if (!pendingInvitation) {
      return new Response(JSON.stringify({ accepted: false, reason: 'no_pending_invitation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (pendingInvitation.invitee_email !== normalizedEmail || pendingInvitation.invited_user_id !== user.id) {
      throw new Error('Invitation identity does not match the authenticated account')
    }

    if (new Date(pendingInvitation.expires_at).getTime() <= Date.now()) {
      await adminClient.from('admin_invitations').update({ status: 'expired' }).eq('id', pendingInvitation.id).eq('status', 'pending')
      await recordActivity(adminClient, pendingInvitation.organization_id, user.id, 'Invitation expired')
      throw new Error('This invitation has expired')
    }

    const { data: organization, error: organizationError } = await adminClient
      .from('organizations')
      .select('company_name')
      .eq('id', pendingInvitation.organization_id)
      .single()
    if (organizationError || !organization) throw new Error('The invitation organization is no longer available')

    const { data: invitationDetails, error: detailsError } = await adminClient
      .from('admin_invitations')
      .select('department, role, invitee_email, expires_at')
      .eq('id', pendingInvitation.id)
      .single()
    if (detailsError || !invitationDetails) throw new Error('Unable to load invitation details')

    const requestBody = await request.json().catch(() => ({})) as { fullName?: string; employeeId?: string }
    if (!requestBody.fullName && !requestBody.employeeId) {
      return new Response(JSON.stringify({ invitation: {
        inviteeEmail: invitationDetails.invitee_email,
        organizationName: organization.company_name,
        department: invitationDetails.department,
        role: invitationDetails.role,
        expiresAt: invitationDetails.expires_at,
      } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fullName = requestBody.fullName?.trim() || ''
    const employeeId = requestBody.employeeId?.trim() || ''
    if (!fullName || !employeeId) throw new Error('Full name and employee ID are required')

    const { data: acceptance, error: acceptError } = await userClient.rpc('complete_admin_invitation', {
      p_full_name: fullName,
      p_employee_id: employeeId,
    })
    if (acceptError || !acceptance?.accepted) throw new Error(acceptError?.message || 'This invitation could not be accepted')

    await recordActivity(adminClient, acceptance.organization_id, user.id, 'Invitation accepted', { department_name: acceptance.department, role: acceptance.role })

    return new Response(JSON.stringify({ accepted: true, organizationId: acceptance.organization_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
