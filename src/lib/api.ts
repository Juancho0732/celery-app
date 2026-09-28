// Acceso a datos. Todas las consultas pasan por RLS: aunque aquí se filtre por
// business_id, quien de verdad impide ver otros negocios es la base de datos.

import { supabase } from './supabase'
import { unwrap } from './errors'
import type {
  Business, BusinessKind, BusinessWithRole, Customer, Invite, LotStock, Member, MemberRole, Movement,
  MovementType, Order, OrderStatus, OrderWithItems, ProductWithVariants, Quote, QuoteStatus, QuoteWithItems, Variant,
} from './types'
import type { StatsOrder, StatsQuote } from './stats'

/** PostgREST devuelve máximo 1000 filas por consulta: se pide por páginas. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const page = 1000
  const rows: T[] = []
  for (let from = 0; ; from += page) {
    const chunk = unwrap(await build(from, from + page - 1)) ?? []
    rows.push(...chunk)
    if (chunk.length < page) return rows
  }
}

// ── Negocios y miembros ──

export async function listMyBusinesses(userId: string): Promise<BusinessWithRole[]> {
  const rows = unwrap(await supabase
    .from('business_members')
    .select('role, business:businesses(*)')
    .eq('user_id', userId)) as unknown as { role: MemberRole; business: Business }[]
  return rows
    .filter((r) => r.business)
    .map((r) => ({ ...r.business, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function createBusiness(name: string, kind: BusinessKind): Promise<Business> {
  return unwrap(await supabase.rpc('create_business', { p_name: name, p_kind: kind })) as Business
}

export async function updateBusiness(id: string, patch: Partial<Business>): Promise<void> {
  unwrap(await supabase.from('businesses').update(patch).eq('id', id).select('id').single())
}

export async function isAppAdmin(): Promise<boolean> {
  return unwrap(await supabase.rpc('is_app_admin')) as boolean
}

export async function claimInvites(): Promise<number> {
  return unwrap(await supabase.rpc('claim_invites')) as number
}

export async function listMembers(businessId: string): Promise<Member[]> {
  return unwrap(await supabase
    .from('business_members')
    .select('*, profile:profiles(email, full_name)')
    .eq('business_id', businessId)
    .order('created_at')) as unknown as Member[]
}

export async function listInvites(businessId: string): Promise<Invite[]> {
  return unwrap(await supabase.from('business_invites').select('*').eq('business_id', businessId).order('created_at')) as Invite[]
}

export async function inviteMember(businessId: string, email: string, role: MemberRole): Promise<'added' | 'invited'> {
  return unwrap(await supabase.rpc('invite_member', { p_business: businessId, p_email: email, p_role: role })) as 'added' | 'invited'
}

export async function cancelInvite(businessId: string, email: string): Promise<void> {
  unwrap(await supabase.rpc('cancel_invite', { p_business: businessId, p_email: email }))
}

export async function removeMember(businessId: string, userId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_member', { p_business: businessId, p_user: userId }))
}

export async function setMemberRole(businessId: string, userId: string, role: MemberRole): Promise<void> {
  unwrap(await supabase.rpc('set_member_role', { p_business: businessId, p_user: userId, p_role: role }))
}

// ── Catálogo ──

export async function listProducts(businessId: string): Promise<ProductWithVariants[]> {
  const rows = await fetchAll((from, to) => supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('business_id', businessId)
    .order('name')
    .range(from, to)) as ProductWithVariants[]
  for (const p of rows) {
    p.product_variants.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  }
  return rows
}

export async function getProduct(id: string): Promise<ProductWithVariants> {
  return unwrap(await supabase.from('products').select('*, product_variants(*)').eq('id', id).single()) as ProductWithVariants
}

export interface VariantDraft {
  id?: string
  option1: string
  option2: string
  sku: string
  price: number
  cost: number
  low_stock_threshold: number
  active: boolean
}

/**
 * Guarda un producto y sus variantes. Las variantes que se quitan del
 * formulario se desactivan (no se borran) para no romper el historial de
 * pedidos y movimientos que las usan.
 */
