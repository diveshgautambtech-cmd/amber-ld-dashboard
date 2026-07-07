'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/dashboard/PageShell'

const TYPE_META: Record<string, { icon: string; color: string }> = {
  SOP:   { icon: '📋', color: '#7C3AED' },
  PPT:   { icon: '📊', color: '#D97706' },
  Video: { icon: '🎬', color: '#DC2626' },
  PDF:   { icon: '📄', color: '#153F90' },
  Form:  { icon: '📝', color: '#16A34A' },
  Other: { icon: '🔗', color: '#6B7280' },
}

export default function LibraryPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [catFilter, setCatFilter] = useState('All')
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState({ title: '', url: '', category: '', type: 'SOP', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchItems() }, [])
  useEffect(() => { applyFilters() }, [items, search, typeFilter, catFilter])

  async function fetchItems() {
    const { data } = await supabase.from('content_library').select('*').order('added_at', { ascending: false })
    if (data) {
      setItems(data)
      setCategories([...new Set(data.map((d: any) => d.category).filter(Boolean))])
    }
    setLoading(false)
  }

  function applyFilters() {
    let out = [...items]
    if (search)            out = out.filter(i => i.title?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter !== 'All') out = out.filter(i => i.type === typeFilter)
    if (catFilter !== 'All')  out = out.filter(i => i.category === catFilter)
    setFiltered(out)
  }

  async function saveItem() {
    if (!form.title || !form.url) return
    setSaving(true)
    if (editItem) {
      await supabase.from('content_library').update({ ...form, added_by: user?.name }).eq('id', editItem.id)
    } else {
      await supabase.from('content_library').insert({ ...form, added_by: user?.name })
    }
    setSaving(false)
    setShowModal(false)
    setEditItem(null)
    setForm({ title: '', url: '', category: '', type: 'SOP', description: '' })
    fetchItems()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item from the library?')) return
    await supabase.from('content_library').delete().eq('id', id)
    fetchItems()
  }

  return (
    <PageShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="card p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-xl text-[#153F90]">📚 Training Content Library</h1>
            <p className="text-xs text-slate-500 mt-0.5">All training resources in one place — SOPs, decks, videos, policy documents</p>
          </div>
          {user?.role === 'admin' && (
            <button onClick={() => { setEditItem(null); setForm({ title:'', url:'', category:'', type:'SOP', description:'' }); setShowModal(true) }}
              className="btn-primary flex items-center gap-2">➕ Add Content</button>
          )}
        </div>

        {/* Search + filters */}
        <div className="card p-4 flex flex-col sm:flex-row gap-3">
          <input className="input flex-grow" placeholder="Search by title, category, description..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input sm:w-44" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="All">🏷️ All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Type pills */}
        <div className="flex flex-wrap gap-2">
          {['All', 'SOP', 'PPT', 'Video', 'PDF', 'Form', 'Other'].map(t => {
            const meta = TYPE_META[t] || { icon: '📚', color: '#153F90' }
            const count = t === 'All' ? items.length : items.filter(i => i.type === t).length
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="text-xs font-bold px-3.5 py-2 rounded-full border-2 transition-all flex items-center gap-1.5"
                style={typeFilter === t
                  ? { background: meta.color, color: '#fff', borderColor: meta.color }
                  : { background: '#fff', color: meta.color, borderColor: meta.color + '40' }}>
                {meta.icon} {t} ({count})
              </button>
            )
          })}
        </div>

        {loading ? <div className="card p-12 text-center text-slate-500">Loading...</div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(item => {
                const meta = TYPE_META[item.type] || TYPE_META.Other
                return (
                  <div key={item.id} className="card p-5 flex flex-col gap-3 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-11 h-11 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: meta.color + '15', color: meta.color }}>{meta.icon}</div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ background: meta.color + '15', color: meta.color }}>{item.type}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 leading-snug">{item.title}</h4>
                      {item.description && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{item.description}</p>}
                    </div>
                    {item.category && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 w-fit">🏷️ {item.category}</span>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100">
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="flex-grow text-center bg-[#153F90] hover:bg-blue-800 text-white text-xs font-bold py-2 rounded-lg transition-all">🔗 Open Resource</a>
                      {user?.role === 'admin' && (
                        <>
                          <button onClick={() => { setEditItem(item); setForm({ title: item.title, url: item.url, category: item.category || '', type: item.type, description: item.description || '' }); setShowModal(true) }}
                            className="text-xs font-semibold text-slate-500 hover:text-[#153F90] px-2 py-1 rounded transition-all">✏️</button>
                          <button onClick={() => deleteItem(item.id)}
                            className="text-xs font-semibold text-red-400 hover:text-red-700 px-2 py-1 rounded transition-all">🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {filtered.length === 0 && (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-3">📭</div>
                <h3 className="font-bold text-lg text-slate-700">No content yet</h3>
                <p className="text-slate-500 text-sm mt-1">{user?.role === 'admin' ? 'Add the first resource using the "Add Content" button.' : 'Admin will add resources soon.'}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-[#153F90] px-6 py-4 flex items-center justify-between">
              <span className="font-display font-bold text-white">{editItem ? '✏️ Edit Content' : '➕ Add Content'}</span>
              <button onClick={() => setShowModal(false)} className="text-white opacity-70 hover:opacity-100 font-bold text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Title *</label>
                <input className="input" placeholder="e.g. POSH Awareness Training Deck" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Link URL *</label>
                <input className="input" placeholder="https://ambergroupindia.sharepoint.com/..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Category</label>
                  <input className="input" list="cats" placeholder="e.g. Safety, POSH" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                  <datalist id="cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Type</label>
                  <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {Object.keys(TYPE_META).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Description (optional)</label>
                <textarea className="input resize-none" rows={3} placeholder="Short description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveItem} disabled={saving || !form.title || !form.url} className="btn-primary disabled:opacity-60">
                {saving ? 'Saving...' : '💾 Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
