import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
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

    const body = await request.json()
    const { organizationId, email, fullName, role } = body
    if (!organizationId || !email || !fullName || !role) throw new Error('Organization, email, name, and role are required')

    const { data: membership } = await userClient
      .from('memberships')
      .select('role')
      .eq('user_id', requester.id)
      .eq('organization_id', organizationId)
      .in('role', ['Super Administrator', 'Organization Administrator'])
      .maybeSingle()
    if (!membership) throw new Error('Only organization administrators can invite users')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invited.user) throw new Error(inviteError?.message || 'Unable to invite user')

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: invited.user.id,
      organization_id: organizationId,
      full_name: fullName,
      account_status: 'pending',
    })
    if (profileError) throw new Error(profileError.message)

    const { error: membershipError } = await adminClient.from('memberships').insert({
      user_id: invited.user.id,
      organization_id: organizationId,
      role,
    })
    if (membershipError) throw new Error(membershipError.message)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
