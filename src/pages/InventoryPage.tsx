import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { addLotEntry, addMovement, listLotStock, listMovements, listProducts, listVariantStock } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { bogotaDayKey, addDays } from '../lib/dateRange'
import { daysUntil, expiryState, lotsNeedingAttention } from '../lib/expiry'
import { formatDateTime, formatDay, formatInt } from '../lib/format'
import { variantLabel } from '../lib/businessKind'
import type { LotStock, MovementType } from '../lib/types'
import { findVariant, VariantSelect } from '../components/VariantSelect'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, Td, Th, useAction } from '../components/ui'

const MOVEMENT_LABELS: Record<MovementType, { label: string; tone: 'good' | 'neutral' | 'warning' | 'brand' }> = {
  entrada: { label: 'Entrada', tone: 'good' },
  venta: { label: 'Venta', tone: 'brand' },
  ajuste: { label: 'Ajuste', tone: 'warning' },
  devolucion: { label: 'Devolución', tone: 'neutral' },
}

type Tab = 'existencias' | 'lotes' | 'movimientos'

function ExpiryBadge({ lot, warningDays }: { lot: LotStock; warningDays: number }) {
  const state = expiryState(lot.expires_on, warningDays)
  const days = daysUntil(lot.expires_on)
  if (state === 'vencido') return <Badge tone="bad">⚠ Vencido hace {-days} d</Badge>
  if (state === 'por-vencer') return <Badge tone="warning">⏳ {days === 0 ? 'Vence hoy' : `Vence en ${days} d`}</Badge>
  return <Badge tone="good">✓ {days} d</Badge>
}

