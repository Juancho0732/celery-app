import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { claimInvites, listMyBusinesses } from '../lib/api'
import type { BusinessWithRole } from '../lib/types'

interface AuthState {
  session: Session | null
  /** true mientras se revisa si hay una sesión guardada. */
  loading: boolean
  /** true cuando se llegó desde el enlace de "recuperar contraseña". */
  recovering: boolean
  businesses: BusinessWithRole[]
  businessesLoading: boolean
  businessesError: unknown
  reloadBusinesses: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [businesses, setBusinesses] = useState<BusinessWithRole[]>([])
  const [businessesLoading, setBusinessesLoading] = useState(false)
  const [businessesError, setBusinessesError] = useState<unknown>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const reloadBusinesses = useCallback(async () => {
    if (!userId) {
      setBusinesses([])
      return
    }
    setBusinessesLoading(true)
    setBusinessesError(null)
    try {
      // Si alguien invitó este correo antes de que tuviera cuenta, aquí se une.
      await claimInvites().catch(() => 0)
      setBusinesses(await listMyBusinesses(userId))
    } catch (e) {
      setBusinessesError(e)
    } finally {
      setBusinessesLoading(false)
    }
  }, [userId])

  useEffect(() => { void reloadBusinesses() }, [reloadBusinesses])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setBusinesses([])
    setRecovering(false)
  }, [])

  return (
    <AuthContext.Provider value={{
      session, loading, recovering, businesses, businessesLoading, businessesError, reloadBusinesses, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
