'use client'
import { useAuth } from '@/lib/auth'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
const navLinks = [
  { href: '/dashboard', label: '📊 Coverage' },
  { href: '/dashboard/manhours', label: '⏱ Manhours' },
  { href: '/dashboard/trends', label: '📈 Trends' },
  { href: '/dashboard/md-review', label: '📋 MD Review' },
  { href: '/esg', label: '🌱 ESG Report' },
  { href: '/library', label: '📚 Content Library' },
  { href: '/tni', label: '🎯 Training Needs' },
  { href: '/report', label: '📄 Report' },
]
const adminLinks = [
  { href: '/upload', label: '📤 Upload Data' },
  { href: '/admin', label: '🔍 Admin Panel' },
]
export default function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const handleLogout = () => { logout(); router.replace('/login') }
  if (!user) return null
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <img src="https://www.ambergroupindia.com/wp-content/uploads/2025/02/Amber-Logo-on-white.png"
            alt="Amber" className="h-8 object-contain flex-shrink-0" />
          <div className="hidden sm:block">
            <div className="font-display font-bold text-sm text-[#153F90]">L&D Training Intelligence Portal</div>
            <div className="text-xs text-slate-400">
              {user.branch ? `${user.branch}` : 'All Branches'}
            </div>
          </div>
          {/* Nav links */}
          <nav className="flex items-center gap-1 flex-wrap ml-4">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                  ${pathname === link.href
                    ? 'bg-[#153F90] text-white shadow-sm'
                    : 'text-slate-600 hover:text-[#153F90] hover:bg-blue-50'}`}>
                {link.label}
              </Link>
            ))}
            {user.role === 'admin' && adminLinks.map(link => (
              <Link key={link.href} href={link.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                  ${pathname === link.href
                    ? 'bg-[#153F90] text-white shadow-sm'
                    : 'text-slate-600 hover:text-[#153F90] hover:bg-blue-50'}`}>
                {link.label}
              </Link>
            ))}
          </nav>
          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${user.role === 'admin' ? 'badge-admin' : 'badge-spoc'}`}>
              {user.role === 'admin' ? '👑 Admin' : `🏢 ${user.branch}`}
            </span>
            <span className="hidden md:block text-xs text-slate-500 font-semibold">{user.name}</span>
            <button onClick={handleLogout} className="btn-secondary text-xs">🚪 Logout</button>
          </div>
        </div>
      </div>
    </header>
  )
}
