'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './supabase'

export type UserRole = 'admin' | 'spoc'

export interface AuthUser {
  id: string
  empCode: string
  name: string
  role: UserRole
  branch: string | null
  email: string | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (empCode: string, password: string, role: UserRole) => Promise<{ error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session from sessionStorage
    const saved = sessionStorage.getItem('amber_user')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (empCode: string, password: string, role: UserRole) => {
    const { data, error } = await supabase
      .from('spoc_users')
      .select('*')
      .eq('emp_code', empCode.toUpperCase())
      .eq('role', role)
      .single()

    if (error || !data) return { error: 'Employee Code not found.' }

    // Simple password check (in production use bcrypt via API route)
    if (data.password !== password) return { error: 'Incorrect password.' }

    const authUser: AuthUser = {
      id: data.id,
      empCode: data.emp_code,
      name: data.name,
      role: data.role,
      branch: data.branch,
      email: data.email,
    }

    setUser(authUser)
    sessionStorage.setItem('amber_user', JSON.stringify(authUser))

    // Log session
    await supabase.from('audit_log').insert({
      user_name: data.name,
      emp_code: data.emp_code,
      branch: data.branch,
      role: data.role,
      action: 'Login',
    })

    return {}
  }

  const logout = async () => {
    if (user) {
      await supabase.from('audit_log').insert({
        user_name: user.name,
        emp_code: user.empCode,
        branch: user.branch,
        role: user.role,
        action: 'Logout',
      })
    }
    setUser(null)
    sessionStorage.removeItem('amber_user')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
