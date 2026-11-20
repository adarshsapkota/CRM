import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ToastProvider'
import { errorText, formatPrice, getLeadProducts, getOwnedLead, getProductPrices, interestLevels, interestLabel, interestSurface, loadLookups, syncLeadProducts } from './leadUtils'
import type { Category, InterestLevel, Product, ProductPrice, Stage } from './types'

type FormState = {
  company_name: string; contact_person: string; phone: string; email: string; address: string;
  category_id: string; existing_website: string; stage_id: string; next_follow_up_date: string;
  notes: string; source: string; lead_direction: 'outbound' | 'inbound'; interest_level: InterestLevel; social_media: Record<string, string>; product_ids: string[];
}
const emptyForm: FormState = { company_name: '', contact_person: '', phone: '', email: '', address: '', category_id: '', existing_website: '', stage_id: '', next_follow_up_date: '', notes: '', source: '', lead_direction: 'outbound', interest_level: 'neutral', social_media: { facebook: '', instagram: '', linkedin: '', tiktok: '', other: '' }, product_ids: [] }
const socialKeys = ['facebook', 'instagram', 'linkedin', 'tiktok', 'other'] as const

export function LeadFormPage() {
  const { leadId } = useParams()
  const editing = Boolean(leadId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [categories, setCategories] = useState<Category[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const lookups = await loadLookups()
        if (!alive) return
        setCategories(lookups.categories); setStages(lookups.stages); setProducts(lookups.products)
        if (editing && leadId) {
          const lead = await getOwnedLead(leadId)
          if (!lead) throw new Error('Lead not found or you do not have access to it.')
          const productIds = await getLeadProducts(leadId)
          if (!alive) return
          setForm({
            company_name: lead.company_name, contact_person: lead.contact_person ?? '', phone: lead.phone ?? '', email: lead.email ?? '', address: lead.address ?? '',
            category_id: lead.category_id ?? '', existing_website: lead.existing_website ?? '', stage_id: lead.stage_id, next_follow_up_date: lead.next_follow_up_date ?? '',
            notes: lead.notes ?? '', source: lead.source ?? '', lead_direction: lead.lead_direction ?? 'outbound', interest_level: lead.interest_level ?? 'neutral', social_media: Object.fromEntries(socialKeys.map((key) => [key, lead.social_media?.[key] ?? ''])), product_ids: productIds,
          })
        } else if (lookups.stages.length) {
          const initial = lookups.stages.find((stage) => stage.name === 'New') ?? lookups.stages[0]
          setForm((current) => ({ ...current, stage_id: initial.id }))
        }
      } catch (e) { if (alive) setError(errorText(e)) }
      finally { if (alive) setLoading(false) }
    }
    void load()
    return () => { alive = false }
  }, [editing, leadId])

  useEffect(() => {
    let alive = true
    getProductPrices(form.product_ids, form.category_id || null).then((rows) => { if (alive) setPrices(rows) }).catch((e) => { if (alive) setError(errorText(e)) })
    return () => { alive = false }
  }, [form.product_ids, form.category_id])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })) }
  function toggleProduct(id: string) { setForm((current) => ({ ...current, product_ids: current.product_ids.includes(id) ? current.product_ids.filter((x) => x !== id) : [...current.product_ids, id] })) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!form.company_name.trim()) { setError('Company name is required.'); return }
    if (!form.stage_id) { setError('Choose a pipeline stage.'); return }
    setSaving(true)
    const payload = {
      company_name: form.company_name.trim(), contact_person: form.contact_person.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, address: form.address.trim() || null, category_id: form.category_id || null,
      existing_website: form.existing_website.trim() || null,
      social_media: Object.fromEntries(socialKeys.map((key) => [key, form.social_media[key].trim()]).filter(([, value]) => value)),
      stage_id: form.stage_id, next_follow_up_date: form.next_follow_up_date || null, notes: form.notes.trim() || null,
      lead_direction: form.lead_direction, interest_level: form.interest_level, source: form.source.trim() || null,
    }
    try {
      let savedLeadId = leadId
      if (editing && leadId) {
        const { error } = await supabase.from('leads').update(payload).eq('id', leadId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('leads').insert({ ...payload, owner_id: user?.id }).select('id').single()
        if (error) throw error
        savedLeadId = data.id
      }
      if (!savedLeadId) throw new Error('The lead was saved, but its ID could not be read.')
      await syncLeadProducts(savedLeadId, form.product_ids)
      if (form.next_follow_up_date) {
        const { data: openRows, error: openError } = await supabase.from('follow_ups').select('id').eq('lead_id', savedLeadId).is('completed_at', null).order('scheduled_date', { ascending: false }).limit(1)
        if (openError) throw openError
        if (openRows?.[0]) {
          const { error } = await supabase.from('follow_ups').update({ scheduled_date: form.next_follow_up_date }).eq('id', openRows[0].id)
          if (error) throw error
        } else {
          const selectedStage = stages.find((stage) => stage.id === form.stage_id)
          const number = Number(selectedStage?.name.match(/follow[- ]?up\s*(\d+)/i)?.[1]) || 1
          const { error } = await supabase.from('follow_ups').insert({ lead_id: savedLeadId, follow_up_number: number, scheduled_date: form.next_follow_up_date })
          if (error) throw error
        }
      } else {
        const { data: openRows, error: openError } = await supabase.from('follow_ups').select('id').eq('lead_id', savedLeadId).is('completed_at', null)
        if (openError) throw openError
        if (openRows?.length) {
          const { error } = await supabase.from('follow_ups').delete().in('id', openRows.map((row) => row.id))
          if (error) throw error
        }
      }
      toast(editing ? 'Lead changes saved.' : 'Lead created.')
      navigate(`/leads/${savedLeadId}`, { replace: true })
    } catch (e) { setError(errorText(e)) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading lead form…</div>
  return <div className="mx-auto max-w-4xl">
    <Link to={editing && leadId ? `/leads/${leadId}` : '/leads'} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Back to leads</Link>
    <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{editing ? 'Edit lead' : 'Add lead'}</h1><p className="mt-1 text-sm text-slate-500">Enter company and contact details for this opportunity.</p></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="mb-5 text-base font-semibold text-slate-900">Company & contact</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Company name <span className="text-rose-500">*</span><input required maxLength={200} className="field mt-2" value={form.company_name} onChange={(e) => set('company_name', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700">Contact person<input className="field mt-2" value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700">Phone<input type="tel" className="field mt-2" value={form.phone} onChange={(e) => set('phone', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700">Email<input type="email" className="field mt-2" value={form.email} onChange={(e) => set('email', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address<textarea rows={2} className="field mt-2" value={form.address} onChange={(e) => set('address', e.target.value)}/></label>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="mb-5 text-base font-semibold text-slate-900">Opportunity</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Category<select className="field mt-2" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Interest level<select className={`field mt-2 ${interestSurface(form.interest_level)}`} value={form.interest_level} onChange={(e) => set('interest_level', e.target.value as InterestLevel)}>{interestLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">{interestLabel(form.interest_level)} leads use matching colors on your pipeline.</span></label>
          <label className="text-sm font-medium text-slate-700">Lead direction<select className="field mt-2" value={form.lead_direction} onChange={(e) => set('lead_direction', e.target.value as FormState['lead_direction'])}><option value="outbound">Outbound — we contacted them</option><option value="inbound">Inbound — they contacted us</option></select><span className="mt-1 block text-xs font-normal text-slate-400">Inbound includes requests from your website, social media, or other platforms.</span></label>
          <label className="text-sm font-medium text-slate-700">Source platform<input className="field mt-2" placeholder="Website, Facebook, referral…" value={form.source} onChange={(e) => set('source', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700">Stage<select required disabled={editing} className="field mt-2 disabled:bg-slate-100" value={form.stage_id} onChange={(e) => set('stage_id', e.target.value)}><option value="">Select stage</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{editing && <span className="mt-1 block text-xs font-normal text-slate-400">Change a lead’s stage on the pipeline board to log the transition.</span>}</label>
          <label className="text-sm font-medium text-slate-700">Next follow-up date<input type="date" className="field mt-2" value={form.next_follow_up_date} onChange={(e) => set('next_follow_up_date', e.target.value)}/></label>
          <label className="text-sm font-medium text-slate-700">Existing website<input type="url" className="field mt-2" placeholder="https://example.com" value={form.existing_website} onChange={(e) => set('existing_website', e.target.value)}/></label>
          <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-700">Interested products</legend>{products.length ? <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">{products.map((p) => <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>{p.name}</label>)}</div> : <p className="text-sm text-slate-400">No active products yet.</p>}{form.product_ids.length > 0 && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Category pricing</p><ul className="space-y-2">{form.product_ids.map((id) => { const product = products.find((p) => p.id === id); const productPrices = prices.filter((price) => price.product_id === id); return <li key={id} className="text-sm"><span className="font-medium text-slate-800">{product?.name ?? 'Product'}</span>{productPrices.length ? <span className="ml-2 text-slate-600">{productPrices.map((price) => `${formatPrice(price.price, price.currency)} / ${price.billing_type}`).join(' · ')}</span> : <span className="ml-2 text-xs text-amber-700">No price configured for this category</span>}</li> })}</ul></div>}</fieldset>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="mb-5 text-base font-semibold text-slate-900">Social media</h2>
        <div className="grid gap-4 sm:grid-cols-2">{socialKeys.map((key) => <label key={key} className="text-sm font-medium capitalize text-slate-700">{key === 'other' ? 'Other link' : key}<input type="url" className="field mt-2" placeholder="https://" value={form.social_media[key]} onChange={(e) => setForm((current) => ({ ...current, social_media: { ...current.social_media, [key]: e.target.value } }))}/></label>)}</div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><label className="block text-sm font-medium text-slate-700">Notes<textarea rows={5} className="field mt-2" placeholder="Context, needs, or conversation notes…" value={form.notes} onChange={(e) => set('notes', e.target.value)}/></label></section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><Link to={editing && leadId ? `/leads/${leadId}` : '/leads'} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</Link><button disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin"/>}{saving ? 'Saving…' : editing ? 'Save changes' : 'Create lead'}</button></div>
    </form>
  </div>
}
