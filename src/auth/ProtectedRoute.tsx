import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your workspace…</div>
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
