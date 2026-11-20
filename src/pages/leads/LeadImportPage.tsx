import { useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, LoaderCircle, Upload } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { errorText, loadLookups } from './leadUtils'
import type { Category, Product, Stage } from './types'

type Target = 'company_name' | 'contact_person' | 'phone' | 'email' | 'address' | 'category' | 'stage' | 'lead_direction' | 'interest_level' | 'next_follow_up_date' | 'existing_website' | 'notes' | 'source' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'other' | 'products'
const targets: { key: Target; label: string }[] = [
  { key: 'company_name', label: 'Company name (required)' }, { key: 'contact_person', label: 'Contact person' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' },
  { key: 'category', label: 'Category name' }, { key: 'stage', label: 'Pipeline stage name' }, { key: 'lead_direction', label: 'Lead direction (inbound/outbound)' }, { key: 'interest_level', label: 'Interest level' }, { key: 'next_follow_up_date', label: 'Next follow-up date' }, { key: 'existing_website', label: 'Existing website' }, { key: 'notes', label: 'Notes' }, { key: 'source', label: 'Source platform' },
  { key: 'facebook', label: 'Facebook URL' }, { key: 'instagram', label: 'Instagram URL' }, { key: 'linkedin', label: 'LinkedIn URL' }, { key: 'tiktok', label: 'TikTok URL' }, { key: 'other', label: 'Other social URL' }, { key: 'products', label: 'Products (separate names with ;)' },
]

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = '' }
    else cell += char
  }
  row.push(cell.replace(/\r$/, ''))
  if (row.some((v) => v.trim())) rows.push(row)
  return rows
}

function normalized(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }
function suggestTarget(header: string): Target | '' {
  const h = normalized(header)
  const guesses: Record<string, Target> = {
    company: 'company_name', companyname: 'company_name', business: 'company_name', businessname: 'company_name', organization: 'company_name',
    contact: 'contact_person', contactperson: 'contact_person', name: 'contact_person', phone: 'phone', mobile: 'phone', telephone: 'phone', email: 'email',
    address: 'address', category: 'category', industry: 'category', stage: 'stage', pipelinestage: 'stage', status: 'stage', nextfollowup: 'next_follow_up_date', followupdate: 'next_follow_up_date',
    website: 'existing_website', url: 'existing_website', notes: 'notes', source: 'source', leadsource: 'source', interest: 'interest_level', interestlevel: 'interest_level', leadtype: 'lead_direction', direction: 'lead_direction', leaddirection: 'lead_direction', leadirection: 'lead_direction', inboundoutbound: 'lead_direction', facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', tiktok: 'tiktok', other: 'other', products: 'products', product: 'products',
  }
  return guesses[h] ?? ''
}

