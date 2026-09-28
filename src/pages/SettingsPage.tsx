import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useBusiness } from '../layout/BusinessContext'
import { cancelInvite, inviteMember, listInvites, listMembers, removeMember, setMemberRole, updateBusiness } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/format'
import type { Business, MemberRole } from '../lib/types'
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Textarea, Th, readImageAsDataUrl, useAction } from '../components/ui'

export function SettingsPage() {
  const { business, labels, isAdmin } = useBusiness()
  return (
    <>
      <PageHeader title="Configuración" subtitle={`${business.name} · ${labels.kindName}`} />
      {!isAdmin && <div className="mb-4"><Notice tone="neutral">Solo los administradores pueden cambiar estos datos.</Notice></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <BusinessForm key={business.id} />
        <MembersCard />
      </div>
    </>
  )
}

function BusinessForm() {
  const { business, labels, isAdmin } = useBusiness()
  const { reloadBusinesses } = useAuth()
  const [form, setForm] = useState<Partial<Business>>(business)
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()
  const set = (k: keyof Business) => (e: { target: { value: string } }) => { setSaved(false); setForm((f) => ({ ...f, [k]: e.target.value })) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      await updateBusiness(business.id, {
        name: form.name?.trim(),
        legal_id: form.legal_id?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        city: form.city?.trim() || null,
        instagram: form.instagram?.trim() || null,
        logo_url: form.logo_url ?? null,
        expiry_warning_days: Number(form.expiry_warning_days) || 0,
        quote_validity_days: Math.max(1, Number(form.quote_validity_days) || 15),
        quote_terms: form.quote_terms?.trim() || null,
      })
      await reloadBusinesses()
      return true
    })
    if (ok) setSaved(true)
  }

  return (
    <Card title="Datos del negocio" className="self-start">
      <form onSubmit={submit}>
        <fieldset disabled={!isAdmin || busy} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Logo" className="sm:col-span-2" hint="Aparece en las cotizaciones en PDF.">
            {(id) => (
              <div className="flex items-center gap-4">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="h-16 w-16 rounded-lg border border-border object-contain" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-muted text-xs text-ink-faint">Sin logo</span>}
                <input id={id} type="file" accept="image/png,image/jpeg" className="text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) await run(async () => { setSaved(false); const url = await readImageAsDataUrl(file, 400); setForm((f) => ({ ...f, logo_url: url })) })
                  }} />
                {form.logo_url && <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, logo_url: null }))}>Quitar</Button>}
              </div>
            )}
          </Field>
          <Field label="Nombre">{(id) => <Input id={id} required value={form.name ?? ''} onChange={set('name')} />}</Field>
          <Field label="NIT o cédula">{(id) => <Input id={id} value={form.legal_id ?? ''} onChange={set('legal_id')} />}</Field>
          <Field label="Teléfono / WhatsApp">{(id) => <Input id={id} value={form.phone ?? ''} onChange={set('phone')} />}</Field>
          <Field label="Correo">{(id) => <Input id={id} type="email" value={form.email ?? ''} onChange={set('email')} />}</Field>
          <Field label="Dirección">{(id) => <Input id={id} value={form.address ?? ''} onChange={set('address')} />}</Field>
          <Field label="Ciudad">{(id) => <Input id={id} value={form.city ?? ''} onChange={set('city')} />}</Field>
          <Field label="Instagram">{(id) => <Input id={id} value={form.instagram ?? ''} onChange={set('instagram')} placeholder="@minegocio" />}</Field>
          {labels.usesLots && (
            <Field label="Avisar vencimientos con" hint="Días de anticipación.">{(id) => <Input id={id} type="number" min={0} max={365} value={form.expiry_warning_days ?? 7} onChange={set('expiry_warning_days')} />}</Field>
          )}
          <Field label="Vigencia de cotizaciones" hint="Días por defecto.">{(id) => <Input id={id} type="number" min={1} max={365} value={form.quote_validity_days ?? 15} onChange={set('quote_validity_days')} />}</Field>
          <Field label="Condiciones para las cotizaciones" className="sm:col-span-2" hint="Se imprimen al final de cada cotización.">
            {(id) => <Textarea id={id} value={form.quote_terms ?? ''} onChange={set('quote_terms')} placeholder="Precios sujetos a disponibilidad. Pago 50 % anticipado…" />}
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            {isAdmin && <Button type="submit" variant="primary">{busy ? 'Guardando…' : 'Guardar cambios'}</Button>}
            {saved && <span className="text-sm text-good-text">✓ Guardado</span>}
          </div>
          <div className="sm:col-span-2"><ErrorBox error={error} /></div>
        </fieldset>
      </form>
    </Card>
  )
}

