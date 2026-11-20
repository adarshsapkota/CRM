import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ClipboardPlus, ExternalLink, LoaderCircle, Mail, MapPin, MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { errorText, formatPrice, getLeadActivities, getLeadProducts, getOwnedLead, getProductPrices, interestBadge, interestLabel, interestSurface, loadLookups } from './leadUtils'
import type { Activity, Category, Lead, ProductPrice, Stage } from './types'
import { ActivityLogModal } from './ActivityLogModal'

export function LeadDetailPage() {
  const { leadId = '' } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState<Lead | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [productIds, setProductIds] = useState<string[]>([])
  const [productPrices, setProductPrices] = useState<ProductPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setError('')
      try {
        const [lead, activities, lookups, productIds] = await Promise.all([getOwnedLead(leadId), getLeadActivities(leadId), loadLookups(), getLeadProducts(leadId)])
        if (!lead) throw new Error('Lead not found or you do not have access to it.')
        let names: Record<string, string> = {}
        const prices = await getProductPrices(productIds, lead.category_id)
        if (productIds.length) {
          const { data, error } = await supabase.from('products').select('id,name').in('id', productIds)
          if (error) throw error
          names = Object.fromEntries((data ?? []).map((p) => [p.id as string, p.name as string]))
        }
        if (!alive) return
        setLead(lead); setActivities(activities); setCategories(lookups.categories); setStages(lookups.stages); setProductNames(names); setProductIds(productIds); setProductPrices(prices)
      } catch (e) { if (alive) setError(errorText(e)) }
      finally { if (alive) setLoading(false) }
    }
    void load(); return () => { alive = false }
  }, [leadId])

  async function deleteLead() {
    if (!lead || !window.confirm(`Delete ${lead.company_name}? This also deletes its activities and follow-ups.`)) return
    setDeleting(true); setError('')
    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    setDeleting(false)
    if (error) { setError(error.message); return }
    navigate('/leads', { replace: true })
  }
  const phoneDigits = lead?.phone?.replace(/[^\d+]/g, '').replace(/^\+/, '')
  const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits}` : ''
  const category = categories.find((c) => c.id === lead?.category_id)?.name
  const stage = stages.find((s) => s.id === lead?.stage_id)?.name
  const social = lead?.social_media ?? {}

  if (loading) return <div className="py-20 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading lead…</div>
  if (!lead) return <div><Link to="/leads" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>Back to leads</Link><div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || 'Lead not found.'}</div></div>

  return <div className="mx-auto max-w-6xl">
    <Link to="/leads" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>All leads</Link>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border p-5 sm:p-7 ${interestSurface(lead.interest_level)}`}>
      <div><div className="flex flex-wrap items-center gap-2 sm:gap-3"><h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900">{lead.company_name}</h1>{stage && <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{stage}</span>}<span className={`rounded-full px-3 py-1 text-xs font-medium ${interestBadge(lead.interest_level)}`}>{interestLabel(lead.interest_level)}</span></div><p className="mt-2 text-sm text-slate-500">{lead.contact_person || 'No contact person'}{category ? ` · ${category}` : ''}</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setActivityOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"><ClipboardPlus size={16}/>Log activity</button><Link to={`/leads/${lead.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil size={16}/>Edit</Link><button onClick={() => void deleteLead()} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3.5 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60">{deleting ? <LoaderCircle className="animate-spin" size={16}/> : <Trash2 size={16}/>}Delete</button></div>
    </div>
    <div className="mb-6 flex flex-wrap gap-2">
      {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><Phone size={16}/>Call</a>}
      {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle size={16}/>WhatsApp</a>}
      {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Mail size={16}/>Email</a>}
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-base font-semibold text-slate-900">Lead information</h2><dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Info label="Contact person" value={lead.contact_person}/><Info label="Phone" value={lead.phone}/><Info label="Email" value={lead.email}/><Info label="Category" value={category}/><Info label="Interest level" value={interestLabel(lead.interest_level)}/><Info label="Next follow-up" value={lead.next_follow_up_date ? new Date(`${lead.next_follow_up_date}T00:00:00`).toLocaleDateString() : null}/><Info label="Products" value={productIds.map((id) => productNames[id]).filter(Boolean).join(', ') || null}/><Info label="Direction" value={lead.lead_direction === 'inbound' ? 'Inbound — they contacted us' : 'Outbound — we contacted them'}/><Info label="Source platform" value={lead.source}/><Info label="Created" value={new Date(lead.created_at).toLocaleString()}/>
        {productIds.length > 0 && <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Category pricing</dt><dd className="mt-2 space-y-2">{productIds.map((id) => { const rows = productPrices.filter((price) => price.product_id === id); return <div key={id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-slate-800">{productNames[id] ?? 'Product'}</span>{rows.length ? <span className="ml-2 text-slate-600">{rows.map((price) => `${formatPrice(price.price, price.currency)} / ${price.billing_type}`).join(' · ')}</span> : <span className="ml-2 text-xs text-amber-700">No price configured for this category</span>}</div> })}</dd></div>}
        <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</dt><dd className="mt-1 flex items-start gap-1.5 whitespace-pre-wrap text-sm text-slate-700">{lead.address ? <><MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />{lead.address}</> : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Website</dt><dd className="mt-1 text-sm">{lead.existing_website ? <a className="inline-flex items-center gap-1 text-indigo-600 hover:underline" href={lead.existing_website} target="_blank" rel="noreferrer">{lead.existing_website}<ExternalLink size={13}/></a> : <span className="text-slate-700">—</span>}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Social media</dt><dd className="mt-2 flex flex-wrap gap-2">{Object.entries(social).filter(([, value]) => value).map(([key, value]) => <a key={key} href={String(value)} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">{key}</a>)}{!Object.values(social).some(Boolean) && <span className="text-sm text-slate-700">—</span>}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{lead.notes || '—'}</dd></div>
      </dl></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center gap-2"><CalendarDays size={18} className="text-indigo-600"/><h2 className="text-base font-semibold text-slate-900">Activity timeline</h2></div>
        {activities.length ? <ol className="mt-5 space-y-5">{activities.map((activity) => <li key={activity.id} className="relative border-l border-slate-200 pl-5 last:border-transparent"><span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white"/><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold capitalize text-slate-800">{activity.type.replace('_', ' ')}</span><time className="text-xs text-slate-400">{new Date(activity.created_at).toLocaleString()}</time></div>{activity.outcome && <p className="mt-1 text-xs font-medium text-indigo-600">{activity.outcome}</p>}{activity.notes && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{activity.notes}</p>}</li>)}</ol> : <div className="mt-8 rounded-lg bg-slate-50 px-4 py-8 text-center"><p className="text-sm font-medium text-slate-700">No activity yet</p><p className="mt-1 text-xs text-slate-500">Logged calls, meetings, and notes will show here.</p></div>}
      </section>
    </div>
    {activityOpen && <ActivityLogModal lead={lead} onClose={() => setActivityOpen(false)} onSaved={() => { void getLeadActivities(lead.id).then(setActivities).catch((e) => setError(errorText(e))) }}/>}
  </div>
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-700">{value || '—'}</dd></div>
}
