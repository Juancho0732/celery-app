import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { getOrder, listCustomers, listProducts, listVariantStock, saveOrder } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { fromBogotaInput, toBogotaInput } from '../lib/dateRange'
import { CHANNEL_LABELS } from '../lib/stats'
import { ORDER_STATUS, PAYMENT_METHODS } from '../lib/orderLabels'
import type { Channel, Customer, OrderStatus, PaymentMethod, PaymentStatus } from '../lib/types'
import { LineItemsEditor, linesSubtotal, newLine, TotalsBox, type LineDraft } from '../components/LineItemsEditor'
import { CustomerPicker } from '../components/CustomerPicker'
import { Button, Card, ErrorBox, Field, Input, MoneyInput, PageHeader, Select, Spinner, Textarea, useAction } from '../components/ui'

export function OrderEditorPage() {
  const { orderId } = useParams()
  const isNew = !orderId
  const [params] = useSearchParams()
  const quickSale = isNew && params.get('rapida') === '1'
  const { business } = useBusiness()
  const navigate = useNavigate()

  const { data, error: loadError, loading, reload } = useAsync(() => Promise.all([
    listProducts(business.id), listVariantStock([business.id]), listCustomers(business.id),
    isNew ? Promise.resolve(null) : getOrder(orderId!),
  ]), [business.id, orderId])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [createdAt, setCreatedAt] = useState(toBogotaInput(new Date()))
  const [customerId, setCustomerId] = useState(params.get('cliente') ?? '')
  const [channel, setChannel] = useState<Channel>(quickSale ? 'tienda' : business.kind === 'ropa' ? 'instagram' : 'whatsapp')
  const [status, setStatus] = useState<OrderStatus>(quickSale ? 'entregado' : 'nuevo')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(quickSale ? 'efectivo' : '')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(quickSale ? 'pagado' : 'pendiente')
  const [lines, setLines] = useState<LineDraft[]>([newLine()])
  const [discount, setDiscount] = useState(0)
  const [shipping, setShipping] = useState(0)
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    if (!data) return
    setCustomers(data[2])
    const o = data[3]
    if (!o) return
    setCreatedAt(toBogotaInput(new Date(o.created_at)))
    setCustomerId(o.customer_id ?? '')
    setChannel(o.channel)
    setStatus(o.status)
    setPaymentMethod(o.payment_method ?? '')
    setPaymentStatus(o.payment_status)
    setLines(o.order_items.map((i) => ({ ...newLine(), variant_id: i.variant_id, quantity: i.quantity, unit_price: i.unit_price })))
    setDiscount(o.discount)
    setShipping(o.shipping_cost)
    setCarrier(o.carrier ?? '')
    setTracking(o.tracking_number ?? '')
    setNotes(o.notes ?? '')
  }, [data])

  if (loading && !data) return <Spinner />
  if (loadError) return <ErrorBox error={loadError} onRetry={reload} />
  const [products, stock, , existing] = data!
  if (existing && (existing.stock_applied || existing.status === 'cancelado')) {
    return <ErrorBox error={new Error('Este pedido ya fue entregado o cancelado y no se puede editar.')} />
  }

  const subtotal = linesSubtotal(lines)
  const delivery = channel !== 'tienda'

  async function submit(e: FormEvent) {
    e.preventDefault()
    const items = lines.filter((l) => l.variant_id)
    if (!items.length) {
      setError(new Error('Agrega al menos un producto.'))
      return
    }
    if (discount > subtotal) {
      setError(new Error('El descuento no puede ser mayor que el subtotal.'))
      return
    }
    const saved = await run(() => saveOrder({
      id: orderId,
      business_id: business.id,
      customer_id: customerId || null,
      channel,
      status,
      payment_method: paymentMethod || null,
      payment_status: paymentStatus,
      discount,
      shipping_cost: shipping,
      carrier,
      tracking_number: tracking,
      notes,
      created_at: fromBogotaInput(createdAt).toISOString(),
    }, items.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price }))))
    if (saved) navigate(`/n/${business.id}/pedidos/${saved.id}`, { replace: true })
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={quickSale ? 'Venta rápida en tienda' : isNew ? 'Nuevo pedido' : `Editar pedido #${existing?.number}`}
        subtitle={status === 'entregado' ? 'Al guardar como entregado, las unidades se descuentan del inventario.' : undefined}
        actions={<>
          <Button onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar pedido'}</Button>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Productos">
            <LineItemsEditor products={products} stock={stock} lines={lines} onChange={setLines} />
          </Card>
          <Card title="Entrega y notas">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {delivery && <>
                <Field label="Transportadora o domiciliario">{(id) => <Input id={id} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={business.kind === 'ropa' ? 'Servientrega, Interrapidísimo…' : 'Domiciliario'} />}</Field>
                <Field label="Número de guía">{(id) => <Input id={id} value={tracking} onChange={(e) => setTracking(e.target.value)} />}</Field>
              </>}
              <Field label="Notas" className="sm:col-span-2">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dirección de entrega, indicaciones, cambios de talla…" />}</Field>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Pedido">
            <div className="flex flex-col gap-4 p-5">
              <Field label="Cliente">
                {(id) => <CustomerPicker id={id} customers={customers} value={customerId} onChange={setCustomerId} onCreated={(c) => setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name, 'es')))} />}
              </Field>
              <Field label="Fecha y hora" hint="Puedes registrar ventas de días anteriores.">{(id) => <Input id={id} type="datetime-local" required value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />}</Field>
              <Field label="Canal">
                {(id) => (
                  <Select id={id} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                    {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Estado">
                {(id) => (
                  <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                    {(Object.keys(ORDER_STATUS) as OrderStatus[]).filter((s) => s !== 'cancelado').map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </Card>
          <Card title="Pago">
            <div className="flex flex-col gap-4 p-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Método">
                  {(id) => (
                    <Select id={id} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                      <option value="">Sin definir</option>
                      {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Estado del pago">
                  {(id) => (
                    <Select id={id} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                    </Select>
                  )}
                </Field>
                <Field label="Descuento">{(id) => <MoneyInput id={id} value={discount} onChange={setDiscount} />}</Field>
                <Field label="Envío">{(id) => <MoneyInput id={id} value={shipping} onChange={setShipping} />}</Field>
              </div>
              <TotalsBox subtotal={subtotal} discount={discount} shipping={shipping} />
            </div>
          </Card>
          <ErrorBox error={error} />
        </div>
      </div>
    </form>
  )
}