export function LeadImportPage() {
  const { user } = useAuth()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<Target, string>>({} as Record<Target, string>)
  const [categories, setCategories] = useState<Category[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ imported: number; failures: string[] } | null>(null)
  const totalRows = rows.length
  const companyColumn = mapping.company_name
  const validRows = useMemo(() => rows.slice(1).filter((r) => (r[Number(companyColumn)] ?? '').trim()), [rows, companyColumn])

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setError(''); setResult(null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Choose a .csv file.'); return }
    try {
      const parsed = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
      if (parsed.length < 2) throw new Error('The CSV needs a header row and at least one data row.')
      const cols = parsed[0].map((header, i) => header.trim() || `Column ${i + 1}`)
      const initial = {} as Record<Target, string>
      for (let i = 0; i < cols.length; i++) { const guessed = suggestTarget(cols[i]); if (guessed && !initial[guessed]) initial[guessed] = String(i) }
      const lookups = await loadLookups()
      setCategories(lookups.categories); setStages(lookups.stages); setProducts(lookups.products)
      setHeaders(cols); setRows(parsed); setMapping(initial); setFileName(file.name)
    } catch (e) { setError(errorText(e)); setRows([]); setHeaders([]) }
  }

  async function importRows() {
    setBusy(true); setError(''); setResult(null)
    try {
      if (!mapping.company_name) throw new Error('Map a CSV column to Company name before importing.')
      const stageDefault = stages.find((s) => s.name === 'New') ?? stages[0]
      if (!stageDefault) throw new Error('No pipeline stages are available. Add stages before importing.')
      const categoryMap = new Map(categories.map((c) => [normalized(c.name), c.id]))
      const stageMap = new Map(stages.map((s) => [normalized(s.name), s.id]))
      const productMap = new Map(products.map((p) => [normalized(p.name), p.id]))
      let imported = 0; const failures: string[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const get = (key: Target) => { const index = mapping[key]; return index === undefined || index === '' ? '' : (row[Number(index)] ?? '').trim() }
        const company = get('company_name')
        if (!company) continue
        const categoryName = get('category')
        const stageName = get('stage')
        const stageId = stageName ? stageMap.get(normalized(stageName)) : stageDefault.id
        if (stageName && !stageId) { failures.push(`Row ${i + 1}: unknown stage “${stageName}”.`); continue }
        const directionValue = get('lead_direction').toLowerCase() || 'outbound'
        if (directionValue !== 'inbound' && directionValue !== 'outbound') { failures.push(`Row ${i + 1} (${company}): lead direction must be inbound or outbound.`); continue }
        const rawInterest = normalized(get('interest_level'))
        const interestValues: Record<string, 'very_interested' | 'semi_interested' | 'lightly_interested' | 'neutral'> = {
          veryinterested: 'very_interested', veryhigh: 'very_interested',
          semiinterested: 'semi_interested', interested: 'semi_interested',
          lightlyinterested: 'lightly_interested', maybe: 'lightly_interested',
          neutral: 'neutral', notinterested: 'neutral', unknown: 'neutral',
        }
        const interestLevel = rawInterest ? interestValues[rawInterest] : 'neutral'
        if (!interestLevel) { failures.push(`Row ${i + 1} (${company}): use Very interested, Semi interested, Lightly interested, or Neutral.`); continue }
        const productList = get('products').split(/[;|]/).map((v) => v.trim()).filter(Boolean)
        const unknownProducts = productList.filter((name) => !productMap.has(normalized(name)))
        if (unknownProducts.length) { failures.push(`Row ${i + 1} (${company}): unknown product(s): ${unknownProducts.join(', ')}.`); continue }
        const social = Object.fromEntries((['facebook', 'instagram', 'linkedin', 'tiktok', 'other'] as const).map((key) => [key, get(key)]).filter(([, value]) => value))
        const payload = {
          company_name: company, contact_person: get('contact_person') || null, phone: get('phone') || null, email: get('email') || null, address: get('address') || null,
          category_id: categoryName ? categoryMap.get(normalized(categoryName)) ?? null : null,
          stage_id: stageId!, lead_direction: directionValue, interest_level: interestLevel, next_follow_up_date: get('next_follow_up_date') || null,
          existing_website: get('existing_website') || null, notes: get('notes') || null, source: get('source') || null,
          social_media: social, owner_id: user?.id,
        }
        let createdLeadId: string | null = null
        try {
          const { data, error } = await supabase.from('leads').insert(payload).select('id').single()
          if (error) throw error
          createdLeadId = data.id
          if (payload.next_follow_up_date) {
            const chosenStage = stages.find((stage) => stage.id === payload.stage_id)
            const followUpNumber = Number(chosenStage?.name.match(/follow[- ]?up\s*(\d+)/i)?.[1]) || 1
            const { error: followupError } = await supabase.from('follow_ups').insert({ lead_id: data.id, follow_up_number: followUpNumber, scheduled_date: payload.next_follow_up_date })
            if (followupError) throw followupError
          }
          const ids = [...new Set(productList.map((name) => productMap.get(normalized(name))!))]
          if (ids.length) {
            const { error: linkError } = await supabase.from('lead_products').insert(ids.map((product_id) => ({ lead_id: data.id, product_id })))
            if (linkError) throw linkError
          }
          imported++
        } catch (e) {
          if (createdLeadId) await supabase.from('leads').delete().eq('id', createdLeadId)
          failures.push(`Row ${i + 1} (${company}): ${errorText(e)}`)
        }
      }
      setResult({ imported, failures })
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-5xl">
    <Link to="/leads" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Back to leads</Link>
    <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Import leads from CSV</h1><p className="mt-1 text-sm text-slate-500">Choose a CSV, map its columns, preview the data, then import it to your leads.</p></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {result && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17}/>Imported {result.imported} lead{result.imported === 1 ? '' : 's'}{result.failures.length ? `; ${result.failures.length} row(s) need attention` : '.'}</p>{result.failures.length > 0 && <ul className="mt-3 max-h-48 list-inside list-disc space-y-1 overflow-auto text-xs text-rose-700">{result.failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}<Link to="/leads" className="mt-3 inline-block text-sm font-semibold text-indigo-700 hover:underline">View leads</Link></div>}
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
      <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 px-5 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30"><span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Upload size={22}/></span><span className="mt-3 text-sm font-semibold text-slate-800">{fileName || 'Choose a CSV file'}</span><span className="mt-1 text-xs text-slate-500">CSV file with a header row</span><input type="file" accept=".csv,text/csv" onChange={(e) => void chooseFile(e)} className="sr-only"/></label>
      {headers.length > 0 && <>
        <div className="mt-7"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-base font-semibold text-slate-900">Map columns</h2><p className="mt-1 text-xs text-slate-500">We guessed mappings from the headers. Review them before importing.</p></div><span className="text-xs text-slate-500">{validRows.length} non-empty lead rows · {totalRows - 1} total rows</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{targets.map(({ key, label }) => <label key={key} className="text-xs font-medium text-slate-600">{label}<select className="field mt-1.5 !py-2" value={mapping[key] ?? ''} onChange={(e) => setMapping((current) => ({ ...current, [key]: e.target.value }))}><option value="">Do not import</option>{headers.map((header, i) => <option key={`${i}-${header}`} value={i}>{header}</option>)}</select></label>)}</div>
        </div>
        <div className="mt-7"><h2 className="mb-3 text-base font-semibold text-slate-900">Preview</h2><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[500px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(1, 4).map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci} className="max-w-56 truncate px-3 py-2.5 text-slate-600">{row[ci] ?? ''}</td>)}</tr>)}</tbody></table></div></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Unmatched categories are left blank. Products can be separated with semicolons. Dates must use YYYY-MM-DD.</p><button onClick={() => void importRows()} disabled={busy || validRows.length === 0 || !mapping.company_name} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Upload size={16}/>} {busy ? 'Importing…' : `Import ${validRows.length} leads`}</button></div>
      </>}
    </section>
  </div>
}
