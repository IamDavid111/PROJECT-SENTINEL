import { createClient } from '@supabase/supabase-js'

// The browser uses Supabase's public anon key, which relies on database policies to limit access.
// Never put a service-role key here; that privileged key belongs only in trusted server-side functions.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    // Restore browser sessions, refresh expiring tokens, and process Supabase auth redirects.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
