const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send'

export type InviteEmailDetails = {
  inviteeEmail: string
  organizationName: string
  department: string | null
  role: string
  inviteUrl: string
  expiresInHours: number
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInviteEmail(details: InviteEmailDetails) {
  const organizationName = escapeHtml(details.organizationName)
  const department = details.department ? escapeHtml(details.department) : null
  const role = escapeHtml(details.role)
  const inviteUrl = escapeHtml(details.inviteUrl)

  const detailRows = [
    `<tr><td style="padding:6px 0;color:#5b6b7c;font-size:14px;">Organization</td><td style="padding:6px 0;color:#16212e;font-size:14px;font-weight:600;text-align:right;">${organizationName}</td></tr>`,
    department
      ? `<tr><td style="padding:6px 0;color:#5b6b7c;font-size:14px;">Department</td><td style="padding:6px 0;color:#16212e;font-size:14px;font-weight:600;text-align:right;">${department}</td></tr>`
      : '',
    `<tr><td style="padding:6px 0;color:#5b6b7c;font-size:14px;">Role</td><td style="padding:6px 0;color:#16212e;font-size:14px;font-weight:600;text-align:right;">${role}</td></tr>`,
  ]
    .filter(Boolean)
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;background:#eef2f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,32,48,0.08);">
            <tr>
              <td style="background:#16212e;padding:24px 32px;">
                <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">SentinelQHSE</div>
                <div style="color:#8fa3b8;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;">Safety Intelligence</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#16212e;">You have been invited</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3d4d5e;">An administrator at ${organizationName} has invited you to join their SentinelQHSE workspace. Set up your account to get started.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;border-radius:10px;padding:4px 16px;margin-bottom:24px;">
                  ${detailRows}
                </table>
                <a href="${inviteUrl}" style="display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:8px;">Set up your account</a>
                <p style="margin:20px 0 0;font-size:13px;color:#5b6b7c;">This link expires in ${details.expiresInHours} hours. If it expires, ask an administrator to send a new invitation.</p>
                <p style="margin:12px 0 0;font-size:12px;color:#8fa3b8;line-height:1.5;word-break:break-all;">If the button does not work, copy this link into your browser:<br />${inviteUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f6f8fa;padding:18px 32px;border-top:1px solid #e3e9ef;">
                <p style="margin:0;font-size:12px;color:#8fa3b8;">You are receiving this because an administrator invited this address to a SentinelQHSE workspace. If you were not expecting it, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`
}

export async function sendInviteEmail(details: InviteEmailDetails) {
  const serviceId = Deno.env.get('EMAILJS_SERVICE_ID')
  const templateId = Deno.env.get('EMAILJS_TEMPLATE_ID')
  const publicKey = Deno.env.get('EMAILJS_PUBLIC_KEY')
  // Required because EmailJS is in strict mode: "Allow EmailJS API for
  // non-browser applications" makes accessToken mandatory on every request.
  const privateKey = Deno.env.get('EMAILJS_PRIVATE_KEY')
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    throw new Error('Invitation email delivery is not configured')
  }

  // EmailJS requires a template on every send, so the dashboard template is a
  // thin shell: its subject line is {{subject}} and its body is {{{message}}},
  // with the actual HTML supplied here as a template parameter. Triple braces
  // are required because EmailJS escapes double-brace variables by default,
  // which would show the markup to the recipient as literal text. Every
  // interpolated value below is escaped by escapeHtml above.
  const response = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: details.inviteeEmail,
        to_name: details.inviteeEmail,
        from_name: 'SentinelQHSE',
        subject: `You've been invited to ${details.organizationName} on SentinelQHSE`,
        message: renderInviteEmail(details),
      },
    }),
  })

  if (!response.ok) {
    const failure = await response.text().catch(() => '')
    throw new Error(`Invitation email could not be sent (${response.status})${failure ? `: ${failure}` : ''}`)
  }

  return { inviteUrl: details.inviteUrl }
}
