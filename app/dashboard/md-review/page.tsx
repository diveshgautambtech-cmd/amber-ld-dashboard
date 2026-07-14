'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

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

const isStaff = (g: any) => String(g || '').toLowerCase().includes('staff')
const isWorker = (g: any) => String(g || '').toLowerCase().includes('worker')

interface Row { spoc: string; branch: string; monthly: Record<string, number>; avg: number }
interface CovRow { spoc: string; branch: string; staff: number | null; worker: number | null; overall: number | null }

export default function MDReviewPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<string[]>([])
  const [staffRows, setStaffRows] = useState<Row[]>([])
  const [workerRows, setWorkerRows] = useState<Row[]>([])
  const [staffGrand, setStaffGrand] = useState<Record<string, number>>({})
  const [workerGrand, setWorkerGrand] = useState<Record<string, number>>({})
  const [covRows, setCovRows] = useState<CovRow[]>([])
  const [covGrand, setCovGrand] = useState<{ staff: number; worker: number; overall: number }>({ staff: 0, worker: 0, overall: 0 })
  const [currentMonth, setCurrentMonth] = useState('')
  const [building, setBuilding] = useState(false)

  useEffect(() => { fetchData() }, [user])
  useEffect(() => { if (months.length && !currentMonth) setCurrentMonth(months[months.length - 1]) }, [months])
  useEffect(() => { if (currentMonth) computeCoverage() }, [currentMonth])

  // stored raw data for coverage recompute
  const [raw, setRaw] = useState<{ training: any[]; employees: any[]; spocMap: Record<string, string> }>({ training: [], employees: [], spocMap: {} })

  function spocFor(map: Record<string, string>, branch: string) {
    return map[String(branch || '').trim().toLowerCase()] || 'Unassigned'
  }

  async function fetchData() {
    setLoading(true)
    try {
      const training = await fetchAllRows('training_mis')
      const employees = await fetchAllRows('employee_master')
      const spocData = await fetchAllRows('spoc_mapping')

      const spocMap: Record<string, string> = {}
      spocData.forEach((s: any) => { if (s.branch) spocMap[String(s.branch).trim().toLowerCase()] = s.spoc })

      const mList = sortMonths([...new Set(training.map((r: any) => r.month).filter(Boolean))] as string[])
      setMonths(mList)
      setRaw({ training, employees, spocMap })

      // ---- Manhours tables (avg manhours per employee, per branch per month) ----
      function buildManhours(matchCat: (g: any) => boolean) {
        // employee counts per branch (of this category)
        const empCount: Record<string, number> = {}
        employees.forEach((e: any) => { if (matchCat(e.grade)) { const b = String(e.branch || '').trim(); empCount[b] = (empCount[b] || 0) + 1 } })
        // manhours per branch per month (of this category)
        const hrs: Record<string, Record<string, number>> = {}
        training.forEach((r: any) => {
          if (!matchCat(r.grade)) return
          const b = String(r.branch || '').trim(); const m = r.month
          if (!b || !m) return
          if (!hrs[b]) hrs[b] = {}
          hrs[b][m] = (hrs[b][m] || 0) + (Number(r.total_man_hours) || 0)
        })
        const branches = [...new Set([...Object.keys(empCount), ...Object.keys(hrs)])]
        const rows: Row[] = branches.map(b => {
          const monthly: Record<string, number> = {}
          const denom = empCount[b] || 0
          mList.forEach(m => {
            const h = hrs[b]?.[m] || 0
            monthly[m] = denom > 0 ? +(h / denom).toFixed(2) : 0
          })
          const vals = mList.map(m => monthly[m])
          const avg = vals.length ? +(vals.reduce((a, c) => a + c, 0) / vals.length).toFixed(2) : 0
          return { spoc: spocFor(spocMap, b), branch: b, monthly, avg }
        }).sort((a, b) => a.spoc.localeCompare(b.spoc) || a.branch.localeCompare(b.branch))

        // grand total per month = total hours (cat) / total employees (cat)
        const totalEmp = Object.values(empCount).reduce((a, c) => a + c, 0)
        const grand: Record<string, number> = {}
        mList.forEach(m => {
          let th = 0
          Object.keys(hrs).forEach(b => { th += hrs[b][m] || 0 })
          grand[m] = totalEmp > 0 ? +(th / totalEmp).toFixed(2) : 0
        })
        grand['Avg'] = mList.length ? +(mList.map(m => grand[m]).reduce((a, c) => a + c, 0) / mList.length).toFixed(2) : 0
        return { rows, grand }
      }

      const staff = buildManhours(isStaff)
      const worker = buildManhours(isWorker)
      setStaffRows(staff.rows); setStaffGrand(staff.grand)
      setWorkerRows(worker.rows); setWorkerGrand(worker.grand)

    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function computeCoverage() {
    const { training, employees, spocMap } = raw
    if (!employees.length) return
    // coverage for currentMonth
    const trainedByCat = (matchCat: (g: any) => boolean) => {
      const set = new Set<string>()
      training.forEach((r: any) => {
        if (r.month === currentMonth && matchCat(r.grade) && (Number(r.total_man_hours) || 0) > 0 && r.emp_code)
          set.add(String(r.emp_code).toLowerCase())
      })
      return set
    }
    const staffTrained = trainedByCat(isStaff)
    const workerTrained = trainedByCat(isWorker)

    const byBranch: Record<string, { st: number; stT: number; wk: number; wkT: number }> = {}
    employees.forEach((e: any) => {
      const b = String(e.branch || '').trim(); if (!b) return
      if (!byBranch[b]) byBranch[b] = { st: 0, stT: 0, wk: 0, wkT: 0 }
      const code = String(e.emp_code || '').toLowerCase()
      if (isStaff(e.grade)) { byBranch[b].st++; if (staffTrained.has(code)) byBranch[b].stT++ }
      else if (isWorker(e.grade)) { byBranch[b].wk++; if (workerTrained.has(code)) byBranch[b].wkT++ }
    })

    const rows: CovRow[] = Object.keys(byBranch).map(b => {
      const v = byBranch[b]
      return {
        spoc: spocFor(spocMap, b), branch: b,
        staff: v.st > 0 ? Math.round((v.stT / v.st) * 100) : null,
        worker: v.wk > 0 ? Math.round((v.wkT / v.wk) * 100) : null,
        overall: (v.st + v.wk) > 0 ? Math.round(((v.stT + v.wkT) / (v.st + v.wk)) * 100) : null,
      }
    }).sort((a, b) => a.spoc.localeCompare(b.spoc) || a.branch.localeCompare(b.branch))
    setCovRows(rows)

    let st = 0, stT = 0, wk = 0, wkT = 0
    Object.values(byBranch).forEach(v => { st += v.st; stT += v.stT; wk += v.wk; wkT += v.wkT })
    setCovGrand({
      staff: st ? Math.round((stT / st) * 100) : 0,
      worker: wk ? Math.round((wkT / wk) * 100) : 0,
      overall: (st + wk) ? Math.round(((stT + wkT) / (st + wk)) * 100) : 0,
    })
  }

  async function downloadPPT() {
    setBuilding(true)
    try {
      const PptxGenJS = (await import('pptxgenjs')).default
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      const cols = [...months, 'Avg']

      function manhoursSlide(title: string, rows: Row[], grand: Record<string, number>) {
        const slide = pptx.addSlide()
        slide.addText(title, { x: 0.3, y: 0.2, w: 12.7, h: 0.5, fontSize: 18, bold: true, color: BRAND })
        const header = ['SPOC', 'Branch', ...cols].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND }, fontSize: 8, align: 'center' as const } }))
        const body: any[] = []
        let lastSpoc = ''
        rows.forEach(r => {
          const spocCell = r.spoc === lastSpoc ? '' : r.spoc
          lastSpoc = r.spoc
          body.push([
            { text: spocCell, options: { fontSize: 7, bold: true } },
            { text: r.branch, options: { fontSize: 7 } },
            ...cols.map(c => ({ text: String(c === 'Avg' ? r.avg : (r.monthly[c] ?? 0)), options: { fontSize: 7, align: 'center' as const } })),
          ])
        })
        body.push([
          { text: 'Grand Total', options: { fontSize: 7.5, bold: true, fill: { color: 'E2E8F0' } } },
          { text: '', options: { fill: { color: 'E2E8F0' } } },
          ...cols.map(c => ({ text: String(grand[c] ?? 0), options: { fontSize: 7.5, bold: true, align: 'center' as const, fill: { color: 'E2E8F0' } } })),
        ])
        slide.addTable([header, ...body], { x: 0.3, y: 0.8, w: 12.7, colW: [1.4, 1.9, ...cols.map(() => (9.4 / cols.length))], border: { type: 'solid', color: 'D0D7E2', pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true })
      }

      manhoursSlide(`Staff — Training Manhours (per employee) · ${currentMonth}`, staffRows, staffGrand)
      manhoursSlide(`Workers — Training Manhours (per employee) · ${currentMonth}`, workerRows, workerGrand)

      // Coverage slide
      const s3 = pptx.addSlide()
      s3.addText(`Location-wise Coverage % · ${currentMonth}`, { x: 0.3, y: 0.2, w: 12.7, h: 0.5, fontSize: 18, bold: true, color: BRAND })
      const cHeader = ['SPOC', 'Branch', 'Staff Cov%', 'Workers Cov%', 'Overall Cov%'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND }, fontSize: 9, align: 'center' as const } }))
      const cBody: any[] = []
      let lastS = ''
      covRows.forEach(r => {
        const sc = r.spoc === lastS ? '' : r.spoc; lastS = r.spoc
        cBody.push([
          { text: sc, options: { fontSize: 8, bold: true } },
          { text: r.branch, options: { fontSize: 8 } },
          { text: r.staff === null ? 'NA' : r.staff + '%', options: { fontSize: 8, align: 'center' as const } },
          { text: r.worker === null ? 'NA' : r.worker + '%', options: { fontSize: 8, align: 'center' as const } },
          { text: r.overall === null ? 'NA' : r.overall + '%', options: { fontSize: 8, align: 'center' as const } },
        ])
      })
      cBody.push([
        { text: 'Grand Total', options: { fontSize: 9, bold: true, fill: { color: 'E2E8F0' } } },
        { text: '', options: { fill: { color: 'E2E8F0' } } },
        { text: covGrand.staff + '%', options: { fontSize: 9, bold: true, align: 'center' as const, fill: { color: 'E2E8F0' } } },
        { text: covGrand.worker + '%', options: { fontSize: 9, bold: true, align: 'center' as const, fill: { color: 'E2E8F0' } } },
        { text: covGrand.overall + '%', options: { fontSize: 9, bold: true, align: 'center' as const, fill: { color: 'E2E8F0' } } },
      ])
      s3.addTable([cHeader, ...cBody], { x: 0.3, y: 0.8, w: 12.7, colW: [1.6, 3.5, 2.5, 2.5, 2.6], border: { type: 'solid', color: 'D0D7E2', pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true })

      await pptx.writeFile({ fileName: `MD_Review_${currentMonth}_${new Date().toISOString().slice(0, 10)}.pptx` })
    } catch (e: any) {
      alert('PPT generation failed: ' + (e?.message || e))
    }
    setBuilding(false)
  }

  const cols = [...months, 'Avg']

  const ManhoursTable = ({ title, rows, grand }: { title: string; rows: Row[]; grand: Record<string, number> }) => {
    let lastSpoc = ''
    return (
      <div className="card p-5">
        <h3 className="font-display font-bold text-sm text-[#153F90] mb-3">{title}</h3>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="text-xs border-collapse w-full">
            <thead className="sticky top-0">
              <tr className="text-white" style={{ background: BRAND }}>
                <th className="px-2 py-1.5 text-left">SPOC</th>
                <th className="px-2 py-1.5 text-left">Branch</th>
                {cols.map(c => <th key={c} className="px-2 py-1.5 text-center">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const sc = r.spoc === lastSpoc ? '' : r.spoc; lastSpoc = r.spoc
                return (
                  <tr key={r.branch} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1 font-bold text-slate-700">{sc}</td>
                    <td className="px-2 py-1">{r.branch}</td>
                    {cols.map(c => <td key={c} className="px-2 py-1 text-center">{c === 'Avg' ? r.avg : (r.monthly[c] ?? 0)}</td>)}
                  </tr>
                )
              })}
              <tr className="font-bold" style={{ background: '#E2E8F0' }}>
                <td className="px-2 py-1.5" colSpan={2}>Grand Total</td>
                {cols.map(c => <td key={c} className="px-2 py-1.5 text-center">{grand[c] ?? 0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  let lastCovSpoc = ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-[#153F90]">MD Review — Management Deck</h2>
          <p className="text-xs text-slate-500">Staff &amp; Workers manhours + coverage, SPOC-wise · one-click PowerPoint</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Review Month:</span>
          <select value={currentMonth} onChange={e => setCurrentMonth(e.target.value)}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 text-slate-600 bg-white focus:border-[#153F90] outline-none">
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={downloadPPT} disabled={building || loading}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
            style={{ background: BRAND }}>
            {building ? '⏳ Building…' : '⬇ Download PPT'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-slate-500">Loading MD Review data…</div>
      ) : (
        <>
          <ManhoursTable title="Staff — Avg Training Manhours per Employee" rows={staffRows} grand={staffGrand} />
          <ManhoursTable title="Workers — Avg Training Manhours per Employee" rows={workerRows} grand={workerGrand} />

          <div className="card p-5">
            <h3 className="font-display font-bold text-sm text-[#153F90] mb-3">Location-wise Coverage % · {currentMonth}</h3>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="text-xs border-collapse w-full">
                <thead className="sticky top-0">
                  <tr className="text-white" style={{ background: BRAND }}>
                    <th className="px-2 py-1.5 text-left">SPOC</th>
                    <th className="px-2 py-1.5 text-left">Branch</th>
                    <th className="px-2 py-1.5 text-center">Staff Cov%</th>
                    <th className="px-2 py-1.5 text-center">Workers Cov%</th>
                    <th className="px-2 py-1.5 text-center">Overall Cov%</th>
                  </tr>
                </thead>
                <tbody>
                  {covRows.map(r => {
                    const sc = r.spoc === lastCovSpoc ? '' : r.spoc; lastCovSpoc = r.spoc
                    return (
                      <tr key={r.branch} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1 font-bold text-slate-700">{sc}</td>
                        <td className="px-2 py-1">{r.branch}</td>
                        <td className="px-2 py-1 text-center">{r.staff === null ? 'NA' : r.staff + '%'}</td>
                        <td className="px-2 py-1 text-center">{r.worker === null ? 'NA' : r.worker + '%'}</td>
                        <td className="px-2 py-1 text-center font-semibold">{r.overall === null ? 'NA' : r.overall + '%'}</td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold" style={{ background: '#E2E8F0' }}>
                    <td className="px-2 py-1.5" colSpan={2}>Grand Total</td>
                    <td className="px-2 py-1.5 text-center">{covGrand.staff}%</td>
                    <td className="px-2 py-1.5 text-center">{covGrand.worker}%</td>
                    <td className="px-2 py-1.5 text-center">{covGrand.overall}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
