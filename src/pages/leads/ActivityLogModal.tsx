import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ToastProvider'
import type { Lead } from './types'

const activityTypes = ['call', 'whatsapp', 'email', 'meeting', 'note'] as const
export function ActivityLogModal({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved?: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [type, setType] = useState<(typeof activityTypes)[number]>('call')
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!outcome.trim() && !notes.trim()) { setError('Add an outcome or a note before saving this activity.'); return }
    setBusy(true)
    const { error } = await supabase.from('activities').insert({ lead_id: lead.id, type, outcome: outcome.trim() || null, notes: notes.trim() || null, created_by: user?.id })
    setBusy(false)
    if (error) { setError(error.message); return }
    toast('Activity logged.')
    onSaved?.(); onClose()
  }
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <form onSubmit={(e) => void submit(e)} role="dialog" aria-modal="true" aria-labelledby="activity-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
      <div className="flex items-start justify-between"><div><h2 id="activity-title" className="text-lg font-semibold text-slate-900">Log activity</h2><p className="mt-1 text-sm text-slate-500">{lead.company_name}</p></div><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={19}/></button></div>
      <div className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-700">Activity type<select className="field mt-1.5" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{activityTypes.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label className="block text-sm font-medium text-slate-700">Outcome<input className="field mt-1.5" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Connected, left a message…"/></label><label className="block text-sm font-medium text-slate-700">Notes<textarea rows={4} className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?"/></label></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save activity'}</button></div>
    </form>
  </div>
}
