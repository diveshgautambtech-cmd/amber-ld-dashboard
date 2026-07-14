'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

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

function rag(coverage: number) {
  if (coverage >= 80) return { color: '#16A34A', label: 'Excellent' }
  if (coverage >= 60) return { color: '#D97706', label: 'On Track' }
  if (coverage >= 40) return { color: '#CA8A04', label: 'Needs Attention' }
  return { color: '#DC2626', label: 'Critical Gap' }
}

export default function ReportPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('All')
  const [months, setMonths] = useState<string[]>([])
  const [stats, setStats] = useState({ total: 0, trained: 0, coverage: 0, totalHours: 0, avgHours: 0 })
  const [branchData, setBranchData] = useState<any[]>([])
  const [genderData, setGenderData] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [generatedAt] = useState(() => new Date())

  useEffect(() => { fetchData() }, [user, period])

  async function fetchData() {
    setLoading(true)
    try {
      const spocFilter = (q: any) => (user?.role === 'spoc' && user.branch ? q.eq('branch', user.branch) : q)

      const training = await fetchAllRows('training_mis', (q) => {
        let qq = spocFilter(q)
        if (period !== 'All') qq = qq.eq('month', period)
        return qq
      })
      const employees = await fetchAllRows('employee_master', spocFilter)
      const allTraining = await fetchAllRows('training_mis', spocFilter) // for month list + trend

      const allMonths = sortMonths([...new Set(allTraining.map((r: any) => r.month).filter(Boolean))] as string[])
      setMonths(allMonths)

      // training map (respecting current period)
      const tMap: Record<string, { hours: number; trained: boolean }> = {}
      training.forEach((r: any) => {
        const c = r.emp_code?.toLowerCase(); if (!c) return
        if (!tMap[c]) tMap[c] = { hours: 0, trained: false }
        tMap[c].hours += Number(r.total_man_hours) || 0
        if ((Number(r.total_man_hours) || 0) > 0) tMap[c].trained = true
      })

      const total = employees.length
      const trained = employees.filter((e: any) => tMap[e.emp_code?.toLowerCase()]?.trained).length
      const totalHours = Object.values(tMap).reduce((a, b) => a + b.hours, 0)
      setStats({
        total, trained,
        coverage: total ? Math.round((trained / total) * 100) : 0,
        totalHours: Math.round(totalHours),
        avgHours: total ? Math.round(totalHours / total) : 0,
      })

      // branch
      const byBranch: Record<string, any> = {}
      employees.forEach((e: any) => {
        const b = e.branch || 'Unknown'
        if (!byBranch[b]) byBranch[b] = { branch: b, total: 0, trained: 0, hours: 0 }
        byBranch[b].total++
        const t = tMap[e.emp_code?.toLowerCase()]
        if (t?.trained) byBranch[b].trained++
        byBranch[b].hours += t?.hours || 0
      })
      setBranchData(Object.values(byBranch).map((b: any) => ({
        ...b, hours: Math.round(b.hours),
        coverage: b.total ? Math.round((b.trained / b.total) * 100) : 0,
      })).sort((a: any, b: any) => a.coverage - b.coverage)) // worst first for leadership

      // gender
      const byGender: Record<string, { total: number; trained: number }> = {}
      employees.forEach((e: any) => {
        const g = e.gender || 'Unknown'
        if (!byGender[g]) byGender[g] = { total: 0, trained: 0 }
        byGender[g].total++
        if (tMap[e.emp_code?.toLowerCase()]?.trained) byGender[g].trained++
      })
      setGenderData(Object.entries(byGender).map(([name, v]) => ({
        name, trained: v.trained, total: v.total,
        coverage: v.total ? Math.round((v.trained / v.total) * 100) : 0,
      })))

      // training category (respecting period)
      const byCat: Record<string, { count: number; hours: number }> = {}
      training.forEach((r: any) => {
        const c = (r.training_categories || 'Uncategorised').trim()
        if (!byCat[c]) byCat[c] = { count: 0, hours: 0 }
        byCat[c].count++
        byCat[c].hours += Number(r.total_man_hours) || 0
      })
      setCategoryData(Object.entries(byCat).map(([name, v]) => ({
        name, count: v.count, hours: Math.round(v.hours),
      })).sort((a, b) => b.count - a.count))

      // month trend (always across all months)
      const trend = allMonths.map(m => {
        const rowsM = allTraining.filter((r: any) => r.month === m)
        const trainedSet = new Set(rowsM.filter((r: any) => (Number(r.total_man_hours) || 0) > 0).map((r: any) => r.emp_code?.toLowerCase()).filter(Boolean))
        const hoursM = rowsM.reduce((a: number, r: any) => a + (Number(r.total_man_hours) || 0), 0)
        return {
          month: m,
          trained: trainedSet.size,
          coverage: total ? Math.round((trainedSet.size / total) * 100) : 0,
          hours: Math.round(hoursM),
        }
      })
      setTrendData(trend)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const kpis = [
    { label: 'Total Employees', value: stats.total.toLocaleString() },
    { label: 'Trained', value: stats.trained.toLocaleString() },
    { label: 'Coverage', value: `${stats.coverage}%` },
    { label: 'Total Manhours', value: stats.totalHours.toLocaleString() },
    { label: 'Avg Hrs / Emp', value: `${stats.avgHours}h` },
  ]

  const periodLabel = period === 'All' ? 'All Months (Cumulative)' : period
  const fmtDate = generatedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <PageShell>
      {/* Print isolation: only #report-sheet prints */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-sheet, #report-sheet * { visibility: visible !important; }
          #report-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
        {/* Controls (hidden in print) */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Report Month:</span>
            {['All', ...months].map(m => (
              <button key={m} onClick={() => setPeriod(m)}
                style={{ padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  border: period === m ? 'none' : '1px solid #e2e8f0', background: period === m ? BRAND : 'white', color: period === m ? 'white' : '#475569' }}>
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => window.print()}
            style={{ padding: '10px 22px', background: BRAND, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
            ⬇ Download PDF
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Preparing report…</div>
        ) : (
          <div id="report-sheet" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${BRAND}`, paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <img src="https://www.ambergroupindia.com/wp-content/uploads/2025/02/Amber-Logo-on-white.png" alt="Amber" style={{ height: '34px', marginBottom: '8px', objectFit: 'contain' }} />
                <h1 style={{ margin: 0, color: BRAND, fontSize: '22px', fontWeight: 800 }}>L&amp;D Training — Leadership Report</h1>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{periodLabel}{user?.role === 'spoc' && user.branch ? ` · ${user.branch}` : ' · All Branches'}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
                <div>Generated: {fmtDate}</div>
                <div>Prepared by: {user?.name || 'HR'}</div>
                <div style={{ marginTop: '4px', fontWeight: 700, color: '#DC2626' }}>Confidential — Internal</div>
              </div>
            </div>

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
              {kpis.map(k => (
                <div key={k.label} style={{ border: '1px solid #e2e8f0', borderTop: `3px solid ${BRAND}`, borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em' }}>{k.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: BRAND, marginTop: '4px' }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Month trend */}
            {trendData.length > 1 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ color: BRAND, fontSize: '14px', fontWeight: 800, margin: '0 0 10px' }}>Month-on-Month Coverage</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Coverage']} />
                    <Bar dataKey="coverage" fill={BRAND} radius={[4, 4, 0, 0]} barSize={48}>
                      <LabelList dataKey="coverage" position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fontWeight: 700, fill: BRAND }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Branch performance */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: BRAND, fontSize: '14px', fontWeight: 800, margin: '0 0 10px' }}>Branch Performance {period === 'All' ? '' : `(${period})`}</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '8px' }}>Branch</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Trained</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Gap</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Coverage</th>
                    <th style={{ padding: '8px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branchData.map((b: any) => {
                    const r = rag(b.coverage)
                    return (
                      <tr key={b.branch} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{b.branch}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{b.total}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#15803d', fontWeight: 700 }}>{b.trained}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{b.total - b.trained}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: r.color }}>{b.coverage}%</td>
                        <td style={{ padding: '8px' }}><span style={{ fontSize: '11px', fontWeight: 700, color: r.color, background: `${r.color}18`, padding: '2px 8px', borderRadius: '9999px' }}>{r.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Two-up: gender + category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <h3 style={{ color: BRAND, fontSize: '14px', fontWeight: 800, margin: '0 0 10px' }}>Gender-wise Coverage</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '8px' }}>Gender</th><th style={{ padding: '8px', textAlign: 'center' }}>Trained</th><th style={{ padding: '8px', textAlign: 'center' }}>Coverage</th>
                  </tr></thead>
                  <tbody>
                    {genderData.map(g => (
                      <tr key={g.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{g.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{g.trained} / {g.total}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: BRAND }}>{g.coverage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ color: BRAND, fontSize: '14px', fontWeight: 800, margin: '0 0 10px' }}>Training Categories</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '8px' }}>Category</th><th style={{ padding: '8px', textAlign: 'center' }}>Sessions</th><th style={{ padding: '8px', textAlign: 'center' }}>Hours</th>
                  </tr></thead>
                  <tbody>
                    {categoryData.slice(0, 8).map(c => (
                      <tr key={c.name} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{c.count}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{c.hours.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '10px', fontSize: '10px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>Amber Group India · L&amp;D Training Intelligence Portal</span>
              <span>Generated {fmtDate}</span>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