export function InventoryPage() {
  const { business, labels } = useBusiness()
  const [tab, setTab] = useState<Tab>('existencias')
  const [entryOpen, setEntryOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { data, error, loading, reload } = useAsync(() => Promise.all([
    listProducts(business.id), listVariantStock([business.id]),
    labels.usesLots ? listLotStock([business.id]) : Promise.resolve([] as LotStock[]),
    listMovements(business.id),
  ]), [business.id])
  const [products, stock, lots, movements] = data ?? [[], new Map<string, number>(), [], []]

  const attention = useMemo(() => lotsNeedingAttention(lots, business.expiry_warning_days), [lots, business.expiry_warning_days])
  const rows = useMemo(() => products.flatMap((p) => p.product_variants
    .filter((v) => v.active && p.active)
    .map((v) => ({ product: p, variant: v, qty: stock.get(v.id) ?? 0 }))), [products, stock])
  const low = rows.filter((r) => r.qty <= r.variant.low_stock_threshold)

  function done(message: string) {
    setEntryOpen(false)
    setAdjustOpen(false)
    setNotice(message)
    reload()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'existencias', label: 'Existencias' },
    ...(labels.usesLots ? [{ id: 'lotes' as Tab, label: 'Lotes y vencimientos' }] : []),
    { id: 'movimientos', label: 'Historial de movimientos' },
  ]

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle={labels.usesLots
          ? 'Cada entrada de producción es un lote con fecha de vencimiento. Al vender, sale primero lo que vence primero.'
          : 'Existencias por talla y color. Las ventas se descuentan solas al marcar un pedido como entregado.'}
        actions={<>
          <Button onClick={() => setAdjustOpen(true)} disabled={!rows.length}>Ajuste</Button>
          <Button variant="primary" onClick={() => setEntryOpen(true)} disabled={!rows.length}>
            + {labels.usesLots ? 'Entrada de producción' : 'Entrada de mercancía'}
          </Button>
        </>}
      />
      <div className="mb-4 flex flex-col gap-3">
        {notice && <Notice>{notice}</Notice>}
        <ErrorBox error={error} onRetry={reload} />
        {labels.usesLots && attention.length > 0 && (
          <Notice tone="warning">
            ⏳ {attention.length} {attention.length === 1 ? 'lote vencido o por vencer' : 'lotes vencidos o por vencer'} con unidades disponibles.{' '}
            <button type="button" className="font-medium underline" onClick={() => setTab('lotes')}>Ver lotes</button>
          </Notice>
        )}
        {low.length > 0 && (
          <Notice tone="warning">▼ {low.length} {low.length === 1 ? 'variante tiene' : 'variantes tienen'} pocas existencias.</Notice>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.id ? 'border-brand font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? <Spinner /> : (
        <Card>
          {tab === 'existencias' && (rows.length === 0 ? (
            <EmptyState title="No hay productos activos" action={<Link to="../productos/nuevo"><Button variant="primary">Crear producto</Button></Link>}>
              Crea tus productos para empezar a registrar inventario.
            </EmptyState>
          ) : (
            <Table head={<><Th>{labels.product}</Th><Th>{[labels.option1, labels.option2].filter(Boolean).join(' / ')}</Th><Th className="text-right">Existencia</Th><Th className="text-right">Alerta en</Th><Th>Estado</Th></>}>
              {rows.map(({ product, variant, qty }) => (
                <tr key={variant.id}>
                  <Td className="font-medium">{product.name}</Td>
                  <Td>{variantLabel(variant)}</Td>
                  <Td className="text-right tabular font-medium">{formatInt(qty)}</Td>
                  <Td className="text-right tabular text-ink-faint">{formatInt(variant.low_stock_threshold)}</Td>
                  <Td>
                    {qty < 0 ? <Badge tone="bad">⚠ Negativo: revisa entradas</Badge>
                      : qty === 0 ? <Badge tone="bad">⚠ Agotado</Badge>
                      : qty <= variant.low_stock_threshold ? <Badge tone="warning">▼ Bajo</Badge>
                      : <Badge tone="good">✓ OK</Badge>}
                  </Td>
                </tr>
              ))}
            </Table>
          ))}

          {tab === 'lotes' && (lots.filter((l) => l.stock !== 0).length === 0 ? (
            <EmptyState title="No hay lotes con unidades">Registra una entrada de producción para crear el primer lote.</EmptyState>
          ) : (
            <Table head={<><Th>Producto</Th><Th>Lote</Th><Th>Producción</Th><Th>Vence</Th><Th className="text-right">Unidades</Th><Th>Estado</Th></>}>
              {lots.filter((l) => l.stock !== 0).map((l) => {
                const found = findVariant(products, l.variant_id)
                return (
                  <tr key={l.lot_id}>
                    <Td className="font-medium">{found ? `${found.product.name} · ${variantLabel(found.variant)}` : '—'}</Td>
                    <Td>{l.code ?? <span className="text-ink-faint">Sin código</span>}</Td>
                    <Td>{l.produced_on ? formatDay(l.produced_on) : '—'}</Td>
                    <Td>{formatDay(l.expires_on)}</Td>
                    <Td className="text-right tabular font-medium">{formatInt(l.stock)}</Td>
                    <Td><ExpiryBadge lot={l} warningDays={business.expiry_warning_days} /></Td>
                  </tr>
                )
              })}
            </Table>
          ))}

          {tab === 'movimientos' && (movements.length === 0 ? (
            <EmptyState title="Aún no hay movimientos" />
          ) : (
            <Table head={<><Th>Fecha</Th><Th>Tipo</Th><Th>Producto</Th>{labels.usesLots && <Th>Lote</Th>}<Th className="text-right">Cantidad</Th><Th>Detalle</Th></>}>
              {movements.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-ink-muted">{formatDateTime(m.created_at)}</Td>
                  <Td><Badge tone={MOVEMENT_LABELS[m.type].tone}>{MOVEMENT_LABELS[m.type].label}</Badge></Td>
                  <Td>{m.variant ? `${m.variant.product?.name ?? ''} · ${variantLabel(m.variant)}` : '—'}</Td>
                  {labels.usesLots && <Td className="text-ink-muted">{m.lot ? (m.lot.code ?? formatDay(m.lot.expires_on)) : '—'}</Td>}
                  <Td className={`text-right tabular font-medium ${m.quantity > 0 ? 'text-good-text' : ''}`}>{m.quantity > 0 ? '+' : ''}{formatInt(m.quantity)}</Td>
                  <Td className="text-ink-muted">
                    {m.order ? <Link className="hover:underline" to={`../pedidos/${m.order_id}`}>Pedido #{m.order.number}</Link> : null}
                    {m.note && <span className="ml-1">{m.note}</span>}
                  </Td>
                </tr>
              ))}
            </Table>
          ))}
        </Card>
      )}

      <EntryModal open={entryOpen} onClose={() => setEntryOpen(false)} onDone={done} products={products} stock={stock} />
      <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} onDone={done} products={products} stock={stock} lots={lots} />
    </>
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  products: Awaited<ReturnType<typeof listProducts>>
  stock: Map<string, number>
}

