import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { empCode, password, role } = await req.json()

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

    // Fail loudly-but-cleanly if server env vars are missing, instead of a 500 crash.
    if (!url || !serviceKey) {
      console.error('AUTH ENV MISSING', { hasUrl: !!url, hasServiceKey: !!serviceKey })
      return NextResponse.json(
        { error: 'Server configuration error. Please contact admin.' },
        { status: 200 }
      )
    }

    const supabase = createClient(url, serviceKey)

    const { data, error } = await supabase
      .from('spoc_users')
      .select('*')
      .eq('emp_code', empCode)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Employee Code not found.' })
    if (data.password !== password) return NextResponse.json({ error: 'Incorrect password.' })
    if (data.role !== role) return NextResponse.json({ error: 'Wrong login tab. Use ' + data.role + ' tab.' })

    // Log session (don't let a logging failure block login)
    try {
      await supabase.from('audit_log').insert({
        user_name: data.name, emp_code: data.emp_code,
        branch: data.branch, role: data.role, action: 'Login',
      })
    } catch (logErr) {
      console.error('audit_log insert failed', logErr)
    }

    return NextResponse.json({
      user: {
        id: data.id, empCode: data.emp_code, name: data.name,
        role: data.role, branch: data.branch, email: data.email,
      },
    })
  } catch (err: any) {
    console.error('AUTH ROUTE ERROR', err)
    return NextResponse.json(
      { error: 'Login failed: ' + (err?.message || 'unknown error') },
      { status: 200 }
    )
  }
}
