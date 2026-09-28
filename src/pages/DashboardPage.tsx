import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useBusiness } from '../layout/BusinessContext'
import { listLotStock, listProducts, listVariantStock, loadStatsData } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { addDays, bogotaDayKey, COMPARISON_LABELS, PRESET_LABELS, resolveRange, type RangePreset } from '../lib/dateRange'
import { lotsNeedingAttention } from '../lib/expiry'
import { formatCOP, formatInt, formatPercent } from '../lib/format'
import { KIND_LABELS } from '../lib/businessKind'
import { computeDashboardStats, relativeChange, type Kpis } from '../lib/stats'
import { OPEN_STATUSES } from '../lib/orderLabels'
import type { BusinessWithRole, LotStock } from '../lib/types'
import { BarList, SalesOverTime } from '../components/charts'
import { Card, ErrorBox, Input, PageHeader, Spinner } from '../components/ui'

/** Dashboard de un negocio. */
export function DashboardPage() {
  const { business } = useBusiness()
  return <Dashboard businesses={[business]} />
}

/** Dashboard combinado de todos los negocios del usuario. */
export function CombinedDashboardPage() {
  const { businesses, businessesLoading } = useAuth()
  if (businessesLoading && !businesses.length) return <Spinner />
  return <Dashboard businesses={businesses} />
}

const PRESETS: RangePreset[] = ['hoy', '7d', '30d', 'general', 'personalizado']

