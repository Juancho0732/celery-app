import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { deleteOrder, getOrder, setOrderStatus, updateOrderTracking } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCOP, formatDateTime } from '../lib/format'
import { CHANNEL_LABELS, itemsValue } from '../lib/stats'
import { ORDER_STATUS, PAYMENT_METHODS } from '../lib/orderLabels'
import type { OrderStatus, PaymentMethod } from '../lib/types'
import { TotalsBox } from '../components/LineItemsEditor'
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table, Td, Th, useAction } from '../components/ui'

/** Siguiente paso natural según el canal (en tienda se entrega de una vez). */
function nextSteps(status: OrderStatus, channel: string): OrderStatus[] {
  if (status === 'nuevo') return channel === 'tienda' ? ['entregado'] : ['preparando', 'entregado']
  if (status === 'preparando') return channel === 'tienda' ? ['listo', 'entregado'] : ['enviado', 'listo', 'entregado']
  if (status === 'enviado' || status === 'listo') return ['entregado']
  return []
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { business } = useBusiness()
  const navigate = useNavigate()
  const { data: order, error: loadError, loading, reload } = useAsync(() => getOrder(orderId!), [orderId])
  const { busy, error, run } = useAction()
  const [carrier, setCarrier] = useState<string | null>(null)
  const [tracking, setTracking] = useState<string | null>(null)

  if (loading && !order) return <Spinner />
  if (loadError || !order) return <ErrorBox error={loadError} onRetry={reload} />

  const editable = !order.stock_applied && order.status !== 'cancelado'
  const subtotal = itemsValue(order.order_items)
  const info = ORDER_STATUS[order.status]

  async function changeStatus(status: OrderStatus) {
    if (status === 'cancelado' && !confirm(order!.stock_applied
      ? 'Se cancelará el pedido y sus unidades volverán al inventario. ¿Continuar?'
      : '¿Cancelar este pedido?')) return
    const ok = await run(async () => { await setOrderStatus(order!.id, status); return true })
    if (ok) reload()
  }

  async function patch(fields: Parameters<typeof updateOrderTracking>[1]) {
    const ok = await run(async () => { await updateOrderTracking(order!.id, fields); return true })
    if (ok) reload()
  }

  async function remove() {
    if (!confirm(`¿Eliminar el pedido #${order!.number}? Esta acción no se puede deshacer.`)) return
    const ok = await run(async () => { await deleteOrder(order!.id); return true })
    if (ok) navigate(`/n/${business.id}/pedidos`, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Pedido #{order.number} <Badge tone={info.tone}>{info.icon} {info.label}</Badge></span>}
        subtitle={`${formatDateTime(order.created_at)} · ${CHANNEL_LABELS[order.channel]}`}
        actions={<>
          <Link to={`/n/${business.id}/pedidos`}><Button variant="ghost">← Pedidos</Button></Link>
          {editable && <Link to="editar"><Button>Editar</Button></Link>}
          {editable && <Button variant="danger" onClick={remove} disabled={busy}>Eliminar</Button>}
          {order.status !== 'cancelado' && <Button variant="danger" onClick={() => changeStatus('cancelado')} disabled={busy}>Cancelar pedido</Button>}
        </>}
      />
      <div className="mb-4"><ErrorBox error={error} /></div>

      {nextSteps(order.status, order.channel).length > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="text-sm text-ink-muted">Marcar como:</span>
            {nextSteps(order.status, order.channel).map((s) => (
              <Button key={s} variant={s === 'entregado' ? 'primary' : 'secondary'} onClick={() => changeStatus(s)} disabled={busy}>
                {ORDER_STATUS[s].icon} {ORDER_STATUS[s].label}
              </Button>
            ))}
            {!order.stock_applied && <span className="text-xs text-ink-faint">Las unidades se descuentan del inventario al marcarlo entregado.</span>}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Productos">
          <Table head={<><Th>Producto</Th><Th className="text-right">Cant.</Th><Th className="text-right">Precio</Th><Th className="text-right">Total</Th></>}>
            {order.order_items.map((i) => (
              <tr key={i.id}>
                <Td>{i.description}</Td>
                <Td className="text-right tabular">{i.quantity}</Td>
                <Td className="text-right tabular">{formatCOP(i.unit_price)}</Td>
                <Td className="text-right tabular font-medium">{formatCOP(i.quantity * i.unit_price)}</Td>
              </tr>
            ))}
          </Table>
          <div className="flex justify-end border-t border-border px-5 py-4">
            <div className="w-72"><TotalsBox subtotal={subtotal} discount={order.discount} shipping={order.shipping_cost} /></div>
          </div>
          {order.notes && <p className="border-t border-border px-5 py-4 text-sm text-ink-muted"><strong className="text-ink">Notas:</strong> {order.notes}</p>}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Cliente">
            <div className="px-5 py-4 text-sm">
              {order.customer ? (
                <>
                  <p className="font-medium">{order.customer.name}</p>
                  {order.customer.phone && (
                    <a className="text-brand-text hover:underline" target="_blank" rel="noreferrer"
                      href={`https://wa.me/${order.customer.phone.replace(/\D/g, '').replace(/^(?!57)(\d{10})$/, '57$1')}`}>
                      WhatsApp {order.customer.phone}
                    </a>
                  )}
                </>
              ) : <p className="text-ink-faint">Sin cliente</p>}
            </div>
          </Card>

          <Card title="Pago">
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between">
                {order.payment_status === 'pagado' ? <Badge tone="good">✓ Pagado</Badge> : <Badge tone="bad">$ Pendiente</Badge>}
                {order.status !== 'cancelado' && (
                  <Button size="sm" onClick={() => patch({ payment_status: order.payment_status === 'pagado' ? 'pendiente' : 'pagado' })} disabled={busy}>
                    {order.payment_status === 'pagado' ? 'Marcar pendiente' : 'Marcar pagado'}
                  </Button>
                )}
              </div>
              <Field label="Método">
                {(id) => (
                  <Select id={id} value={order.payment_method ?? ''} disabled={busy || order.status === 'cancelado'}
                    onChange={(e) => patch({ payment_method: (e.target.value || null) as PaymentMethod | null })}>
                    <option value="">Sin definir</option>
                    {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          {order.channel !== 'tienda' && (
            <Card title="Envío">
              <div className="flex flex-col gap-3 px-5 py-4">
                <Field label="Transportadora">{(id) => <Input id={id} value={carrier ?? order.carrier ?? ''} onChange={(e) => setCarrier(e.target.value)} />}</Field>
                <Field label="Número de guía">{(id) => <Input id={id} value={tracking ?? order.tracking_number ?? ''} onChange={(e) => setTracking(e.target.value)} />}</Field>
                {(carrier !== null || tracking !== null) && (
                  <Button size="sm" variant="primary" disabled={busy} onClick={async () => {
                    await patch({ carrier: (carrier ?? order.carrier ?? '').trim() || null, tracking_number: (tracking ?? order.tracking_number ?? '').trim() || null })
                    setCarrier(null)
                    setTracking(null)
                  }}>Guardar envío</Button>
                )}
              </div>
            </Card>
          )}
          {order.quote_id && <p className="text-sm text-ink-muted">Creado desde una <Link className="text-brand-text hover:underline" to={`/n/${business.id}/cotizaciones/${order.quote_id}`}>cotización</Link>.</p>}
        </div>
      </div>
    </>
  )
}
