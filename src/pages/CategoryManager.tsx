import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { errorText } from './leads/leadUtils'
import type { Category } from './leads/types'

export function CategoryManager() {
  const toast = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('categories').select('id,name').order('name')
    if (error) setError(errorText(error))
    else { const values = (data ?? []) as Category[]; setCategories(values); setDrafts(Object.fromEntries(values.map((c) => [c.id, c.name]))) }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault(); setError(''); setSuccess('')
    const name = newName.trim()
    if (!name) { setError('Enter a category name.'); return }
    setBusy(true)
    const { error } = await supabase.from('categories').insert({ name })
    setBusy(false)
    if (error) setError(errorText(error)); else { setNewName(''); setSuccess(`Added ${name}.`); toast(`Added category ${name}.`); await load() }
  }
  async function rename(category: Category) {
    const name = drafts[category.id]?.trim()
    if (!name || name === category.name) return
    setBusy(true); setError(''); setSuccess('')
    const { error } = await supabase.from('categories').update({ name }).eq('id', category.id)
    setBusy(false)
    if (error) setError(errorText(error)); else { setEditing(null); setSuccess(`Renamed category to ${name}.`); toast(`Renamed category to ${name}.`); await load() }
  }
  async function remove(category: Category) {
    if (!window.confirm(`Delete “${category.name}”? Leads using it will become uncategorized, and category-specific product prices will be removed.`)) return
    setBusy(true); setError(''); setSuccess('')
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    setBusy(false)
    if (error) setError(errorText(error)); else { setSuccess(`Deleted ${category.name}.`); toast(`Deleted category ${category.name}.`); await load() }
  }
  return <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Client categories</h2><p className="mt-1 text-xs text-slate-500">Categories connect leads to the right product pricing.</p></header>
    {error && <div role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}{error.toLowerCase().includes('row-level security') && <p className="mt-1 text-xs">Run the catalog and quotes SQL migration in Supabase SQL Editor to enable category management.</p>}</div>}{success && <p role="status" className="mx-5 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}
    <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row"><input required maxLength={100} aria-label="New category name" className="field flex-1 !py-2" placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)}/><button disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15}/>Add category</button></form>
    {loading ? <div className="py-10 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Loading categories…</div> : categories.length ? <ul className="divide-y divide-slate-100">{categories.map((category) => <li key={category.id} className="flex items-center gap-2 px-4 py-3"><input aria-label={`Category name ${category.name}`} disabled={editing !== category.id} className="field flex-1 !py-2 disabled:border-transparent disabled:bg-transparent disabled:px-0" value={drafts[category.id] ?? category.name} onChange={(e) => setDrafts((current) => ({ ...current, [category.id]: e.target.value }))}/>{editing === category.id ? <><button disabled={busy} onClick={() => void rename(category)} aria-label="Save category" className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50"><Check size={16}/></button><button onClick={() => { setDrafts((current) => ({ ...current, [category.id]: category.name })); setEditing(null) }} aria-label="Cancel edit" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={16}/></button></> : <><button onClick={() => setEditing(category.id)} aria-label={`Rename ${category.name}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button disabled={busy} onClick={() => void remove(category)} aria-label={`Delete ${category.name}`} className="rounded-md p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-40"><Trash2 size={15}/></button></>}</li>)}</ul> : <p className="py-8 text-center text-sm text-slate-500">No categories yet.</p>}
  </section>
}
