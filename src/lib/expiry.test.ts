import { daysUntil, expiryState, lotsNeedingAttention } from './expiry'
import type { LotStock } from './types'

const now = new Date('2026-09-29T03:00:00Z') // 28 sep, 10 p. m. en Bogotá

const lot = (expires_on: string, stock: number): LotStock => ({
  business_id: 'b', lot_id: expires_on, variant_id: 'v', code: null, produced_on: null, expires_on, stock,
})

describe('vencimientos', () => {
  it('clasifica según el día en Bogotá', () => {
    expect(expiryState('2026-09-27', 7, now)).toBe('vencido')
    expect(expiryState('2026-09-28', 7, now)).toBe('por-vencer')
    expect(expiryState('2026-10-05', 7, now)).toBe('por-vencer')
    expect(expiryState('2026-10-06', 7, now)).toBe('ok')
  })

  it('cuenta los días que faltan', () => {
    expect(daysUntil('2026-10-01', now)).toBe(3)
    expect(daysUntil('2026-09-26', now)).toBe(-2)
  })

  it('solo alerta lotes con unidades, ordenados por urgencia', () => {
    const result = lotsNeedingAttention([lot('2026-10-03', 5), lot('2026-09-20', 2), lot('2026-09-30', 0), lot('2026-12-01', 9)], 7, now)
    expect(result.map((l) => l.expires_on)).toEqual(['2026-09-20', '2026-10-03'])
  })
})
