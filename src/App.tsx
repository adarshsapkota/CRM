import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthPage } from './auth/AuthPage'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { useAuth } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { LeadsPage } from './pages/leads/LeadsPage'
import { LeadFormPage } from './pages/leads/LeadFormPage'
import { LeadDetailPage } from './pages/leads/LeadDetailPage'
import { LeadImportPage } from './pages/leads/LeadImportPage'
import { FollowUpsPage } from './pages/FollowUpsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProductsPage } from './pages/ProductsPage'
import { QuotesPage } from './pages/QuotesPage'
import { QuoteBuilderPage } from './pages/QuoteBuilderPage'
import { QuoteDetailPage } from './pages/QuoteDetailPage'
import { DashboardPage } from './pages/DashboardPage'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your workspace…</div>
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/new" element={<LeadFormPage />} />
          <Route path="/leads/import" element={<LeadImportPage />} />
          <Route path="/leads/:leadId/edit" element={<LeadFormPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/quotes/new" element={<QuoteBuilderPage />} />
          <Route path="/quotes/:quoteId" element={<QuoteDetailPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
