'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { downloadExcelReport } from '@/lib/exportExcel'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'

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
  const [months, setMonths] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])

  const [stats, setStats] = useState({ totalEmployees: 0, totalHours: 0, avgHours: 0, sessions: 0 })
  const [branchHours, setBranchHours] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [gradeData, setGradeData] = useState<any[]>([])

  useEffect(() => { fetchData() }, [user, period, grade])

  async function fetchData() {
    setLoading(true)
    try {
      let training = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        if (period !== 'All') qq = qq.eq('month', period)
        return qq
      })
      let employees = await fetchAllRows('employee_master', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })
      const monthRows = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })

      if (!training || !employees) { setLoading(false); return }

      setMonths(sortMonths([...new Set(monthRows.map((r: any) => r.month).filter(Boolean))] as string[]))
      setGrades([...new Set(employees.map((e: any) => e.grade).filter(Boolean))].sort() as string[])

      // Grade scoping (by emp_code membership from employee_master)
      let scopedMonthRows = monthRows
      if (grade !== 'All') {
        const validCodes = new Set<string>()
        employees.forEach((e: any) => { if ((e.grade || '') === grade && e.emp_code) validCodes.add(String(e.emp_code).toLowerCase()) })
        employees = employees.filter((e: any) => (e.grade || '') === grade)
        training = training.filter((r: any) => r.emp_code && validCodes.has(String(r.emp_code).toLowerCase()))
        scopedMonthRows = monthRows.filter((r: any) => r.emp_code && validCodes.has(String(r.emp_code).toLowerCase()))
      }

      // ---- Manhours-focused KPIs ----
      const totalEmployees = employees.length
      const totalHours = Math.round(training.reduce((a: number, r: any) => a + (Number(r.total_man_hours) || 0), 0))
      const trainedCodes = new Set<string>()
      training.forEach((r: any) => { if ((Number(r.total_man_hours) || 0) > 0 && r.emp_code) trainedCodes.add(String(r.emp_code).toLowerCase()) })
      const avgHours = trainedCodes.size ? Math.round(totalHours / trainedCodes.size) : 0
      const sessions = training.filter((r: any) => (Number(r.total_man_hours) || 0) > 0).length
      setStats({ totalEmployees, totalHours, avgHours, sessions })

      // ---- Manhours breakdowns (respect month + grade) ----
      const byBranch: Record<string, number> = {}
      const byGrade: Record<string, number> = {}
      training.forEach((r: any) => {
        const h = Number(r.total_man_hours) || 0
        if (r.branch) byBranch[r.branch] = (byBranch[r.branch] || 0) + h
        if (r.grade) byGrade[r.grade] = (byGrade[r.grade] || 0) + h
      })
      setBranchHours(Object.entries(byBranch).map(([branch, hours]) => ({ branch, hours: Math.round(hours as number) })).sort((a, b) => b.hours - a.hours))
      setGradeData(Object.entries(byGrade).map(([g, hours]) => ({ grade: g, hours: Math.round(hours as number) })).sort((a, b) => b.hours - a.hours))

      // Monthly trend across all months (respect grade, ignore month filter)
      const byMonth: Record<string, number> = {}
      scopedMonthRows.forEach((r: any) => {
        if (!r.month) return
        byMonth[r.month] = (byMonth[r.month] || 0) + (Number(r.total_man_hours) || 0)
      })
      setMonthlyData(sortMonths(Object.keys(byMonth)).map(m => ({ month: m, hours: Math.round(byMonth[m]) })))

    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const avgAllEmp = stats.totalEmployees ? (stats.totalHours / stats.totalEmployees) : 0
  const kpiCards = [
    { label: 'Total Employees', value: stats.totalEmployees.toLocaleString(), color: '#153F90', icon: '👥' },
    { label: 'Total Manhours', value: stats.totalHours.toLocaleString(), color: '#D97706', icon: '⏱' },
    { label: 'Avg Hrs/Employee', value: `${stats.avgHours}h`, color: '#7C3AED', icon: '📈' },
    { label: 'Total Sessions', value: stats.sessions.toLocaleString(), color: '#0891B2', icon: '📚' },
    { label: 'GRI 404-1 Target', value: '≥ 8 hrs', color: avgAllEmp >= 8 ? '#16A34A' : '#DC2626', icon: '🎯' },
  ]

  return (
    <div className="space-y-6">
      {user?.role === 'spoc' && (
        <div className="spoc-banner"><span>🔒</span><span>Manhours data for <strong>{user.branch}</strong> only</span></div>
      )}

      {/* Filters (same as Coverage) */}
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

      {/* KPI Cards (manhours-focused) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map(k => (
          <div key={k.label} className="card p-5" style={{ borderLeft: `4px solid ${k.color}` }}>
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{k.label}</div>
            <div className="font-display font-bold text-2xl mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="card p-12 text-center text-slate-500">Loading...</div> : (
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
            <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Monthly Manhours Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [v + ' hrs', 'Manhours']} />
                <Line type="monotone" dataKey="hours" stroke="#153F90" strokeWidth={2} dot={{ fill: '#153F90', r: 4 }} />
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
      )}
    </div>
  )
}
