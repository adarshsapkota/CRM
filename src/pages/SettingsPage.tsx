import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { errorText } from './leads/leadUtils'
import type { Stage } from './leads/types'
import { CategoryManager } from './CategoryManager'

export function SettingsPage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [newFollowup, setNewFollowup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('pipeline_stages').select('id,name,sort_order,is_followup,is_won,is_lost').order('sort_order')
    if (error) setError(errorText(error))
    else { const values = (data ?? []) as Stage[]; setStages(values); setDrafts(Object.fromEntries(values.map((s) => [s.id, s.name]))) }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function rename(stage: Stage) {
    const name = drafts[stage.id]?.trim()
    if (!name || name === stage.name) return
    setBusy(true); setError(''); setSuccess('')
    const { error } = await supabase.from('pipeline_stages').update({ name }).eq('id', stage.id)
    if (error) setError(errorText(error)); else { setSuccess(`Renamed stage to ${name}.`); await load() }
    setBusy(false)
  }
  async function addStage(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    const name = newName.trim()
    if (!name) { setError('Enter a stage name.'); return }
    setBusy(true)
    const max = Math.max(0, ...stages.map((s) => s.sort_order))
    const { error } = await supabase.from('pipeline_stages').insert({ name, sort_order: max + 10, is_followup: newFollowup, is_won: false, is_lost: false })
    if (error) setError(errorText(error)); else { setNewName(''); setNewFollowup(false); setSuccess(`Added ${name}.`); await load() }
    setBusy(false)
  }
  async function toggleFollowup(stage: Stage) {
    setBusy(true); setError(''); setSuccess('')
    const { error } = await supabase.from('pipeline_stages').update({ is_followup: !stage.is_followup }).eq('id', stage.id)
    if (error) setError(errorText(error)); else { setSuccess(`Updated ${stage.name}.`); await load() }
    setBusy(false)
  }
  async function reorder(index: number, offset: -1 | 1) {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= stages.length) return
    const ordered = [...stages]; [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]]
    setBusy(true); setError(''); setSuccess('')
    try {
      // Move through a temporary range first to avoid collisions with the unique sort_order index.
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase.from('pipeline_stages').update({ sort_order: 1_000_000_000 + i }).eq('id', ordered[i].id)
        if (error) throw error
      }
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase.from('pipeline_stages').update({ sort_order: (i + 1) * 10 }).eq('id', ordered[i].id)
        if (error) throw error
      }
      setSuccess('Pipeline stage order saved.'); await load()
    } catch (e) { setError(errorText(e)); await load() }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-4xl">
    <div className="mb-7"><p className="text-sm font-medium text-indigo-600">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Settings</h1><p className="mt-2 text-sm text-slate-500">Manage the stages in your sales pipeline.</p></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}{error.toLowerCase().includes('row-level security') && <p className="mt-1">Run the stage management policy migration included with this update in Supabase SQL Editor.</p>}</div>}
    {success && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
    <form onSubmit={(e) => void addStage(e)} className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold text-slate-900">Add a stage</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-medium text-slate-700">Stage name<input required maxLength={80} className="field mt-1.5" placeholder="e.g. Follow-up 4" value={newName} onChange={(e) => setNewName(e.target.value)}/></label><label className="flex items-center gap-2 pb-2 text-sm text-slate-700"><input type="checkbox" checked={newFollowup} onChange={(e) => setNewFollowup(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600"/>Follow-up stage</label><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/>Add stage</button></div></form>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Pipeline stages</h2><p className="mt-1 text-xs text-slate-500">Drag order with the arrows. Follow-up stages prompt for a date and outcome when a lead enters.</p></header>{loading ? <div className="py-14 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading stages…</div> : <ol className="divide-y divide-slate-100">{stages.map((stage, index) => <li key={stage.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"><span className="w-7 text-xs tabular-nums text-slate-400">{index + 1}</span><input aria-label={`Stage name ${stage.name}`} className="field min-w-40 flex-1 !py-2" value={drafts[stage.id] ?? stage.name} onChange={(e) => setDrafts((current) => ({ ...current, [stage.id]: e.target.value }))}/><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={stage.is_followup} onChange={() => void toggleFollowup(stage)} disabled={busy} className="h-4 w-4 rounded border-slate-300 text-indigo-600"/>Follow-up</label><span className="min-w-12 text-right text-xs text-slate-400">{stage.is_won ? 'Won' : stage.is_lost ? 'Lost' : ''}</span><button title="Move up" aria-label={`Move ${stage.name} up`} disabled={busy || index === 0} onClick={() => void reorder(index, -1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={16}/></button><button title="Move down" aria-label={`Move ${stage.name} down`} disabled={busy || index === stages.length - 1} onClick={() => void reorder(index, 1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={16}/></button><button onClick={() => void rename(stage)} disabled={busy || drafts[stage.id]?.trim() === stage.name} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><Save size={14}/>Rename</button></li>)}</ol>}</section>
    <CategoryManager />
  </div>
}
