import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { deleteCustomer, listCustomers, listOrders, saveCustomer } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCOP, formatDate, formatInt } from '../lib/format'
import { orderTotal } from '../lib/stats'
import type { Customer } from '../lib/types'
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Table, Td, Textarea, Th, useAction } from '../components/ui'

export function CustomersPage() {
  const { business } = useBusiness()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const { data, error, loading, reload } = useAsync(() => Promise.all([listCustomers(business.id), listOrders(business.id)]), [business.id])
  const [customers, orders] = data ?? [[], []]

  const history = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; last: string }>()
    for (const o of orders) {
      if (!o.customer_id || o.status === 'cancelado') continue
      const h = map.get(o.customer_id) ?? { orders: 0, total: 0, last: o.created_at }
      h.orders += 1
      h.total += orderTotal({ items: o.order_items, discount: o.discount, shipping_cost: o.shipping_cost })
      if (o.created_at > h.last) h.last = o.created_at
      map.set(o.customer_id, h)
    }
    return map
  }, [orders])

  const filtered = customers.filter((c) => {
    const q = query.trim().toLowerCase()
    return !q || [c.name, c.phone, c.email, c.city, c.document].some((v) => (v ?? '').toLowerCase().includes(q))
  })

  return (
    <>
      <PageHeader title="Clientes" subtitle="Historial de compras de cada cliente." actions={<Button variant="primary" onClick={() => setEditing({})}>+ Nuevo cliente</Button>} />
      <ErrorBox error={error} onRetry={reload} />
      <Card>
        <div className="border-b border-border px-4 py-3">
          <Input className="max-w-xs" placeholder="Buscar por nombre, teléfono, correo…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar clientes" />
        </div>
        {loading && !data ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={customers.length ? 'Nada coincide con la búsqueda' : 'Aún no hay clientes'}>
            {customers.length ? null : 'También puedes crearlos directamente al registrar un pedido.'}
          </EmptyState>
        ) : (
          <Table head={<><Th>Nombre</Th><Th>Contacto</Th><Th>Ciudad</Th><Th className="text-right">Pedidos</Th><Th className="text-right">Total comprado</Th><Th>Última compra</Th><Th /></>}>
            {filtered.map((c) => {
              const h = history.get(c.id)
              return (
                <tr key={c.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-ink-muted">
                    {c.phone && <a className="hover:underline" href={`https://wa.me/${c.phone.replace(/\D/g, '').replace(/^(?!57)(\d{10})$/, '57$1')}`} target="_blank" rel="noreferrer">{c.phone}</a>}
                    {c.phone && c.email && ' · '}
                    {c.email}
                  </Td>
                  <Td className="text-ink-muted">{c.city}</Td>
                  <Td className="text-right tabular">{h ? <Link className="hover:underline" to={`../pedidos?cliente=${c.id}`}>{formatInt(h.orders)}</Link> : 0}</Td>
                  <Td className="text-right tabular">{h ? formatCOP(h.total) : '—'}</Td>
                  <Td className="text-ink-muted">{h ? formatDate(h.last) : '—'}</Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Editar</Button></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
      <CustomerModal customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
    </>
  )
}

export function CustomerModal({ customer, onClose, onSaved }: {
  customer: Partial<Customer> | null
  onClose: () => void
  onSaved: (c: Customer) => void
}) {
  const { business } = useBusiness()
  const [form, setForm] = useState<Partial<Customer>>({})
  const [loadedFor, setLoadedFor] = useState<Partial<Customer> | null>(null)
  const { busy, error, run } = useAction()

  // Reinicia el formulario cada vez que se abre con otro cliente.
  if (customer !== loadedFor) {
    setLoadedFor(customer)
    setForm(customer ?? {})
  }

  const set = (k: keyof Customer) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const saved = await run(() => saveCustomer(business.id, { ...form, name: form.name ?? '' }))
    if (saved) onSaved(saved)
  }

  async function remove() {
    if (!form.id || !confirm(`¿Eliminar a ${form.name}? Sus pedidos se conservan, pero sin cliente asociado.`)) return
    const ok = await run(async () => { await deleteCustomer(form.id!); return true })
    if (ok) onSaved(form as Customer)
  }

  return (
    <Modal open={customer !== null} onClose={onClose} title={form.id ? 'Editar cliente' : 'Nuevo cliente'} wide
      footer={<>
        {form.id && <Button variant="danger" className="mr-auto" onClick={remove} disabled={busy}>Eliminar</Button>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="customer-form" variant="primary" disabled={busy || !form.name?.trim()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </>}>
      <form id="customer-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="Nombre" className="col-span-2">{(id) => <Input id={id} required autoFocus value={form.name ?? ''} onChange={set('name')} />}</Field>
        <Field label="Teléfono / WhatsApp">{(id) => <Input id={id} type="tel" value={form.phone ?? ''} onChange={set('phone')} placeholder="300 123 4567" />}</Field>
        <Field label="Correo">{(id) => <Input id={id} type="email" value={form.email ?? ''} onChange={set('email')} />}</Field>
        <Field label="Cédula o NIT" hint="Opcional, para cotizaciones">{(id) => <Input id={id} value={form.document ?? ''} onChange={set('document')} />}</Field>
        <Field label="Ciudad">{(id) => <Input id={id} value={form.city ?? ''} onChange={set('city')} />}</Field>
        <Field label="Dirección" className="col-span-2">{(id) => <Input id={id} value={form.address ?? ''} onChange={set('address')} />}</Field>
        <Field label="Notas" className="col-span-2">{(id) => <Textarea id={id} value={form.notes ?? ''} onChange={set('notes')} />}</Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </form>
    </Modal>
  )
}
