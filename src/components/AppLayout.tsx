import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, FileText, LayoutDashboard, Layers3, LogOut, Menu, Package, Settings, Users, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Leads', to: '/leads', icon: Users },
  { label: 'Follow-ups', to: '/follow-ups', icon: CalendarDays },
  { label: 'Products', to: '/products', icon: Package },
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Settings', to: '/settings', icon: Settings },
]

export function AppLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Could not sign out:', error.message)
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex h-[72px] items-center gap-3 border-b border-white/10 px-6 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500"><Layers3 size={19} /></span>
        <span className="text-base font-bold tracking-tight">CRM <span className="font-medium text-slate-400">by Aadu</span></span>
      </Link>
      <div className="px-4 pt-7">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
        <nav className="space-y-1">
          {navItems.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-indigo-500/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <Icon size={18} strokeWidth={1.8} />{label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-4">
        <div className="mb-3 flex min-w-0 items-center gap-3 px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold uppercase text-slate-200">{user?.email?.slice(0, 2) ?? 'U'}</div>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
        </div>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"><LogOut size={17} />Sign out</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden">
        <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/40" />
        <aside className="relative h-full w-72 max-w-[85vw]">{sidebar}</aside>
      </div>}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8">
          <button aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen(!mobileOpen)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
          <div className="hidden text-sm text-slate-500 sm:block">Your sales workspace</div>
          <button aria-label="Notifications" className="ml-auto rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><Bell size={19} /></button>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
