import { type LucideIcon } from 'lucide-react'

type PlaceholderPageProps = { title: string; description: string; icon: LucideIcon }

export function PlaceholderPage({ title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-600">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      <section className="grid min-h-[340px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Icon size={25} strokeWidth={1.7} /></span>
          <h2 className="mt-5 text-base font-semibold text-slate-900">{title} is ready for setup</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">This page is a placeholder. Its CRM features will be added in a later step.</p>
        </div>
      </section>
    </div>
  )
}
