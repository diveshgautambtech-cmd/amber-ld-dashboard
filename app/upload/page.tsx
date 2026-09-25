'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

// Read a cell by trying several possible header spellings
function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim()
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const wanted = keys.map(norm)
  for (const actualKey of Object.keys(row)) {
    if (wanted.includes(norm(actualKey))) {
      const v = row[actualKey]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
  }
  return ''
}

const BATCH_SIZE = 500
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']
const TEMPLATE_HEADERS = ['Sr.No.', 'Employee Code', 'Employee Name', 'Month', 'Branch', 'Grade', 'Employee Category', 'Designation', 'Department', 'Gender', 'Training Categories', 'Total Manhours']

export default function UploadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const isAdmin = user?.role === 'admin'

  const [phase, setPhase] = useState<'training' | 'master'>('training')
  const [rows, setRows] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [done, setDone] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [spocMonth, setSpocMonth] = useState('')   // SPOC selects which month they are uploading

  const today = new Date().getDate()
  const inWindow = today >= 25 || today <= 5

  function resetState() {
    setRows([]); setFileName(''); setDone(false); setPreview([]); setError(''); setProgress('')
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
    // pre-fill Branch column hint for SPOC in row 2 Sr.No 1 (optional guidance row left blank otherwise)
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Training MIS')
    XLSX.writeFile(wb, 'Training_MIS_Template.xlsx')
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setError(''); setDone(false); setRows([]); setPreview([]); setProgress('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sn = phase === 'training'
          ? (wb.SheetNames.find(n => /training|mis|trg/i.test(n)) || wb.SheetNames[0])
          : (wb.SheetNames.find(n => /employee|master/i.test(n)) || wb.SheetNames[0])
        const parsed = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' }) as any[]
        if (!parsed.length) { setError('File appears empty.'); return }
        setRows(parsed); setPreview(parsed.slice(0, 5))
      } catch { setError('Could not read file.') }
    }
    reader.readAsArrayBuffer(file)
  }

  async function deleteAll(table: string) {
    const keyCol = table === 'employee_master' ? 'emp_code' : 'id'
    const { error: delErr } = await supabase.from(table).delete().not(keyCol, 'is', null)
    if (delErr) throw new Error('Could not clear old data: ' + delErr.message)
  }

  // SPOC: delete only this branch + this month (safe, scoped)
  async function deleteBranchMonth(branch: string, month: string) {
    const { error: delErr } = await supabase.from('training_mis').delete().eq('branch', branch).eq('month', month)
    if (delErr) throw new Error('Could not clear old data for your branch/month: ' + delErr.message)
  }

  async function insertInBatches(table: string, all: any[]) {
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const chunk = all.slice(i, i + BATCH_SIZE)
      const { error: insErr } = await supabase.from(table).insert(chunk)
      if (insErr) throw new Error(`Insert failed at row ${i + 1}: ${insErr.message}`)
      setProgress(`Uploading… ${Math.min(i + BATCH_SIZE, all.length)} / ${all.length}`)
    }
  }

  function buildTrainingRow(r: any) {
    return {
      emp_code: pick(r, ['Employee Code', 'Emp Code']),
      emp_name: pick(r, ['Employee Name', 'Name']),
      branch: pick(r, ['Branch']),
      gender: pick(r, ['Gender']),
      grade: pick(r, ['Grade']),
      month: pick(r, ['Month']),
      employee_category: pick(r, ['Employee Category', 'Category']),
      training_categories: pick(r, ['Training Categories', 'Training Category']),
      total_man_hours: Number(parseFloat(pick(r, ['Total Manhours', 'Total Man Hours', 'Total Manhrs', 'Manhours']) || '0')) || 0,
      designation: pick(r, ['Designation']),
      department: pick(r, ['Department']),
      uploaded_by: String(user?.name || '').trim(),
    }
  }

  // ---------------- SPOC UPLOAD ----------------
  async function handleSpocUpload() {
    setError('')
    const myBranch = String(user?.branch || '').trim()
    if (!myBranch) { setError('Your branch is not set. Contact admin.'); return }
    if (!spocMonth) { setError('Please select the month you are uploading for.'); return }
    if (!rows.length) { setError('Please select a file first.'); return }

    // Build rows
    const built = rows.map(buildTrainingRow)

    // VALIDATION 1: every row must have emp_code + month
    const missingCore: number[] = []
    built.forEach((r, i) => { if (!r.emp_code || !r.month) missingCore.push(i + 2) }) // +2 = header + 1-indexed
    if (missingCore.length) {
      setError(`Rows missing Employee Code or Month (Excel row ${missingCore.slice(0, 10).join(', ')}${missingCore.length > 10 ? '…' : ''}). Fix the file and re-upload.`)
      return
    }

    // VALIDATION 2: every row's branch must equal SPOC's branch (case-insensitive)
    const norm = (s: string) => String(s || '').trim().toLowerCase()
    const wrongBranch: { row: number; branch: string }[] = []
    built.forEach((r, i) => { if (norm(r.branch) !== norm(myBranch)) wrongBranch.push({ row: i + 2, branch: r.branch || '(blank)' }) })
    if (wrongBranch.length) {
      const sample = wrongBranch.slice(0, 8).map(w => `Row ${w.row}: "${w.branch}"`).join(' · ')
      setError(`❌ Upload blocked. Your file has ${wrongBranch.length} row(s) that are NOT your branch (${myBranch}). You can only upload data for "${myBranch}". Fix these rows and re-upload → ${sample}${wrongBranch.length > 8 ? ' …' : ''}`)
      return
    }

    // VALIDATION 3: every row's month must match the selected month (case-insensitive)
    const wrongMonth: number[] = []
    built.forEach((r, i) => { if (norm(r.month) !== norm(spocMonth)) wrongMonth.push(i + 2) })
    if (wrongMonth.length) {
      setError(`❌ Upload blocked. You selected "${spocMonth}" but ${wrongMonth.length} row(s) have a different Month (Excel row ${wrongMonth.slice(0, 10).join(', ')}${wrongMonth.length > 10 ? '…' : ''}). Make the Month column match, or change the selected month.`)
      return
    }

    // Force branch to canonical spelling (SPOC's own branch) to keep data clean
    const inserts = built.map(r => ({ ...r, branch: myBranch }))

    const ok = window.confirm(
      `Upload ${inserts.length} rows for ${myBranch} — ${spocMonth}?\n\n` +
      `This will replace ONLY your branch's ${spocMonth} data. Other branches and other months are untouched.`
    )
    if (!ok) return

    setUploading(true); setProgress('Preparing…')
    try {
      setProgress(`Clearing old ${myBranch} · ${spocMonth} data…`)
      await deleteBranchMonth(myBranch, spocMonth)
      await insertInBatches('training_mis', inserts)
      setUploadedCount(inserts.length); setDone(true)
    } catch (err: any) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false); setProgress('')
  }

  // ---------------- ADMIN UPLOAD (full replace, unchanged) ----------------
  async function handleAdminUpload() {
    if (!rows.length) return
    let inserts: any[] = []
    if (phase === 'training') {
      inserts = rows.map(buildTrainingRow).filter((r: any) => r.emp_code && r.month)
    } else {
      inserts = rows.map((r: any) => ({
        emp_code: pick(r, ['Employee Code', 'Emp Code']),
        emp_name: pick(r, ['Employee Name', 'Name']),
        branch: pick(r, ['Branch']),
        grade: pick(r, ['Grade']),
        employee_category: pick(r, ['Employee Category', 'Category']),
        gender: pick(r, ['Gender']),
        designation: pick(r, ['Designation']),
        department: pick(r, ['Department']),
      })).filter((r: any) => r.emp_code)
    }
    if (!inserts.length) {
      setError('No valid rows found (Employee Code / Month missing). Nothing was changed.')
      return
    }
    const tableLabel = phase === 'training' ? 'Training MIS' : 'Employee Master'
    const ok = window.confirm(`This will REPLACE ALL existing ${tableLabel} data with ${inserts.length} rows from "${fileName}". Continue?`)
    if (!ok) return
    setUploading(true); setError(''); setProgress('Preparing…')
    try {
      const table = phase === 'training' ? 'training_mis' : 'employee_master'
      setProgress('Clearing old data…')
      await deleteAll(table)
      await insertInBatches(table, inserts)
      setUploadedCount(inserts.length); setDone(true)
    } catch (err: any) {
      setError('Upload failed: ' + err.message + ' — please re-upload to restore data.')
    }
    setUploading(false); setProgress('')
  }

  const windowClosedForSpoc = !inWindow && !isAdmin

  return (
    <PageShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {windowClosedForSpoc && (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ color: '#153F90', fontWeight: 700 }}>Upload Window Closed</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>Open between <strong>25th</strong> and <strong>5th</strong> each month.</p>
          </div>
        )}

        {!windowClosedForSpoc && (
          <>
            {/* Header */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h1 style={{ color: '#153F90', fontWeight: 700, fontSize: '20px', margin: 0 }}>📤 Upload Training Data</h1>
              {isAdmin ? (
                <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Admin: each upload fully replaces that table with your file.</p>
              ) : (
                <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                  You are uploading for <strong style={{ color: '#153F90' }}>{user?.branch}</strong> only. This replaces just your branch’s selected-month data.
                </p>
              )}
              <button onClick={downloadTemplate}
                style={{ marginTop: '12px', padding: '8px 14px', background: 'white', color: '#15803d', border: '1px solid #16a34a', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                ⬇ Download Blank Template
              </button>
            </div>

            {/* Admin phase switch */}
            {isAdmin && (
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['training', 'master'] as const).map(p => (
                  <button key={p} onClick={() => { setPhase(p); resetState() }}
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', border: phase === p ? 'none' : '2px solid #e2e8f0', fontWeight: 700, cursor: 'pointer', background: phase === p ? '#153F90' : 'white', color: phase === p ? 'white' : '#475569', fontSize: '14px' }}>
                    <div>{p === 'training' ? '📊 Training Data' : '📋 Employee Master'}</div>
                    <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '4px', opacity: 0.8 }}>{p === 'training' ? 'Full replace' : 'Full replace'}</div>
                  </button>
                ))}
              </div>
            )}

            {/* SPOC month selector */}
            {!isAdmin && (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month you are uploading for</label>
                <select value={spocMonth} onChange={e => setSpocMonth(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 600, color: '#153F90' }}>
                  <option value="">— Select month —</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            {/* File drop */}
            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', background: 'white' }}
              onClick={() => (document.getElementById('fileInput') as HTMLInputElement)?.click()}>
              <input id="fileInput" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>{fileName ? '✅' : '📂'}</div>
              <div style={{ fontWeight: 700, color: '#153F90' }}>{fileName || 'Click to select file'}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{rows.length > 0 ? `${rows.length} rows detected` : '.xlsx · .xls · .csv'}</div>
            </div>

            {/* Preview */}
            {preview.length > 0 && !done && (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', overflowX: 'auto' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Preview (first 5 rows)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>{Object.keys(preview[0]).slice(0, 7).map(k => <th key={k} style={{ padding: '8px', textAlign: 'left', color: '#64748b' }}>{k}</th>)}</tr></thead>
                  <tbody>{preview.map((row, i) => <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>{Object.keys(preview[0]).slice(0, 7).map(k => <td key={k} style={{ padding: '8px' }}>{String(row[k] || '').substring(0, 22)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}

            {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontWeight: 600, fontSize: '14px', lineHeight: 1.5 }}>{error}</div>}

            {done && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: '20px' }}>{uploadedCount} records uploaded!</div>
                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '4px' }}>
                  {isAdmin ? 'Old data replaced — dashboard updated.' : `Your ${user?.branch} · ${spocMonth} data is updated. Other branches/months untouched.`}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                  <button onClick={() => router.push('/dashboard')} style={{ padding: '10px 24px', background: '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>View Dashboard</button>
                  <button onClick={() => resetState()} style={{ padding: '10px 24px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Upload More</button>
                </div>
              </div>
            )}

            {rows.length > 0 && !done && (
              <button onClick={isAdmin ? handleAdminUpload : handleSpocUpload} disabled={uploading}
                style={{ width: '100%', padding: '14px', background: uploading ? '#94a3b8' : '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '16px', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                {uploading ? (progress || '⏳ Uploading…') : (isAdmin ? `📤 Replace with ${rows.length} Records` : `📤 Upload ${rows.length} Rows for ${user?.branch}`)}
              </button>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
