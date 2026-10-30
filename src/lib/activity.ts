import { supabase } from './supabase'

/** Append a user-scoped activity row. */
export async function recordActivity(
  organizationId: string,
  userId: string,
  activity: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from('activity_logs').insert({ organization_id: organizationId, user_id: userId, activity, metadata })
}