import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Layers3 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AuthPageProps = { mode: 'login' | 'signup' }

export function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === 'signup'
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')

    const result = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }

    if (isSignup && !result.data.session) {
      setMessage('Account created. Check your email to confirm your address, then sign in.')
      return
    }
    navigate(redirectTo, { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><Layers3 size={19} /></span>
          CRM <span className="font-medium text-slate-400">by Aadu</span>
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm text-slate-500">{isSignup ? 'Start organizing your sales workspace.' : 'Sign in to continue to your workspace.'}</p>
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field mt-2" placeholder="you@company.com" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input required minLength={6} type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-2" placeholder="At least 6 characters" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'} {!busy && <ArrowRight size={16} />}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {isSignup ? 'Already have an account?' : 'New to CRM by Aadu?'}{' '}
            <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
