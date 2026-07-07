'use client'
import { useState, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'
import * as XLSX from 'xlsx'

interface TNIRow { code: string; name: string; role: string; branch: string; responses: Record<string, string> }

export default function TNIPage() {
  const { user } = useAuth()
  const [tniData, setTniData] = useState<TNIRow[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [topicQuery, setTopicQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [branchFilter, setBranchFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState<'Both' | 'High' | 'Moderate'>('Both')
  const [nominees, setNominees] = useState<TNIRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const branches = user?.role === 'admin'
    ? ['All', ...new Set(tniData.map(r => r.branch).filter(Boolean))]
    : [user?.branch || '']

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = ev => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheetName = wb.SheetNames.find(n => /final|tni/i.test(n)) || wb.SheetNames[0]
      const rows2D = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as any[][]
      if (rows2D.length < 3) { setLoading(false); return }
      const row1 = rows2D[0].map((c: any) => String(c || '').trim())
      const row2 = rows2D[1].map((c: any) => String(c || '').trim())
      let metaCols = 0
      for (let i = 0; i < row1.length; i++) {
        if (row1[i] && !row2[i]) metaCols++
        else break
      }
      if (metaCols < 4) metaCols = 5
      const topicHeaders = row2.slice(metaCols).filter(Boolean)
      const parsed: TNIRow[] = []
      for (let r = 2; r < rows2D.length; r++) {
        const row = rows2D[r]
        if (!row[1]) continue
        const responses: Record<string, string> = {}
        topicHeaders.forEach((t, i) => { responses[t] = String(row[metaCols + i] || '').trim() })
        parsed.push({ code: String(row[1] || '').trim(), name: String(row[3] || '').trim(), role: String(row[2] || '').trim(), branch: String(row[4] || '').trim(), responses })
      }
      setTniData(parsed)
      setTopics(topicHeaders)
      setLoading(false)
    }
    reader.readAsArrayBuffer(file)
  }

  function selectTopic(t: string) {
    setSelectedTopic(t)
    setTopicQuery('')
    setShowSuggestions(false)
    computeNominees(t, branchFilter, priorityFilter)
  }

  function computeNominees(topic: string, branch: string, priority: 'Both' | 'High' | 'Moderate') {
    let pool = tniData.filter(r => r.responses[topic] === 'High' || r.responses[topic] === 'Moderate')
    if (user?.role === 'spoc' && user.branch) pool = pool.filter(r => r.branch.toUpperCase() === user.branch!.toUpperCase())
    else if (branch !== 'All') pool = pool.filter(r => r.branch === branch)
    if (priority === 'High') pool = pool.filter(r => r.responses[topic] === 'High')
    else if (priority === 'Moderate') pool = pool.filter(r => r.responses[topic] === 'Moderate')
    pool.sort((a, b) => (a.responses[topic] === 'High' ? -1 : 1) || a.name.localeCompare(b.name))
    setNominees(pool)
  }

  function handleBranchFilter(val: string) {
    setBranchFilter(val)
    if (selectedTopic) computeNominees(selectedTopic, val, priorityFilter)
  }

  function handlePriorityFilter(val: 'Both' | 'High' | 'Moderate') {
    setPriorityFilter(val)
    if (selectedTopic) computeNominees(selectedTopic, branchFilter, val)
  }

  async function nominateAll() {
    if (!nominees.length || !selectedTopic) return
    if (!confirm(`Nominate all ${nominees.length} employees for "${selectedTopic}"?`)) return
    setUploading(true)
    const inserts = nominees.map(r => ({
      emp_code: r.code, emp_name: r.name, branch: r.branch,
      training_categories: selectedTopic, total_man_hours: 0,
      month: 'Pending Nomination', uploaded_by: user?.name || '',
    }))
    await supabase.from('training_mis').insert(inserts)
    setUploading(false)
    alert(`✅ ${nominees.length} employees nominated for "${selectedTopic}"`)
  }

  function exportCSV() {
    if (!nominees.length) return
    let csv = `Amber Group India — Training Nominee List\nTopic: ${selectedTopic}\nGenerated: ${new Date().toLocaleString('en-IN')}\n\nEmployee Code,Name,Role,Branch,Priority\n`
    nominees.forEach(r => { csv += `"${r.code}","${r.name}","${r.role}","${r.branch}","${r.responses[selectedTopic]}"\n` })
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `TNI_Nominees_${selectedTopic.replace(/[^a-z0-9]/gi,'_').substring(0,30)}.csv`
    a.click()
  }

  const suggestions = topicQuery
    ? topics.filter(t => t.toLowerCase().includes(topicQuery.toLowerCase())).slice(0, 20)
    : topics.slice(0, 20)

  const highCount = nominees.filter(r => r.responses[selectedTopic] === 'High').length
  const modCount  = nominees.filter(r => r.responses[selectedTopic] === 'Moderate').length

  return (
    <PageShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-xl text-[#153F90]">🎯 Training Needs Identification (TNI)</h1>
            <p className="text-xs text-slate-500 mt-0.5">Find employees who requested a topic — nominate them directly into Training MIS</p>
          </div>
          {tniData.length > 0 && (
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full font-semibold text-blue-800">
                {tniData.length.toLocaleString()} responses · {topics.length} topics
              </span>
            </div>
          )}
        </div>

        {/* Upload */}
        {tniData.length === 0 && (
          <div className="card p-10 text-center border-2 border-dashed border-slate-300 hover:border-[#153F90] transition-all relative cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <div className="text-4xl mb-3">📋</div>
            <h3 className="font-bold text-[#153F90] text-lg">Upload TNI Excel Sheet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Upload your 06_TNI.xlsx file — employee High/Moderate/Low responses per training topic</p>
            <div className="mt-4 inline-block bg-[#153F90] text-white text-xs font-bold px-5 py-2.5 rounded-lg">
              {loading ? '⏳ Reading file...' : '📂 Select TNI File'}
            </div>
          </div>
        )}

        {tniData.length > 0 && (
          <>
            {user?.role === 'spoc' && (
              <div className="spoc-banner"><span>🔒</span><span>Showing nominees from <strong>{user.branch}</strong> only</span></div>
            )}

            {/* Topic search */}
            <div className="card p-5 relative">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">🔍 Search Training Topic</label>
              <input className="input" placeholder={`Search ${topics.length} training topics...`}
                value={topicQuery}
                onChange={e => { setTopicQuery(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)} />
              {selectedTopic && (
                <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-bold text-[#153F90]">📌 Selected:</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1">{selectedTopic}</span>
                  <button onClick={() => { setSelectedTopic(''); setNominees([]) }} className="text-xs text-slate-400 hover:text-red-500">✕ Clear</button>
                </div>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-5 right-5 top-full mt-1 bg-white border-2 border-[#153F90] rounded-xl shadow-xl z-20 max-h-72 overflow-y-auto">
                  {suggestions.map(t => {
                    const pool = user?.role === 'spoc' && user.branch
                      ? tniData.filter(r => r.branch.toUpperCase() === user.branch!.toUpperCase())
                      : tniData
                    const cnt = pool.filter(r => r.responses[t] === 'High' || r.responses[t] === 'Moderate').length
                    return (
                      <div key={t} onClick={() => selectTopic(t)}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-slate-100 last:border-0 text-sm">
                        <span className="font-medium text-slate-800">{t}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0 ml-3">
                          {cnt} {user?.role === 'spoc' ? 'in your branch' : 'interested'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedTopic && (
              <>
                {/* Filters */}
                <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {user?.role === 'admin' && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">🏢 Branch</label>
                      <select className="input sm:w-48" value={branchFilter} onChange={e => handleBranchFilter(e.target.value)}>
                        {branches.map(b => <option key={b} value={b}>{b === 'All' ? '🏢 All Branches' : b}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">⭐ Priority</label>
                    <div className="flex gap-2">
                      {(['Both', 'High', 'Moderate'] as const).map(p => (
                        <button key={p} onClick={() => handlePriorityFilter(p)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all
                            ${priorityFilter === p
                              ? p === 'High' ? 'bg-red-600 text-white border-red-600'
                                : p === 'Moderate' ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-[#153F90] text-white border-[#153F90]'
                              : p === 'High' ? 'text-red-600 border-red-300 bg-white'
                                : p === 'Moderate' ? 'text-amber-600 border-amber-300 bg-white'
                                : 'text-[#153F90] border-blue-300 bg-white'}`}>
                          {p === 'Both' ? '⭐ High + Moderate' : p === 'High' ? '🔴 High Only' : '🟡 Moderate Only'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'High Priority', value: highCount, color: '#DC2626', bg: '#FEF2F2', desc: 'Immediate Requirement' },
                    { label: 'Moderate Priority', value: modCount, color: '#D97706', bg: '#FFFBEB', desc: 'Not Immediate but Required' },
                    { label: 'Total Nominees', value: nominees.length, color: '#153F90', bg: '#EEF3FB', desc: 'High + Moderate' },
                  ].map(k => (
                    <div key={k.label} className="card p-5 text-center" style={{ borderTop: `3px solid ${k.color}`, background: k.bg }}>
                      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: k.color }}>{k.label}</div>
                      <div className="font-display font-extrabold text-3xl" style={{ color: k.color }}>{k.value}</div>
                      <div className="text-xs mt-1" style={{ color: k.color }}>{k.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Nominee table */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="font-bold text-[#153F90]">👥 Eligible Nominees — <span className="text-slate-600">{selectedTopic}</span></h3>
                    <div className="flex gap-2">
                      <button onClick={exportCSV} className="btn-secondary border-[#153F90] text-[#153F90]">📥 Export List</button>
                      <button onClick={nominateAll} disabled={uploading || nominees.length === 0} className="btn-primary disabled:opacity-60">
                        {uploading ? '⏳ Nominating...' : `✅ Nominate All (${nominees.length})`}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                          <th className="px-4 py-3 text-left">Employee Code</th>
                          <th className="px-4 py-3 text-left">Name</th>
                          <th className="px-4 py-3 text-left">Role</th>
                          <th className="px-4 py-3 text-left">Branch</th>
                          <th className="px-4 py-3 text-center">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {nominees.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs text-[#153F90] font-bold">{r.code}</td>
                            <td className="px-4 py-3 font-semibold">{r.name}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{r.role}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{r.branch}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={r.responses[selectedTopic] === 'High' ? 'badge-high' : 'badge-mod'}>
                                {r.responses[selectedTopic] === 'High' ? '🔴 High' : '🟡 Moderate'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {nominees.length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-sm">No employees match the current filters for this topic.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
