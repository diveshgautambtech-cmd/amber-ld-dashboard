import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { empCode, password, role } = await req.json()
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: rows } = await sb
      .from('spoc_users')
      .select('*')
      .eq('emp_code', empCode)
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Employee Code not found.' })
    }
    const user = rows[0]
    if (user.password !== password) {
      return NextResponse.json({ error: 'Incorrect password.' })
    }
    if (user.role !== role) {
      return NextResponse.json({ error: 'Wrong login tab.' })
    }
    return NextResponse.json({
      user: {
        id: user.id,
        empCode: user.emp_code,
        name: user.name,
        role: user.role,
        branch: user.branch,
        email: user.email
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}