import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ToastProvider'
import { errorText } from './leadUtils'
import type { Lead, Stage } from './types'

function localDate() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
type PreviousFollowUp = { id: string; follow_up_number: number }

export function StageChangeDialog({ lead, target, onClose, onSaved }: { lead: Lead; target: Stage; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previousNumber, setPreviousNumber] = useState<number | null>(null)
  const followupNumber = Number(target.name.match(/follow[- ]?up\s*(\d+)/i)?.[1]) || null
  const entersFollowup = target.is_followup

  useEffect(() => {
    let alive = true
    if (!entersFollowup) return
    supabase.from('follow_ups').select('id,follow_up_number').eq('lead_id', lead.id).is('completed_at', null).order('follow_up_number', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      if (alive && data) setPreviousNumber(data.follow_up_number as number)
    })
    return () => { alive = false }
  }, [entersFollowup, lead.id])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      let previous: PreviousFollowUp | null = null
      if (entersFollowup) {
        const { data, error } = await supabase.from('follow_ups').select('id,follow_up_number').eq('lead_id', lead.id).is('completed_at', null).order('follow_up_number', { ascending: false }).limit(1).maybeSingle()
        if (error) throw error
        previous = data as PreviousFollowUp | null
      }
      const { error: updateError } = await supabase.from('leads').update({ stage_id: target.id, next_follow_up_date: entersFollowup ? date : null }).eq('id', lead.id)
      if (updateError) throw updateError
      if (previous) {
        const { error } = await supabase.from('follow_ups').update({ completed_at: new Date().toISOString(), outcome: outcome.trim() || null, notes: notes.trim() || null }).eq('id', previous.id)
        if (error) throw error
      }
      if (entersFollowup) {
        const { data: maxRows, error: maxError } = await supabase.from('follow_ups').select('follow_up_number').eq('lead_id', lead.id).order('follow_up_number', { ascending: false }).limit(1)
        if (maxError) throw maxError
        const number = followupNumber ?? ((maxRows?.[0]?.follow_up_number as number | undefined) ?? 0) + 1
        const { error } = await supabase.from('follow_ups').insert({ lead_id: lead.id, follow_up_number: number, scheduled_date: date })
        if (error) throw error
      }
      if (entersFollowup) {
        const { error: activityError } = await supabase.from('activities').insert({ lead_id: lead.id, type: 'follow_up', outcome: `Scheduled for ${date}`, notes: [outcome.trim(), notes.trim()].filter(Boolean).join(' — ') || null, created_by: user?.id })
        if (activityError) throw activityError
      }
      toast(`Moved ${lead.company_name} to ${target.name}.`)
      onSaved()
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <form onSubmit={(e) => void submit(e)} role="dialog" aria-modal="true" aria-labelledby="stage-change-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
      <div className="flex items-start justify-between"><div><h2 id="stage-change-title" className="text-lg font-semibold text-slate-900">Move to {target.name}</h2><p className="mt-1 text-sm text-slate-500">{lead.company_name}</p></div><button type="button" disabled={busy} aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={19}/></button></div>
      {entersFollowup ? <div className="mt-5 space-y-4">
        {previousNumber && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">This completes open follow-up #{previousNumber}. Record the outcome, then schedule this follow-up.</p>}
        <label className="block text-sm font-medium text-slate-700">Next follow-up date<input type="date" required min={localDate()} className="field mt-1.5" value={date} onChange={(e) => setDate(e.target.value)}/></label>
        <label className="block text-sm font-medium text-slate-700">Previous follow-up outcome<input className="field mt-1.5" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Connected, no answer, asked for a demo…"/></label>
        <label className="block text-sm font-medium text-slate-700">Notes<textarea rows={3} className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened in the previous follow-up?"/></label>
      </div> : <p className="mt-5 text-sm text-slate-600">This stage change will be recorded in the lead activity timeline.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm stage change'}</button></div>
    </form>
  </div>
}
