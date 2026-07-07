'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'

export default function ManhoursPage() {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [gradeData, setGradeData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalHours, setTotalHours] = useState(0)
  const [avgHours, setAvgHours] = useState(0)

  useEffect(() => { fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    let q = supabase.from('training_mis').select('*')
    if (user?.role === 'spoc' && user.branch) q = q.eq('branch', user.branch)
    const { data: rows } = await q
    if (!rows) { setLoading(false); return }

    // Branch totals
    const byBranch: Record<string, number> = {}
    const byMonth: Record<string, number> = {}
    const byGrade: Record<string, number> = {}
    let total = 0
    const codes = new Set<string>()

    rows.forEach((r: any) => {
      const h = r.total_man_hours || 0
      total += h
      codes.add(r.emp_code)
      if (r.branch) byBranch[r.branch] = (byBranch[r.branch] || 0) + h
      if (r.month)  byMonth[r.month]   = (byMonth[r.month]   || 0) + h
      if (r.grade)  byGrade[r.grade]   = (byGrade[r.grade]   || 0) + h
    })

    setTotalHours(Math.round(total))
    setAvgHours(codes.size > 0 ? Math.round(total / codes.size) : 0)
    setData(Object.entries(byBranch).map(([branch, hours]) => ({ branch, hours: Math.round(hours as number) })).sort((a, b) => b.hours - a.hours))
    setMonthlyData(Object.entries(byMonth).map(([month, hours]) => ({ month, hours: Math.round(hours as number) })))
    setGradeData(Object.entries(byGrade).map(([grade, hours]) => ({ grade, hours: Math.round(hours as number) })).sort((a, b) => b.hours - a.hours))
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {user?.role === 'spoc' && (
        <div className="spoc-banner"><span>🔒</span><span>Manhours data for <strong>{user.branch}</strong> only</span></div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Manhours', value: totalHours.toLocaleString() + ' hrs', color: '#D97706', icon: '⏱' },
          { label: 'Avg per Employee', value: avgHours + ' hrs', color: '#153F90', icon: '👤' },
          { label: 'Branches', value: data.length.toString(), color: '#16A34A', icon: '🏢' },
          { label: 'GRI 404-1 Target', value: '≥ 8 hrs', color: '#7C3AED', icon: '🎯' },
        ].map(k => (
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
              <BarChart data={data.slice(0, 12)} layout="vertical" margin={{ left: 80 }}>
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
