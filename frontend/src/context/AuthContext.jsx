import { createContext, useContext, useState, useCallback } from 'react'
import { parseTokenPayload, logout as apiLogout } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [payload, setPayload] = useState(() => parseTokenPayload())

  const refreshAuth = useCallback(() => {
    setPayload(parseTokenPayload())
  }, [])

  const logout = useCallback(() => {
    apiLogout()
    setPayload(null)
  }, [])

  return (
    <AuthContext.Provider value={{ payload, refreshAuth, logout, isAdmin: payload?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}