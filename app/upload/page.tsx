'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

export default function UploadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [phase, setPhase] = useState<'training'|'master'>('training')
  const [rows, setRows] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any[]>([])

  const today = new Date().getDate()
  const inWindow = today >= 25 || today <= 5

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setError(''); setDone(false); setRows([]); setPreview([])
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

  async function handleUpload() {
    if (!rows.length) return
    setUploading(true); setError('')
    try {
      if (phase === 'training') {
        const inserts = rows.map((r: any) => ({
          emp_code: String(r['Employee Code'] || r['Emp Code'] || '').trim(),
          emp_name: String(r['Employee Name'] || r['Name'] || '').trim(),
          branch: user?.role === 'spoc' ? (user.branch || '') : String(r['Branch'] || '').trim(),
          gender: String(r['Gender'] || '').trim(),
          grade: String(r['Grade'] || '').trim(),
          month: String(r['Month'] || '').trim(),
          training_categories: String(r['Training Categories'] || r['Category'] || '').trim(),
          total_man_hours: Number(parseFloat(String(r['Total Man Hours'] || '0')).toFixed(2)),
          designation: String(r['Designation'] || '').trim(),
          department: String(r['Department'] || '').trim(),
          uploaded_by: String(user?.name || '').trim(),
        })).filter((r: any) => r.emp_code)

        const { error: dbErr } = await supabase.from('training_mis').insert(inserts)
        if (dbErr) throw new Error(dbErr.message)
      } else {
        const inserts = rows.map((r: any) => ({
          emp_code: String(r['Employee Code'] || r['Emp Code'] || '').trim(),
          emp_name: String(r['Employee Name'] || r['Name'] || '').trim(),
          branch: String(r['Branch'] || '').trim(),
          grade: String(r['Grade'] || '').trim(),
          gender: String(r['Gender'] || '').trim(),
          designation: String(r['Designation'] || '').trim(),
          department: String(r['Department'] || '').trim(),
        })).filter((r: any) => r.emp_code)
        const { error: dbErr } = await supabase.from('employee_master').upsert(inserts, { onConflict: 'emp_code' })
        if (dbErr) throw new Error(dbErr.message)
      }
      setDone(true)
    } catch (err: any) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false)
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
              <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Phase 1 required · Phase 2 optional</p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {(['training', 'master'] as const).map(p => (
                <button key={p} onClick={() => { setPhase(p); setRows([]); setFileName(''); setDone(false); setPreview([]) }}
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
                <div style={{ fontWeight: '700', color: '#15803d', fontSize: '20px' }}>{rows.length} records uploaded!</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                  <button onClick={() => router.push('/dashboard')} style={{ padding: '10px 24px', background: '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>View Dashboard</button>
                  <button onClick={() => { setDone(false); setRows([]); setFileName(''); setPreview([]) }} style={{ padding: '10px 24px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Upload More</button>
                </div>
              </div>
            )}

            {rows.length > 0 && !done && (
              <button onClick={handleUpload} disabled={uploading}
                style={{ width: '100%', padding: '14px', background: uploading ? '#94a3b8' : '#153F90', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '16px', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                {uploading ? '⏳ Uploading...' : `📤 Upload ${rows.length} Records`}
              </button>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
