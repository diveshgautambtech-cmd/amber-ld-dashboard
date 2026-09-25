'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'

const ESG_METRICS = [
  { id: 'gri404_1', code: 'GRI 404-1', title: 'Average Training Hours per Employee', target: 8, unit: 'hrs/employee' },
  { id: 'gri404_2', code: 'GRI 404-2', title: 'Programs for Upgrading Employee Skills', target: null, unit: 'programs' },
  { id: 'gri403_5', code: 'GRI 403-5', title: 'Safety Training Coverage', target: 100, unit: '%' },
  { id: 'brsr_p5',  code: 'BRSR P5',   title: 'Employees Trained on Business Responsibility', target: 90, unit: '%' },
  { id: 'brsr_p1',  code: 'BRSR P1',   title: 'Ethics & Governance Training Coverage', target: 90, unit: '%' },
]

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

export default function ESGPage() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('All')
  const [months, setMonths] = useState<string[]>([])

  useEffect(() => { fetchData() }, [user, month])

  async function fetchData() {
    setLoading(true)

    const training = await fetchAllRows('training_mis', (q) => {
      let qq = q
      if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
      if (month !== 'All') qq = qq.eq('month', month)
      return qq
    })
    const employees = await fetchAllRows('employee_master', (q) => {
      let qq = q
      if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
      return qq
    })
    // Full month list (independent of the selected month filter)
    const monthSource = await fetchAllRows('training_mis', (q) => {
      let qq = q
      if (user?.role === 'spoc' && user.branch) qq = qq.eq('branch', user.branch)
      return qq
    })

    if (!training || !employees) { setLoading(false); return }

    setMonths(sortMonths([...new Set(monthSource.map((r: any) => r.month).filter(Boolean))] as string[]))

    const totalEmps = employees.length
    const totalHours = training.reduce((s: number, r: any) => s + (Number(r.total_man_hours) || 0), 0)

    const safetyTraining = training.filter((r: any) => /safety|fire|posh|health|hazard|emergency/i.test(r.training_categories || ''))
    const safetyCodes = new Set(safetyTraining.map((r: any) => r.emp_code?.toLowerCase()))

    const brCategories = training.filter((r: any) => /compliance|business|responsibility|ethics|policy|governance/i.test(r.training_categories || ''))
    const brCodes = new Set(brCategories.map((r: any) => r.emp_code?.toLowerCase()))

    const ethicsCategories = training.filter((r: any) => /ethics|governance|integrity|code of conduct|posh/i.test(r.training_categories || ''))
    const ethicsCodes = new Set(ethicsCategories.map((r: any) => r.emp_code?.toLowerCase()))

    setMetrics({
      gri404_1: totalEmps > 0 ? Math.round((totalHours / totalEmps) * 10) / 10 : 0,
      gri404_2: new Set(training.map((r: any) => r.training_categories).filter(Boolean)).size,
      gri403_5: totalEmps > 0 ? Math.round((safetyCodes.size / totalEmps) * 100) : 0,
      brsr_p5:  totalEmps > 0 ? Math.round((brCodes.size / totalEmps) * 100) : 0,
      brsr_p1:  totalEmps > 0 ? Math.round((ethicsCodes.size / totalEmps) * 100) : 0,
    })
    setLoading(false)
  }

  return (
    <PageShell>
      <div className="space-y-6">
        {user?.role === 'spoc' && (
          <div className="spoc-banner"><span>🔒</span><span>ESG metrics for <strong>{user.branch}</strong> only</span></div>
        )}
        <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-xl text-[#153F90]">🌱 ESG Report</h1>
            <p className="text-xs text-slate-500 mt-0.5">GRI 404-1 · 404-2 · 403-5 · BRSR Principle 5 · Principle 1</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['All', ...months].map(m => (
              <button key={m} onClick={() => setMonth(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border
                  ${month === m ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="card p-12 text-center text-slate-500">Loading ESG data...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ESG_METRICS.map(metric => {
              const value = metrics[metric.id] || 0
              const hasTarget = metric.target !== null
              const pct = hasTarget && metric.target ? Math.min(Math.round((value / metric.target) * 100), 100) : null
              const status = !hasTarget ? 'info' : pct! >= 90 ? 'good' : pct! >= 70 ? 'warn' : 'bad'
              const statusColor = status === 'good' ? '#16A34A' : status === 'warn' ? '#D97706' : status === 'bad' ? '#DC2626' : '#153F90'
              const statusLabel = status === 'good' ? '✅ On Target' : status === 'warn' ? '⚠️ Needs Improvement' : status === 'bad' ? '❌ Below Target' : '📊 Informational'

              return (
                <div key={metric.id} className="card p-5" style={{ borderLeft: `4px solid ${statusColor}` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs font-bold px-2 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: `${statusColor}15`, color: statusColor }}>
                        {metric.code}
                      </div>
                      <div className="font-semibold text-sm text-slate-800 leading-snug">{metric.title}</div>
                    </div>
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <div className="font-display font-extrabold text-3xl" style={{ color: statusColor }}>
                      {value}{metric.unit === '%' ? '%' : ''}
                    </div>
                    <div className="text-sm text-slate-400 mb-1">
                      {metric.unit === 'hrs/employee' ? 'hrs avg' : metric.unit === 'programs' ? 'unique programs' : ''}
                    </div>
                  </div>
                  {hasTarget && (
                    <>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: statusColor }} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: statusColor }} className="font-semibold">{statusLabel}</span>
                        <span className="text-slate-400">Target: {metric.target}{metric.unit === '%' ? '%' : ' hrs'}</span>
                      </div>
                    </>
                  )}
                  {!hasTarget && <div className="text-xs text-slate-500 font-semibold">{statusLabel}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PageShell>
  )
}
