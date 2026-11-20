import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarCheck2, CircleDollarSign, Clock3, Flame, LoaderCircle, RefreshCw, Trophy, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Category, Lead, Stage } from './leads/types'
import { errorText, formatPrice, interestBadge, interestLabel, interestSurface } from './leads/leadUtils'

type QuoteRow = { id: string; lead_id: string; total: number; currency: string; status: string; created_at: string }
type DashboardData = {
  todayCount: number; overdueCount: number; wonThisMonth: number; pipelineValue: string;
  stageCounts: { stage: Stage; count: number }[]; categoryRates: { category: string; won: number; total: number; rate: number }[];
  coldLeads: Lead[];
}
const emptyData: DashboardData = { todayCount: 0, overdueCount: 0, wonThisMonth: 0, pipelineValue: 'NPR 0', stageCounts: [], categoryRates: [], coldLeads: [] }

function localDateString(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
function firstOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }
function nextMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 1) }

async function getAllLeads() {
  const rows: Lead[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).order('id').range(start, start + 999)
    if (error) throw error
    const page = (data ?? []) as Lead[]
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function getRecentActivityLeadIds(leadIds: string[], since: string) {
  const active = new Set<string>()
  for (let offset = 0; offset < leadIds.length; offset += 100) {
    const batch = leadIds.slice(offset, offset + 100)
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from('activities').select('lead_id').in('lead_id', batch).gte('created_at', since).order('created_at').order('id').range(start, start + 999)
      if (error) throw error
      const rows = data ?? []
      rows.forEach((row) => active.add(row.lead_id as string))
      if (rows.length < 1000) break
    }
  }
  return active
}

