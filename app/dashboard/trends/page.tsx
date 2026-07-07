'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const BANDS = [
  { label: 'No Training',    min: 0,    max: 0,    color: '#DC2626', bg: '#FEF2F2' },
  { label: '1 Week',         min: 1,    max: 8,    color: '#F97316', bg: '#FFF7ED' },
  { label: '1 Month',        min: 9,    max: 32,   color: '#D97706', bg: '#FFFBEB' },
  { label: '2 Months',       min: 33,   max: 64,   color: '#16A34A', bg: '#F0FDF4' },
  { label: '3+ Months',      min: 65,   max: Infinity, color: '#153F90', bg: '#EEF3FB' },
]

export default function TrendsPage() {
  const { user } = useAuth()
  const [bandData, setBandData] = useState<{ label: string; count: number; color: string; bg: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => { fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    let q = supabase.from('employee_master').select('emp_code, branch')
    if (user?.role === 'spoc' && user.branch) q = q.eq('branch', user.branch)
    const { data: emps } = await q

    let tq = supabase.from('training_mis').select('emp_code, total_man_hours')
    if (user?.role === 'spoc' && user.branch) tq = tq.eq('branch', user.branch)
    const { data: training } = await tq

    if (!emps || !training) { setLoading(false); return }

    const hoursMap: Record<string, number> = {}
    training.forEach((r: any) => {
      const code = r.emp_code?.toLowerCase()
      if (code) hoursMap[code] = (hoursMap[code] || 0) + (r.total_man_hours || 0)
    })

    const counts: Record<string, number> = {}
    BANDS.forEach(b => { counts[b.label] = 0 })

    emps.forEach((e: any) => {
      const code = e.emp_code?.toLowerCase()
      const hrs = hoursMap[code] || 0
      const band = BANDS.find(b => hrs >= b.min && hrs <= b.max)
      if (band) counts[band.label]++
    })

    setBandData(BANDS.map(b => ({ ...b, count: counts[b.label] })))
    setTotal(emps.length)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {user?.role === 'spoc' && (
        <div className="spoc-banner"><span>🔒</span><span>Trends for <strong>{user.branch}</strong> only</span></div>
      )}
      <div className="card p-5">
        <h2 className="font-display font-bold text-lg text-[#153F90] mb-1">Training Intensity Distribution</h2>
        <p className="text-sm text-slate-500">How many employees fall in each training hour band — showing depth of training, not just coverage.</p>
      </div>

      {loading ? <div className="card p-12 text-center text-slate-500">Loading...</div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {bandData.map(b => (
              <div key={b.label} className="card p-5 text-center" style={{ borderTop: `4px solid ${b.color}`, background: b.bg }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: b.color }}>{b.label}</div>
                <div className="font-display font-extrabold text-4xl" style={{ color: b.color }}>{b.count}</div>
                <div className="text-xs mt-2" style={{ color: b.color }}>
                  {total > 0 ? Math.round((b.count / total) * 100) : 0}% of total
                </div>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <h3 className="font-display font-bold text-sm text-[#153F90] mb-4">Band Distribution Bar</h3>
            <div className="space-y-3">
              {bandData.map(b => {
                const pct = total > 0 ? Math.round((b.count / total) * 100) : 0
                return (
                  <div key={b.label} className="flex items-center gap-4">
                    <div className="w-28 text-xs font-semibold text-slate-600 text-right flex-shrink-0">{b.label}</div>
                    <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg flex items-center px-3 transition-all duration-700"
                        style={{ width: `${Math.max(pct, 3)}%`, background: b.color }}>
                        <span className="text-white text-xs font-bold">{b.count > 0 ? b.count : ''}</span>
                      </div>
                    </div>
                    <div className="w-12 text-xs font-bold text-right flex-shrink-0" style={{ color: b.color }}>{pct}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
