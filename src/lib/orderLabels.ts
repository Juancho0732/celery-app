import type { Tone } from '../components/ui'
import type { OrderStatus, PaymentMethod, QuoteStatus } from './types'

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; icon: string }> = {
  nuevo: { label: 'Nuevo', tone: 'brand', icon: '●' },
  preparando: { label: 'Preparando', tone: 'warning', icon: '◐' },
  enviado: { label: 'Enviado', tone: 'warning', icon: '➜' },
  listo: { label: 'Listo para recoger', tone: 'warning', icon: '◉' },
  entregado: { label: 'Entregado', tone: 'good', icon: '✓' },
  cancelado: { label: 'Cancelado', tone: 'neutral', icon: '✕' },
}

/** Estados en los que el pedido todavía está en curso. */
export const OPEN_STATUSES: OrderStatus[] = ['nuevo', 'preparando', 'enviado', 'listo']

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  enviada: { label: 'Enviada', tone: 'brand' },
  aceptada: { label: 'Aceptada', tone: 'good' },
  rechazada: { label: 'Rechazada', tone: 'bad' },
}
