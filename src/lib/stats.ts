// Cálculo de las estadísticas del dashboard. Funciones puras sobre los pedidos
// ya cargados, para poder probarlas sin base de datos.
//
// Definiciones (se muestran igual en la interfaz):
// - Ventas: valor de los productos menos el descuento del pedido. No incluye el
//   envío, que se cobra aparte y normalmente se le paga a la transportadora.
// - Ganancia estimada: ventas menos el costo de los productos vendidos (el costo
//   se congela en el momento de la venta).
// - Los pedidos cancelados no cuentan en nada.

import type { Channel, OrderStatus, PaymentStatus, QuoteStatus } from './types'
import { bucketKey, bucketKeys, inRange, previousRange, type DateRange } from './dateRange'

export interface StatsItem {
  variant_id: string
  description: string
  quantity: number
  unit_price: number
  unit_cost: number
  product_name: string | null
  option1: string | null
  option2: string | null
}

export interface StatsOrder {
  id: string
  business_id: string
  created_at: string
  status: OrderStatus
  payment_status: PaymentStatus
  channel: Channel
  customer_id: string | null
  discount: number
  shipping_cost: number
  items: StatsItem[]
}

export interface StatsQuote {
  business_id: string
  created_at: string
  status: QuoteStatus
}

export interface Kpis {
  sales: number
  orders: number
  units: number
  averageTicket: number
  profit: number
  /** Ganancia / ventas (0–1). null si no hubo ventas. */
  margin: number | null
}

export interface Breakdown {
  key: string
  label: string
  sales: number
  units: number
  orders: number
}

export interface DashboardStats {
  kpis: Kpis
  previous: Kpis | null
  series: { key: string; sales: number; orders: number }[]
  byChannel: Breakdown[]
  byBusiness: Breakdown[]
  topProducts: Breakdown[]
  byOption1: Breakdown[]
  byOption2: Breakdown[]
  byProduct: Breakdown[]
  customers: { newCustomers: number; returning: number; withoutCustomer: number }
  quotes: { sent: number; accepted: number; conversion: number | null }
  /** Pedidos no cancelados con pago pendiente (de cualquier fecha). */
  receivable: { amount: number; orders: number }
  earliest: Date | null
}

export function itemsValue(items: Pick<StatsItem, 'quantity' | 'unit_price'>[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
}

type PricedLine = Pick<StatsItem, 'quantity' | 'unit_price'>

export function orderSales(order: { items: PricedLine[]; discount: number }): number {
  return Math.max(0, itemsValue(order.items) - order.discount)
}

export function orderTotal(order: { items: PricedLine[]; discount: number; shipping_cost: number }): number {
  return orderSales(order) + order.shipping_cost
}

function orderCost(order: StatsOrder): number {
  return order.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)
}

export function computeKpis(orders: StatsOrder[]): Kpis {
  let sales = 0
  let cost = 0
  let units = 0
  for (const o of orders) {
    sales += orderSales(o)
    cost += orderCost(o)
    units += o.items.reduce((s, i) => s + i.quantity, 0)
  }
  return {
    sales,
    orders: orders.length,
    units,
    averageTicket: orders.length ? sales / orders.length : 0,
    profit: sales - cost,
    margin: sales > 0 ? (sales - cost) / sales : null,
  }
}

