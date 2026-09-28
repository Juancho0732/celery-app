import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { listQuotes } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { bogotaDayKey } from '../lib/dateRange'
import { formatCOP, formatDate, formatDay } from '../lib/format'
import { QUOTE_STATUS } from '../lib/orderLabels'
import { orderTotal } from '../lib/stats'
import type { QuoteStatus } from '../lib/types'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, Table, Td, Th } from '../components/ui'

export function QuotesPage() {
  const { business } = useBusiness()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<QuoteStatus | ''>('')
  const { data: quotes, error, loading, reload } = useAsync(() => listQuotes(business.id), [business.id])
  const today = bogotaDayKey(new Date())

  const filtered = useMemo(() => (quotes ?? []).filter((q) => {
    if (status && q.status !== status) return false
    const s = query.trim().toLowerCase()
    return !s || String(q.number) === s || `#${q.number}`.includes(s) || (q.customer?.name ?? '').toLowerCase().includes(s)
  }), [quotes, status, query])

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle="Crea cotizaciones en PDF con el logo del negocio y conviértelas en pedido cuando el cliente acepte."
        actions={<Link to="nueva"><Button variant="primary">+ Nueva cotización</Button></Link>}
      />
      <ErrorBox error={error} onRetry={reload} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Input className="max-w-56" placeholder="N.º o cliente…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar cotizaciones" />
          <Select className="max-w-44" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus | '')}>
            <option value="">Todos los estados</option>
            {(Object.keys(QUOTE_STATUS) as QuoteStatus[]).map((s) => <option key={s} value={s}>{QUOTE_STATUS[s].label}</option>)}
          </Select>
        </div>
        {loading && !quotes ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={quotes?.length ? 'Ninguna cotización coincide' : 'Aún no hay cotizaciones'}
            action={!quotes?.length && <Link to="nueva"><Button variant="primary">Crear la primera</Button></Link>} />
        ) : (
          <Table head={<><Th>N.º</Th><Th>Fecha</Th><Th>Cliente</Th><Th>Válida hasta</Th><Th>Estado</Th><Th className="text-right">Total</Th></>}>
            {filtered.map((q) => {
              const expired = q.valid_until && q.valid_until < today && (q.status === 'borrador' || q.status === 'enviada')
              return (
                <tr key={q.id} className="hover:bg-surface-muted/60">
                  <Td><Link to={q.id} className="font-medium hover:underline">#{q.number}</Link></Td>
                  <Td className="text-ink-muted">{formatDate(q.created_at)}</Td>
                  <Td>{q.customer?.name ?? <span className="text-ink-faint">Sin cliente</span>}</Td>
                  <Td className="text-ink-muted">{q.valid_until ? formatDay(q.valid_until) : '—'}</Td>
                  <Td className="flex gap-1.5">
                    <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                    {expired && <Badge tone="warning">⏳ Vencida</Badge>}
                  </Td>
                  <Td className="text-right tabular font-medium">{formatCOP(orderTotal({ items: q.quote_items, discount: q.discount, shipping_cost: q.shipping_cost }))}</Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
    </>
  )
}
