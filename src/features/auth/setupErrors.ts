export type InvitationDetails = {
  inviteeEmail: string
  organizationName: string
  department: string | null
  role: string
  expiresAt: string
}

export const setupFailedMessage = 'We could not finish setting up your account. Please try again, or ask your administrator to send a new invitation.'

// Supabase returns raw database and function text (SQL errors, auth internals)
// that means nothing to the person filling this form. The detail goes to the
// console and stays visible in the network response, while the screen only ever
// shows client copy.
export function reportSetupFailure(stage: string, error: unknown) {
  console.error(`[invite-setup] ${stage}`, error)
}