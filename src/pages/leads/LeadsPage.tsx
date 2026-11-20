import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, GripVertical, List, LoaderCircle, Plus, Search, Upload, Workflow, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ToastProvider'
import { errorText, loadLookups, PAGE_SIZE } from './leadUtils'
import type { Category, Lead, Product, Stage } from './types'
import { StageChangeDialog } from './StageChangeDialog'
import { ActivityLogModal } from './ActivityLogModal'

type SortKey = 'company_name' | 'created_at' | 'next_follow_up_date'
export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productNames, setProductNames] = useState<Record<string, string[]>>({})
  const [search, setSearch] = useState('')
  const [stageId, setStageId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [direction, setDirection] = useState('')
  const [productId, setProductId] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [sort, setSort] = useState<SortKey>('created_at')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [pendingStage, setPendingStage] = useState<{ lead: Lead; target: Stage } | null>(null)
  const [activityLead, setActivityLead] = useState<Lead | null>(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    loadLookups().then(({ categories, stages, products }) => {
      setCategories(categories); setStages(stages); setProducts(products)
    }).catch((e) => setError(errorText(e)))
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let filteredIds: string[] | null = null
      if (productId) {
        const { data, error } = await supabase.from('lead_products').select('lead_id').eq('product_id', productId)
        if (error) throw error
        filteredIds = [...new Set((data ?? []).map((row) => row.lead_id as string))]
        if (!filteredIds.length) { setLeads([]); setCount(0); setProductNames({}); setLoading(false); return }
      }
      let query = supabase.from('leads').select('*', { count: 'exact' }).order(sort, { ascending, nullsFirst: false }).order('id').range(view === 'board' ? 0 : page * PAGE_SIZE, view === 'board' ? 999 : page * PAGE_SIZE + PAGE_SIZE - 1)
      if (stageId) query = query.eq('stage_id', stageId)
      if (categoryId) query = query.eq('category_id', categoryId)
      if (direction) query = query.eq('lead_direction', direction)
      if (filteredIds) query = query.in('id', filteredIds)
      if (overdue) query = query.not('next_follow_up_date', 'is', null).lt('next_follow_up_date', new Date().toISOString().slice(0, 10))
      const cleanSearch = search.trim().replace(/[(),]/g, ' ').replace(/[%_\\]/g, '')
      if (cleanSearch) query = query.or(`company_name.ilike.%${cleanSearch}%,contact_person.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`)
      const { data, count, error } = await query
      if (error) throw error
      const items = (data ?? []) as Lead[]
      setLeads(items); setCount(count ?? 0)
      if (items.length) {
        const { data: links, error: linkError } = await supabase.from('lead_products').select('lead_id,product_id').in('lead_id', items.map((lead) => lead.id))
        if (linkError) throw linkError
        const ids = [...new Set((links ?? []).map((x) => x.product_id as string))]
        const { data: names, error: nameError } = ids.length ? await supabase.from('products').select('id,name').in('id', ids) : { data: [], error: null }
        if (nameError) throw nameError
        const nameMap = Object.fromEntries((names ?? []).map((p) => [p.id, p.name])) as Record<string, string>
        const grouped: Record<string, string[]> = {}
        for (const link of links ?? []) (grouped[link.lead_id] ??= []).push(nameMap[link.product_id] ?? '')
        setProductNames(grouped)
      } else setProductNames({})
    } catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [search, stageId, categoryId, direction, productId, overdue, sort, ascending, page, view])

  useEffect(() => { void fetchLeads() }, [fetchLeads])
  const stageNames = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.name])), [stages])
  const wonStage = stages.find((stage) => stage.is_won)
  const lostStage = stages.find((stage) => stage.is_lost)
  const categoryNames = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories])
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const toggleSort = (key: SortKey) => { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(true) } setPage(0) }
  function beginStageChange(lead: Lead, stage: Stage) {
    if (lead.stage_id !== stage.id) setPendingStage({ lead, target: stage })
  }
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
  async function exportCsv() {
    setExporting(true); setError('')
    const header = ['Company', 'Contact', 'Phone', 'Email', 'Address', 'Category', 'Stage', 'Lead direction', 'Next follow-up', 'Website', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Other social', 'Products', 'Source platform', 'Notes']
    try {
      let filteredIds: string[] | null = null
      if (productId) {
        const { data, error } = await supabase.from('lead_products').select('lead_id').eq('product_id', productId)
        if (error) throw error
        filteredIds = [...new Set((data ?? []).map((row) => row.lead_id as string))]
      }
      const output: Lead[] = []
      if (filteredIds?.length === 0) {
        // The product filter matched no leads; export the header only.
      } else {
        for (let start = 0; ; start += 1000) {
          let query = supabase.from('leads').select('*').order(sort, { ascending, nullsFirst: false }).order('id').range(start, start + 999)
          if (stageId) query = query.eq('stage_id', stageId)
          if (categoryId) query = query.eq('category_id', categoryId)
          if (direction) query = query.eq('lead_direction', direction)
          if (filteredIds) query = query.in('id', filteredIds)
          if (overdue) query = query.not('next_follow_up_date', 'is', null).lt('next_follow_up_date', new Date().toISOString().slice(0, 10))
          const cleanSearch = search.trim().replace(/[(),]/g, ' ').replace(/[%_\\]/g, '')
          if (cleanSearch) query = query.or(`company_name.ilike.%${cleanSearch}%,contact_person.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`)
          const { data, error } = await query
          if (error) throw error
          const batch = (data ?? []) as Lead[]
          output.push(...batch)
          if (batch.length < 1000) break
        }
      }
      const productIdsByLead: Record<string, string[]> = {}
      for (let offset = 0; offset < output.length; offset += 100) {
        const batch = output.slice(offset, offset + 100).map((lead) => lead.id)
        if (!batch.length) continue
        const { data, error } = await supabase.from('lead_products').select('lead_id,product_id').in('lead_id', batch)
        if (error) throw error
        for (const link of data ?? []) (productIdsByLead[link.lead_id] ??= []).push(link.product_id)
      }
      const allProductIds = [...new Set(Object.values(productIdsByLead).flat())]
      const productNames: Record<string, string> = {}
      for (let offset = 0; offset < allProductIds.length; offset += 100) {
        const batch = allProductIds.slice(offset, offset + 100)
        const { data, error } = await supabase.from('products').select('id,name').in('id', batch)
        if (error) throw error
        for (const product of data ?? []) productNames[product.id] = product.name
      }
      const rows = output.map((l) => [l.company_name, l.contact_person ?? '', l.phone ?? '', l.email ?? '', l.address ?? '', categoryNames[l.category_id ?? ''] ?? '', stageNames[l.stage_id] ?? '', l.lead_direction ?? 'outbound', l.next_follow_up_date ?? '', l.existing_website ?? '', l.social_media?.facebook ?? '', l.social_media?.instagram ?? '', l.social_media?.linkedin ?? '', l.social_media?.tiktok ?? '', l.social_media?.other ?? '', (productIdsByLead[l.id] ?? []).map((id) => productNames[id]).filter(Boolean).join('; '), l.source ?? '', l.notes ?? ''])
      const blob = new Blob([[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click(); URL.revokeObjectURL(url)
      toast(`Exported ${output.length} lead${output.length === 1 ? '' : 's'} to CSV.`)
    } catch (e) { setError(errorText(e)); toast(errorText(e), 'error') }
    finally { setExporting(false) }
  }

  return <div>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Leads</h1><p className="mt-2 text-sm text-slate-500">Search and manage your sales pipeline.</p></div>
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1"><button onClick={() => { setView('board'); setPage(0) }} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === 'board' ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-500'}`}><Workflow size={15}/>Board</button><button onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === 'list' ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-500'}`}><List size={15}/>List</button></div>
        <Link to="/leads/import" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Upload size={16}/>Import CSV</Link>
        <button onClick={() => void exportCsv()} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={16}/>{exporting ? 'Exporting…' : 'Export CSV'}</button>
        <Link to="/leads/new" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={17}/>Add lead</Link>
      </div>
    </div>
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search leads</span><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="field !py-2.5 !pl-9" placeholder="Search leads…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}/></label>
        <select aria-label="Filter by stage" className="field !py-2.5" value={stageId} onChange={(e) => { setStageId(e.target.value); setPage(0) }}><option value="">All stages</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="Filter by category" className="field !py-2.5" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0) }}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Filter by lead direction" className="field !py-2.5" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(0) }}><option value="">Inbound & outbound</option><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select>
        <select aria-label="Filter by product" className="field !py-2.5" value={productId} onChange={(e) => { setProductId(e.target.value); setPage(0) }}><option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(0) }}/>Overdue follow-ups</label>
      </div>
    </section>
    {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => void fetchLeads()} className="font-semibold underline">Retry</button></div>}
    {view === 'board' ? loading ? <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20}/>Loading pipeline…</div> : <section className="overflow-x-auto pb-3">
      {count > 1000 && <p className="mb-3 text-xs text-amber-700">Showing the first 1,000 matching leads. Narrow the filters to view a smaller pipeline.</p>}
      <div className="flex min-h-[420px] items-start gap-4">
        {stages.map((stage) => {
          const cards = leads.filter((lead) => lead.stage_id === stage.id)
          return <section key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (draggedLead) beginStageChange(draggedLead, stage); setDraggedLead(null) }} className="w-[285px] shrink-0 rounded-xl bg-slate-100/80 p-3">
            <header className="mb-3 flex items-center justify-between px-1"><h2 className="text-sm font-semibold text-slate-800">{stage.name}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{cards.length}</span></header>
            <div className="min-h-24 space-y-2 rounded-lg" >{cards.map((lead) => <article key={lead.id} draggable onDragStart={() => setDraggedLead(lead)} onDragEnd={() => setDraggedLead(null)} className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-indigo-200 hover:shadow">
              <div className="flex items-start justify-between gap-2"><Link to={`/leads/${lead.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">{lead.company_name}</Link><GripVertical size={16} className="shrink-0 cursor-grab text-slate-300"/></div>
              <p className="mt-1 truncate text-xs text-slate-500">{lead.contact_person || lead.email || lead.phone || 'No contact details'}</p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${lead.lead_direction === 'inbound' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{lead.lead_direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>
              {lead.next_follow_up_date && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={14}/>{new Date(`${lead.next_follow_up_date}T00:00:00`).toLocaleDateString()}</p>}
              {!stages.find((stage) => stage.id === lead.stage_id)?.is_won && !stages.find((stage) => stage.id === lead.stage_id)?.is_lost && <div className="mt-3 flex gap-2">
                {wonStage && <button onClick={() => beginStageChange(lead, wonStage)} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><CheckCircle2 size={14}/>Close won</button>}
                {lostStage && <button onClick={() => beginStageChange(lead, lostStage)} className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"><XCircle size={14}/>Close lost</button>}
              </div>}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2"><button onClick={() => setActivityLead(lead)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Log activity</button><Link to={`/leads/${lead.id}`} className="text-xs text-slate-400 hover:text-slate-700">Details</Link></div>
            </article>)}</div>
          </section>
        })}
      </div>
    </section> : <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            {([['company_name', 'Company'], ['created_at', 'Added'], ['next_follow_up_date', 'Next follow-up']] as [SortKey, string][]).map(([key, label]) => <th key={key} className="px-5 py-3.5"><button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5">{label}{sort === key && (ascending ? <ArrowUp size={13}/> : <ArrowDown size={13}/>)}</button></th>)}
            <th className="px-5 py-3.5">Contact</th><th className="px-5 py-3.5">Direction</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">Products</th><th className="px-5 py-3.5">Stage</th><th className="px-5 py-3.5"> </th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={9} className="py-16 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20}/>Loading leads…</td></tr> : leads.length === 0 ? <tr><td colSpan={9} className="py-16 text-center text-slate-500">No leads found. Adjust your filters or add a lead.</td></tr> : leads.map((lead) => <tr key={lead.id} className="hover:bg-slate-50/70">
              <td className="px-5 py-4"><Link to={`/leads/${lead.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">{lead.company_name}</Link></td>
              <td className="px-5 py-4 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td>
              <td className="px-5 py-4 text-slate-600">{lead.next_follow_up_date ? new Date(`${lead.next_follow_up_date}T00:00:00`).toLocaleDateString() : '—'}</td>
              <td className="px-5 py-4"><div className="text-slate-800">{lead.contact_person || '—'}</div><div className="mt-0.5 text-xs text-slate-500">{lead.email || lead.phone || ''}</div></td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${lead.lead_direction === 'inbound' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{lead.lead_direction === 'inbound' ? 'Inbound' : 'Outbound'}</span></td>
              <td className="px-5 py-4 text-slate-600">{categoryNames[lead.category_id ?? ''] ?? '—'}</td>
              <td className="max-w-48 px-5 py-4 text-slate-600"><span className="line-clamp-2">{productNames[lead.id]?.join(', ') || '—'}</span></td>
              <td className="px-5 py-4"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{stageNames[lead.stage_id] ?? '—'}</span></td>
              <td className="px-5 py-4"><div className="flex items-center gap-3"><button onClick={() => setActivityLead(lead)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Log activity</button><Link aria-label={`View ${lead.company_name}`} to={`/leads/${lead.id}`} className="text-slate-400 hover:text-indigo-600"><Eye size={18}/></Link></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500"><span>{count ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} of ${count}` : '0 leads'}</span><div className="flex items-center gap-2"><button disabled={page <= 0 || loading} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"><ChevronLeft size={16}/>Previous</button><span>Page {page + 1} of {totalPages}</span><button disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next<ChevronRight size={16}/></button></div></footer>
    </section>}
    {pendingStage && <StageChangeDialog lead={pendingStage.lead} target={pendingStage.target} onClose={() => setPendingStage(null)} onSaved={() => { setPendingStage(null); void fetchLeads() }}/>}
    {activityLead && <ActivityLogModal lead={activityLead} onClose={() => setActivityLead(null)}/>}
  </div>
}
