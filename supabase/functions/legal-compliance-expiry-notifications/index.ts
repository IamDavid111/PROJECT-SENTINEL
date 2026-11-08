import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendLegalComplianceExpiryEmail } from '../_shared/inviteEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ExpiryEmailClaim = {
  event_id: string
  organization_id: string
  obligation_name: string
  issuing_authority: string
  expiry_date: string
  days_before: 14 | 30
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) throw new Error('The compliance reminder service is not configured')

    const authorization = request.headers.get('Authorization')
    if (!authorization) return jsonResponse({ error: 'Authentication is required' }, 401)
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Invalid authentication token' }, 401)

    const { data: profile, error: profileError } = await client.from('profiles')
      .select('full_name, organization_id, account_status')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError || !profile || profile.account_status !== 'active') {
      return jsonResponse({ error: 'An active organization membership is required' }, 403)
    }
    const { data: organization, error: organizationError } = await client.from('organizations')
      .select('company_name')
      .eq('id', profile.organization_id)
      .maybeSingle()
    if (organizationError) throw new Error('Unable to verify the notification organization')

    let sent = 0
    let failed = 0
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error: claimError } = await client.rpc('claim_next_legal_compliance_expiry_email')
      if (claimError) throw new Error(claimError.message)
      const claim = (data as ExpiryEmailClaim[] | null)?.[0]
      if (!claim) break

      try {
        await sendLegalComplianceExpiryEmail({
          recipientEmail: user.email || '',
          recipientName: profile.full_name || user.email || 'Organization member',
          organizationName: organization?.company_name || 'your organization',
          obligationName: claim.obligation_name,
          issuingAuthority: claim.issuing_authority,
          expiryDate: claim.expiry_date,
          daysBefore: claim.days_before,
        })
        const { error: completionError } = await client.rpc('complete_legal_compliance_expiry_email', {
          target_event_id: claim.event_id,
          delivery_succeeded: true,
          failure_code: null,
        })
        if (completionError) throw new Error(completionError.message)
        sent += 1
      } catch (caught) {
        await client.rpc('complete_legal_compliance_expiry_email', {
          target_event_id: claim.event_id,
          delivery_succeeded: false,
          failure_code: caught instanceof Error ? caught.message : 'delivery_failed',
        })
        failed += 1
      }
    }

    return jsonResponse({ success: true, sent, failed })
  } catch (caught) {
    console.error(JSON.stringify({ event: 'legal_compliance_expiry_email_dispatch_failed', message: caught instanceof Error ? caught.message : 'Unexpected error' }))
    return jsonResponse({ success: false, error: 'Compliance reminder delivery failed' }, 500)
  }
})