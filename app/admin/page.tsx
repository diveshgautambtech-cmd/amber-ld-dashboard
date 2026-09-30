'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

const MONTH_ORDER = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']
function sortMonths(list: string[]) {
  return [...list].sort((a, b) => {
    const ia = MONTH_ORDER.indexOf(a), ib = MONTH_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

async function fetchAllRows(table: string, applyFilters?: (q: any) => any) {
  const pageSize = 1000
  let from = 0
  let all: any[] = []
  while (true) {
    let q = supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (applyFilters) q = applyFilters(q)
    const { data, error } = await q
    if (error) { console.error(`fetchAllRows(${table})`, error); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'sessions' | 'spocs' | 'uploads' | 'passwords'>('sessions')
  const [sessions, setSessions] = useState<any[]>([])
  const [spocs, setSpocs] = useState<any[]>([])
  const [pwdLog, setPwdLog] = useState<any[]>([])
  const [resetCode, setResetCode] = useState('')
  const [resetPwd, setResetPwd] = useState('')
  const [msg, setMsg] = useState('')

  // SPOC uploads tab
  const [training, setTraining] = useState<any[]>([])
  const [uMonth, setUMonth] = useState('All')
  const [uMonths, setUMonths] = useState<string[]>([])
  const [uLoading, setULoading] = useState(false)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) router.replace('/login')
    if (user?.role === 'admin') fetchData()
  }, [user, loading])

  useEffect(() => {
    if (user?.role === 'admin' && tab === 'uploads' && training.length === 0) fetchTraining()
  }, [tab, user])

  async function fetchData() {
    const { data: sess } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50)
    const { data: spocData } = await supabase.from('spoc_users').select('id, emp_code, name, branch, email, role').order('name')
    const { data: pwdData } = await supabase.from('password_reset_log').select('*').order('created_at', { ascending: false }).limit(50)
    if (sess) setSessions(sess)
    if (spocData) setSpocs(spocData)
    if (pwdData) setPwdLog(pwdData)
  }

  async function fetchTraining() {
    setULoading(true)
    const rows = await fetchAllRows('training_mis')
    setTraining(rows)
    setUMonths(sortMonths([...new Set(rows.map((r: any) => r.month).filter(Boolean))] as string[]))
    setULoading(false)
  }

  function downloadSpocList() {
    if (!spocs.length) return
    const data = spocs.map((s, i) => ({
      'Sr.No.': i + 1, 'Employee Code': s.emp_code || '', 'Name': s.name || '',
      'Branch': s.branch || '', 'Email': s.email || '', 'Role': s.role || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 34 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'SPOC Directory')
    XLSX.writeFile(wb, `SPOC_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ---- SPOC uploads: summary + download ----
  const scopedRows = uMonth === 'All' ? training : training.filter((r: any) => r.month === uMonth)

  const summary = (() => {
    const by: Record<string, { branch: string; month: string; rows: number; manhours: number; uploaded_by: Set<string>; last: string }> = {}
    scopedRows.forEach((r: any) => {
      const key = `${r.branch || 'Unknown'}||${r.month || '—'}`
      if (!by[key]) by[key] = { branch: r.branch || 'Unknown', month: r.month || '—', rows: 0, manhours: 0, uploaded_by: new Set(), last: '' }
      by[key].rows++
      by[key].manhours += Number(r.total_man_hours) || 0
      if (r.uploaded_by) by[key].uploaded_by.add(String(r.uploaded_by))
      const t = r.created_at || r.updated_at || ''
      if (t && (!by[key].last || t > by[key].last)) by[key].last = t
    })
    return Object.values(by).map(v => ({ ...v, manhours: Math.round(v.manhours), uploaded_by: Array.from(v.uploaded_by).join(', ') }))
      .sort((a, b) => (sortMonths([a.month, b.month])[0] === a.month ? -1 : 1) || a.branch.localeCompare(b.branch))
  })()

  function rowForExport(r: any) {
    return {
      'Employee Code': r.emp_code || '', 'Employee Name': r.emp_name || '', 'Month': r.month || '',
      'Branch': r.branch || '', 'Grade': r.grade || '', 'Employee Category': r.employee_category || '',
      'Designation': r.designation || '', 'Department': r.department || '', 'Gender': r.gender || '',
      'Training Categories': r.training_categories || '', 'Total Manhours': Number(r.total_man_hours) || 0,
      'Uploaded By': r.uploaded_by || '',
    }
  }

  function downloadCurrentMonth() {
    if (!scopedRows.length) return
    const ws = XLSX.utils.json_to_sheet(scopedRows.map(rowForExport))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (uMonth === 'All' ? 'All' : uMonth).slice(0, 28))
    XLSX.writeFile(wb, `SPOC_Uploads_${uMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function downloadAllMonths() {
    if (!training.length) return
    const wb = XLSX.utils.book_new()
    // one sheet per month
    sortMonths([...new Set(training.map((r: any) => r.month).filter(Boolean))] as string[]).forEach(m => {
      const rows = training.filter((r: any) => r.month === m).map(rowForExport)
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, String(m).slice(0, 28))
    })
    XLSX.writeFile(wb, `SPOC_Uploads_AllMonths_${new Date().toISOString().slice(0, 10)}.xlsx`)
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

  const TABS = [['sessions', '📋 Session Log'], ['spocs', '👥 SPOC Directory'], ['uploads', '📥 SPOC Uploads'], ['passwords', '🔑 Password Management']] as const

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="card p-6">
          <h1 className="font-display font-bold text-xl" style={{ color: '#153F90' }}>🔍 Admin Panel — SPOC Audit</h1>
          <p className="text-sm" style={{ color: '#64748b', marginTop: '4px' }}>Session logs · SPOC directory · Uploaded data · Password management</p>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
              <h3 style={{ fontWeight: 700, color: '#153F90', margin: 0 }}>👥 SPOC Directory <span style={{ fontSize: '13px', fontWeight: 400, color: '#94a3b8' }}>({spocs.length} accounts)</span></h3>
              <button onClick={downloadSpocList}
                style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', border: '1px solid #16a34a', background: 'white', color: '#15803d' }}>
                ⬇ Download Excel
              </button>
            </div>
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
              {spocs.length === 0 && <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>No SPOCs found.</div>}
            </div>
          </div>
        )}

        {tab === 'uploads' && (
          <div className="card p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, color: '#153F90', margin: 0 }}>📥 SPOC Uploaded Data <span style={{ fontSize: '13px', fontWeight: 400, color: '#94a3b8' }}>({scopedRows.length.toLocaleString()} rows)</span></h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Month:</span>
                <select value={uMonth} onChange={e => setUMonth(e.target.value)}
                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#153F90' }}>
                  <option value="All">All Months</option>
                  {uMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={downloadCurrentMonth} disabled={!scopedRows.length}
                  style={{ padding: '8px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: scopedRows.length ? 'pointer' : 'not-allowed', border: '1px solid #16a34a', background: 'white', color: '#15803d', opacity: scopedRows.length ? 1 : 0.5 }}>
                  ⬇ Download {uMonth === 'All' ? '(All in 1 sheet)' : uMonth}
                </button>
                <button onClick={downloadAllMonths} disabled={!training.length}
                  style={{ padding: '8px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: training.length ? 'pointer' : 'not-allowed', border: 'none', background: '#153F90', color: 'white', opacity: training.length ? 1 : 0.5 }}>
                  ⬇ Download All Months (sheet per month)
                </button>
              </div>
            </div>

            {uLoading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>Loading uploaded data…</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Branch', 'Month', 'Rows', 'Total Manhours', 'Uploaded By', 'Last Upload'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.branch}</td>
                        <td style={{ padding: '10px 16px', color: '#475569' }}>{s.month}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#153F90' }}>{s.rows.toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', color: '#D97706', fontWeight: 600 }}>{s.manhours.toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '13px' }}>{s.uploaded_by || '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b' }}>{s.last ? new Date(s.last).toLocaleString('en-IN') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summary.length === 0 && <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>No uploaded data for this month.</div>}
              </div>
            )}
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