/** Cambio relativo (0,12 = +12 %). null si el periodo anterior fue cero. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / Math.abs(previous)
}

function group(
  orders: StatsOrder[],
  keyOf: (o: StatsOrder, i: StatsItem) => { key: string; label: string } | null,
): Breakdown[] {
  const map = new Map<string, Breakdown & { orderIds: Set<string> }>()
  for (const o of orders) {
    // El descuento del pedido se reparte en proporción al valor de cada producto,
    // para que la suma de los grupos coincida con las ventas totales.
    const gross = itemsValue(o.items)
    const factor = gross > 0 ? orderSales(o) / gross : 0
    for (const i of o.items) {
      const k = keyOf(o, i)
      if (!k) continue
      const entry = map.get(k.key) ?? { key: k.key, label: k.label, sales: 0, units: 0, orders: 0, orderIds: new Set() }
      entry.sales += i.quantity * i.unit_price * factor
      entry.units += i.quantity
      entry.orderIds.add(o.id)
      map.set(k.key, entry)
    }
  }
  return [...map.values()]
    .map(({ orderIds, ...b }) => ({ ...b, sales: Math.round(b.sales), orders: orderIds.size }))
    .sort((a, b) => b.sales - a.sales || b.units - a.units)
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  tienda: 'Tienda física',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  web: 'Página web',
  otro: 'Otro',
}

export function computeDashboardStats(
  allOrders: StatsOrder[],
  quotes: StatsQuote[],
  range: DateRange,
  businessNames: Record<string, string> = {},
): DashboardStats {
  const valid = allOrders.filter((o) => o.status !== 'cancelado')
  const earliest = valid.reduce<Date | null>((min, o) => {
    const d = new Date(o.created_at)
    return !min || d < min ? d : min
  }, null)

  const current = valid.filter((o) => inRange(new Date(o.created_at), range))
  const prevRange = previousRange(range)
  const previous = prevRange ? valid.filter((o) => inRange(new Date(o.created_at), prevRange)) : null

  const seriesMap = new Map(bucketKeys(range, earliest).map((k) => [k, { key: k, sales: 0, orders: 0 }]))
  for (const o of current) {
    const key = bucketKey(new Date(o.created_at), range.granularity)
    const point = seriesMap.get(key) ?? { key, sales: 0, orders: 0 }
    point.sales += orderSales(o)
    point.orders += 1
    seriesMap.set(key, point)
  }
  const series = [...seriesMap.values()].sort((a, b) => a.key.localeCompare(b.key))

  const byChannelMap = new Map<string, Breakdown>()
  for (const o of current) {
    const b = byChannelMap.get(o.channel) ?? { key: o.channel, label: CHANNEL_LABELS[o.channel], sales: 0, units: 0, orders: 0 }
    b.sales += orderSales(o)
    b.units += o.items.reduce((s, i) => s + i.quantity, 0)
    b.orders += 1
    byChannelMap.set(o.channel, b)
  }

  const byBusinessMap = new Map<string, Breakdown>()
  for (const o of current) {
    const b = byBusinessMap.get(o.business_id) ??
      { key: o.business_id, label: businessNames[o.business_id] ?? 'Negocio', sales: 0, units: 0, orders: 0 }
    b.sales += orderSales(o)
    b.units += o.items.reduce((s, i) => s + i.quantity, 0)
    b.orders += 1
    byBusinessMap.set(o.business_id, b)
  }

  const multiBusiness = new Set(allOrders.map((o) => o.business_id)).size > 1
  const topProducts = group(current, (o, i) => ({
    key: `${o.business_id}:${i.variant_id}`,
    label: multiBusiness && businessNames[o.business_id] ? `${i.description} (${businessNames[o.business_id]})` : i.description,
  })).slice(0, 8)

  // Primer pedido de cada cliente (histórico) para separar nuevos de recurrentes.
  const firstOrder = new Map<string, number>()
  for (const o of valid) {
    if (!o.customer_id) continue
    const t = new Date(o.created_at).getTime()
    if (!firstOrder.has(o.customer_id) || t < firstOrder.get(o.customer_id)!) firstOrder.set(o.customer_id, t)
  }
  const customersInRange = new Set(current.filter((o) => o.customer_id).map((o) => o.customer_id!))
  let newCustomers = 0
  for (const c of customersInRange) {
    if (inRange(new Date(firstOrder.get(c)!), range)) newCustomers += 1
  }

  const quotesInRange = quotes.filter((q) => inRange(new Date(q.created_at), range) && q.status !== 'borrador')
  const accepted = quotesInRange.filter((q) => q.status === 'aceptada').length

  const unpaid = valid.filter((o) => o.payment_status === 'pendiente')

  return {
    kpis: computeKpis(current),
    previous: previous ? computeKpis(previous) : null,
    series,
    byChannel: [...byChannelMap.values()].sort((a, b) => b.sales - a.sales),
    byBusiness: [...byBusinessMap.values()].sort((a, b) => b.sales - a.sales),
    topProducts,
    byProduct: group(current, (_o, i) => i.product_name ? { key: i.product_name, label: i.product_name } : null),
    byOption1: group(current, (_o, i) => i.option1 ? { key: i.option1, label: i.option1 } : null),
    byOption2: group(current, (_o, i) => i.option2 ? { key: i.option2, label: i.option2 } : null),
    customers: {
      newCustomers,
      returning: customersInRange.size - newCustomers,
      withoutCustomer: current.filter((o) => !o.customer_id).length,
    },
    quotes: {
      sent: quotesInRange.length,
      accepted,
      conversion: quotesInRange.length ? accepted / quotesInRange.length : null,
    },
    receivable: { amount: unpaid.reduce((s, o) => s + orderTotal(o), 0), orders: unpaid.length },
    earliest,
  }
}
