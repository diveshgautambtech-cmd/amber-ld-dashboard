import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { empCode, password, role } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('spoc_users')
    .select('*')
    .eq('emp_code', empCode)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Employee Code not found.' })
  if (data.password !== password) return NextResponse.json({ error: 'Incorrect password.' })
  if (data.role !== role) return NextResponse.json({ error: 'Wrong login tab. Use ' + data.role + ' tab.' })

  // Log session
  await supabase.from('audit_log').insert({
    user_name: data.name, emp_code: data.emp_code,
    branch: data.branch, role: data.role, action: 'Login'
  })

  return NextResponse.json({
    user: {
      id: data.id, empCode: data.emp_code, name: data.name,
      role: data.role, branch: data.branch, email: data.email
    }
  })
}