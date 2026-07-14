import * as XLSX from 'xlsx'
import { supabase } from './supabase'

const MONTH_ORDER = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

function sortMonths(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const ia = MONTH_ORDER.indexOf(a), ib = MONTH_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

async function fetchAllRows(table: string, applyFilters?: (q: any) => any): Promise<any[]> {
  const pageSize = 1000
  let from = 0
  let all: any[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q: any = supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (applyFilters) q = applyFilters(q)
    const { data, error } = await q
    if (error) { console.error('fetchAllRows(' + table + ')', error); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function statusLabel(coverage: number): string {
  if (coverage >= 80) return 'Excellent'
  if (coverage >= 60) return 'On Track'
  if (coverage >= 40) return 'Needs Attention'
  return 'Critical Gap'
}

export async function downloadExcelReport(user: any, period: string = 'All'): Promise<void> {
  const spocFilter = (q: any) => (user && user.role === 'spoc' && user.branch ? q.eq('branch', user.branch) : q)

  const training: any[] = await fetchAllRows('training_mis', (q: any) => {
    let qq = spocFilter(q)
    if (period !== 'All') qq = qq.eq('month', period)
    return qq
  })
  const employees: any[] = await fetchAllRows('employee_master', spocFilter)
  const allTraining: any[] = await fetchAllRows('training_mis', spocFilter)

  const tMap: Record<string, { hours: number; trained: boolean; trainings: string[] }> = {}
  training.forEach((r: any) => {
    const c = r.emp_code ? String(r.emp_code).toLowerCase() : ''
    if (!c) return
    if (!tMap[c]) tMap[c] = { hours: 0, trained: false, trainings: [] }
    const hrs = Number(r.total_man_hours) || 0
    tMap[c].hours += hrs
    if (hrs > 0) tMap[c].trained = true
    const cat = r.training_categories ? String(r.training_categories) : ''
    if (cat && tMap[c].trainings.indexOf(cat) === -1) tMap[c].trainings.push(cat)
  })

  const total = employees.length
  const trained = employees.filter((e: any) => {
    const c = e.emp_code ? String(e.emp_code).toLowerCase() : ''
    return c && tMap[c] && tMap[c].trained
  }).length
  const totalHours = Math.round(Object.keys(tMap).reduce((a, k) => a + tMap[k].hours, 0))
  const coverage = total ? Math.round((trained / total) * 100) : 0
  const avgHours = total ? Math.round(totalHours / total) : 0

  const allMonths = sortMonths(Array.from(new Set(allTraining.map((r: any) => r.month).filter(Boolean))) as string[])

  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary
  const monthRows: any[][] = allMonths.map((m) => {
    const rowsM = allTraining.filter((r: any) => r.month === m)
    const set = new Set<string>()
    rowsM.forEach((r: any) => {
      if ((Number(r.total_man_hours) || 0) > 0 && r.emp_code) set.add(String(r.emp_code).toLowerCase())
    })
    const hoursM = Math.round(rowsM.reduce((a: number, r: any) => a + (Number(r.total_man_hours) || 0), 0))
    return [m, set.size, (total ? Math.round((set.size / total) * 100) : 0) + '%', hoursM]
  })
  const summaryAoa: any[][] = [
    ['Amber Group India - L&D Training Report'],
    ['Scope', period === 'All' ? 'All Months (Cumulative)' : period],
    ['Branches', user && user.role === 'spoc' && user.branch ? user.branch : 'All Branches'],
    ['Generated', new Date().toLocaleString('en-IN')],
    ['Prepared by', (user && user.name) || 'HR'],
    [],
    ['KEY METRICS'],
    ['Total Employees', total],
    ['Trained', trained],
    ['Coverage %', coverage + '%'],
    ['Total Manhours', totalHours],
    ['Avg Hrs / Employee', avgHours],
    [],
    ['MONTH-WISE BREAKDOWN'],
    ['Month', 'Trained', 'Coverage %', 'Manhours'],
  ]
  monthRows.forEach((r) => summaryAoa.push(r))
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // Sheet 2: Branch-wise
  const byBranch: Record<string, { total: number; trained: number; hours: number }> = {}
  employees.forEach((e: any) => {
    const b = e.branch || 'Unknown'
    if (!byBranch[b]) byBranch[b] = { total: 0, trained: 0, hours: 0 }
    byBranch[b].total++
    const c = e.emp_code ? String(e.emp_code).toLowerCase() : ''
    const t = c ? tMap[c] : undefined
    if (t && t.trained) byBranch[b].trained++
    if (t) byBranch[b].hours += t.hours
  })
  const branchJson = Object.keys(byBranch).map((branch) => {
    const v = byBranch[branch]
    const cov = v.total ? Math.round((v.trained / v.total) * 100) : 0
    return {
      'Branch / Unit': branch,
      'Total Employees': v.total,
      'Trained': v.trained,
      'Gap (Pending)': v.total - v.trained,
      'Coverage %': cov + '%',
      'Total Hours': Math.round(v.hours),
      'Status': statusLabel(cov),
    }
  }).sort((a, b) => parseInt(a['Coverage %']) - parseInt(b['Coverage %']))
  const wsBranch = XLSX.utils.json_to_sheet(branchJson)
  wsBranch['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsBranch, 'Branch-wise')

  // Sheet 3: Employee-wise
  const empJson = employees.map((e: any) => {
    const c = e.emp_code ? String(e.emp_code).toLowerCase() : ''
    const t = c ? tMap[c] : undefined
    return {
      'Emp Code': e.emp_code || '',
      'Name': e.emp_name || '',
      'Branch': e.branch || '',
      'Gender': e.gender || '',
      'Status': t && t.trained ? 'Trained' : 'Pending',
      'Total Hours': Math.round(t ? t.hours : 0),
      'Trainings': t ? t.trainings.join(', ') : '',
    }
  }).sort((a, b) => (a.Status === b.Status ? String(a.Branch).localeCompare(String(b.Branch)) : a.Status === 'Trained' ? -1 : 1))
  const wsEmp = XLSX.utils.json_to_sheet(empJson)
  wsEmp['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Employee-wise')

  // Sheet 4: Category-wise
  const byCat: Record<string, { count: number; hours: number }> = {}
  training.forEach((r: any) => {
    const cat = (r.training_categories ? String(r.training_categories) : 'Uncategorised').trim()
    if (!byCat[cat]) byCat[cat] = { count: 0, hours: 0 }
    byCat[cat].count++
    byCat[cat].hours += Number(r.total_man_hours) || 0
  })
  const catJson = Object.keys(byCat).map((name) => ({
    'Training Category': name,
    'Sessions': byCat[name].count,
    'Total Hours': Math.round(byCat[name].hours),
  })).sort((a, b) => b.Sessions - a.Sessions)
  const wsCat = XLSX.utils.json_to_sheet(catJson)
  wsCat['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsCat, 'Category-wise')

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, 'Amber_LD_Report_' + period + '_' + stamp + '.xlsx')
}
