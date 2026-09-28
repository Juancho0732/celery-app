import { resolveRange } from './dateRange'
import { computeDashboardStats, orderSales, relativeChange, type StatsOrder } from './stats'

const now = new Date('2026-09-28T20:00:00Z') // 3 p. m. en Bogotá

let seq = 0
function order(partial: Partial<StatsOrder> & { created_at: string }): StatsOrder {
  seq += 1
  return {
    id: `o${seq}`,
    business_id: 'purpal',
    status: 'entregado',
    payment_status: 'pagado',
    channel: 'tienda',
    customer_id: null,
    discount: 0,
    shipping_cost: 0,
    items: [{
      variant_id: 'mango500', description: 'Mango · 500 g', quantity: 2, unit_price: 9000, unit_cost: 4000,
      product_name: 'Mango', option1: '500 g', option2: null,
    }],
    ...partial,
  }
}

describe('orderSales', () => {
  it('resta el descuento pero no suma el envío', () => {
    expect(orderSales(order({ created_at: now.toISOString(), discount: 3000, shipping_cost: 8000 }))).toBe(15000)
  })
})

describe('relativeChange', () => {
  it('calcula el cambio y evita dividir por cero', () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2)
    expect(relativeChange(0, 0)).toBe(0)
    expect(relativeChange(50, 0)).toBeNull()
  })
})

describe('computeDashboardStats', () => {
  const orders: StatsOrder[] = [
    order({ created_at: '2026-09-28T15:00:00Z', customer_id: 'ana', channel: 'whatsapp' }), // hoy
    order({ created_at: '2026-09-27T15:00:00Z', customer_id: 'ana' }), // ayer (primer pedido de Ana)
    order({ created_at: '2026-09-28T16:00:00Z', customer_id: 'luis', payment_status: 'pendiente', shipping_cost: 5000 }),
    order({ created_at: '2026-09-28T17:00:00Z', status: 'cancelado' }),
    order({ created_at: '2026-09-10T15:00:00Z' }),
  ]

  it('solo cuenta pedidos del periodo y no los cancelados', () => {
    const s = computeDashboardStats(orders, [], resolveRange('hoy', now))
    expect(s.kpis.orders).toBe(2)
    expect(s.kpis.sales).toBe(36000)
    expect(s.kpis.profit).toBe(20000)
    expect(s.kpis.averageTicket).toBe(18000)
    expect(s.kpis.margin).toBeCloseTo(20000 / 36000)
  })

  it('compara contra el periodo anterior de la misma duración', () => {
    const s = computeDashboardStats(orders, [], resolveRange('hoy', now))
    expect(s.previous?.orders).toBe(1) // ayer
  })

  it('arma la serie por horas con ceros donde no hubo ventas', () => {
    const s = computeDashboardStats(orders, [], resolveRange('hoy', now))
    expect(s.series).toHaveLength(24)
    expect(s.series.find((p) => p.key === '2026-09-28T10')?.sales).toBe(18000)
    expect(s.series.find((p) => p.key === '2026-09-28T03')?.sales).toBe(0)
  })

  it('separa clientes nuevos de recurrentes con su primer pedido histórico', () => {
    const s = computeDashboardStats(orders, [], resolveRange('hoy', now))
    expect(s.customers).toEqual({ newCustomers: 1, returning: 1, withoutCustomer: 0 })
  })

  it('reparte el descuento entre productos para que cuadren con el total', () => {
    const withDiscount = [order({
      created_at: '2026-09-28T15:00:00Z',
      discount: 5000,
      items: [
        { variant_id: 'a', description: 'Mango · 500 g', quantity: 1, unit_price: 10000, unit_cost: 0, product_name: 'Mango', option1: '500 g', option2: null },
        { variant_id: 'b', description: 'Mora · 1 kg', quantity: 1, unit_price: 30000, unit_cost: 0, product_name: 'Mora', option1: '1 kg', option2: null },
      ],
    })]
    const s = computeDashboardStats(withDiscount, [], resolveRange('hoy', now))
    expect(s.topProducts.reduce((sum, p) => sum + p.sales, 0)).toBe(s.kpis.sales)
    expect(s.byProduct.map((p) => p.label)).toEqual(['Mora', 'Mango'])
    expect(s.byOption1.find((p) => p.label === '1 kg')?.sales).toBe(26250)
  })

  it('agrupa por canal', () => {
    const s = computeDashboardStats(orders, [], resolveRange('7d', now))
    expect(s.byChannel.map((c) => c.label)).toEqual(['Tienda física', 'WhatsApp'])
  })

  it('por cobrar incluye envío, cualquier fecha, y excluye cancelados', () => {
    const s = computeDashboardStats(orders, [], resolveRange('hoy', now))
    expect(s.receivable).toEqual({ amount: 23000, orders: 1 })
  })

  it('conversión de cotizaciones ignora borradores', () => {
    const s = computeDashboardStats([], [
      { business_id: 'purpal', created_at: '2026-09-28T15:00:00Z', status: 'aceptada' },
      { business_id: 'purpal', created_at: '2026-09-28T15:00:00Z', status: 'enviada' },
      { business_id: 'purpal', created_at: '2026-09-28T15:00:00Z', status: 'borrador' },
    ], resolveRange('hoy', now))
    expect(s.quotes).toEqual({ sent: 2, accepted: 1, conversion: 0.5 })
  })

  it('en la vista combinada separa ventas por negocio y marca los productos', () => {
    const mixed = [
      order({ created_at: '2026-09-28T15:00:00Z' }),
      order({
        created_at: '2026-09-28T15:00:00Z', business_id: 'libelle',
        items: [{ variant_id: 'luna', description: 'Pijama Luna · M / Rosa', quantity: 1, unit_price: 85000, unit_cost: 40000, product_name: 'Pijama Luna', option1: 'M', option2: 'Rosa' }],
      }),
    ]
    const s = computeDashboardStats(mixed, [], resolveRange('hoy', now), { purpal: 'Purpal', libelle: 'Libelle' })
    expect(s.byBusiness.map((b) => [b.label, b.sales])).toEqual([['Libelle', 85000], ['Purpal', 18000]])
    expect(s.topProducts[0].label).toBe('Pijama Luna · M / Rosa (Libelle)')
  })
})
