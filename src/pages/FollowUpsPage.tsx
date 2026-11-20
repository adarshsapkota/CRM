import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, ChevronRight, LoaderCircle, Phone, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { errorText, interestBadge, interestLabel, loadLookups } from './leads/leadUtils'
import { StageChangeDialog } from './leads/StageChangeDialog'
import type { Lead, Stage } from './leads/types'

type FollowUp = { id: string; lead_id: string; follow_up_number: number; scheduled_date: string; completed_at: string | null; outcome: string | null; notes: string | null }
type Item = { followup: FollowUp; lead: Lead }
type Tab = 'today' | 'overdue' | 'upcoming'
function localDate(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }
function shiftDate(date: string, days: number) { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return localDate(d) }

export function FollowUpsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('today')
  const [items, setItems] = useState<Item[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Item | null>(null)
  const [stageTarget, setStageTarget] = useState<{ lead: Lead; stage: Stage } | null>(null)

  const fetchRows = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const today = localDate()
      let query = supabase.from('follow_ups').select('*').is('completed_at', null).order('scheduled_date')
      if (tab === 'today') query = query.eq('scheduled_date', today)
      else if (tab === 'overdue') query = query.lt('scheduled_date', today)
      else query = query.gt('scheduled_date', today).lte('scheduled_date', shiftDate(today, 7))
      const [{ data, error }, lookups] = await Promise.all([query, loadLookups()])
      if (error) throw error
      setStages(lookups.stages)
      const followups = (data ?? []) as FollowUp[]
      const ids = [...new Set(followups.map((f) => f.lead_id))]
      if (!ids.length) { setItems([]); return }
      const { data: leads, error: leadError } = await supabase.from('leads').select('*').in('id', ids)
      if (leadError) throw leadError
      const leadMap = new Map((leads ?? []).map((lead) => [lead.id, lead as Lead]))
      setItems(followups.flatMap((f) => { const lead = leadMap.get(f.lead_id); return lead ? [{ followup: f, lead }] : [] }))
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }, [tab])
  useEffect(() => { void fetchRows() }, [fetchRows])

  async function openComplete(item: Item) {
    setSelected(item)
  }
  async function afterFinish(item: Item, outcome: string, notes: string, reschedule: string | null) {
    try {
      const { error } = await supabase.from('follow_ups').update(reschedule
        ? { scheduled_date: reschedule }
        : { completed_at: new Date().toISOString(), outcome: outcome.trim() || null, notes: notes.trim() || null },
      ).eq('id', item.followup.id)
      if (error) throw error
      const { error: activityError } = await supabase.from('activities').insert({ lead_id: item.lead.id, type: 'follow_up', outcome: reschedule ? `Rescheduled to ${reschedule}` : outcome.trim() || 'Completed', notes: notes.trim() || null, created_by: user?.id })
      if (activityError) throw activityError
      const { data: openRows, error: openError } = await supabase.from('follow_ups').select('scheduled_date').eq('lead_id', item.lead.id).is('completed_at', null).order('scheduled_date').limit(1)
      if (openError) throw openError
      const { error: leadError } = await supabase.from('leads').update({ next_follow_up_date: openRows?.[0]?.scheduled_date ?? null }).eq('id', item.lead.id)
      if (leadError) throw leadError
      toast(reschedule ? `Follow-up rescheduled to ${reschedule}.` : 'Follow-up marked done.')
      setSelected(null); await fetchRows()
    } catch (e) { setError(errorText(e)); throw e }
  }

  function moveToNext(item: Item) {
    const currentIndex = stages.findIndex((s) => s.id === item.lead.stage_id)
    const next = stages.slice(currentIndex + 1).find((stage) => !stage.is_won && !stage.is_lost)
    if (next) setStageTarget({ lead: item.lead, stage: next })
  }

  const tabs: { id: Tab; label: string }[] = [{ id: 'today', label: 'Today' }, { id: 'overdue', label: 'Overdue' }, { id: 'upcoming', label: 'Upcoming (7 days)' }]
  return <div>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Follow-ups</h1><p className="mt-2 text-sm text-slate-500">Keep daily conversations moving forward.</p></div><button onClick={() => void fetchRows()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700"><RefreshCw size={15}/>Refresh</button></div>
    <div className="mb-5 flex gap-1 border-b border-slate-200">{tabs.map(({ id, label }) => <button key={id} onClick={() => setTab(id)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
    {error && <div role="alert" className="mb-4 flex justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => void fetchRows()} className="font-semibold underline">Retry</button></div>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {busy ? <div className="py-16 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20}/>Loading follow-ups…</div> : items.length === 0 ? <div className="py-16 text-center"><CalendarClock className="mx-auto text-slate-300" size={25}/><p className="mt-3 text-sm font-medium text-slate-700">No {tab === 'today' ? 'follow-ups today' : tab === 'overdue' ? 'overdue follow-ups' : 'upcoming follow-ups'}</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => {
        const nextIndex = stages.findIndex((s) => s.id === item.lead.stage_id) + 1
        const hasNextStage = stages.slice(nextIndex).some((s) => !s.is_won && !s.is_lost)
        return <li key={item.followup.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={`/leads/${item.lead.id}`} className="break-words font-semibold text-slate-900 hover:text-indigo-600">{item.lead.company_name}</Link><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${interestBadge(item.lead.interest_level)}`}>{interestLabel(item.lead.interest_level)}</span></div><p className="mt-1 break-words text-sm text-slate-500">{item.lead.contact_person || item.lead.phone || item.lead.email || 'No contact details'} · Follow-up {item.followup.follow_up_number}</p><p className={`mt-1 text-xs font-medium ${tab === 'overdue' ? 'text-rose-600' : 'text-slate-400'}`}>Scheduled {new Date(`${item.followup.scheduled_date}T00:00:00`).toLocaleDateString()}</p></div><div className="flex flex-wrap gap-2">{item.lead.phone && <a href={`tel:${item.lead.phone}`} aria-label="Call lead" className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Phone size={16}/></a>}<button onClick={() => void openComplete(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><Check size={15}/>Mark done</button><button onClick={() => setSelected(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reschedule</button>{hasNextStage && <button onClick={() => moveToNext(item)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Next stage<ChevronRight size={14}/></button>}</div></li>
      })}</ul>}
    </section>
    {selected && <FollowUpActionDialog item={selected} onClose={() => setSelected(null)} onSave={(outcome, notes, date) => afterFinish(selected, outcome, notes, date)}/>}
    {stageTarget && <StageChangeDialog lead={stageTarget.lead} target={stageTarget.stage} onClose={() => setStageTarget(null)} onSaved={() => { setStageTarget(null); void fetchRows() }}/>}
  </div>
}

function FollowUpActionDialog({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (outcome: string, notes: string, date: string | null) => Promise<void> }) {
  const [mode, setMode] = useState<'complete' | 'reschedule' | null>(null)
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onSave(outcome, notes, mode === 'reschedule' ? date : null) } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><form onSubmit={(e) => void submit(e)} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6" role="dialog" aria-modal="true">
    <h2 className="text-lg font-semibold text-slate-900">Follow-up · {item.lead.company_name}</h2>
    {!mode ? <div className="mt-5 flex gap-3"><button type="button" onClick={() => setMode('complete')} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">Mark done</button><button type="button" onClick={() => setMode('reschedule')} className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">Reschedule</button></div> : <div className="mt-5 space-y-4">{mode === 'complete' ? <><label className="block text-sm font-medium text-slate-700">Outcome<input required className="field mt-1.5" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Connected, no answer, sent proposal…"/></label><label className="block text-sm font-medium text-slate-700">Notes<textarea rows={3} className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)}/></label></> : <label className="block text-sm font-medium text-slate-700">New date<input type="date" required min={localDate()} className="field mt-1.5" value={date} onChange={(e) => setDate(e.target.value)}/></label>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{busy ? 'Saving…' : mode === 'complete' ? 'Save outcome' : 'Save new date'}</button></div></div>}
  </form></div>
}
