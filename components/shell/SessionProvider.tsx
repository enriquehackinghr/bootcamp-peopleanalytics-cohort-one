'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppRole } from '@/lib/auth/types'

export interface ClientSession {
  employeeId: string
  fullName: string
  workEmail: string
  appRole: AppRole
  visibleEmployeeCount: number
  reportingBoundary: string
  dataLoadId: string | null
}

type SessionContextValue = {
  session: ClientSession | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session')
      if (!res.ok) {
        setSession(null)
        return
      }
      const data = (await res.json()) as ClientSession
      setSession(data)
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setSession(null)
    window.location.href = '/login'
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ session, loading, refresh, signOut }),
    [session, loading, refresh, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

export function useSessionOptional(): SessionContextValue | null {
  return useContext(SessionContext)
}
