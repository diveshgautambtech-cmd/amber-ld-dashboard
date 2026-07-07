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
  const [phase, setPhase] = useState<'training' | 'master'>('training')
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
        const sheetName = phase === 'training'
          ? (wb.SheetNames.find(n => /training|mis/i.test(n)) || wb.SheetNames[0])
          : (wb.SheetNames.find(n => /employee|master/i.test(n)) || wb.SheetNames[0])
        const parsed = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' }) as any[]
        if (!parsed.length) { setError('File appears empty.'); return }
        setRows(parsed); setPreview(parsed.slice(0, 5))
      } catch { setError('Could not read this file. Please check the format.') }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleUpload() {
    if (!rows.length) return
    setUploading(true); setError('')
    try {
      if (phase === 'training') {
        const inserts = rows.map((r: any) => ({
          emp_code: r['Employee Code'] || r['Emp Code'] || r['EmpCode'] || '',
          emp_name: r['Employee Name'] || r['Name'] || '',
          branch: user?.role === 'spoc' ? user.branch : (r['Branch'] || ''),
          gender: r['Gender'] || '',
          grade: r['Grade'] || '',
          month: r['Month'] || '',
          training_categories: r['Training Categories'] || r['Category'] || '',
          total_man_hours: parseFloat(r['Total Man Hours'] || r['Manhours'] || 0),
          designation: r['Designation'] || '',
          department: r['Department'] || '',
          uploaded_by: user?.name || '',
        })).filter((r: any) => r.emp_code)
        const { error: dbErr } = await supabase.from('training_mis').insert(inserts)
        if (dbErr) throw dbErr
        await supabase.from('audit_log').insert({ user_name: user?.name, emp_code: user?.empCode, branch: user?.branch, role: user?.role, action: 'Uploaded Training MIS', details: `${inserts.length} records` })
      } else {
        const inserts = rows.map((r: any) => ({
          emp_code: r['Employee Code'] || r['Emp Code'] || '',
          emp_name: r['Employee Name'] || r['Name'] || '',
          branch: r['Branch'] || '',
          grade: r['Grade'] || '',
          gender: r['Gender'] || '',
          designation: r['Designation'] || '',
          department: r['Department'] || '',
        })).filter((r: any) => r.emp_code)
        const { error: dbErr } = await supabase.from('employee_master').upsert(inserts, { onConflict: 'emp_code' })
        if (dbErr) throw dbErr
      }
      setDone(true)
    } catch (err: any) { setError('Upload failed: ' + err.message) }
    setUploading(false)
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {!inWindow && user?.role !== 'admin' && (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h2 className="font-display font-bold text-xl text-[#153F90]">Upload Window Closed</h2>
            <p className="text-slate-500 text-sm mt-2">Data upload is open between the <strong>25th</strong> and <strong>5th</strong> of each month.</p>
          </div>
        )}

        {(inWindow || user?.role === 'admin') && (
          <>
            <div className="card p-6">
              <h1 className="font-display font-bold text-xl text-[#153F90]">📤 Upload Training Data</h1>
              <p className="text-sm text-slate-500 mt-1">Phase 1 is required · Phase 2 is optional enrichment</p>
            </div>

            <div className="flex gap-3">
              {(['training', 'master'] as const).map(p => (
                <button key={p} onClick={() => { setPhase(p); setRows([]); setFileName(''); setDone(false); setPreview([]) }}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all
                    ${phase === p ? 'bg-[#153F90] text-white border-[#153F90]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#153F90]'}`}>
                  <div>{p === 'training' ? '📊 Phase 1 — Monthly Training Data' : '📋 Phase 2 — Employee Master'}</div>
                  <div className={`text-xs font-normal mt-0.5 ${phase === p ? 'text-blue-200' : 'text-slate-400'}`}>
                    {p === 'training' ? 'Required' : 'Optional'}
                  </div>
                </button>
              ))}
            </div>

            {phase === 'training' && (
              <div className="card p-5 bg-blue-50 border-blue-200">
                <div className="text-xs font-bold text-blue-900 mb-3 uppercase tracking-wider">Required columns in your file:</div>
                <div className="flex flex-wrap gap-2">
                  {['Month', 'Branch', 'Employee Code', 'Employee Name', 'Designation', 'Department', 'Gender', 'Grade', 'Training Categories', 'Total Man Hours'].map(col => (
                    <span key={col} className="text-xs bg-white border border-blue-200 px-2.5 py-1 rounded font-mono text-blue-800">{col}</span>
                  ))}
                </div>
                {user?.role === 'spoc' && (
                  <p className="text-xs text-blue-700 mt-3 font-semibold">🔒 Branch <strong>{user.branch}</strong> will be applied automatically.</p>
                )}
              </div>
            )}

            {!done && (
              <div className="card relative border-2 border-dashed border-slate-300 hover:border-[#153F90] transition-all cursor-pointer text-center p-10">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <div className="text-4xl mb-3">{fileName ? '✅' : '📂'}</div>
                <div className="font-bold text-[#153F90] text-sm">{fileName || 'Click or drag your file here'}</div>
                <div className="text-xs text-slate-400 mt-1">Accepts .xlsx · .xls · .csv{rows.length > 0 ? ` · ${rows.length} rows detected` : ''}</div>
              </div>
            )}

            {preview.length > 0 && !done && (
              <div className="card p-5 overflow-x-auto">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Preview (first 5 rows)</div>
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {Object.keys(preview[0]).slice(0, 8).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-semibold text-slate-600">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, i) => (
                      <tr key={i}>{Object.keys(preview[0]).slice(0, 8).map(k => (
                        <td key={k} className="px-3 py-2 text-slate-700">{String(row[k] || '').substring(0, 25)}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm font-semibold text-red-700">⚠️ {error}</div>}

            {done && (
              <div className="card p-8 text-center bg-green-50 border-green-200">
                <div className="text-4xl mb-2">✅</div>
                <div className="font-bold text-green-700 text-lg">{rows.length} records uploaded successfully!</div>
                <div className="text-sm text-green-600 mt-1">Data is now live in the dashboard.</div>
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={() => router.push('/dashboard')} className="btn-primary">View Dashboard</button>
                  <button onClick={() => { setDone(false); setRows([]); setFileName(''); setPreview([]) }} className="btn-secondary">Upload More</button>
                </div>
              </div>
            )}

            {rows.length > 0 && !done && (
              <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full py-3 text-base disabled:opacity-60">
                {uploading ? '⏳ Uploading...' : `📤 Upload ${rows.length} Records`}
              </button>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
