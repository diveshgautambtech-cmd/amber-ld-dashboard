'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

export default function UploadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [phase, setPhase] = useState('training')
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState([])

  const today = new Date().getDate()
  const inWindow = today >= 25 || today <= 5

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setError(''); setDone(false); setRows([]); setPreview([])
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target?.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sheetName = phase === 'training'
          ? (wb.SheetNames.find(n => /training|mis/i.test(n)) || wb.SheetNames[0])
          : (wb.SheetNames.find(n => /employee|master/i.test(n)) || wb.SheetNames[0])
        const parsed = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
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
        const inserts = rows.map(r => ({
          emp_code: r['Employee Code'] || r['Emp Code'] || '',
          emp_name: r['Employee Name'] || r['Name'] || '',
          branch: user?.role === 'spoc' ? user.branch : (r['Branch'] || ''),
          gender: r['Gender'] || '',
          grade: r['Grade'] || '',
          month: r['Month'] || '',
          training_categories: r['Training Categories'] || r['Category'] || '',
          total_man_hours: parseFloat(r['Total Man Hours'] || 0),
          designation: r['Designation'] || '',
          department: r['Department'] || '',
          uploaded_by: user?.name || '',
        })).filter(r => r.emp_code)
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ table: 'training_mis', rows: inserts, empCode: user?.empCode, userName: user?.name, branch: user?.branch, role: user?.role })
        })
        const result = await res.json()
        if (result.error) throw new Error(result.error)
      } else {
        const inserts = rows.map(r => ({
          emp_code: r['Employee Code'] || r['Emp Code'] || '',
          emp_name: r['Employee Name'] || r['Name'] || '',
          branch: r['Branch'] || '',
          grade: r['Grade'] || '',
          gender: r['Gender'] || '',
          designation: r['Designation'] || '',
          department: r['Department'] || '',
        })).filter(r => r.emp_code)
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ table: 'employee_master', rows: inserts })
        })
        const result = await res.json()
        if (result.error) throw new Error(result.error)
      }
      setDone(true)
    } catch (err) { setError('Upload failed: ' + err.message) }
    setUploading(false)
  }

  return (
    <PageShell>
      <div style={{maxWidth:'700px',margin:'0 auto',padding:'24px 16px',display:'flex',flexDirection:'column',gap:'20px'}}>
        {!inWindow && user?.role !== 'admin' && (
          <div className="card p-8 text-center">
            <div style={{fontSize:'40px',marginBottom:'12px'}}>🔒</div>
            <h2 className="font-display font-bold text-xl" style={{color:'#153F90'}}>Upload Window Closed</h2>
            <p style={{color:'#64748b',fontSize:'14px',marginTop:'8px'}}>Data upload is open between the <strong>25th</strong> and <strong>5th</strong> of each month.</p>
          </div>
        )}
        {(inWindow || user?.role === 'admin') && (
          <>
            <div className="card p-6">
              <h1 className="font-display font-bold text-xl" style={{color:'#153F90'}}>📤 Upload Training Data</h1>
              <p style={{fontSize:'14px',color:'#64748b',marginTop:'4px'}}>Phase 1 is required · Phase 2 is optional</p>
            </div>
            <div style={{display:'flex',gap:'12px'}}>
              {['training','master'].map(p => (
                <button key={p} onClick={() => { setPhase(p); setRows([]); setFileName(''); setDone(false); setPreview([]) }}
                  style={{flex:1,padding:'12px',borderRadius:'12px',border: phase===p ? 'none' : '2px solid #e2e8f0',fontSize:'14px',fontWeight:'700',cursor:'pointer',background:phase===p ? '#153F90' : 'white',color:phase===p ? 'white' : '#475569',transition:'all 0.15s'}}>
                  <div>{p === 'training' ? '📊 Phase 1 — Monthly Training Data' : '📋 Phase 2 — Employee Master'}</div>
                  <div style={{fontSize:'12px',fontWeight:'400',marginTop:'4px',opacity:0.8}}>{p === 'training' ? 'Required' : 'Optional'}</div>
                </button>
              ))}
            </div>
            <div className="card" style={{padding:'20px',cursor:'pointer',border:'2px dashed #cbd5e1',borderRadius:'12px',textAlign:'center',position:'relative'}}
              onClick={() => document.getElementById('fileInput').click()}>
              <input id="fileInput" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:'none'}} />
              <div style={{fontSize:'40px',marginBottom:'8px'}}>{fileName ? '✅' : '📂'}</div>
              <div style={{fontWeight:'700',color:'#153F90'}}>{fileName || 'Click to select file'}</div>
              <div style={{fontSize:'12px',color:'#94a3b8',marginTop:'4px'}}>Accepts .xlsx · .xls · .csv{rows.length > 0 ? ` · ${rows.length} rows` : ''}</div>
            </div>
            {preview.length > 0 && !done && (
              <div className="card p-4" style={{overflowX:'auto'}}>
                <div style={{fontSize:'12px',fontWeight:'700',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'12px'}}>Preview (first 5 rows)</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <thead><tr style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                    {Object.keys(preview[0]).slice(0,7).map(k => <th key={k} style={{padding:'8px 12px',textAlign:'left',fontWeight:'600',color:'#64748b'}}>{k}</th>)}
                  </tr></thead>
                  <tbody>{preview.map((row,i) => <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>{Object.keys(preview[0]).slice(0,7).map(k => <td key={k} style={{padding:'8px 12px',color:'#374151'}}>{String(row[k]||'').substring(0,20)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {error && <div style={{padding:'12px 16px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',fontSize:'14px',fontWeight:'600',color:'#dc2626'}}>⚠️ {error}</div>}
            {done && (
              <div className="card p-8 text-center" style={{background:'#f0fdf4',borderColor:'#bbf7d0'}}>
                <div style={{fontSize:'40px',marginBottom:'8px'}}>✅</div>
                <div style={{fontWeight:'700',color:'#15803d',fontSize:'18px'}}>{rows.length} records uploaded!</div>
                <div style={{display:'flex',gap:'12px',justifyContent:'center',marginTop:'16px'}}>
                  <button onClick={() => router.push('/dashboard')} className="btn-primary">View Dashboard</button>
                  <button onClick={() => { setDone(false); setRows([]); setFileName(''); setPreview([]) }} className="btn-secondary">Upload More</button>
                </div>
              </div>
            )}
            {rows.length > 0 && !done && (
              <button onClick={handleUpload} disabled={uploading} className="btn-primary" style={{width:'100%',padding:'14px',fontSize:'16px',opacity:uploading?0.6:1}}>
                {uploading ? '⏳ Uploading...' : `📤 Upload ${rows.length} Records`}
              </button>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
