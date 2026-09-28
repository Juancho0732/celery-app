import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { createBusiness } from '../lib/api'
import { KIND_LABELS } from '../lib/businessKind'
import type { BusinessKind } from '../lib/types'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, useAction } from '../components/ui'

export function BusinessesPage() {
  const { businesses, canCreateBusinesses, businessesLoading, businessesError, reloadBusinesses, session, signOut } = useAuth()
  const [params, setParams] = useSearchParams()
  const creating = canCreateBusinesses && params.get('nuevo') === '1'
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<BusinessKind>('perecedero')
  const { busy, error, run } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const created = await run(() => createBusiness(name, kind))
    if (created) {
      await reloadBusinesses()
      navigate(`/n/${created.id}/configuracion`)
    }
  }

  const closeCreate = () => setParams({})

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Celery App</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span>{session?.user.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>Cerrar sesión</Button>
        </div>
      </div>

      <PageHeader
        title="Tus negocios"
        subtitle="Solo ves los negocios donde eres socio."
        actions={canCreateBusinesses && <Button variant="primary" onClick={() => setParams({ nuevo: '1' })}>+ Crear negocio</Button>}
      />

      {businessesLoading && !businesses.length ? <Spinner /> : <ErrorBox error={businessesError} onRetry={() => void reloadBusinesses()} />}

      {!businessesLoading && !businessesError && businesses.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-medium">Todavía no tienes negocios</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            {canCreateBusinesses
              ? 'Crea el primero con el botón «Crear negocio».'
              : `Pídele al administrador que te invite con este mismo correo: ${session?.user.email}.`}
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {businesses.length > 1 && (
          <Link to="/todos" className="rounded-xl border border-dashed border-border-strong bg-surface p-5 transition-colors hover:border-brand">
            <p className="font-semibold">Todos mis negocios</p>
            <p className="mt-1 text-sm text-ink-muted">Dashboard combinado de {businesses.map((b) => b.name).join(' y ')}.</p>
          </Link>
        )}
        {businesses.map((b) => (
          <Link key={b.id} to={`/n/${b.id}`} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand">
            {b.logo_url
              ? <img src={b.logo_url} alt="" className="h-12 w-12 rounded-lg object-contain" />
              : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-soft text-lg font-semibold text-brand-text">{b.name.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="truncate font-semibold">{b.name}</p>
              <div className="mt-1 flex gap-2">
                <Badge>{b.kind === 'perecedero' ? 'Perecederos' : 'Ropa'}</Badge>
                <Badge tone={b.role === 'admin' ? 'brand' : 'neutral'}>{b.role === 'admin' ? 'Administrador' : 'Socio'}</Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Modal
        open={creating}
        title="Crear negocio"
        onClose={closeCreate}
        footer={<>
          <Button onClick={closeCreate}>Cancelar</Button>
          <Button variant="primary" type="submit" form="create-business" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear'}</Button>
        </>}
      >
        <form id="create-business" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nombre">{(id) => <Input id={id} autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Purpal" />}</Field>
          <Field label="Tipo de negocio" hint="Define si maneja lotes con vencimiento o tallas y colores. No se puede cambiar después.">
            {(id) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as BusinessKind)}>
                {(Object.keys(KIND_LABELS) as BusinessKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k].kindName}</option>)}
              </Select>
            )}
          </Field>
          <ErrorBox error={error} />
        </form>
      </Modal>
    </div>
  )
}