function MembersCard() {
  const { business, isAdmin } = useBusiness()
  const { session, reloadBusinesses } = useAuth()
  const navigate = useNavigate()
  const { data, error: loadError, loading, reload } = useAsync(
    () => Promise.all([listMembers(business.id), isAdmin ? listInvites(business.id) : Promise.resolve([])]),
    [business.id, isAdmin],
  )
  const [members, invites] = data ?? [[], []]
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('socio')
  const [message, setMessage] = useState<string | null>(null)
  const { busy, error, run } = useAction()

  async function invite(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const result = await run(() => inviteMember(business.id, email, role))
    if (!result) return
    setMessage(result === 'added'
      ? `${email} ya tenía cuenta y quedó agregado a ${business.name}.`
      : `${email} quedó invitado. Cuando se registre con ese correo y lo confirme, verá ${business.name}.`)
    setEmail('')
    reload()
  }

  async function act(fn: () => Promise<void>) {
    const ok = await run(async () => { await fn(); return true })
    if (ok) reload()
  }

  async function leave() {
    if (!confirm(`¿Salir de ${business.name}? Dejarás de ver este negocio.`)) return
    const ok = await run(async () => { await removeMember(business.id, session!.user.id); return true })
    if (ok) { await reloadBusinesses(); navigate('/', { replace: true }) }
  }

  return (
    <Card title="Socios con acceso" className="self-start">
      <p className="px-5 pt-4 text-sm text-ink-muted">
        Cada socio solo ve los negocios a los que lo agregues. Los <strong>administradores</strong> además pueden editar estos datos e invitar socios.
      </p>
      {loading && !data ? <Spinner /> : (
        <div className="mt-2">
          <Table head={<><Th>Persona</Th><Th>Rol</Th><Th /></>}>
            {members.map((m) => {
              const me = m.user_id === session?.user.id
              return (
                <tr key={m.user_id}>
                  <Td>
                    <p className="font-medium">{m.profile?.full_name || m.profile?.email}{me && <span className="ml-2 text-xs text-ink-faint">(tú)</span>}</p>
                    {m.profile?.full_name && <p className="text-xs text-ink-faint">{m.profile.email}</p>}
                  </Td>
                  <Td>
                    {isAdmin && !me ? (
                      <Select aria-label="Rol" className="h-8 w-36" value={m.role} disabled={busy} onChange={(e) => act(() => setMemberRole(business.id, m.user_id, e.target.value as MemberRole))}>
                        <option value="socio">Socio</option>
                        <option value="admin">Administrador</option>
                      </Select>
                    ) : <Badge tone={m.role === 'admin' ? 'brand' : 'neutral'}>{m.role === 'admin' ? 'Administrador' : 'Socio'}</Badge>}
                  </Td>
                  <Td className="text-right">
                    {me ? <Button size="sm" variant="ghost" onClick={leave} disabled={busy}>Salir</Button>
                      : isAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                        if (confirm(`¿Quitarle el acceso a ${m.profile?.email}?`)) void act(() => removeMember(business.id, m.user_id))
                      }}>Quitar</Button>}
                  </Td>
                </tr>
              )
            })}
            {invites.map((i) => (
              <tr key={i.email}>
                <Td><p className="font-medium">{i.email}</p><p className="text-xs text-ink-faint">Invitado el {formatDate(i.created_at)}; aún no se registra</p></Td>
                <Td><Badge tone="warning">Pendiente · {i.role === 'admin' ? 'Admin.' : 'Socio'}</Badge></Td>
                <Td className="text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => cancelInvite(business.id, i.email))}>Cancelar</Button></Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <ErrorBox error={loadError} onRetry={reload} />
      {isAdmin && (
        <form onSubmit={invite} className="flex flex-col gap-3 border-t border-border p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Invitar por correo" className="min-w-56 flex-1">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="socio@correo.com" />}</Field>
            <Field label="Rol">
              {(id) => (
                <Select id={id} value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className="w-40">
                  <option value="socio">Socio</option>
                  <option value="admin">Administrador</option>
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>Invitar</Button>
          </div>
          {message && <Notice>{message}</Notice>}
          <ErrorBox error={error} />
        </form>
      )}
      {!isAdmin && <div className="p-5 pt-0"><ErrorBox error={error} /></div>}
    </Card>
  )
}
