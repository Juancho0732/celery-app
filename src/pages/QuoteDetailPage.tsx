import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { convertQuote, deleteQuote, getQuote, setQuoteStatus } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { bogotaDayKey } from '../lib/dateRange'
import { formatCOP, formatDate, formatDay } from '../lib/format'
import { QUOTE_STATUS } from '../lib/orderLabels'
import { downloadQuotePdf } from '../lib/quotePdf'
import { itemsValue } from '../lib/stats'
import { TotalsBox } from '../components/LineItemsEditor'
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, Table, Td, Th, useAction } from '../components/ui'

export function QuoteDetailPage() {
  const { quoteId } = useParams()
  const { business } = useBusiness()
  const navigate = useNavigate()
  const { data: quote, error: loadError, loading, reload } = useAsync(() => getQuote(quoteId!), [quoteId])
  const { busy, error, run } = useAction()

  if (loading && !quote) return <Spinner />
  if (loadError || !quote) return <ErrorBox error={loadError} onRetry={reload} />

  const converted = Boolean(quote.order_id)
  const expired = quote.valid_until && quote.valid_until < bogotaDayKey(new Date()) && !converted

  async function act(fn: () => Promise<unknown>) {
    const ok = await run(async () => { await fn(); return true })
    if (ok) reload()
  }

  async function toOrder() {
    if (!confirm('Se creará un pedido nuevo con estos productos y precios. ¿Continuar?')) return
    const order = await run(() => convertQuote(quote!.id))
    if (order) navigate(`/n/${business.id}/pedidos/${order.id}`)
  }

  async function remove() {
    if (!confirm(`¿Eliminar la cotización #${quote!.number}?`)) return
    const ok = await run(async () => { await deleteQuote(quote!.id); return true })
    if (ok) navigate(`/n/${business.id}/cotizaciones`, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Cotización #{quote.number}
          <Badge tone={QUOTE_STATUS[quote.status].tone}>{QUOTE_STATUS[quote.status].label}</Badge>
          {expired && <Badge tone="warning">⏳ Vencida</Badge>}
        </span>}
        subtitle={`${formatDate(quote.created_at)}${quote.valid_until ? ` · válida hasta ${formatDay(quote.valid_until)}` : ''}`}
        actions={<>
          <Link to={`/n/${business.id}/cotizaciones`}><Button variant="ghost">← Cotizaciones</Button></Link>
          {!converted && <Link to="editar"><Button>Editar</Button></Link>}
          {!converted && <Button variant="danger" onClick={remove} disabled={busy}>Eliminar</Button>}
          <Button onClick={() => run(() => downloadQuotePdf(business, quote))} disabled={busy}>⬇ Descargar PDF</Button>
          {!converted && quote.status !== 'rechazada' && <Button variant="primary" onClick={toOrder} disabled={busy}>Convertir en pedido</Button>}
        </>}
      />
      <div className="mb-4"><ErrorBox error={error} /></div>

      {converted ? (
        <Card className="mb-6"><p className="px-5 py-4 text-sm">✓ Aceptada y convertida en <Link className="font-medium text-brand-text hover:underline" to={`/n/${business.id}/pedidos/${quote.order_id}`}>pedido</Link>.</p></Card>
      ) : (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="text-sm text-ink-muted">Marcar como:</span>
            {quote.status !== 'enviada' && <Button size="sm" onClick={() => act(() => setQuoteStatus(quote.id, 'enviada'))} disabled={busy}>Enviada al cliente</Button>}
            {quote.status !== 'rechazada' && <Button size="sm" onClick={() => act(() => setQuoteStatus(quote.id, 'rechazada'))} disabled={busy}>Rechazada</Button>}
            {quote.status === 'rechazada' && <Button size="sm" onClick={() => act(() => setQuoteStatus(quote.id, 'enviada'))} disabled={busy}>Reabrir</Button>}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Productos">
          <Table head={<><Th>Producto</Th><Th className="text-right">Cant.</Th><Th className="text-right">Precio</Th><Th className="text-right">Total</Th></>}>
            {quote.quote_items.map((i) => (
              <tr key={i.id}>
                <Td>{i.description}</Td>
                <Td className="text-right tabular">{i.quantity}</Td>
                <Td className="text-right tabular">{formatCOP(i.unit_price)}</Td>
                <Td className="text-right tabular font-medium">{formatCOP(i.quantity * i.unit_price)}</Td>
              </tr>
            ))}
          </Table>
          <div className="flex justify-end border-t border-border px-5 py-4">
            <div className="w-72"><TotalsBox subtotal={itemsValue(quote.quote_items)} discount={quote.discount} shipping={quote.shipping_cost} /></div>
          </div>
          {quote.notes && <p className="border-t border-border px-5 py-4 text-sm text-ink-muted"><strong className="text-ink">Notas:</strong> {quote.notes}</p>}
        </Card>
        <Card title="Cliente">
          <div className="px-5 py-4 text-sm">
            {quote.customer ? (
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{quote.customer.name}</p>
                {quote.customer.document && <p className="text-ink-muted">NIT/C.C. {quote.customer.document}</p>}
                {quote.customer.phone && <p className="text-ink-muted">{quote.customer.phone}</p>}
                {quote.customer.email && <p className="text-ink-muted">{quote.customer.email}</p>}
                {(quote.customer.address || quote.customer.city) && <p className="text-ink-muted">{[quote.customer.address, quote.customer.city].filter(Boolean).join(', ')}</p>}
              </div>
            ) : <p className="text-ink-faint">Sin cliente</p>}
          </div>
        </Card>
      </div>
    </>
  )
}
