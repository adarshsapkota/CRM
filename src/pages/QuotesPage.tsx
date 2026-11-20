import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, LoaderCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { errorText } from './leads/leadUtils'
import type { Lead } from './leads/types'

type QuoteRow = { id: string; lead_id: string; total: number; currency: string; status: string; created_at: string }
export function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [leads, setLeads] = useState<Record<string, Lead>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.from('quotes').select('id,lead_id,total,currency,status,created_at').order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as QuoteRow[]
      setQuotes(rows)
      const ids = [...new Set(rows.map((q) => q.lead_id))]
      if (ids.length) {
        const { data: leads, error: leadsError } = await supabase.from('leads').select('*').in('id', ids)
        if (leadsError) throw leadsError
        setLeads(Object.fromEntries((leads ?? []).map((lead) => [lead.id, lead as Lead])))
      } else setLeads({})
    } catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <div className="mx-auto max-w-5xl">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Quotes</h1><p className="mt-2 text-sm text-slate-500">Prepare and track product quotes for your leads.</p></div><Link to="/quotes/new" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><FilePlus2 size={17}/>Create quote</Link></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}<p className="mt-1 text-xs">Run the catalog and quotes SQL migration in Supabase SQL Editor if the quotes table does not exist.</p></div>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">{loading ? <div className="py-16 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading quotes…</div> : quotes.length ? <div className="divide-y divide-slate-100">{quotes.map((quote) => <Link key={quote.id} to={`/quotes/${quote.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"><div><p className="font-semibold text-slate-900">{leads[quote.lead_id]?.company_name ?? 'Lead quote'}</p><p className="mt-1 text-xs text-slate-500">{new Date(quote.created_at).toLocaleDateString()} · {quote.status}</p></div><p className="text-sm font-semibold text-slate-800">{quote.currency} {Number(quote.total).toLocaleString()}</p></Link>)}</div> : <div className="py-16 text-center"><p className="text-sm font-medium text-slate-700">No quotes saved yet</p><p className="mt-1 text-sm text-slate-500">Create a quote from the products and prices for a lead.</p></div>}</section>
  </div>
}
