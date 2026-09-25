'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { downloadExcelReport } from '@/lib/exportExcel'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

interface BranchStat {
  branch: string
  total: number
  trained: number
  coverage: number
  hours: number
}

interface EmpRow {
  emp_code: string
  emp_name: string
  branch: string
  grade: string
  gender: string
  trained: boolean
  hours: number
  trainings: string[]
}

const COLORS = ['#153F90', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2']

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

function fmtHM(hours: number) {
  const totalMin = Math.round((Number(hours) || 0) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0 && m === 0) return '0 min'
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
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

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ total: 0, trained: 0, coverage: 0, totalHours: 0, avgHours: 0 })
  const [branchData, setBranchData] = useState<BranchStat[]>([])
  const [genderData, setGenderData] = useState<any[]>([])
  const [empRows, setEmpRows] = useState<EmpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('All')
  const [grade, setGrade] = useState('All')
  const [months, setMonths] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])

  const [rankView, setRankView] = useState<'top' | 'bottom' | 'all'>('top')
  const [empSearch, setEmpSearch] = useState('')
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | 'trained' | 'pending'>('all')

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

      if (grade !== 'All') {
        const validCodes = new Set<string>()
        employees.forEach((e: any) => { if ((e.grade || '') === grade && e.emp_code) validCodes.add(String(e.emp_code).toLowerCase()) })
        employees = employees.filter((e: any) => (e.grade || '') === grade)
        training = training.filter((r: any) => r.emp_code && validCodes.has(String(r.emp_code).toLowerCase()))
      }

      const trainingMap: Record<string, { hours: number; trained: boolean; trainings: Set<string> }> = {}
      training.forEach((r: any) => {
        const code = r.emp_code?.toLowerCase()
        if (!code) return
        if (!trainingMap[code]) trainingMap[code] = { hours: 0, trained: false, trainings: new Set() }
        trainingMap[code].hours += Number(r.total_man_hours) || 0
        if ((Number(r.total_man_hours) || 0) > 0) trainingMap[code].trained = true
        if (r.training_categories) trainingMap[code].trainings.add(String(r.training_categories))
      })

      const total = employees.length
      const trained = employees.filter((e: any) => trainingMap[e.emp_code?.toLowerCase()]?.trained).length
      const totalHours = Object.values(trainingMap).reduce((a, b) => a + b.hours, 0)
      setStats({
        total, trained,
        coverage: total > 0 ? Math.round((trained / total) * 100) : 0,
        totalHours: Math.round(totalHours),
        avgHours: total > 0 ? totalHours / total : 0,
      })

      const byBranch: Record<string, BranchStat> = {}
      employees.forEach((e: any) => {
        const b = e.branch || 'Unknown'
        if (!byBranch[b]) byBranch[b] = { branch: b, total: 0, trained: 0, coverage: 0, hours: 0 }
        byBranch[b].total++
        const t = trainingMap[e.emp_code?.toLowerCase()]
        if (t?.trained) byBranch[b].trained++
        byBranch[b].hours += t?.hours || 0
      })
      setBranchData(Object.values(byBranch).map(b => ({
        ...b,
        coverage: b.total > 0 ? Math.round((b.trained / b.total) * 100) : 0,
        hours: Math.round(b.hours),
      })).sort((a, b) => b.coverage - a.coverage))

      const byGender: Record<string, { total: number; trained: number }> = {}
      employees.forEach((e: any) => {
        const g = e.gender || 'Unknown'
        if (!byGender[g]) byGender[g] = { total: 0, trained: 0 }
        byGender[g].total++
        if (trainingMap[e.emp_code?.toLowerCase()]?.trained) byGender[g].trained++
      })
      setGenderData(Object.entries(byGender).map(([name, v]) => ({
        name, value: v.trained,
        coverage: v.total > 0 ? Math.round((v.trained / v.total) * 100) : 0,
      })))

      const rows: EmpRow[] = employees.map((e: any) => {
        const t = trainingMap[e.emp_code?.toLowerCase()]
        return {
          emp_code: e.emp_code || '', emp_name: e.emp_name || '', branch: e.branch || 'Unknown',
          grade: e.grade || '', gender: e.gender || '',
          trained: !!t?.trained, hours: Math.round(t?.hours || 0),
          trainings: t ? Array.from(t.trainings) : [],
        }
      }).sort((a, b) => (a.trained !== b.trained ? (a.trained ? -1 : 1) : a.branch.localeCompare(b.branch)))
      setEmpRows(rows)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // Top / Lowest coverage branch
  const withEmp = useMemo(() => branchData.filter(b => b.total > 0), [branchData])
  const topBranch = useMemo(() => withEmp.length ? withEmp.reduce((a, b) => b.coverage > a.coverage ? b : a) : null, [withEmp])
  const lowBranch = useMemo(() => withEmp.length ? withEmp.reduce((a, b) => b.coverage < a.coverage ? b : a) : null, [withEmp])

  // Ranked 10 (top or bottom) for chart + table
  const ranked = useMemo(() => {
    const s = [...withEmp]
    if (rankView === 'bottom') s.sort((a, b) => a.coverage - b.coverage || b.total - a.total)
    else s.sort((a, b) => b.coverage - a.coverage || b.total - a.total)
    return rankView === 'all' ? s : s.slice(0, 10)
  }, [withEmp, rankView])

  const filteredEmpRows = useMemo(() => {
    const term = empSearch.trim().toLowerCase()
    return empRows.filter(r => {
      if (empStatusFilter === 'trained' && !r.trained) return false
      if (empStatusFilter === 'pending' && r.trained) return false
      if (!term) return true
      return r.emp_code.toLowerCase().includes(term) || r.emp_name.toLowerCase().includes(term) || r.branch.toLowerCase().includes(term)
    })
  }, [empRows, empSearch, empStatusFilter])

  function exportEmpCSV() {
    const header = ['Employee Code', 'Name', 'Branch', 'Grade', 'Gender', 'Status', 'Total Hours', 'Trainings']
    const lines = filteredEmpRows.map(r => [r.emp_code, r.emp_name, r.branch, r.grade, r.gender, r.trained ? 'Trained' : 'Pending', r.hours, r.trainings.join('; ')].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `employee_coverage_${period}_${grade}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const kpiCards = [
    { label: 'Total Employees', value: stats.total.toLocaleString(), color: '#153F90', icon: '👥' },
    { label: 'Trained', value: stats.trained.toLocaleString(), color: '#16A34A', icon: '✅' },
    { label: 'Coverage %', value: `${stats.coverage}%`, color: stats.coverage >= 80 ? '#16A34A' : stats.coverage >= 60 ? '#D97706' : '#DC2626', icon: '📊' },
    { label: 'Total Manhours', value: stats.totalHours.toLocaleString(), color: '#D97706', icon: '⏱' },
    { label: 'Avg Hrs/Employee', value: fmtHM(stats.avgHours), color: '#7C3AED', icon: '📈' },
  ]

  const rankLabel = rankView === 'top' ? 'Top 10 Coverage Units' : rankView === 'bottom' ? 'Bottom 10 Coverage Units' : 'All Coverage Units'
  const rankColor = rankView === 'bottom' ? '#DC2626' : rankView === 'all' ? '#153F90' : '#16A34A'

  return (
    <div className="space-y-6">
      {user?.role === 'spoc' && (
        <div className="spoc-banner"><span>🔒</span><span>Viewing data for <strong>{user.branch}</strong> only</span></div>
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

      {loading ? (
        <div className="card p-12 text-center text-slate-500">Loading dashboard data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpiCards.map(k => (
              <div key={k.label} className="card p-5" style={{ borderLeft: `4px solid ${k.color}` }}>
                <div className="text-2xl mb-1">{k.icon}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{k.label}</div>
                <div className="font-display font-bold text-2xl mt-1" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Top / Lowest coverage highlight */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5" style={{ borderLeft: '4px solid #16A34A', background: '#F0FDF4' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#16A34A' }}>🏆 Highest Coverage Branch</div>
                  <div className="font-display font-bold text-xl mt-1 text-slate-800">{topBranch ? topBranch.branch : '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-2xl" style={{ color: '#16A34A' }}>{topBranch ? topBranch.coverage : 0}%</div>
                  <div className="text-xs text-slate-500">{topBranch ? `${topBranch.trained}/${topBranch.total} trained` : ''}</div>
                </div>
              </div>
            </div>
            <div className="card p-5" style={{ borderLeft: '4px solid #DC2626', background: '#FEF2F2' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#DC2626' }}>⚠️ Lowest Coverage Branch</div>
                  <div className="font-display font-bold text-xl mt-1 text-slate-800">{lowBranch ? lowBranch.branch : '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-2xl" style={{ color: '#DC2626' }}>{lowBranch ? lowBranch.coverage : 0}%</div>
                  <div className="text-xs text-slate-500">{lowBranch ? `${lowBranch.trained}/${lowBranch.total} trained` : ''}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top10 / Bottom10 toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Show:</span>
            <button onClick={() => setRankView('top')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all
                ${rankView === 'top' ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#16A34A]'}`}>
              🔝 Top 10 Units
            </button>
            <button onClick={() => setRankView('bottom')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all
                ${rankView === 'bottom' ? 'bg-[#DC2626] text-white border-[#DC2626]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#DC2626]'}`}>
              🔻 Bottom 10 Units
            </button>
            <button onClick={() => setRankView('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all
                ${rankView === 'all' ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
              📋 All Units
            </button>
          </div>

          {/* Chart + Gender */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">{rankLabel} — Coverage %</h3>
              <div style={{ maxHeight: 420, overflowY: rankView === 'all' ? 'auto' : 'visible' }}>
                <ResponsiveContainer width="100%" height={rankView === 'all' ? Math.max(320, ranked.length * 24) : 320}>
                  <BarChart data={ranked} layout="vertical" margin={{ left: 90 }}>
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="branch" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Coverage']} />
                    <Bar dataKey="coverage" fill={rankColor} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Gender-wise Trained Employees</h3>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={(entry: any) => `${entry.name}: ${entry.coverage}%`}>
                    {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: any, name: any, props: any) => [`${v} trained (${props.payload.coverage}%)`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranked branch table */}
          <div className="card p-5">
            <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">{rankLabel} <span className="text-xs font-normal text-slate-400">({ranked.length} units)</span></h3>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3 text-left">Rank</th>
                    <th className="px-4 py-3 text-left">Branch / Unit</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-center">Trained</th>
                    <th className="px-4 py-3 text-center">Gap</th>
                    <th className="px-4 py-3 text-left">Coverage</th>
                    <th className="px-4 py-3 text-center">Total Hrs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranked.map((b, i) => {
                    const color = b.coverage >= 80 ? '#16A34A' : b.coverage >= 60 ? '#D97706' : '#DC2626'
                    const status = b.coverage >= 80 ? 'Excellent' : b.coverage >= 60 ? 'On Track' : b.coverage >= 40 ? 'Needs Attention' : 'Critical Gap'
                    return (
                      <tr key={b.branch} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-400">#{i + 1}</td>
                        <td className="px-4 py-3 font-semibold">{b.branch}</td>
                        <td className="px-4 py-3 text-center">{b.total}</td>
                        <td className="px-4 py-3 text-center font-bold text-green-700">{b.trained}</td>
                        <td className="px-4 py-3 text-center font-bold text-red-600">{b.total - b.trained}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
                              <div className="h-full rounded-full" style={{ width: `${b.coverage}%`, background: color }} />
                            </div>
                            <span className="text-xs font-bold w-10" style={{ color }}>{b.coverage}%</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{status}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{b.hours.toLocaleString()} hrs</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {ranked.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No data for this filter.</div>}
            </div>
          </div>

          {/* Employee-wise Coverage */}
          <div className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-display font-bold text-sm text-[#153F90]">
                Employee-wise Coverage
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({filteredEmpRows.length} shown · {empRows.filter(r => r.trained).length} trained · {empRows.filter(r => !r.trained).length} pending)
                </span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search name / code / branch"
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 focus:border-[#153F90] outline-none w-56" />
                {(['all', 'trained', 'pending'] as const).map(s => (
                  <button key={s} onClick={() => setEmpStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border capitalize transition-all
                      ${empStatusFilter === s ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
                    {s}
                  </button>
                ))}
                <button onClick={exportEmpCSV}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border border-green-600 text-green-700 hover:bg-green-600 hover:text-white transition-all">
                  ⬇ Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3 text-left">Emp Code</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Branch</th>
                    <th className="px-4 py-3 text-left">Grade</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Hours</th>
                    <th className="px-4 py-3 text-left">Trainings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmpRows.slice(0, 500).map(r => (
                    <tr key={r.emp_code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.emp_code}</td>
                      <td className="px-4 py-2.5 font-semibold">{r.emp_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.branch}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{r.grade || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.trained
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#16A34A20', color: '#16A34A' }}>Trained</span>
                          : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#DC262620', color: '#DC2626' }}>Pending</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{r.hours || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{r.trainings.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEmpRows.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No employees match your filter.</div>}
              {filteredEmpRows.length > 500 && (
                <div className="text-center py-3 text-slate-400 text-xs">Showing first 500 of {filteredEmpRows.length}. Use search/filter or Export CSV for the full list.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
