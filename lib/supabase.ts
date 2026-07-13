import { createClient } from '@supabase/supabase-js'

// Build-time prerendering can run without env vars. We only substitute a
// syntactically-valid placeholder when the value is genuinely missing, so that
// createClient never throws "Invalid supabaseUrl" during build. At runtime the
// real environment variables are present and used as-is.
const FALLBACK_URL = 'https://placeholder.supabase.co'

function resolveUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return FALLBACK_URL
}

const supabaseUrl = resolveUrl()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim() || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const getServiceClient = () =>
  createClient(
    resolveUrl(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() || 'placeholder-service-key'
  )
