import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FilePlus2, LoaderCircle, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { errorText, formatPrice } from './leads/leadUtils'
import type { Category, Lead, ProductPrice } from './leads/types'

type QuoteProduct = { id: string; name: string; description: string | null; is_active: boolean }
type QuoteLine = { product_id: string; product_name: string; description: string; price_id: string; billing_type: ProductPrice['billing_type']; currency: string; quantity: number; unit_price: number }
type QuoteItemSnapshot = QuoteLine & { line_total: number }

export function QuoteBuilderPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [products, setProducts] = useState<QuoteProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [leadId, setLeadId] = useState('')
  const [lines, setLines] = useState<QuoteLine[]>([])
  const [discount, setDiscount] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedLead = leads.find((lead) => lead.id === leadId)
  const candidatePrices = (productId: string) => prices.filter((price) => price.product_id === productId && (price.category_id === selectedLead?.category_id || price.category_id === null) && (!lines.length || price.currency === lines[0].currency))
  const getPriceOptions = (productId: string) => {
    const candidates = candidatePrices(productId)
    const grouped = new Map<string, ProductPrice[]>()
    for (const price of candidates) { const key = `${price.billing_type}|${price.currency}`; grouped.set(key, [...(grouped.get(key) ?? []), price]) }
    return [...grouped.values()].map((group) => (selectedLead?.category_id ? group.find((p) => p.category_id === selectedLead.category_id) : undefined) ?? group.find((p) => p.category_id === null)!).filter(Boolean)
  }

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [l, p, pr, c] = await Promise.all([
          supabase.from('leads').select('*').order('company_name'),
          supabase.from('products').select('id,name,description,is_active').eq('is_active', true).order('name'),
          supabase.from('product_prices').select('id,product_id,category_id,price,billing_type,currency'),
          supabase.from('categories').select('id,name'),
        ])
        const failure = l.error ?? p.error ?? pr.error ?? c.error
        if (failure) throw failure
        if (!alive) return
        setLeads((l.data ?? []) as Lead[]); setProducts((p.data ?? []) as QuoteProduct[]); setPrices((pr.data ?? []) as ProductPrice[]); setCategories((c.data ?? []) as Category[])
      } catch (e) { if (alive) setError(errorText(e)) }
      finally { if (alive) setLoading(false) }
    }
    void load(); return () => { alive = false }
  }, [])

  function addProduct(event: ChangeEvent<HTMLSelectElement>) {
    const productId = event.target.value
    event.target.value = ''
    const product = products.find((p) => p.id === productId)
    const price = getPriceOptions(productId)[0]
    if (!product) return
    if (!price) { setError(`No price is configured for ${product.name} in this lead’s category.`); return }
    if (lines.length && lines[0].currency !== price.currency) { setError(`All quote items must use the same currency (${lines[0].currency}).`); return }
    setError('')
    setLines((current) => [...current, { product_id: product.id, product_name: product.name, description: product.description ?? '', price_id: price.id, billing_type: price.billing_type, currency: price.currency, quantity: 1, unit_price: Number(price.price) }])
  }
  function updateBilling(index: number, priceId: string) {
    const row = lines[index]
    const price = getPriceOptions(row.product_id).find((p) => p.id === priceId)
    if (!price) return
    if (lines.some((_, i) => i !== index) && lines[0].currency !== price.currency) { setError(`All quote items must use the same currency (${lines[0].currency}).`); return }
    setError('')
    setLines((current) => current.map((line, i) => i === index ? { ...line, price_id: price.id, billing_type: price.billing_type, currency: price.currency, unit_price: Number(price.price) } : line))
  }
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  const discountPercent = Math.min(100, Math.max(0, Number(discount) || 0))
  const total = Math.max(0, subtotal - subtotal * discountPercent / 100)
  const currency = lines[0]?.currency ?? 'NPR'

  async function saveQuote() {
    if (!selectedLead || !lines.length) { setError('Select a lead and add at least one product.'); return }
    setSaving(true); setError('')
    const items: QuoteItemSnapshot[] = lines.map((line) => ({ ...line, line_total: line.unit_price * line.quantity }))
    const { data, error } = await supabase.from('quotes').insert({ lead_id: selectedLead.id, owner_id: user?.id, items, subtotal, discount_percent: discountPercent, total, currency, status: 'draft' }).select('id').single()
    setSaving(false)
    if (error) { setError(error.message); return }
    toast('Quote saved. You can print or save it as a PDF.')
    navigate(`/quotes/${data.id}`, { replace: true })
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading quote builder…</div>
  return <div className="mx-auto max-w-5xl">
    <Link to="/quotes" className="no-print mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Back to quotes</Link>
    <div className="no-print mb-6"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create quote</h1><p className="mt-1 text-sm text-slate-500">Choose a lead and products. Prices use the lead’s category.</p></div>
    {error && <div role="alert" className="no-print mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <div className="no-print mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Lead<select className="field mt-1.5" value={leadId} onChange={(e) => { setLeadId(e.target.value); setLines([]); setError('') }}><option value="">Select a lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company_name}{lead.category_id ? ` · ${categories.find((c) => c.id === lead.category_id)?.name ?? ''}` : ''}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Add product<select disabled={!leadId} className="field mt-1.5" value="" onChange={addProduct}><option value="">Choose a product…</option>{products.filter((p) => !lines.some((line) => line.product_id === p.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></div>
    <section className="quote-paper rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><div className="text-sm font-bold uppercase tracking-widest text-indigo-600">CRM by Aadu</div><h2 className="mt-3 text-2xl font-semibold text-slate-900">Sales quote</h2></div><div className="text-right text-sm text-slate-500">Date<br/><span className="font-medium text-slate-800">{new Date().toLocaleDateString()}</span></div></div>
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prepared for</p>
        {selectedLead ? (
          <div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectedLead.company_name}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {[selectedLead.contact_person, selectedLead.email, selectedLead.phone].filter(Boolean).join(' · ')}
            </p>
            {selectedLead.address && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{selectedLead.address}</p>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Select a lead to preview company details.</p>
        )}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Product</th><th className="px-3 py-3">Billing</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Line total</th><th className="no-print px-3 py-3"/></tr></thead><tbody className="divide-y divide-slate-100">{lines.length ? lines.map((line, index) => <tr key={line.product_id}><td className="px-3 py-3"><p className="font-medium text-slate-800">{line.product_name}</p>{line.description && <p className="mt-1 text-xs text-slate-500">{line.description}</p>}</td><td className="px-3 py-3"><select className="no-print field !py-1.5" value={line.price_id} onChange={(e) => updateBilling(index, e.target.value)}>{getPriceOptions(line.product_id).map((price) => <option key={price.id} value={price.id}>{price.billing_type} · {price.currency}</option>)}</select><span className="print-only">{line.billing_type}</span></td><td className="px-3 py-3 text-right"><input className="no-print field ml-auto w-20 !py-1.5 text-right" type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLines((current) => current.map((x, i) => i === index ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}/><span className="print-only">{line.quantity}</span></td><td className="px-3 py-3 text-right">{formatPrice(line.unit_price, line.currency)}</td><td className="px-3 py-3 text-right font-medium">{formatPrice(line.quantity * line.unit_price, line.currency)}</td><td className="no-print px-3 py-3 text-right"><button onClick={() => setLines((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${line.product_name}`} className="rounded p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={15}/></button></td></tr>) : <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">Select products above to add quote items.</td></tr>}</tbody></table></div>
      <div className="mt-6 flex justify-end"><div className="w-full max-w-xs space-y-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatPrice(subtotal, currency)}</span></div><div className="no-print flex items-center justify-between gap-4 text-slate-600"><label htmlFor="discount">Discount (%)</label><input id="discount" className="field w-24 !py-1.5 text-right" type="number" min="0" max="100" step="0.1" value={discount} onChange={(e) => setDiscount(e.target.value)}/></div>{discountPercent > 0 && <div className="flex justify-between text-slate-600"><span>Discount ({discountPercent}%)</span><span>−{formatPrice(subtotal * discountPercent / 100, currency)}</span></div>}<div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Total</span><span>{formatPrice(total, currency)}</span></div></div></div>
    </section>
    <div className="no-print mt-5 flex justify-end gap-2"><button onClick={() => window.print()} disabled={!lines.length} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Print / Save PDF</button><button onClick={() => void saveQuote()} disabled={saving || !selectedLead || !lines.length} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin"/> : <FilePlus2 size={16}/>}Save quote</button></div>
  </div>
}