export async function saveProduct(
  businessId: string,
  product: { id?: string; name: string; category: string; description: string; image_url: string | null; active: boolean },
  variants: VariantDraft[],
  removedVariantIds: string[],
): Promise<string> {
  const fields = {
    business_id: businessId,
    name: product.name.trim(),
    category: product.category.trim() || null,
    description: product.description.trim() || null,
    image_url: product.image_url,
    active: product.active,
  }
  const saved = product.id
    ? unwrap(await supabase.from('products').update(fields).eq('id', product.id).select('id').single())
    : unwrap(await supabase.from('products').insert(fields).select('id').single())
  const productId = (saved as unknown as { id: string }).id

  for (const v of variants) {
    const row = {
      business_id: businessId,
      product_id: productId,
      option1: v.option1.trim() || null,
      option2: v.option2.trim() || null,
      sku: v.sku.trim() || null,
      price: v.price,
      cost: v.cost,
      low_stock_threshold: v.low_stock_threshold,
      active: v.active,
    }
    if (v.id) unwrap(await supabase.from('product_variants').update(row).eq('id', v.id).select('id').single())
    else unwrap(await supabase.from('product_variants').insert(row).select('id').single())
  }
  if (removedVariantIds.length) {
    unwrap(await supabase.from('product_variants').update({ active: false }).in('id', removedVariantIds).select('id'))
  }
  return productId
}

// ── Inventario ──

export async function listVariantStock(businessIds: string[]): Promise<Map<string, number>> {
  const rows = await fetchAll((from, to) => supabase
    .from('variant_stock').select('variant_id, stock').in('business_id', businessIds).range(from, to)) as { variant_id: string; stock: number }[]
  return new Map(rows.map((r) => [r.variant_id, r.stock]))
}

export async function listLotStock(businessIds: string[]): Promise<LotStock[]> {
  return await fetchAll((from, to) => supabase
    .from('lot_stock').select('*').in('business_id', businessIds).order('expires_on').range(from, to)) as LotStock[]
}

export interface MovementRow extends Movement {
  variant: { option1: string | null; option2: string | null; product: { name: string } | null } | null
  lot: { code: string | null; expires_on: string } | null
  order: { number: number } | null
}

