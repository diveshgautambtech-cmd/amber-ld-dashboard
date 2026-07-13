'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
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
  gender: string
  trained: boolean
  hours: number
  trainings: string[]
}

const COLORS = ['#153F90', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2']

// Preferred financial-year month order; anything unknown gets pushed to the end alphabetically.
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

/**
 * Fetch ALL rows from a table, working around Supabase's default 1000-row cap.
 * It pages through with .range() until a short page comes back.
 */
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
  const [months, setMonths] = useState<string[]>([])

  // Employee table controls
  const [empSearch, setEmpSearch] = useState('')
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | 'trained' | 'pending'>('all')

  useEffect(() => { fetchData() }, [user, period])

  async function fetchData() {
    setLoading(true)
    try {
      // ---- Training rows (ALL of them, not just first 1000) ----
      const training = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        if (period !== 'All') qq = qq.eq('month', period)
        return qq
      })

      // ---- Employee master (ALL rows) ----
      const employees = await fetchAllRows('employee_master', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })

      if (!training || !employees) { setLoading(false); return }

      // Available months for the filter — fetch across the WHOLE table (ignoring the
      // current period filter) so all months always show as pills.
      const monthRows = await fetchAllRows('training_mis', (q) => {
        let qq = q
        if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
        return qq
      })
      const allMonths = [...new Set(monthRows.map((r: any) => r.month).filter(Boolean))] as string[]
      setMonths(sortMonths(allMonths))

      // Aggregate training by employee
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
        avgHours: total > 0 ? Math.round(totalHours / total) : 0,
      })

      // Branch breakdown
      const byBranch: Record<string, BranchStat> = {}
      employees.forEach((e: any) => {
        const b = e.branch || 'Unknown'
        if (!byBranch[b]) byBranch[b] = { branch: b, total: 0, trained: 0, coverage: 0, hours: 0 }
        byBranch[b].total++
        const t = trainingMap[e.emp_code?.toLowerCase()]
        if (t?.trained) byBranch[b].trained++
        byBranch[b].hours += t?.hours || 0
      })
      const branchArr = Object.values(byBranch).map(b => ({
        ...b,
        coverage: b.total > 0 ? Math.round((b.trained / b.total) * 100) : 0,
        hours: Math.round(b.hours),
      })).sort((a, b) => b.coverage - a.coverage)
      setBranchData(branchArr)

      // Gender breakdown
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

      // ---- Employee-wise coverage rows (trained + pending) ----
      const rows: EmpRow[] = employees.map((e: any) => {
        const t = trainingMap[e.emp_code?.toLowerCase()]
        return {
          emp_code: e.emp_code || '',
          emp_name: e.emp_name || '',
          branch: e.branch || 'Unknown',
          gender: e.gender || '',
          trained: !!t?.trained,
          hours: Math.round(t?.hours || 0),
          trainings: t ? Array.from(t.trainings) : [],
        }
      }).sort((a, b) => {
        if (a.trained !== b.trained) return a.trained ? -1 : 1 // trained first
        return a.branch.localeCompare(b.branch)
      })
      setEmpRows(rows)

    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // Filtered employee rows for the drill-down table
  const filteredEmpRows = useMemo(() => {
    const term = empSearch.trim().toLowerCase()
    return empRows.filter(r => {
      if (empStatusFilter === 'trained' && !r.trained) return false
      if (empStatusFilter === 'pending' && r.trained) return false
      if (!term) return true
      return (
        r.emp_code.toLowerCase().includes(term) ||
        r.emp_name.toLowerCase().includes(term) ||
        r.branch.toLowerCase().includes(term)
      )
    })
  }, [empRows, empSearch, empStatusFilter])

  function exportEmpCSV() {
    const header = ['Employee Code', 'Name', 'Branch', 'Gender', 'Status', 'Total Hours', 'Trainings']
    const lines = filteredEmpRows.map(r => [
      r.emp_code, r.emp_name, r.branch, r.gender,
      r.trained ? 'Trained' : 'Pending', r.hours,
      r.trainings.join('; '),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `employee_coverage_${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kpiCards = [
    { label: 'Total Employees', value: stats.total.toLocaleString(), color: '#153F90', icon: '👥' },
    { label: 'Trained', value: stats.trained.toLocaleString(), color: '#16A34A', icon: '✅' },
    { label: 'Coverage %', value: `${stats.coverage}%`, color: stats.coverage >= 80 ? '#16A34A' : stats.coverage >= 60 ? '#D97706' : '#DC2626', icon: '📊' },
    { label: 'Total Manhours', value: stats.totalHours.toLocaleString(), color: '#D97706', icon: '⏱' },
    { label: 'Avg Hrs/Employee', value: `${stats.avgHours}h`, color: '#7C3AED', icon: '📈' },
  ]

  return (
    <div className="space-y-6">
      {/* SPOC Banner */}
      {user?.role === 'spoc' && (
        <div className="spoc-banner">
          <span>🔒</span>
          <span>Viewing data for <strong>{user.branch}</strong> only</span>
        </div>
      )}

      {/* Month filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter by Month:</span>
        {['All', ...months].map(m => (
          <button key={m} onClick={() => setPeriod(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border
              ${period === m ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
            {m}
          </button>
        ))}
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

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Branch coverage chart */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Branch Coverage %</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={branchData.slice(0, 12)} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="branch" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Coverage']} />
                  <Bar dataKey="coverage" fill="#153F90" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Gender pie chart */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Gender-wise Trained Employees</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(entry: any) => `${entry.name}: ${entry.coverage}%`}>
                    {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: any, name: any, props: any) => [`${v} trained (${props.payload.coverage}%)`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Branch table */}
          <div className="card p-5">
            <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Branch Performance Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3 text-left">Branch / Unit</th>
                    <th className="px-4 py-3 text-center">Total</th>
                    <th className="px-4 py-3 text-center">Trained</th>
                    <th className="px-4 py-3 text-center">Gap</th>
                    <th className="px-4 py-3 text-left">Coverage</th>
                    <th className="px-4 py-3 text-center">Total Hrs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchData.map(b => {
                    const color = b.coverage >= 80 ? '#16A34A' : b.coverage >= 60 ? '#D97706' : '#DC2626'
                    const status = b.coverage >= 80 ? 'Excellent' : b.coverage >= 60 ? 'On Track' : b.coverage >= 40 ? 'Needs Attention' : 'Critical Gap'
                    return (
                      <tr key={b.branch} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold">{b.branch}</td>
                        <td className="px-4 py-3 text-center">{b.total}</td>
                        <td className="px-4 py-3 text-center font-bold text-green-700">{b.trained}</td>
                        <td className="px-4 py-3 text-center font-bold text-red-600">{b.total - b.trained}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
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
              {branchData.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No data yet. SPOCs need to upload their monthly training data first.
                </div>
              )}
            </div>
          </div>

          {/* ===== Employee-wise Coverage (NEW) ===== */}
          <div className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-display font-bold text-sm text-[#153F90]">
                Employee-wise Coverage
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({filteredEmpRows.length} shown · {empRows.filter(r => r.trained).length} trained · {empRows.filter(r => !r.trained).length} pending)
                </span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search name / code / branch"
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 focus:border-[#153F90] outline-none w-56"
                />
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
                      <td className="px-4 py-2.5 text-center">
                        {r.trained ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#16A34A20', color: '#16A34A' }}>Trained</span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#DC262620', color: '#DC2626' }}>Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{r.hours || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{r.trainings.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEmpRows.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">No employees match your filter.</div>
              )}
              {filteredEmpRows.length > 500 && (
                <div className="text-center py-3 text-slate-400 text-xs">
                  Showing first 500 of {filteredEmpRows.length}. Use search/filter or Export CSV for the full list.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
