import {
  addDays, bogotaDayKey, bucketKey, bucketKeys, bucketLabel, inRange, previousRange, resolveRange, startOfBogotaDay,
} from './dateRange'

// 28 sep 2026, 10:30 p. m. en Bogotá = 29 sep 03:30 UTC: el "hoy" debe ser el 28.
const lateNight = new Date('2026-09-29T03:30:00Z')

describe('días en Bogotá', () => {
  it('usa la hora de Bogotá, no la UTC', () => {
    expect(bogotaDayKey(lateNight)).toBe('2026-09-28')
  })

  it('el día empieza a las 5:00 UTC', () => {
    expect(startOfBogotaDay('2026-09-28').toISOString()).toBe('2026-09-28T05:00:00.000Z')
  })

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('resolveRange', () => {
  it('hoy va de medianoche a medianoche en Bogotá, por horas', () => {
    const r = resolveRange('hoy', lateNight)
    expect(r.from?.toISOString()).toBe('2026-09-28T05:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-09-29T05:00:00.000Z')
    expect(r.granularity).toBe('hour')
  })

  it('últimos 7 días incluye hoy y los 6 anteriores', () => {
    const r = resolveRange('7d', lateNight)
    expect(bogotaDayKey(r.from!)).toBe('2026-09-22')
    expect(bucketKeys(r, null)).toHaveLength(7)
  })

  it('últimos 30 días tiene 30 días', () => {
    expect(bucketKeys(resolveRange('30d', lateNight), null)).toHaveLength(30)
  })

  it('personalizado incluye ambos extremos y acepta el orden invertido', () => {
    const r = resolveRange('personalizado', lateNight, { from: '2026-03-15', to: '2026-03-01' })
    expect(bogotaDayKey(r.from!)).toBe('2026-03-01')
    expect(bucketKeys(r, null)).toHaveLength(15)
    expect(r.granularity).toBe('day')
  })

  it('un rango personalizado de un día se muestra por horas y uno largo por meses', () => {
    expect(resolveRange('personalizado', lateNight, { from: '2026-03-01', to: '2026-03-01' }).granularity).toBe('hour')
    expect(resolveRange('personalizado', lateNight, { from: '2026-01-01', to: '2026-06-30' }).granularity).toBe('month')
  })

  it('general agrupa por mes cuando hay más de dos meses de datos', () => {
    const r = resolveRange('general', lateNight, undefined, new Date('2026-01-10T15:00:00Z'))
    expect(r.from).toBeNull()
    expect(r.granularity).toBe('month')
    expect(bucketKeys(r, new Date('2026-01-10T15:00:00Z'))).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ])
  })
})

describe('comparación y grupos', () => {
  it('el periodo anterior tiene la misma duración y termina donde empieza el actual', () => {
    const r = resolveRange('7d', lateNight)
    const prev = previousRange(r)!
    expect(prev.to).toEqual(r.from)
    expect(bogotaDayKey(prev.from!)).toBe('2026-09-15')
    expect(previousRange(resolveRange('general', lateNight))).toBeNull()
  })

  it('inRange excluye el final', () => {
    const r = resolveRange('hoy', lateNight)
    expect(inRange(new Date('2026-09-28T05:00:00Z'), r)).toBe(true)
    expect(inRange(new Date('2026-09-29T05:00:00Z'), r)).toBe(false)
  })

  it('agrupa por hora de Bogotá y rotula en español', () => {
    const key = bucketKey(new Date('2026-09-28T18:10:00Z'), 'hour')
    expect(key).toBe('2026-09-28T13')
    expect(bucketLabel(key, 'hour')).toBe('1 p. m.')
    expect(bucketLabel('2026-09-28', 'day')).toBe('28 sep')
    expect(bucketLabel('2026-09', 'month')).toBe('sep 26')
  })
})

describe('campos de fecha y hora', () => {
  it('ida y vuelta con la hora de Bogotá', async () => {
    const { toBogotaInput, fromBogotaInput } = await import('./dateRange')
    expect(toBogotaInput(new Date('2026-09-29T03:30:00Z'))).toBe('2026-09-28T22:30')
    expect(fromBogotaInput('2026-09-28T22:30').toISOString()).toBe('2026-09-29T03:30:00.000Z')
  })
})
