'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { downloadExcelReport } from '@/lib/exportExcel'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'

const BRAND = '#153F90'
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

export default function ManhoursPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('All')
  const [grade, setGrade] = useState('All')
  const [viewBy, setViewBy] = useState<'Branch' | 'Grade' | 'Month'>('Branch')
  const [months, setMonths] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])

  // scoped raw data (after month + grade filters)
  const [training, setTraining] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [scopedMonthRows, setScopedMonthRows] = useState<any[]>([])

  useEffect(() => { fetchData() }, [user, period, grade])

  async function fetchData() {
    setLoading(true)
    try {
      let tr = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        if (period !== 'All') qq = qq.eq('month', period)
        return qq
      })
      let emp = await fetchAllRows('employee_master', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })
      const monthRows = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })
      if (!tr || !emp) { setLoading(false); return }

      setMonths(sortMonths([...new Set(monthRows.map((r: any) => r.month).filter(Boolean))] as string[]))
      setGrades([...new Set(emp.map((e: any) => e.grade).filter(Boolean))].sort() as string[])

      let mRows = monthRows
      if (grade !== 'All') {
        const valid = new Set<string>()
        emp.forEach((e: any) => { if ((e.grade || '') === grade && e.emp_code) valid.add(String(e.emp_code).toLowerCase()) })
        emp = emp.filter((e: any) => (e.grade || '') === grade)
        tr = tr.filter((r: any) => r.emp_code && valid.has(String(r.emp_code).toLowerCase()))
        mRows = monthRows.filter((r: any) => r.emp_code && valid.has(String(r.emp_code).toLowerCase()))
      }
      setTraining(tr); setEmployees(emp); setScopedMonthRows(mRows)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // ---- headline totals ----
  const totals = useMemo(() => {
    const totalEmployees = employees.length
    const totalHours = Math.round(training.reduce((a: number, r: any) => a + (Number(r.total_man_hours) || 0), 0))
    const sessions = training.filter((r: any) => (Number(r.total_man_hours) || 0) > 0).length
    const avg = totalEmployees ? +(totalHours / totalEmployees).toFixed(1) : 0   // Total Hours / Total Employees
    return { totalEmployees, totalHours, sessions, avg }
  }, [training, employees])

  // ---- summary table (View by Branch / Grade / Month) ----
  const summary = useMemo(() => {
    const rows: { key: string; emp: number; hours: number; sessions: number; avg: number }[] = []

    if (viewBy === 'Month') {
      const totalEmp = employees.length
      const byM: Record<string, { hours: number; sessions: number }> = {}
      training.forEach((r: any) => {
        const m = r.month; if (!m) return
        if (!byM[m]) byM[m] = { hours: 0, sessions: 0 }
        const h = Number(r.total_man_hours) || 0
        byM[m].hours += h
        if (h > 0) byM[m].sessions++
      })
      sortMonths(Object.keys(byM)).forEach(m => {
        const v = byM[m]
        rows.push({ key: m, emp: totalEmp, hours: Math.round(v.hours), sessions: v.sessions, avg: totalEmp ? +(v.hours / totalEmp).toFixed(1) : 0 })
      })
    } else {
      const field = viewBy === 'Branch' ? 'branch' : 'grade'
      const empCount: Record<string, number> = {}
      employees.forEach((e: any) => { const k = String(e[field] || 'Unknown').trim(); empCount[k] = (empCount[k] || 0) + 1 })
      const agg: Record<string, { hours: number; sessions: number }> = {}
      training.forEach((r: any) => {
        const k = String(r[field] || 'Unknown').trim()
        if (!agg[k]) agg[k] = { hours: 0, sessions: 0 }
        const h = Number(r.total_man_hours) || 0
        agg[k].hours += h
        if (h > 0) agg[k].sessions++
      })
      const keys = [...new Set([...Object.keys(empCount), ...Object.keys(agg)])]
      keys.forEach(k => {
        const e = empCount[k] || 0
        const h = agg[k]?.hours || 0
        rows.push({ key: k, emp: e, hours: Math.round(h), sessions: agg[k]?.sessions || 0, avg: e ? +(h / e).toFixed(1) : 0 })
      })
      rows.sort((a, b) => b.hours - a.hours)
    }
    return rows
  }, [training, employees, viewBy])

  // ---- charts ----
  const branchHours = useMemo(() => {
    const by: Record<string, number> = {}
    training.forEach((r: any) => { if (r.branch) by[r.branch] = (by[r.branch] || 0) + (Number(r.total_man_hours) || 0) })
    return Object.entries(by).map(([branch, h]) => ({ branch, hours: Math.round(h as number) })).sort((a, b) => b.hours - a.hours)
  }, [training])

  const gradeData = useMemo(() => {
    const by: Record<string, number> = {}
    training.forEach((r: any) => { if (r.grade) by[r.grade] = (by[r.grade] || 0) + (Number(r.total_man_hours) || 0) })
    return Object.entries(by).map(([g, h]) => ({ grade: g, hours: Math.round(h as number) })).sort((a, b) => b.hours - a.hours)
  }, [training])

  // Monthly trend = AVG hrs per employee per month (Total Hours / Total Employees)
  const monthlyData = useMemo(() => {
    const totalEmp = employees.length
    const byMonth: Record<string, number> = {}
    scopedMonthRows.forEach((r: any) => { if (r.month) byMonth[r.month] = (byMonth[r.month] || 0) + (Number(r.total_man_hours) || 0) })
    return sortMonths(Object.keys(byMonth)).map(m => ({ month: m, avg: totalEmp ? +(byMonth[m] / totalEmp).toFixed(2) : 0 }))
  }, [scopedMonthRows, employees])

  const griMet = totals.avg >= 8
  const viewLabel = viewBy === 'Branch' ? 'Branch / Unit' : viewBy === 'Grade' ? 'Grade' : 'Month'

  return (
    <div className="space-y-6">
      {user?.role === 'spoc' && (
        <div className="spoc-banner"><span>🔒</span><span>Manhours data for <strong>{user.branch}</strong> only</span></div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter by Month:</span>
        {['All', ...months].map(m => (
          <button key={m} onClick={() => setPeriod(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border
              ${period === m ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
            {m}
          </button>
        ))}
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">Grade:</span>
        <select value={grade} onChange={e => setGrade(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 text-slate-600 bg-white focus:border-[#153F90] outline-none">
          <option value="All">All Grades</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => downloadExcelReport(user, period, grade)}
          className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold border border-green-600 text-green-700 hover:bg-green-600 hover:text-white transition-all">
          ⬇ Export Excel
        </button>
      </div>

      {loading ? <div className="card p-12 text-center text-slate-500">Loading...</div> : (
        <>
          {/* Summary table (replaces KPI cards) */}
          <div className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-display font-bold text-sm text-[#153F90]">Manhours Summary</h3>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">View by:</span>
                <select value={viewBy} onChange={e => setViewBy(e.target.value as any)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 text-slate-700 bg-white focus:border-[#153F90] outline-none">
                  <option value="Branch">Branch</option>
                  <option value="Grade">Grade</option>
                  <option value="Month">Month</option>
                </select>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: griMet ? '#16A34A20' : '#DC262620', color: griMet ? '#16A34A' : '#DC2626' }}>
                🎯 GRI 404-1 Target: ≥ 8 hrs/employee · Current {totals.avg}h {griMet ? '✓' : ''}
              </span>
            </div>

            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3 text-left">{viewLabel}</th>
                    <th className="px-4 py-3 text-center">Employees</th>
                    <th className="px-4 py-3 text-center">Total Manhours</th>
                    <th className="px-4 py-3 text-center">Avg Hrs / Employee</th>
                    <th className="px-4 py-3 text-center">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.map(r => (
                    <tr key={r.key} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold">{r.key}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{r.emp.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center font-semibold" style={{ color: '#D97706' }}>{r.hours.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center font-bold" style={{ color: r.avg >= 8 ? '#16A34A' : '#153F90' }}>{r.avg}h</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{r.sessions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold" style={{ background: '#EAF0FB' }}>
                    <td className="px-4 py-3">Grand Total</td>
                    <td className="px-4 py-3 text-center">{totals.totalEmployees.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center" style={{ color: '#D97706' }}>{totals.totalHours.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center" style={{ color: totals.avg >= 8 ? '#16A34A' : '#153F90' }}>{totals.avg}h</td>
                    <td className="px-4 py-3 text-center">{totals.sessions.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
              {summary.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No data for this filter.</div>}
            </div>
            <p className="text-xs text-slate-400 mt-3">Avg Hrs / Employee = Total Manhours ÷ Total Employees (all employees, whether trained or not).</p>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Manhours by Branch</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={branchHours.slice(0, 12)} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="branch" width={80} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [v + ' hrs', 'Manhours']} />
                  <Bar dataKey="hours" fill="#D97706" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Avg Manhours / Employee — Monthly Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [v + ' hrs/emp', 'Avg']} />
                  <Line type="monotone" dataKey="avg" stroke="#153F90" strokeWidth={2} dot={{ fill: '#153F90', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Manhours by Grade</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gradeData}>
                  <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [v + ' hrs', 'Manhours']} />
                  <Bar dataKey="hours" fill="#7C3AED" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
