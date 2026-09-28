import { createPortal } from 'react-dom'
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { errorMessage } from '../lib/errors'
import { formatInt, parseMoney } from '../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover border-transparent',
  secondary: 'bg-surface text-ink border-border-strong hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-surface-muted hover:text-ink',
  danger: 'bg-surface text-bad-text border-border-strong hover:bg-bad-soft',
}

export function Button({
  variant = 'secondary', size = 'md', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm'
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none ${sizing} ${BUTTON[variant]} ${className}`}
    />
  )
}

const CONTROL = 'w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface-muted disabled:text-ink-muted'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (id: string) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className = '' }: FieldProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children(id)}
      {error ? <p className="text-xs text-bad-text">{error}</p> : hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </div>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} h-10 ${className}`} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} h-10 pr-8 ${className}`} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} py-2 min-h-20 ${className}`} />
}

/** Campo de pesos: muestra separadores de miles mientras se escribe. */
export function MoneyInput({ value, onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
      <Input
        {...props}
        inputMode="numeric"
        className="pl-6 text-right tabular"
        value={value ? formatInt(value) : ''}
        placeholder="0"
        onChange={(e) => onChange(parseMoney(e.target.value))}
      />
    </div>
  )
}

export function Card({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export type Tone = 'neutral' | 'brand' | 'good' | 'warning' | 'bad'

const BADGE: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  brand: 'bg-brand-soft text-brand-text',
  good: 'bg-good-soft text-good-text',
  warning: 'bg-warning-soft text-warning-text',
  bad: 'bg-bad-soft text-bad-text',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE[tone]}`}>{children}</span>
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      {label}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad-text">
      <span>{errorMessage(error)}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Reintentar</Button>}
    </div>
  )
}

export function Notice({ tone = 'good', children }: { tone?: Tone; children: ReactNode }) {
  return <div role="status" className={`rounded-lg px-4 py-3 text-sm ${BADGE[tone]}`}>{children}</div>
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  // Portal al body: así un modal con su propio <form> nunca queda anidado
  // dentro del formulario de la página.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-border bg-surface shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
        // Los eventos de React atraviesan los portales: sin esto, enviar el
        // formulario del modal también enviaría el formulario de la página.
        onSubmit={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-ink-muted hover:bg-surface-muted">✕</button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/** Tabla simple con encabezado fijo en estilo. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}

/** Envuelve una acción async con estado de "guardando" y error. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

/** Lee una imagen del disco y la reduce a un data URL pequeño (logos, fotos). */
export function readImageAsDataUrl(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
