// Tipos de las filas de la base de datos (ver supabase/migrations).
// Los montos son pesos colombianos enteros (bigint en la base).

export type BusinessKind = 'perecedero' | 'ropa'
export type MemberRole = 'admin' | 'socio'
export type MovementType = 'entrada' | 'venta' | 'ajuste' | 'devolucion'
export type OrderStatus = 'nuevo' | 'preparando' | 'enviado' | 'listo' | 'entregado' | 'cancelado'
export type PaymentStatus = 'pendiente' | 'pagado'
export type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada'
export type Channel = 'tienda' | 'whatsapp' | 'instagram' | 'web' | 'otro'
export type PaymentMethod = 'efectivo' | 'transferencia' | 'nequi' | 'daviplata' | 'tarjeta' | 'otro'

export interface Business {
  id: string
  name: string
  kind: BusinessKind
  legal_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  instagram: string | null
  logo_url: string | null
  expiry_warning_days: number
  quote_validity_days: number
  quote_terms: string | null
  created_at: string
}

export interface BusinessWithRole extends Business {
  role: MemberRole
}

export interface Member {
  business_id: string
  user_id: string
  role: MemberRole
  created_at: string
  profile: { email: string; full_name: string | null } | null
}

export interface Invite {
  business_id: string
  email: string
  role: MemberRole
  created_at: string
}

export interface Product {
  id: string
  business_id: string
  name: string
  category: string | null
  description: string | null
  image_url: string | null
  active: boolean
  created_at: string
}

export interface Variant {
  id: string
  business_id: string
  product_id: string
  option1: string | null
  option2: string | null
  sku: string | null
  price: number
  cost: number
  low_stock_threshold: number
  active: boolean
  created_at: string
}

export interface ProductWithVariants extends Product {
  product_variants: Variant[]
}

export interface LotStock {
  business_id: string
  lot_id: string
  variant_id: string
  code: string | null
  produced_on: string | null
  expires_on: string
  stock: number
}

export interface Movement {
  id: string
  business_id: string
  variant_id: string
  lot_id: string | null
  quantity: number
  type: MovementType
  note: string | null
  order_id: string | null
  created_by: string | null
  created_at: string
}

export interface Customer {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  address: string | null
  city: string | null
  notes: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  business_id: string
  order_id: string
  variant_id: string
  description: string
  quantity: number
  unit_price: number
  unit_cost: number
}

export interface Order {
  id: string
  business_id: string
  number: number
  customer_id: string | null
  channel: Channel
  status: OrderStatus
  payment_method: PaymentMethod | null
  payment_status: PaymentStatus
  discount: number
  shipping_cost: number
  carrier: string | null
  tracking_number: string | null
  notes: string | null
  quote_id: string | null
  stock_applied: boolean
  delivered_at: string | null
  created_at: string
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
  customer: Pick<Customer, 'id' | 'name' | 'phone'> | null
}

export interface QuoteItem {
  id: string
  business_id: string
  quote_id: string
  variant_id: string
  description: string
  quantity: number
  unit_price: number
}

export interface Quote {
  id: string
  business_id: string
  number: number
  customer_id: string | null
  status: QuoteStatus
  valid_until: string | null
  discount: number
  shipping_cost: number
  notes: string | null
  order_id: string | null
  created_at: string
}

export interface QuoteWithItems extends Quote {
  quote_items: QuoteItem[]
  customer: Customer | null
}