function Dashboard({ businesses }: { businesses: BusinessWithRole[] }) {
  const ids = businesses.map((b) => b.id)
  const combined = businesses.length > 1
  const single = combined ? null : businesses[0]
  const [preset, setPreset] = useState<RangePreset>('30d')
  const today = bogotaDayKey(new Date())
  const [customFrom, setCustomFrom] = useState(addDays(today, -13))
  const [customTo, setCustomTo] = useState(today)

  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, products, stock, lots] = await Promise.all([
      loadStatsData(ids),
      Promise.all(ids.map((id) => listProducts(id))).then((all) => all.flat()),
      listVariantStock(ids),
      businesses.some((b) => KIND_LABELS[b.kind].usesLots) ? listLotStock(ids) : Promise.resolve([] as LotStock[]),
    ])
    return { ...stats, products, stock, lots }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])

  const names = Object.fromEntries(businesses.map((b) => [b.id, b.name]))
  const stats = useMemo(() => {
    if (!data) return null
    const earliest = data.orders.find((o) => o.status !== 'cancelado')
    const range = resolveRange(preset, new Date(), { from: customFrom, to: customTo }, earliest ? new Date(earliest.created_at) : null)
    return { range, ...computeDashboardStats(data.orders, data.quotes, range, names) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, preset, customFrom, customTo])

  const alerts = useMemo(() => {
    if (!data) return null
    const openOrders = data.orders.filter((o) => OPEN_STATUSES.includes(o.status)).length
    const lowStock = data.products.filter((p) => p.active).flatMap((p) => p.product_variants)
      .filter((v) => v.active && (data.stock.get(v.id) ?? 0) <= v.low_stock_threshold).length
    const expiring = businesses.reduce((n, b) => n + (KIND_LABELS[b.kind].usesLots
      ? lotsNeedingAttention(data.lots.filter((l) => l.business_id === b.id), b.expiry_warning_days).length : 0), 0)
    return { openOrders, lowStock, expiring }
  }, [data, businesses])

  const base = single ? `/n/${single.id}` : null
  const comparison = COMPARISON_LABELS[preset]
  const kindLabels = single ? KIND_LABELS[single.kind] : null

  return (
    <>
      <PageHeader
        title={combined ? 'Todos mis negocios' : 'Dashboard'}
        subtitle={combined ? businesses.map((b) => b.name).join(' + ') : single?.name}
      />

      {/* Filtro de periodo: una sola fila, afecta todo lo que está debajo. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Periodo" className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={preset === p} onClick={() => setPreset(p)}
              className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${preset === p ? 'bg-brand text-brand-ink font-medium' : 'text-ink-muted hover:text-ink'}`}>
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {preset === 'personalizado' && (
          <div className="flex items-center gap-2 text-sm">
            <Input type="date" aria-label="Desde" className="w-40" value={customFrom} max={customTo} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} />
            <span className="text-ink-muted">a</span>
            <Input type="date" aria-label="Hasta" className="w-40" value={customTo} min={customFrom} onChange={(e) => e.target.value && setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : stats && alerts && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AlertTile icon="🧾" label="Pedidos por entregar" value={formatInt(alerts.openOrders)} tone={alerts.openOrders ? 'warning' : 'good'}
              to={base && `${base}/pedidos?estado=abiertos`} />
            <AlertTile icon="$" label={`Por cobrar · ${formatInt(stats.receivable.orders)} ${stats.receivable.orders === 1 ? 'pedido' : 'pedidos'}`}
              value={formatCOP(stats.receivable.amount)} tone={stats.receivable.amount ? 'bad' : 'good'} to={base && `${base}/pedidos?pago=pendiente`} />
            <AlertTile icon="▼" label="Variantes con pocas existencias" value={formatInt(alerts.lowStock)} tone={alerts.lowStock ? 'warning' : 'good'}
              to={base && `${base}/inventario`} />
            {businesses.some((b) => KIND_LABELS[b.kind].usesLots) && (
              <AlertTile icon="⏳" label="Lotes vencidos o por vencer" value={formatInt(alerts.expiring)} tone={alerts.expiring ? 'bad' : 'good'}
                to={base && `${base}/inventario`} />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiTile label="Ventas" value={formatCOP(stats.kpis.sales)} current={stats.kpis} previous={stats.previous} field="sales" comparison={comparison}
              help="Productos vendidos menos descuentos. No incluye envíos ni pedidos cancelados." />
            <KpiTile label="Pedidos" value={formatInt(stats.kpis.orders)} current={stats.kpis} previous={stats.previous} field="orders" comparison={comparison} />
            <KpiTile label="Ticket promedio" value={formatCOP(stats.kpis.averageTicket)} current={stats.kpis} previous={stats.previous} field="averageTicket" comparison={comparison}
              help="Cuánto compra en promedio cada pedido." />
            <KpiTile label="Ganancia estimada" value={formatCOP(stats.kpis.profit)} current={stats.kpis} previous={stats.previous} field="profit" comparison={comparison}
              help="Ventas menos el costo registrado de cada producto."
              extra={stats.kpis.margin !== null ? `Margen ${formatPercent(stats.kpis.margin)}` : undefined} />
            <KpiTile label="Unidades vendidas" value={formatInt(stats.kpis.units)} current={stats.kpis} previous={stats.previous} field="units" comparison={comparison} />
          </div>

          <Card title="Ventas en el tiempo">
            <SalesOverTime series={stats.series} granularity={stats.range.granularity} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {combined && <Card title="Ventas por negocio"><BarList items={stats.byBusiness} /></Card>}
            <Card title="Ventas por canal"><BarList items={stats.byChannel} /></Card>
            <Card title="Productos más vendidos" actions={<span className="text-xs text-ink-faint">por ventas</span>}><BarList items={stats.topProducts} /></Card>
            {kindLabels && single?.kind === 'perecedero' && <>
              <Card title={`Ventas por ${kindLabels.product.toLowerCase()}`}><BarList items={stats.byProduct} /></Card>
              <Card title={`Unidades por ${kindLabels.option1.toLowerCase()}`}><BarList items={stats.byOption1} metric="units" /></Card>
            </>}
            {kindLabels && single?.kind === 'ropa' && <>
              <Card title="Unidades por talla"><BarList items={stats.byOption1} metric="units" /></Card>
              <Card title="Unidades por color"><BarList items={stats.byOption2} metric="units" /></Card>
            </>}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Clientes">
              <div className="grid grid-cols-3 divide-x divide-border">
                <Stat label="Nuevos" value={formatInt(stats.customers.newCustomers)} hint="Su primera compra fue en este periodo" />
                <Stat label="Recurrentes" value={formatInt(stats.customers.returning)} hint="Ya habían comprado antes" />
                <Stat label="Ventas sin cliente" value={formatInt(stats.customers.withoutCustomer)} hint="Pedidos sin cliente asociado" />
              </div>
            </Card>
            <Card title="Cotizaciones">
              <div className="grid grid-cols-3 divide-x divide-border">
                <Stat label="Enviadas" value={formatInt(stats.quotes.sent)} hint="Sin contar borradores" />
                <Stat label="Aceptadas" value={formatInt(stats.quotes.accepted)} />
                <Stat label="Conversión" value={stats.quotes.conversion === null ? '—' : formatPercent(stats.quotes.conversion)} hint="Aceptadas ÷ enviadas" />
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

function AlertTile({ icon, label, value, tone, to }: { icon: string; label: string; value: string; tone: 'good' | 'warning' | 'bad'; to: string | null }) {
  const ring = { good: 'text-good-text bg-good-soft', warning: 'text-warning-text bg-warning-soft', bad: 'text-bad-text bg-bad-soft' }[tone]
  const body: ReactNode = (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${ring}`}>{tone === 'good' ? '✓' : icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular leading-tight">{value}</p>
        <p className="truncate text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

function KpiTile({ label, value, current, previous, field, comparison, help, extra }: {
  label: string; value: string; current: Kpis; previous: Kpis | null; field: keyof Kpis; comparison: string; help?: string; extra?: string
}) {
  const change = previous ? relativeChange(current[field] as number, previous[field] as number) : null
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4" title={help}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 min-h-4 text-xs">
        {previous && change !== null && (
          <span className={change > 0 ? 'text-good-text' : change < 0 ? 'text-bad-text' : 'text-ink-muted'}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '='} {formatPercent(Math.abs(change))}{' '}
          </span>
        )}
        {previous && change === null && <span className="text-ink-muted">Sin ventas antes para comparar</span>}
        {previous && change !== null && <span className="text-ink-faint">{comparison}</span>}
        {extra && <span className="text-ink-muted">{previous ? ' · ' : ''}{extra}</span>}
      </p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
