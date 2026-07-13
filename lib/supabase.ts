import { createClient } from '@supabase/supabase-js'

// A syntactically valid placeholder URL so build-time prerendering never crashes
// with "Invalid supabaseUrl". At runtime in the browser the real
// NEXT_PUBLIC_SUPABASE_URL is injected and used instead.
const FALLBACK_URL = 'https://placeholder.supabase.co'

function safeUrl(value: string | undefined): string {
  if (!value) return FALLBACK_URL
  try {
    // createClient requires a valid http/https URL
    const u = new URL(value)
    if (u.protocol === 'http:' || u.protocol === 'https:') return value
    return FALLBACK_URL
  } catch {
    return FALLBACK_URL
  }
}

const supabaseUrl = safeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const getServiceClient = () =>
  createClient(
    safeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'
  )
