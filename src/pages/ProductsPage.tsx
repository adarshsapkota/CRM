import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { errorText } from './leads/leadUtils'
import type { Category, Product } from './leads/types'

type Price = { id: string; product_id: string; category_id: string | null; price: number; billing_type: 'one-time' | 'monthly' | 'yearly'; currency: string }
const billingOptions: Price['billing_type'][] = ['one-time', 'monthly', 'yearly']

export function ProductsPage() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [priceForm, setPriceForm] = useState({ product_id: '', category_id: '', price: '', billing_type: 'one-time' as Price['billing_type'], currency: 'NPR' })
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState({ category_id: '', price: '', billing_type: 'one-time' as Price['billing_type'], currency: 'NPR' })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [p, c, pr] = await Promise.all([
      supabase.from('products').select('id,name,description,is_active').order('name'),
      supabase.from('categories').select('id,name').order('name'),
      supabase.from('product_prices').select('id,product_id,category_id,price,billing_type,currency').order('product_id'),
    ])
    const failure = p.error ?? c.error ?? pr.error
    if (failure) setError(errorText(failure))
    else { setProducts((p.data ?? []) as Product[]); setCategories((c.data ?? []) as Category[]); setPrices((pr.data ?? []) as Price[]) }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  function resetProductForm() { setEditingProduct(null); setProductName(''); setDescription('') }
  function editProduct(product: Product) { setEditingProduct(product.id); setProductName(product.name); setDescription(product.description ?? '') }
  async function saveProduct(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    const name = productName.trim()
    if (!name) { setError('Enter a product name.'); return }
    setBusy(true)
    const result = editingProduct
      ? await supabase.from('products').update({ name, description: description.trim() || null }).eq('id', editingProduct)
      : await supabase.from('products').insert({ name, description: description.trim() || null })
    setBusy(false)
    if (result.error) { setError(errorText(result.error)); return }
    setSuccess(editingProduct ? 'Product updated.' : 'Product added.'); toast(editingProduct ? 'Product updated.' : 'Product added.'); resetProductForm(); await load()
  }
  async function toggleActive(product: Product) {
    setBusy(true); setError('')
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    setBusy(false)
    if (error) setError(errorText(error)); else { toast(product.is_active ? 'Product deactivated.' : 'Product activated.'); await load() }
  }
  async function savePrice(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    const { error } = await supabase.from('product_prices').insert({ product_id: priceForm.product_id, category_id: priceForm.category_id || null, price: Number(priceForm.price), billing_type: priceForm.billing_type, currency: priceForm.currency.toUpperCase() })
    setBusy(false)
    if (error) { setError(errorText(error)); return }
    setSuccess('Price added to the matrix.'); toast('Price added to the matrix.'); setPriceForm((f) => ({ ...f, price: '' })); await load()
  }
  async function savePriceEdit(id: string) {
    setBusy(true); setError('')
    const { error } = await supabase.from('product_prices').update({ category_id: priceDraft.category_id || null, price: Number(priceDraft.price), billing_type: priceDraft.billing_type, currency: priceDraft.currency.toUpperCase() }).eq('id', id)
    setBusy(false)
    if (error) setError(errorText(error)); else { setEditingPrice(null); setSuccess('Price updated.'); toast('Price updated.'); await load() }
  }
  async function deletePrice(price: Price) {
    if (!window.confirm('Delete this price from the matrix?')) return
    const { error } = await supabase.from('product_prices').delete().eq('id', price.id)
    if (error) setError(errorText(error)); else { setSuccess('Price removed.'); toast('Price removed.'); await load() }
  }
  const productById = Object.fromEntries(products.map((p) => [p.id, p]))
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  return <div className="mx-auto max-w-6xl">
    <div className="mb-7"><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Products & pricing</h1><p className="mt-2 text-sm text-slate-500">Manage your software catalog and category specific prices.</p></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}{error.toLowerCase().includes('row-level security') && <p className="mt-1">Run the catalog and quotes SQL migration in Supabase SQL Editor to enable catalog management.</p>}</div>}
    {success && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-slate-900">{editingProduct ? 'Edit product' : 'Add product'}</h2><form onSubmit={(e) => void saveProduct(e)} className="mt-4 space-y-3"><label className="block text-sm font-medium text-slate-700">Product name<input required maxLength={160} className="field mt-1.5" value={productName} onChange={(e) => setProductName(e.target.value)}/></label><label className="block text-sm font-medium text-slate-700">Description<textarea rows={3} className="field mt-1.5" value={description} onChange={(e) => setDescription(e.target.value)}/></label><div className="flex gap-2"><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{editingProduct ? <Check size={16} /> : <Plus size={16} />}{editingProduct ? 'Save product' : 'Add product'}</button>{editingProduct && <button type="button" onClick={resetProductForm} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700"><X size={16}/>Cancel</button>}</div></form>
        <div className="mt-7 border-t border-slate-100 pt-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Catalog</h3>{loading ? <p className="py-4 text-sm text-slate-500">Loading products…</p> : products.length ? <ul className="divide-y divide-slate-100">{products.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.is_active ? 'Active' : 'Inactive'}</p></div><div className="flex shrink-0 items-center gap-2"><button title={p.is_active ? 'Deactivate' : 'Activate'} onClick={() => void toggleActive(p)} disabled={busy} className="text-xs font-medium text-slate-500 hover:text-slate-900">{p.is_active ? 'Deactivate' : 'Activate'}</button><button aria-label={`Edit ${p.name}`} onClick={() => editProduct(p)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button></div></li>)}</ul> : <p className="py-4 text-sm text-slate-500">No products yet.</p>}</div>
      </section>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-slate-900">Add a price</h2><form onSubmit={(e) => void savePrice(e)} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Product<select required className="field mt-1.5" value={priceForm.product_id} onChange={(e) => setPriceForm({ ...priceForm, product_id: e.target.value })}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Client category<select className="field mt-1.5" value={priceForm.category_id} onChange={(e) => setPriceForm({ ...priceForm, category_id: e.target.value })}><option value="">Default (all categories)</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Price<input required type="number" min="0" step="0.01" className="field mt-1.5" value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}/></label><label className="text-sm font-medium text-slate-700">Billing type<select className="field mt-1.5" value={priceForm.billing_type} onChange={(e) => setPriceForm({ ...priceForm, billing_type: e.target.value as Price['billing_type'] })}>{billingOptions.map((b) => <option key={b}>{b}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Currency<input required pattern="[A-Za-z]{3}" title="Enter a three-letter currency code, such as NPR." maxLength={3} minLength={3} className="field mt-1.5 uppercase" value={priceForm.currency} onChange={(e) => setPriceForm({ ...priceForm, currency: e.target.value })}/></label><div className="flex items-end"><button disabled={busy || !products.length} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/>Add price</button></div></form></section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Price matrix</h2><p className="mt-1 text-xs text-slate-500">Specific category prices are used before the default price.</p></header>{loading ? <div className="py-10 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading prices…</div> : prices.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3"> </th></tr></thead><tbody className="divide-y divide-slate-100">{prices.map((price) => <tr key={price.id}><td className="px-4 py-3 font-medium text-slate-800">{productById[price.product_id]?.name ?? 'Product'}</td><td className="px-4 py-3 text-slate-600">{editingPrice === price.id ? <select aria-label="Price category" className="field !py-1.5" value={priceDraft.category_id} onChange={(e) => setPriceDraft({ ...priceDraft, category_id: e.target.value })}><option value="">Default</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : price.category_id ? categoryById[price.category_id] ?? 'Category' : 'Default'}</td><td className="px-4 py-3">{editingPrice === price.id ? <div className="flex items-center gap-1"><input aria-label="Price amount" type="number" min="0" step="0.01" className="field w-28 !py-1.5" value={priceDraft.price} onChange={(e) => setPriceDraft({ ...priceDraft, price: e.target.value })}/><input aria-label="Currency" maxLength={3} className="field w-16 !py-1.5 uppercase" value={priceDraft.currency} onChange={(e) => setPriceDraft({ ...priceDraft, currency: e.target.value })}/></div> : <span className="font-semibold text-slate-800">{price.currency} {Number(price.price).toLocaleString()}</span>}</td><td className="px-4 py-3">{editingPrice === price.id ? <select className="field !py-1.5" value={priceDraft.billing_type} onChange={(e) => setPriceDraft({ ...priceDraft, billing_type: e.target.value as Price['billing_type'] })}>{billingOptions.map((b) => <option key={b}>{b}</option>)}</select> : <span className="text-slate-600">{price.billing_type}</span>}</td><td className="px-4 py-3"><div className="flex items-center gap-1">{editingPrice === price.id ? <><button onClick={() => void savePriceEdit(price.id)} disabled={busy} aria-label="Save price" className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"><Check size={16}/></button><button onClick={() => setEditingPrice(null)} aria-label="Cancel editing price" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={16}/></button></> : <><button onClick={() => { setEditingPrice(price.id); setPriceDraft({ category_id: price.category_id ?? '', price: String(price.price), billing_type: price.billing_type, currency: price.currency }) }} aria-label="Edit price" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button onClick={() => void deletePrice(price)} aria-label="Delete price" className="rounded p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={15}/></button></>}</div></td></tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-slate-500">No prices defined yet.</p>}</section>
      </div>
    </div>
  </div>
}