async function getStageChangeActivities(startDate: string, endDate: string) {
  const rows: { lead_id: string; outcome: string | null; created_at: string }[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('activities').select('lead_id,outcome,created_at').eq('type', 'stage_change').gte('created_at', startDate).lt('created_at', endDate).order('created_at').order('id').range(start, start + 999)
    if (error) throw error
    rows.push(...(data ?? []) as { lead_id: string; outcome: string | null; created_at: string }[])
    if ((data ?? []).length < 1000) return rows
  }
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const now = new Date()
      const today = localDateString(now)
      const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const startMonth = firstOfMonth(now).toISOString()
      const nextMonthStart = nextMonth(now).toISOString()
      const cutoffIso = cutoff.toISOString()
      const [todayResult, overdueResult, leads, stagesResult, categoriesResult, wonActivities] = await Promise.all([
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).is('completed_at', null).eq('scheduled_date', today),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).is('completed_at', null).lt('scheduled_date', today),
        getAllLeads(),
        supabase.from('pipeline_stages').select('id,name,sort_order,is_followup,is_won,is_lost').order('sort_order'),
        supabase.from('categories').select('id,name').order('name'),
        getStageChangeActivities(startMonth, nextMonthStart),
      ])
      const error = todayResult.error ?? overdueResult.error ?? stagesResult.error ?? categoriesResult.error
      if (error) throw error
      const stages = (stagesResult.data ?? []) as Stage[]
      const categories = (categoriesResult.data ?? []) as Category[]
      const wonStageNames = new Set(stages.filter((stage) => stage.is_won).map((stage) => stage.name))
      const wonLeadIds = new Set(wonActivities.filter((activity) => {
        const outcome = activity.outcome as string | null
        const parts = outcome?.split(' → ')
        const target = parts?.[parts.length - 1]
        return Boolean(target && wonStageNames.has(target))
      }).map((activity) => activity.lead_id))
      const wonThisMonth = wonLeadIds.size

      const stageCounts = stages.map((stage) => ({ stage, count: leads.filter((lead) => lead.stage_id === stage.id).length }))
      const categoryCounts = new Map<string, { won: number; total: number }>()
      for (const lead of leads) {
        const key = lead.category_id ?? 'uncategorized'
        const value = categoryCounts.get(key) ?? { won: 0, total: 0 }
        value.total++
        if (stages.some((stage) => stage.id === lead.stage_id && stage.is_won)) value.won++
        categoryCounts.set(key, value)
      }
      const names = new Map(categories.map((category) => [category.id, category.name]))
      const categoryRates = [...categoryCounts.entries()].map(([key, value]) => ({ category: key === 'uncategorized' ? 'Uncategorized' : names.get(key) ?? 'Other', ...value, rate: value.total ? value.won / value.total * 100 : 0 })).sort((a, b) => b.total - a.total)

      const coldCutoffDate = localDateString(cutoff)
      const oldLeads = leads.filter((lead) => lead.created_at.slice(0, 10) <= coldCutoffDate)
      const activeRecently = await getRecentActivityLeadIds(oldLeads.map((lead) => lead.id), cutoffIso)
      const coldLeads = oldLeads.filter((lead) => !activeRecently.has(lead.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 8)

      let quotes: QuoteRow[] = []
      for (let start = 0; ; start += 1000) {
        const { data: quotePage, error: quoteError } = await supabase.from('quotes').select('id,lead_id,total,currency,status,created_at').order('created_at', { ascending: false }).order('id').range(start, start + 999)
        if (quoteError) throw quoteError
        const page = (quotePage ?? []) as QuoteRow[]
        quotes.push(...page)
        if (page.length < 1000) break
      }
      const openLeadIds = new Set(leads.filter((lead) => !stages.some((stage) => stage.id === lead.stage_id && (stage.is_won || stage.is_lost))).map((lead) => lead.id))
      const latestQuoteByLead = new Map<string, QuoteRow>()
      for (const quote of quotes) if (openLeadIds.has(quote.lead_id) && !latestQuoteByLead.has(quote.lead_id)) latestQuoteByLead.set(quote.lead_id, quote)
      const quoted = [...latestQuoteByLead.values()].filter((quote) => quote.status !== 'rejected')
      const totalsByCurrency = new Map<string, number>()
      for (const quote of quoted) totalsByCurrency.set(quote.currency, (totalsByCurrency.get(quote.currency) ?? 0) + Number(quote.total))
      const pipelineValue = [...totalsByCurrency.entries()].map(([currency, total]) => formatPrice(total, currency)).join(' · ') || 'NPR 0'

      setData({ todayCount: todayResult.count ?? 0, overdueCount: overdueResult.count ?? 0, wonThisMonth, pipelineValue, stageCounts, categoryRates, coldLeads })
    } catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const maxStageCount = Math.max(1, ...data.stageCounts.map((item) => item.count))
  return <div className="mx-auto max-w-7xl">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1><p className="mt-2 text-sm text-slate-500">Your daily sales snapshot.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button></div>
    {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => void load()} className="font-semibold underline">Retry</button></div>}
    {loading && !data.stageCounts.length ? <div className="grid min-h-64 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500"><span><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading dashboard…</span></div> : <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Today's follow-ups" value={data.todayCount} icon={CalendarCheck2} tint="indigo" link="/follow-ups"/>
        <MetricCard title="Overdue" value={data.overdueCount} icon={AlertCircle} tint="rose" link="/follow-ups"/>
        <MetricCard title="Deals won this month" value={data.wonThisMonth} icon={Trophy} tint="emerald" link="/leads"/>
        <MetricCard title="Pipeline value" value={data.pipelineValue} icon={CircleDollarSign} tint="amber" detail="Latest saved quotes for open leads" link="/quotes"/>
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><header className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Leads by stage</h2><p className="mt-1 text-xs text-slate-500">Current pipeline distribution</p></div><Link to="/leads" className="text-xs font-semibold text-indigo-600 hover:underline">View pipeline</Link></header>
          {data.stageCounts.length ? <div className="space-y-3">{data.stageCounts.map(({ stage, count }) => <div key={stage.id} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 sm:grid-cols-[8rem_1fr_2rem]"><span className="truncate text-xs font-medium text-slate-600" title={stage.name}>{stage.name}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${stage.is_won ? 'bg-emerald-500' : stage.is_lost ? 'bg-slate-400' : 'bg-indigo-500'}`} style={{ width: `${count ? Math.max(5, count / maxStageCount * 100) : 0}%` }}/></div><span className="text-right text-xs tabular-nums text-slate-500">{count}</span></div>)}</div> : <EmptyState title="No pipeline stages" text="Add stages in Settings to see your pipeline here."/>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><header className="mb-5"><h2 className="font-semibold text-slate-900">Conversion by category</h2><p className="mt-1 text-xs text-slate-500">Won leads ÷ all leads in each category</p></header>
          {data.categoryRates.length ? <div className="space-y-4">{data.categoryRates.map((item) => <div key={item.category}><div className="mb-1.5 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-slate-700">{item.category}</span><span className="shrink-0 text-xs text-slate-500">{item.won}/{item.total} · {item.rate.toFixed(0)}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.rate}%` }}/></div></div>)}</div> : <EmptyState title="No leads to compare" text="Add leads and assign categories to see conversion rates."/>}
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-6"><div className="flex items-center gap-2"><Flame size={18} className="text-orange-500"/><div><h2 className="font-semibold text-slate-900">Cold leads</h2><p className="mt-1 text-xs text-slate-500">No logged activity in 14+ days</p></div></div><Link to="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">All leads<ArrowRight size={14}/></Link></header>
        {data.coldLeads.length ? <ul className="divide-y divide-slate-100 sm:grid sm:grid-cols-2 sm:divide-y-0">{data.coldLeads.map((lead, index) => <li key={lead.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 ${interestSurface(lead.interest_level)} ${index % 2 ? 'sm:border-l sm:border-slate-100' : ''} ${index > 1 ? 'sm:border-t sm:border-slate-100' : ''}`}><div className="min-w-0"><Link to={`/leads/${lead.id}`} className="break-words font-semibold text-slate-800 hover:text-indigo-600">{lead.company_name}</Link><p className="mt-1 truncate text-xs text-slate-500">{lead.contact_person || lead.email || 'No contact details'}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${interestBadge(lead.interest_level)}`}>{interestLabel(lead.interest_level)}</span><span className="flex shrink-0 items-center gap-1 text-xs text-slate-400"><Clock3 size={13}/>14+ days</span></li>)}</ul> : <EmptyState title="No cold leads" text="Leads with no activity for two weeks or more will appear here."/>}
      </section>
    </>}
  </div>
}

function MetricCard({ title, value, icon: Icon, tint, detail, link }: { title: string; value: string | number; icon: LucideIcon; tint: string; detail?: string; link: string }) {
  const colors: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600', rose: 'bg-rose-50 text-rose-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600' }
  return <Link to={link} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{title}</span><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tint]}`}><Icon size={18}/></span></div><p className="mt-4 break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{value}</p>{detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}</Link>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="grid min-h-32 place-items-center px-4 py-6 text-center"><div><p className="text-sm font-medium text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{text}</p></div></div>
}
