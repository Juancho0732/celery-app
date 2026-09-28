import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { listOrders } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCOP, formatDateTime } from '../lib/format'
import { CHANNEL_LABELS, orderTotal } from '../lib/stats'
import { OPEN_STATUSES, ORDER_STATUS } from '../lib/orderLabels'
import type { Channel, OrderStatus } from '../lib/types'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, Table, Td, Th } from '../components/ui'

type StatusFilter = 'abiertos' | 'todos' | OrderStatus

export function OrdersPage() {
  const { business } = useBusiness()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const status = (params.get('estado') ?? 'todos') as StatusFilter
  const payment = params.get('pago') ?? ''
  const channel = params.get('canal') ?? ''
  const customerId = params.get('cliente') ?? ''
  const { data: orders, error, loading, reload } = useAsync(() => listOrders(business.id), [business.id])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => (orders ?? []).filter((o) => {
    if (status === 'abiertos' && !OPEN_STATUSES.includes(o.status)) return false
    if (status !== 'abiertos' && status !== 'todos' && o.status !== status) return false
    if (payment && o.payment_status !== payment) return false
    if (channel && o.channel !== channel) return false
    if (customerId && o.customer_id !== customerId) return false
    const q = query.trim().toLowerCase()
    if (q && !(`#${o.number}`.includes(q) || String(o.number) === q || (o.customer?.name ?? '').toLowerCase().includes(q) ||
      (o.tracking_number ?? '').toLowerCase().includes(q))) return false
    return true
  }), [orders, status, payment, channel, customerId, query])

  const openCount = (orders ?? []).filter((o) => OPEN_STATUSES.includes(o.status)).length

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={openCount ? `${openCount} ${openCount === 1 ? 'pedido en curso' : 'pedidos en curso'}.` : 'Ventas de todos los canales.'}
        actions={<>
          {business.kind === 'perecedero' && <Link to="nuevo?rapida=1"><Button>Venta rápida en tienda</Button></Link>}
          <Link to="nuevo"><Button variant="primary">+ Nuevo pedido</Button></Link>
        </>}
      />
      <ErrorBox error={error} onRetry={reload} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Input className="max-w-56" placeholder="N.º, cliente o guía…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar pedidos" />
          <Select className="max-w-48" aria-label="Estado" value={status} onChange={(e) => setFilter('estado', e.target.value === 'todos' ? '' : e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="abiertos">En curso</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
          </Select>
          <Select className="max-w-44" aria-label="Pago" value={payment} onChange={(e) => setFilter('pago', e.target.value)}>
            <option value="">Todos los pagos</option>
            <option value="pendiente">Pago pendiente</option>
            <option value="pagado">Pagado</option>
          </Select>
          <Select className="max-w-44" aria-label="Canal" value={channel} onChange={(e) => setFilter('canal', e.target.value)}>
            <option value="">Todos los canales</option>
            {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
          </Select>
          {customerId && <Button size="sm" variant="ghost" onClick={() => setFilter('cliente', '')}>Quitar filtro de cliente ✕</Button>}
        </div>
        {loading && !orders ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={orders?.length ? 'Ningún pedido coincide con los filtros' : 'Aún no hay pedidos'}
            action={!orders?.length && <Link to="nuevo"><Button variant="primary">Registrar el primero</Button></Link>} />
        ) : (
          <Table head={<><Th>N.º</Th><Th>Fecha</Th><Th>Cliente</Th><Th>Canal</Th><Th>Estado</Th><Th>Pago</Th><Th className="text-right">Total</Th></>}>
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-surface-muted/60">
                <Td><Link to={o.id} className="font-medium hover:underline">#{o.number}</Link></Td>
                <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(o.created_at)}</Td>
                <Td>{o.customer?.name ?? <span className="text-ink-faint">Sin cliente</span>}</Td>
                <Td className="text-ink-muted">{CHANNEL_LABELS[o.channel]}</Td>
                <Td><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].icon} {ORDER_STATUS[o.status].label}</Badge></Td>
                <Td>{o.status === 'cancelado' ? <span className="text-ink-faint">—</span>
                  : o.payment_status === 'pagado' ? <Badge tone="good">✓ Pagado</Badge> : <Badge tone="bad">$ Pendiente</Badge>}</Td>
                <Td className={`text-right tabular font-medium ${o.status === 'cancelado' ? 'text-ink-faint line-through' : ''}`}>
                  {formatCOP(orderTotal({ items: o.order_items, discount: o.discount, shipping_cost: o.shipping_cost }))}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
