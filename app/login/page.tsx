'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, UserRole } from '@/lib/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [tab, setTab] = useState<UserRole>('spoc')
  const [empCode, setEmpCode] = useState('')
  const [password, setPassword] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPwd, setAdminPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleLogin = async () => {
    setError(''); setLoading(true)
    const code = tab === 'admin' ? adminUser : empCode
    const pwd  = tab === 'admin' ? adminPwd  : password
    if (!code.trim()) { setError('Please enter your Employee Code.'); setLoading(false); return }
    if (!pwd.trim())  { setError('Please enter your password.'); setLoading(false); return }
    const result = await login(code.trim(), pwd.trim(), tab)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    router.replace('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#153F90] to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="https://www.ambergroupindia.com/wp-content/uploads/2025/02/Amber-Logo-on-white.png"
            alt="Amber Group" className="h-12 mx-auto object-contain mb-3" />
          <h1 className="font-display font-bold text-xl text-[#153F90]">L&D Training Intelligence Portal</h1>
          <p className="text-xs text-slate-500 mt-1">Secure login — authorised personnel only</p>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-6">
          <button onClick={() => { setTab('spoc'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-bold transition-all ${tab === 'spoc' ? 'bg-[#153F90] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
            🏢 HR SPOC Login
          </button>
          <button onClick={() => { setTab('admin'); setError('') }}
            className={`flex-1 py-2.5 text-sm font-bold transition-all ${tab === 'admin' ? 'bg-[#153F90] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
            👑 Admin Login
          </button>
        </div>

        {/* SPOC fields */}
        {tab === 'spoc' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Employee Code</label>
              <input className="input" placeholder="e.g. ILS2654" value={empCode}
                onChange={e => setEmpCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPwd ? 'text' : 'password'}
                  placeholder="Enter your password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin fields */}
        {tab === 'admin' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Admin Username</label>
              <input className="input" placeholder="AmberHRAdmin" value={adminUser}
                onChange={e => setAdminUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPwd ? 'text' : 'password'}
                  placeholder="Enter admin password" value={adminPwd}
                  onChange={e => setAdminPwd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Login button */}
        <button onClick={handleLogin} disabled={loading}
          className="btn-primary w-full mt-5 flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? '⏳ Logging in...' : '🔐 Login to Dashboard'}
        </button>

        <p className="text-center text-xs text-slate-400 mt-4">Amber Group India · Confidential Internal Tool</p>
      </div>
    </div>
  )
}
