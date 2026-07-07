'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'

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
    const saved = sessionStorage.getItem('amber_user')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (empCode: string, password: string, role: UserRole) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode: empCode.toUpperCase(), password, role })
      })
      const result = await res.json()
      if (result.error) return { error: result.error }

      const authUser: AuthUser = result.user
      setUser(authUser)
      sessionStorage.setItem('amber_user', JSON.stringify(authUser))
      return {}
    } catch (e) {
      return { error: 'Connection error. Please try again.' }
    }
  }

  const logout = () => {
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