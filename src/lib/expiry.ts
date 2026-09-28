import { addDays, bogotaDayKey } from './dateRange'
import type { LotStock } from './types'

export type ExpiryState = 'vencido' | 'por-vencer' | 'ok'

/** Estado de un lote según su fecha de vencimiento y el aviso del negocio. */
export function expiryState(expiresOn: string, warningDays: number, now = new Date()): ExpiryState {
  const today = bogotaDayKey(now)
  if (expiresOn < today) return 'vencido'
  if (expiresOn <= addDays(today, warningDays)) return 'por-vencer'
  return 'ok'
}

/** Días que faltan (negativo si ya venció). */
export function daysUntil(expiresOn: string, now = new Date()): number {
  const today = bogotaDayKey(now)
  const [a, b] = [Date.parse(`${today}T00:00:00Z`), Date.parse(`${expiresOn}T00:00:00Z`)]
  return Math.round((b - a) / 86_400_000)
}

/** Lotes con unidades que ya vencieron o están por vencer, el más urgente primero. */
export function lotsNeedingAttention(lots: LotStock[], warningDays: number, now = new Date()): LotStock[] {
  return lots
    .filter((l) => l.stock > 0 && expiryState(l.expires_on, warningDays, now) !== 'ok')
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
}
