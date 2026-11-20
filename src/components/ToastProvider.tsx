import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; message: string; kind: ToastKind }
type ToastContextValue = { toast: (message: string, kind?: ToastKind) => void }
const ToastContext = createContext<ToastContextValue | null>(null)
let nextToastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextToastId
    setItems((current) => [...current, { id, message, kind }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])
  const icons = { success: CheckCircle2, error: CircleAlert, info: Info }
  return <ToastContext.Provider value={{ toast }}>
    {children}
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
      {items.map((item) => {
        const Icon = icons[item.kind]
        return <div key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg ${item.kind === 'success' ? 'border-emerald-200 text-emerald-800' : item.kind === 'error' ? 'border-rose-200 text-rose-800' : 'border-slate-200 text-slate-800'}`}>
          <Icon size={18} className="mt-0.5 shrink-0"/><p className="flex-1 text-sm leading-5">{item.message}</p><button aria-label="Dismiss notification" onClick={() => setItems((current) => current.filter((toastItem) => toastItem.id !== item.id))} className="-mr-1 rounded p-1 text-slate-400 hover:bg-slate-100"><X size={15}/></button>
        </div>
      })}
    </div>
  </ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context.toast
}
