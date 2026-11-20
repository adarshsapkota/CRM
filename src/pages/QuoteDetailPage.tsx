import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { errorText, formatPrice } from './leads/leadUtils'
import type { Lead } from './leads/types'

type Item = { product_id: string; product_name: string; description: string; billing_type: string; currency: string; quantity: number; unit_price: number; line_total: number }
type Quote = { id: string; lead_id: string; items: Item[]; subtotal: number; discount_percent: number; total: number; currency: string; status: string; created_at: string }

export function QuoteDetailPage() {
  const { quoteId = '' } = useParams()
  const toast = useToast()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const { data, error } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle()
        if (error) throw error
        if (!data) throw new Error('Quote not found or you do not have access to it.')
        const { data: lead, error: leadError } = await supabase.from('leads').select('*').eq('id', data.lead_id).maybeSingle()
        if (leadError) throw leadError
        if (!alive) return
        setQuote(data as Quote); setLead(lead as Lead | null)
      } catch (e) { if (alive) setError(errorText(e)) }
      finally { if (alive) setLoading(false) }
    }
    void load(); return () => { alive = false }
  }, [quoteId])
  async function updateStatus(status: string) {
    if (!quote) return
    setSaving(true); setError('')
    const { error } = await supabase.from('quotes').update({ status }).eq('id', quote.id)
    setSaving(false)
    if (error) setError(error.message); else { setQuote({ ...quote, status }); toast(`Quote marked ${status}.`) }
  }
  if (loading) return <div className="py-20 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading quote…</div>
  if (!quote || !lead) return <div><Link to="/quotes" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>Back to quotes</Link><div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || 'Quote lead was not found.'}</div></div>
  return <div className="mx-auto max-w-5xl">
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3"><Link to="/quotes" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Back to quotes</Link><div className="flex items-center gap-2"><label className="sr-only" htmlFor="quote-status">Quote status</label><select id="quote-status" disabled={saving} value={quote.status} onChange={(e) => void updateStatus(e.target.value)} className="field !w-auto !py-2"><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Printer size={16}/>Print / Save PDF</button></div></div>
    {error && <div role="alert" className="no-print mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <article className="quote-paper rounded-xl border border-slate-200 bg-white p-5 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">CRM by Aadu</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Quote</h1><p className="mt-2 text-sm text-slate-500">Reference {quote.id.slice(0, 8).toUpperCase()}</p></div><div className="text-right text-sm text-slate-500"><p>Date</p><p className="mt-1 font-medium text-slate-900">{new Date(quote.created_at).toLocaleDateString()}</p><p className="mt-3">Status</p><p className="mt-1 font-semibold capitalize text-slate-900">{quote.status}</p></div></header>
      <section className="my-7"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prepared for</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{lead.company_name}</h2>{lead.contact_person && <p className="mt-1 text-sm text-slate-600">{lead.contact_person}</p>}{lead.email && <p className="mt-1 text-sm text-slate-600">{lead.email}</p>}{lead.address && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{lead.address}</p>}</section>
      <div className="space-y-3 md:hidden">{quote.items.map((item, i) => <section key={`${item.product_id}-${i}`} className="rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium text-slate-800">{item.product_name}</p>{item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}</div><span className="shrink-0 text-xs capitalize text-slate-500">{item.billing_type}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-400">Qty</dt><dd className="mt-1 text-slate-700">{item.quantity}</dd></div><div><dt className="text-slate-400">Unit price</dt><dd className="mt-1 text-slate-700">{formatPrice(item.unit_price, item.currency)}</dd></div></dl><div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-900">{formatPrice(item.line_total, item.currency)}</span></div></section>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Product</th><th className="px-3 py-3">Billing</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{quote.items.map((item, i) => <tr key={`${item.product_id}-${i}`}><td className="px-3 py-4"><p className="font-medium text-slate-800">{item.product_name}</p>{item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}</td><td className="px-3 py-4 capitalize text-slate-600">{item.billing_type}</td><td className="px-3 py-4 text-right">{item.quantity}</td><td className="px-3 py-4 text-right">{formatPrice(item.unit_price, item.currency)}</td><td className="px-3 py-4 text-right font-medium">{formatPrice(item.line_total, item.currency)}</td></tr>)}</tbody></table></div>
      <div className="ml-auto mt-6 w-full max-w-xs space-y-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatPrice(quote.subtotal, quote.currency)}</span></div>{Number(quote.discount_percent) > 0 && <div className="flex justify-between text-slate-600"><span>Discount ({quote.discount_percent}%)</span><span>−{formatPrice(Number(quote.subtotal) * Number(quote.discount_percent) / 100, quote.currency)}</span></div>}<div className="flex justify-between border-t border-slate-300 pt-3 text-lg font-bold text-slate-900"><span>Total</span><span>{formatPrice(quote.total, quote.currency)}</span></div></div>
      <footer className="mt-12 border-t border-slate-100 pt-4 text-xs text-slate-400">Thank you for considering our software solutions.</footer>
    </article>
  </div>
}
