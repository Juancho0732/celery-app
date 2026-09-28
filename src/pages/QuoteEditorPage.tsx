import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { getQuote, listCustomers, listProducts, saveQuote } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { addDays, bogotaDayKey } from '../lib/dateRange'
import type { Customer } from '../lib/types'
import { LineItemsEditor, linesSubtotal, newLine, TotalsBox, type LineDraft } from '../components/LineItemsEditor'
import { CustomerPicker } from '../components/CustomerPicker'
import { Button, Card, ErrorBox, Field, Input, MoneyInput, PageHeader, Spinner, Textarea, useAction } from '../components/ui'

export function QuoteEditorPage() {
  const { quoteId } = useParams()
  const isNew = !quoteId
  const { business } = useBusiness()
  const navigate = useNavigate()
  const { data, error: loadError, loading, reload } = useAsync(() => Promise.all([
    listProducts(business.id), listCustomers(business.id), isNew ? Promise.resolve(null) : getQuote(quoteId!),
  ]), [business.id, quoteId])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [validUntil, setValidUntil] = useState(addDays(bogotaDayKey(new Date()), business.quote_validity_days))
  const [lines, setLines] = useState<LineDraft[]>([newLine()])
  const [discount, setDiscount] = useState(0)
  const [shipping, setShipping] = useState(0)
  const [notes, setNotes] = useState('')
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    if (!data) return
    setCustomers(data[1])
    const q = data[2]
    if (!q) return
    setCustomerId(q.customer_id ?? '')
    setValidUntil(q.valid_until ?? '')
    setLines(q.quote_items.map((i) => ({ ...newLine(), variant_id: i.variant_id, quantity: i.quantity, unit_price: i.unit_price })))
    setDiscount(q.discount)
    setShipping(q.shipping_cost)
    setNotes(q.notes ?? '')
  }, [data])

  if (loading && !data) return <Spinner />
  if (loadError) return <ErrorBox error={loadError} onRetry={reload} />
  const [products, , existing] = data!
  if (existing?.order_id) return <ErrorBox error={new Error('Esta cotización ya se convirtió en pedido y no se puede editar.')} />

  const subtotal = linesSubtotal(lines)

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
    const saved = await run(() => saveQuote({
      id: quoteId,
      business_id: business.id,
      customer_id: customerId || null,
      status: existing?.status ?? 'borrador',
      valid_until: validUntil || null,
      discount,
      shipping_cost: shipping,
      notes,
    }, items.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, unit_price: l.unit_price }))))
    if (saved) navigate(`/n/${business.id}/cotizaciones/${saved.id}`, { replace: true })
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={isNew ? 'Nueva cotización' : `Editar cotización #${existing?.number}`}
        actions={<>
          <Button onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cotización'}</Button>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Productos">
            <LineItemsEditor products={products} lines={lines} onChange={setLines} />
          </Card>
          <Card title="Notas para el cliente">
            <div className="p-5">
              <Textarea aria-label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tiempo de entrega, forma de pago, condiciones especiales…" />
              <p className="mt-2 text-xs text-ink-faint">Las condiciones generales del negocio (en Configuración) se agregan al final del PDF.</p>
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Cotización">
            <div className="flex flex-col gap-4 p-5">
              <Field label="Cliente">
                {(id) => <CustomerPicker id={id} customers={customers} value={customerId} onChange={setCustomerId} onCreated={(c) => setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name, 'es')))} />}
              </Field>
              <Field label="Válida hasta">{(id) => <Input id={id} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />}</Field>
              <div className="grid grid-cols-2 gap-4">
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