function EntryModal({ open, onClose, onDone, products, stock }: ModalProps) {
  const { business, labels } = useBusiness()
  const today = bogotaDayKey(new Date())
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [code, setCode] = useState('')
  const [producedOn, setProducedOn] = useState(today)
  const [expiresOn, setExpiresOn] = useState(addDays(today, 30))
  const [note, setNote] = useState('')
  const { busy, error, setError, run } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const qty = Number(quantity)
    if (!variantId || !Number.isInteger(qty) || qty <= 0) {
      setError(new Error('Elige el producto y una cantidad mayor que cero.'))
      return
    }
    const ok = await run(async () => {
      if (labels.usesLots) {
        await addLotEntry({ business_id: business.id, variant_id: variantId, quantity: qty, code, produced_on: producedOn, expires_on: expiresOn, note })
      } else {
        await addMovement({ business_id: business.id, variant_id: variantId, quantity: qty, type: 'entrada', note: note.trim() || undefined })
      }
      return true
    })
    if (ok) {
      setQuantity('')
      setCode('')
      setNote('')
      onDone(`Entrada registrada: +${qty} unidades.`)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={labels.usesLots ? 'Entrada de producción' : 'Entrada de mercancía'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button type="submit" form="entry-form" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar'}</Button></>}>
      <form id="entry-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="Producto" className="col-span-2">{(id) => <VariantSelect id={id} products={products} value={variantId} onChange={setVariantId} stock={stock} />}</Field>
        <Field label="Cantidad (unidades)">{(id) => <Input id={id} type="number" min={1} step={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        {labels.usesLots && <>
          <Field label="Código de lote" hint="Opcional">{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} placeholder="L-0928" />}</Field>
          <Field label="Fecha de producción">{(id) => <Input id={id} type="date" value={producedOn} onChange={(e) => setProducedOn(e.target.value)} />}</Field>
          <Field label="Fecha de vencimiento">{(id) => <Input id={id} type="date" required value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />}</Field>
        </>}
        <Field label="Nota" className="col-span-2">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder={labels.usesLots ? 'Opcional' : 'Proveedor, factura… (opcional)'} />}</Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </form>
    </Modal>
  )
}

function AdjustModal({ open, onClose, onDone, products, stock, lots }: ModalProps & { lots: LotStock[] }) {
  const { business, labels } = useBusiness()
  const [variantId, setVariantId] = useState('')
  const [lotId, setLotId] = useState('')
  const [direction, setDirection] = useState<'-1' | '1'>('-1')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('Producto dañado')
  const { busy, error, setError, run } = useAction()
  const variantLots = lots.filter((l) => l.variant_id === variantId && l.stock !== 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const qty = Number(quantity)
    if (!variantId || !Number.isInteger(qty) || qty <= 0) {
      setError(new Error('Elige el producto y una cantidad mayor que cero.'))
      return
    }
    const signed = qty * Number(direction)
    const ok = await run(async () => {
      await addMovement({ business_id: business.id, variant_id: variantId, lot_id: lotId || null, quantity: signed, type: 'ajuste', note: reason.trim() || undefined })
      return true
    })
    if (ok) {
      setQuantity('')
      onDone(`Ajuste registrado: ${signed > 0 ? '+' : ''}${signed} unidades.`)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajuste de inventario"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button type="submit" form="adjust-form" variant="primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar ajuste'}</Button></>}>
      <form id="adjust-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <p className="col-span-2 text-sm text-ink-muted">Para corregir un conteo, pérdidas o daños. Queda en el historial con tu nombre.</p>
        <Field label="Producto" className="col-span-2">{(id) => <VariantSelect id={id} products={products} value={variantId} onChange={(v) => { setVariantId(v); setLotId('') }} stock={stock} />}</Field>
        {labels.usesLots && (
          <Field label="Lote" className="col-span-2" hint="Si es una pérdida de un lote puntual (p. ej. vencido).">
            {(id) => (
              <Select id={id} value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={!variantLots.length}>
                <option value="">Sin lote</option>
                {variantLots.map((l) => <option key={l.lot_id} value={l.lot_id}>{l.code ?? 'Sin código'} · vence {formatDay(l.expires_on)} · {l.stock} und.</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value as '-1' | '1')}>
              <option value="-1">Restar unidades</option>
              <option value="1">Sumar unidades</option>
            </Select>
          )}
        </Field>
        <Field label="Cantidad">{(id) => <Input id={id} type="number" min={1} step={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        <Field label="Motivo" className="col-span-2">
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Producto dañado', 'Producto vencido', 'Corrección de conteo', 'Consumo interno', 'Muestra o regalo', 'Otro'].map((r) => <option key={r}>{r}</option>)}
            </Select>
          )}
        </Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </form>
    </Modal>
  )
}