export async function listMovements(businessId: string, limit = 200): Promise<MovementRow[]> {
  return unwrap(await supabase
    .from('inventory_movements')
    .select('*, variant:product_variants(option1, option2, product:products(name)), lot:lots(code, expires_on), order:orders(number)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)) as unknown as MovementRow[]
}

export async function addMovement(m: {
  business_id: string; variant_id: string; lot_id?: string | null; quantity: number; type: MovementType; note?: string
}): Promise<void> {
  // created_by lo pone la base de datos (default auth.uid()).
  unwrap(await supabase.from('inventory_movements').insert(m).select('id').single())
}

/** Entrada de producción de un perecedero: crea el lote y le suma las unidades. */
export async function addLotEntry(e: {
  business_id: string; variant_id: string; quantity: number; code: string; produced_on: string | null; expires_on: string; note?: string
}): Promise<void> {
  const lot = unwrap(await supabase.from('lots').insert({
    business_id: e.business_id,
    variant_id: e.variant_id,
    code: e.code.trim() || null,
    produced_on: e.produced_on || null,
    expires_on: e.expires_on,
  }).select('id').single()) as { id: string }
  await addMovement({
    business_id: e.business_id, variant_id: e.variant_id, lot_id: lot.id, quantity: e.quantity, type: 'entrada', note: e.note,
  })
}

// ── Clientes ──

export async function listCustomers(businessId: string): Promise<Customer[]> {
  return await fetchAll((from, to) => supabase
    .from('customers').select('*').eq('business_id', businessId).order('name').range(from, to)) as Customer[]
}

export async function saveCustomer(businessId: string, c: Partial<Customer> & { name: string }): Promise<Customer> {
  const fields = {
    business_id: businessId,
    name: c.name.trim(),
    phone: c.phone?.trim() || null,
    email: c.email?.trim() || null,
    document: c.document?.trim() || null,
    address: c.address?.trim() || null,
    city: c.city?.trim() || null,
    notes: c.notes?.trim() || null,
  }
  return (c.id
    ? unwrap(await supabase.from('customers').update(fields).eq('id', c.id).select('*').single())
    : unwrap(await supabase.from('customers').insert(fields).select('*').single())) as Customer
}

export async function deleteCustomer(id: string): Promise<void> {
  unwrap(await supabase.from('customers').delete().eq('id', id).select('id'))
}

// ── Pedidos ──

const ORDER_SELECT = '*, order_items(*), customer:customers(id, name, phone)'

export async function listOrders(businessId: string): Promise<OrderWithItems[]> {
  return await fetchAll((from, to) => supabase
    .from('orders').select(ORDER_SELECT).eq('business_id', businessId)
    .order('created_at', { ascending: false }).range(from, to)) as OrderWithItems[]
}

export async function getOrder(id: string): Promise<OrderWithItems> {
  return unwrap(await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single()) as OrderWithItems
}

export interface OrderDraft {
  id?: string
  business_id: string
  customer_id: string | null
  channel: string
  status: OrderStatus
  payment_method: string | null
  payment_status: string
  discount: number
  shipping_cost: number
  carrier: string
  tracking_number: string
  notes: string
  created_at?: string
}

export async function saveOrder(order: OrderDraft, items: { variant_id: string; quantity: number; unit_price: number }[]): Promise<Order> {
  return unwrap(await supabase.rpc('save_order', { p_order: order, p_items: items })) as Order
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  return unwrap(await supabase.rpc('set_order_status', { p_order: id, p_status: status })) as Order
}

/** Datos que se pueden cambiar aunque el pedido ya esté entregado. */
export async function updateOrderTracking(id: string, patch: {
  payment_status?: string; payment_method?: string | null; carrier?: string | null; tracking_number?: string | null; notes?: string | null
}): Promise<void> {
  unwrap(await supabase.from('orders').update(patch).eq('id', id).select('id').single())
}

export async function deleteOrder(id: string): Promise<void> {
  const rows = unwrap(await supabase.from('orders').delete().eq('id', id).select('id')) as unknown[]
  if (!rows.length) throw new Error('Un pedido entregado no se puede eliminar; cancélalo.')
}

// ── Cotizaciones ──

const QUOTE_SELECT = '*, quote_items(*), customer:customers(*)'

export async function listQuotes(businessId: string): Promise<QuoteWithItems[]> {
  return await fetchAll((from, to) => supabase
    .from('quotes').select(QUOTE_SELECT).eq('business_id', businessId)
    .order('created_at', { ascending: false }).range(from, to)) as QuoteWithItems[]
}

export async function getQuote(id: string): Promise<QuoteWithItems> {
  return unwrap(await supabase.from('quotes').select(QUOTE_SELECT).eq('id', id).single()) as QuoteWithItems
}

export async function saveQuote(quote: {
  id?: string; business_id: string; customer_id: string | null; status: QuoteStatus; valid_until: string | null;
  discount: number; shipping_cost: number; notes: string
}, items: { variant_id: string; quantity: number; unit_price: number }[]): Promise<Quote> {
  return unwrap(await supabase.rpc('save_quote', { p_quote: quote, p_items: items })) as Quote
}

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
  unwrap(await supabase.from('quotes').update({ status }).eq('id', id).select('id').single())
}

export async function convertQuote(id: string): Promise<Order> {
  return unwrap(await supabase.rpc('convert_quote_to_order', { p_quote: id })) as Order
}

export async function deleteQuote(id: string): Promise<void> {
  unwrap(await supabase.from('quotes').delete().eq('id', id).select('id'))
}

// ── Dashboard ──

interface RawStatsOrder extends Omit<StatsOrder, 'items'> {
  order_items: {
    variant_id: string; description: string; quantity: number; unit_price: number; unit_cost: number
    variant: { option1: string | null; option2: string | null; product: { name: string } | null } | null
  }[]
}

export async function loadStatsData(businessIds: string[]): Promise<{ orders: StatsOrder[]; quotes: StatsQuote[] }> {
  const [rawOrders, quotes] = await Promise.all([
    fetchAll((from, to) => supabase
      .from('orders')
      .select('id, business_id, created_at, status, payment_status, channel, customer_id, discount, shipping_cost, ' +
        'order_items(variant_id, description, quantity, unit_price, unit_cost, variant:product_variants(option1, option2, product:products(name)))')
      .in('business_id', businessIds)
      .order('created_at')
      .range(from, to)) as unknown as Promise<RawStatsOrder[]>,
    fetchAll((from, to) => supabase
      .from('quotes').select('business_id, created_at, status').in('business_id', businessIds).range(from, to)) as Promise<StatsQuote[]>,
  ])
  const orders = rawOrders.map(({ order_items, ...o }) => ({
    ...o,
    items: order_items.map(({ variant, ...i }) => ({
      ...i,
      product_name: variant?.product?.name ?? null,
      option1: variant?.option1 ?? null,
      option2: variant?.option2 ?? null,
    })),
  }))
  return { orders, quotes }
}

export type { Variant }
