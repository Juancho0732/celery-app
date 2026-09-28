import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, ErrorBox, Field, Input, Notice, useAction } from '../components/ui'
import { useAuth } from './AuthProvider'

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-10 w-10" />
          <span className="text-xl font-semibold tracking-tight">Celery App</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </div>
  )
}

function redirectUrl(path: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${path}`
}

export function LoginPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()
  if (session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    })
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Entra con tu correo y contraseña."
      footer={<>¿No tienes cuenta? <Link className="font-medium text-brand-text hover:underline" to="/registro">Regístrate</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Correo">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Contraseña">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <ErrorBox error={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
        <Link to="/recuperar" className="text-center text-sm text-ink-muted hover:text-ink hover:underline">Olvidé mi contraseña</Link>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const { busy, error, setError, run } = useAction()
  if (session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError(new Error('La contraseña debe tener al menos 8 caracteres.'))
      return
    }
    await run(async () => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: redirectUrl('') },
      })
      if (error) throw error
      // Sin sesión = el proyecto pide confirmar el correo antes de entrar.
      if (!data.session) setPendingConfirmation(true)
    })
  }

  if (pendingConfirmation) {
    return (
      <AuthLayout title="Revisa tu correo" footer={<Link className="font-medium text-brand-text hover:underline" to="/login">Volver a iniciar sesión</Link>}>
        <Notice>
          Te enviamos un enlace a <strong>{email}</strong>. Ábrelo para confirmar tu cuenta y luego inicia sesión.
        </Notice>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Si un socio ya te invitó, regístrate con ese mismo correo para ver su negocio."
      footer={<>¿Ya tienes cuenta? <Link className="font-medium text-brand-text hover:underline" to="/login">Inicia sesión</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">{(id) => <Input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Correo">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">{(id) => <Input id={id} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <ErrorBox error={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</Button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl('restablecer') })
      if (error) throw error
      setSent(true)
    })
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace para crear una nueva."
      footer={<Link className="font-medium text-brand-text hover:underline" to="/login">Volver a iniciar sesión</Link>}
    >
      {sent ? (
        <Notice>Si existe una cuenta con <strong>{email}</strong>, te llegará un correo con el enlace en unos minutos.</Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Correo">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <ErrorBox error={error} />
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const { busy, error, setError, run } = useAction()

  if (!loading && !session) {
    return (
      <AuthLayout title="Enlace no válido" footer={<Link className="font-medium text-brand-text hover:underline" to="/recuperar">Pedir otro enlace</Link>}>
        <p className="text-sm text-ink-muted">El enlace venció o ya se usó. Pide uno nuevo.</p>
      </AuthLayout>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError(new Error('La contraseña debe tener al menos 8 caracteres.'))
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return true
    })
    if (ok) navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Nueva contraseña">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">{(id) => <Input id={id} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <ErrorBox error={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</Button>
      </form>
    </AuthLayout>
  )
}
