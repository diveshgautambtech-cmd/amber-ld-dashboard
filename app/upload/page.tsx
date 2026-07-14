'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

// Read a cell by trying several possible header spellings (handles "Total Manhours"
// vs "Total Man Hours" vs trailing spaces, etc.)
function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim()
    }
  }
  // fallback: case/space-insensitive match
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

export default function UploadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [phase, setPhase] = useState<'training' | 'master'>('training')
  const [rows, setRows] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [done, setDone] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any[]>([])

  const today = new Date().getDate()
  const inWindow = today >= 25 || today <= 5

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
          ? (wb.SheetNames.find(n => /training|mis/i.test(n)) || wb.SheetNames[0])
          : (wb.SheetNames.find(n => /employee|master/i.test(n)) || wb.SheetNames[0])
        const parsed = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' }) as any[]
        if (!parsed.length) { setError('File appears empty.'); return }
        setRows(parsed); setPreview(parsed.slice(0, 5))
      } catch { setError('Could not read file.') }
    }
    reader.readAsArrayBuffer(file)
  }

  // Delete ALL rows of a table (Supabase requires a filter, so we match every row via id not null)
  async function deleteAll(table: string) {
  // employee_master has no `id` column; its key is emp_code
  const keyCol = table === 'employee_master' ? 'emp_code' : 'id'
  const { error: delErr } = await supabase.from(table).delete().not(keyCol, 'is', null)
  if (delErr) throw new Error('Could not clear old data: ' + delErr.message)
}
  // Insert rows in batches so large files don't fail/timeout
  async function insertInBatches(table: string, all: any[]) {
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const chunk = all.slice(i, i + BATCH_SIZE)
      const { error: insErr } = await supabase.from(table).insert(chunk)
      if (insErr) throw new Error(`Insert failed at row ${i + 1}: ${insErr.message}`)
      setProgress(`Uploading… ${Math.min(i + BATCH_SIZE, all.length)} / ${all.length}`)
    }
  }

  async function handleUpload() {
    if (!rows.length) return

    let inserts: any[] = []

    if (phase === 'training') {
      inserts = rows.map((r: any) => ({
        emp_code: pick(r, ['Employee Code', 'Emp Code']),
        emp_name: pick(r, ['Employee Name', 'Name']),
        branch: user?.role === 'spoc' ? (user.branch || '') : pick(r, ['Branch']),
        gender: pick(r, ['Gender']),
        grade: pick(r, ['Grade']),
        month: pick(r, ['Month']),
        training_categories: pick(r, ['Training Categories', 'Category']),
        total_man_hours: Number(parseFloat(pick(r, ['Total Manhours', 'Total Man Hours', 'Total Manhrs', 'Manhours']) || '0')) || 0,
        designation: pick(r, ['Designation']),
        department: pick(r, ['Department']),
        uploaded_by: String(user?.name || '').trim(),
      })).filter((r: any) => r.emp_code && r.month)
    } else {
      inserts = rows.map((r: any) => ({
        emp_code: pick(r, ['Employee Code', 'Emp Code']),
        emp_name: pick(r, ['Employee Name', 'Name']),
        branch: pick(r, ['Branch']),
        grade: pick(r, ['Grade']),
        gender: pick(r, ['Gender']),
        designation: pick(r, ['Designation']),
        department: pick(r, ['Department']),
      })).filter((r: any) => r.emp_code)
    }

    // SAFETY: never wipe old data if the new file has no valid rows
    if (!inserts.length) {
      setError('No valid rows found in this file (Employee Code / Month missing). Nothing was changed.')
      return
    }

    const tableLabel = phase === 'training' ? 'Training MIS' : 'Employee Master'
    const ok = window.confirm(
      `This will REPLACE all existing ${tableLabel} data with ${inserts.length} rows from "${fileName}".\n\n` +
      `The current data will be deleted first, then the new file loaded. Continue?`
    )
    if (!ok) return

    setUploading(true); setError(''); setProgress('Preparing…')
    try {
      const table = phase === 'training' ? 'training_mis' : 'employee_master'
      setProgress('Clearing old data…')
      await deleteAll(table)
      await insertInBatches(table, inserts)
      setUploadedCount(inserts.length)
      setDone(true)
    } catch (err: any) {
      setError('Upload failed: ' + err.message + ' — please re-upload the file to restore data.')
    }
    setUploading(false)
    setProgress('')
  }

  return (
    <PageShell>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {!inWindow && user?.role !== 'admin' && (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ color: '#153F90', fontWeight: '700' }}>Upload Window Closed</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>Open between <strong>25th</strong> and <strong>5th</strong> each month.</p>
          </div>
        )}
        {(inWindow || user?.role === 'admin') && (
          <>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h1 style={{ color: '#153F90', fontWeight: '700', fontSize: '20px', margin: 0 }}>📤 Upload Training Data</h1>
              <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Each upload fully replaces that table with your file (no duplicates).</p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {(['training', 'master'] as const).map(p => (
                <button key={p} onClick={() => { setPhase(p); setRows([]); setFileName(''); setDone(false); setPreview([]); setError(''); setProgress('') }}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: phase === p ? 'none' : '2px solid #e2e8f0', fontWeight: '700', cursor: 'pointer', background: phase === p ? '#153F90' : 'white', color: phase === p ? 'white' : '#475569', fontSize: '14px' }}>
                  <div>{p === 'training' ? '📊 Phase 1 — Training Data' : '📋 Phase 2 — Employee Master'}</div>
                  <div style={{ fontSize: '12px', fontWeight: '400', marginTop: '4px', opacity: 0.8 }}>{p === 'training' ? 'Required' : 'Optional'}</div>
                </button>
              ))}
            </div>

            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', background: 'white', position: 'relative' }}
              onClick={() => (document.getElementById('fileInput') as HTMLInputElement)?.click()}>
              <input id="fileInput" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>{fileName ? '✅' : '📂'}</div>
              <div style={{ fontWeight: '700', color: '#153F90' }}>{fileName || 'Click to select file'}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{rows.length > 0 ? `${rows.length} rows detected` : '.xlsx · .xls · .csv'}</div>
            </div>

            {preview.length > 0 && !done && (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', overflowX: 'auto' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Preview</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>{Object.keys(preview[0]).slice(0, 6).map(k => <th key={k} style={{ padding: '8px', textAlign: 'left', color: '#64748b' }}>{k}</th>)}</tr></thead>
                  <tbody>{preview.map((row, i) => <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>{Object.keys(preview[0]).slice(0, 6).map(k => <td key={k} style={{ padding: '8px' }}>{String(row[k] || '').substring(0, 25)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}

            {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontWeight: '600', fontSize: '14px' }}>⚠️ {error}</div>}

            {done && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: '700', color: '#15803d', fontSize: '20px' }}>{uploadedCount} records uploaded!</div>
                <div style={{ fontSize: '13px', color: '#15803d', marginTop: '4px' }}>Old data replaced — dashboard now shows only this file.</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                  <button onClick={() => router.push('/dashboard')} style={{ padding: '10px 24px', background: '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>View Dashboard</button>
                  <button onClick={() => { setDone(false); setRows([]); setFileName(''); setPreview([]) }} style={{ padding: '10px 24px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Upload More</button>
                </div>
              </div>
            )}

            {rows.length > 0 && !done && (
              <button onClick={handleUpload} disabled={uploading}
                style={{ width: '100%', padding: '14px', background: uploading ? '#94a3b8' : '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '16px', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                {uploading ? (progress || '⏳ Uploading…') : `📤 Replace with ${rows.length} Records`}
              </button>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
