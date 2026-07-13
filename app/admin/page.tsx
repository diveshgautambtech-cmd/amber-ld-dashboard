'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'

export default function AdminPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'sessions' | 'spocs' | 'passwords'>('sessions')
  const [sessions, setSessions] = useState<any[]>([])
  const [spocs, setSpocs] = useState<any[]>([])
  const [pwdLog, setPwdLog] = useState<any[]>([])
  const [resetCode, setResetCode] = useState('')
  const [resetPwd, setResetPwd] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) router.replace('/login')
    if (user?.role === 'admin') fetchData()
  }, [user, loading])

  async function fetchData() {
    const { data: sess } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50)
    const { data: spocData } = await supabase.from('spoc_users').select('id, emp_code, name, branch, email, role').order('name')
    const { data: pwdData } = await supabase.from('password_reset_log').select('*').order('created_at', { ascending: false }).limit(50)
    if (sess) setSessions(sess)
    if (spocData) setSpocs(spocData)
    if (pwdData) setPwdLog(pwdData)
  }

  async function handleResetPassword() {
    if (!resetCode || !resetPwd) { setMsg('Please fill both fields.'); return }
    if (resetPwd.length < 6) { setMsg('Password must be at least 6 characters.'); return }
    const { error } = await supabase.from('spoc_users').update({ password: resetPwd }).eq('emp_code', resetCode.toUpperCase())
    if (error) { setMsg('Error: ' + error.message); return }
    await supabase.from('password_reset_log').insert({ changed_by: user?.name, changed_by_role: 'Admin', account_changed: resetCode.toUpperCase(), branch: 'N/A', action: 'Admin Reset SPOC Password' })
    setMsg('✅ Password reset for ' + resetCode.toUpperCase())
    setResetCode(''); setResetPwd('')
    fetchData()
  }

  if (loading || !user || user.role !== 'admin') return null

  const TABS = [['sessions', '📋 Session Log'], ['spocs', '👥 SPOC Directory'], ['passwords', '🔑 Password Management']] as const

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="card p-6">
          <h1 className="font-display font-bold text-xl" style={{ color: '#153F90' }}>🔍 Admin Panel — SPOC Audit</h1>
          <p className="text-sm" style={{ color: '#64748b', marginTop: '4px' }}>Session logs · SPOC directory · Password management</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', border: tab === key ? 'none' : '1px solid #e2e8f0', background: tab === key ? '#153F90' : 'white', color: tab === key ? 'white' : '#475569', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'sessions' && (
          <div className="card p-5">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Name', 'Emp Code', 'Branch', 'Role', 'Action', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.user_name}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px' }}>{s.emp_code}</td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>{s.branch || '—'}</td>
                      <td style={{ padding: '10px 16px' }}><span className={s.role === 'admin' ? 'badge-admin' : 'badge-spoc'}>{s.role}</span></td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: s.action === 'Login' ? '#dcfce7' : '#f1f5f9', color: s.action === 'Login' ? '#15803d' : '#475569' }}>{s.action}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b' }}>{new Date(s.created_at).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sessions.length === 0 && <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>No sessions yet.</div>}
            </div>
          </div>
        )}

        {tab === 'spocs' && (
          <div className="card p-5">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['#', 'Employee Code', 'Name', 'Branch', 'Email', 'Role'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spocs.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#153F90', fontSize: '12px' }}>{s.emp_code}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>{s.branch || '—'}</td>
                      <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '12px' }}>{s.email || '—'}</td>
                      <td style={{ padding: '10px 16px' }}><span className={s.role === 'admin' ? 'badge-admin' : 'badge-spoc'}>{s.role}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'passwords' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card p-6">
              <h3 style={{ fontWeight: 700, color: '#153F90', marginBottom: '16px' }}>Reset any SPOC password</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <select value={resetCode} onChange={e => setResetCode(e.target.value)} className="input" style={{ flex: 1, minWidth: '200px' }}>
                  <option value="">— Select SPOC —</option>
                  {spocs.filter(s => s.role === 'spoc').map(s => (
                    <option key={s.id} value={s.emp_code}>{s.name} ({s.emp_code}) — {s.branch}</option>
                  ))}
                </select>
                <input className="input" type="password" placeholder="New password (min 6 chars)"
                  value={resetPwd} onChange={e => setResetPwd(e.target.value)} style={{ width: '220px' }} />
                <button onClick={handleResetPassword} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>🔄 Reset Password</button>
              </div>
              {msg && <div style={{ marginTop: '12px', fontSize: '14px', fontWeight: 600, color: msg.startsWith('✅') ? '#15803d' : '#dc2626' }}>{msg}</div>}
            </div>

            <div className="card p-5">
              <h3 style={{ fontWeight: 700, color: '#153F90', marginBottom: '16px' }}>Password Reset Log</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Changed By', 'Role', 'Account', 'Action', 'Time'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pwdLog.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{p.changed_by}</td>
                        <td style={{ padding: '10px 16px' }}><span className={p.changed_by_role === 'Admin' ? 'badge-admin' : 'badge-spoc'}>{p.changed_by_role}</span></td>
                        <td style={{ padding: '10px 16px', color: '#475569' }}>{p.account_changed}</td>
                        <td style={{ padding: '10px 16px' }}><span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: '9999px', display: 'inline-block' }}>{p.action}</span></td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b' }}>{new Date(p.created_at).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pwdLog.length === 0 && <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>No password resets yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
