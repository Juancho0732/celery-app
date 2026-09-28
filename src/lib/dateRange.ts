// Periodos del dashboard, siempre en la hora de Bogotá. Colombia no tiene
// horario de verano, así que el desfase UTC−5 es fijo todo el año.

const OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type RangePreset = 'hoy' | '7d' | '30d' | 'general' | 'personalizado'
export type Granularity = 'hour' | 'day' | 'month'

export interface DateRange {
  preset: RangePreset
  /** Inicio incluido. null = desde el primer dato ("general"). */
  from: Date | null
  /** Fin excluido. */
  to: Date
  granularity: Granularity
}

/** 'YYYY-MM-DD' del día en Bogotá al que pertenece un instante. */
export function bogotaDayKey(date: Date): string {
  return new Date(date.getTime() - OFFSET_MS).toISOString().slice(0, 10)
}

/** Instante en que empieza (00:00 en Bogotá) el día indicado. */
export function startOfBogotaDay(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + OFFSET_MS)
}

export function addDays(dayKey: string, days: number): string {
  return bogotaDayKey(new Date(startOfBogotaDay(dayKey).getTime() + days * DAY_MS))
}

function granularityForSpan(from: Date, to: Date): Granularity {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS)
  if (days <= 1) return 'hour'
  if (days <= 62) return 'day'
  return 'month'
}

/**
 * Convierte el filtro elegido en un rango concreto.
 * "Últimos 7 días" incluye hoy y los 6 días anteriores (y así con 30).
 * `earliest` es la fecha del primer pedido, para decidir el detalle de "general".
 */
export function resolveRange(
  preset: RangePreset,
  now: Date,
  custom?: { from: string; to: string },
  earliest?: Date | null,
): DateRange {
  const today = bogotaDayKey(now)
  const tomorrow = startOfBogotaDay(addDays(today, 1))
  switch (preset) {
    case 'hoy':
      return { preset, from: startOfBogotaDay(today), to: tomorrow, granularity: 'hour' }
    case '7d':
      return { preset, from: startOfBogotaDay(addDays(today, -6)), to: tomorrow, granularity: 'day' }
    case '30d':
      return { preset, from: startOfBogotaDay(addDays(today, -29)), to: tomorrow, granularity: 'day' }
    case 'general': {
      const from = earliest ?? null
      return {
        preset,
        from: null,
        to: tomorrow,
        granularity: from ? granularityForSpan(startOfBogotaDay(bogotaDayKey(from)), tomorrow) : 'month',
      }
    }
    case 'personalizado': {
      if (!custom) throw new Error('Falta el rango personalizado')
      const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from]
      const from = startOfBogotaDay(a)
      const to = startOfBogotaDay(addDays(b, 1))
      return { preset, from, to, granularity: granularityForSpan(from, to) }
    }
  }
}

/** El periodo inmediatamente anterior, de la misma duración (para comparar). */
export function previousRange(range: DateRange): DateRange | null {
  if (!range.from) return null
  const span = range.to.getTime() - range.from.getTime()
  return { ...range, from: new Date(range.from.getTime() - span), to: range.from }
}

export function inRange(date: Date, range: Pick<DateRange, 'from' | 'to'>): boolean {
  const t = date.getTime()
  return (!range.from || t >= range.from.getTime()) && t < range.to.getTime()
}

/** Clave del grupo (hora, día o mes, en Bogotá) al que pertenece un instante. */
export function bucketKey(date: Date, granularity: Granularity): string {
  const shifted = new Date(date.getTime() - OFFSET_MS).toISOString()
  if (granularity === 'hour') return shifted.slice(0, 13)
  if (granularity === 'day') return shifted.slice(0, 10)
  return shifted.slice(0, 7)
}

/** Todas las claves del rango, en orden, para que los huecos se vean como cero. */
export function bucketKeys(range: DateRange, earliest: Date | null): string[] {
  const from = range.from ?? (earliest ? startOfBogotaDay(bogotaDayKey(earliest)) : null)
  if (!from) return []
  const keys: string[] = []
  if (range.granularity === 'hour') {
    for (let t = from.getTime(); t < range.to.getTime(); t += 60 * 60 * 1000) keys.push(bucketKey(new Date(t), 'hour'))
  } else if (range.granularity === 'day') {
    for (let day = bogotaDayKey(from); startOfBogotaDay(day) < range.to; day = addDays(day, 1)) keys.push(day)
  } else {
    let [y, m] = bogotaDayKey(from).split('-').map(Number)
    const last = bucketKey(new Date(range.to.getTime() - 1), 'month')
    for (;;) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      keys.push(key)
      if (key >= last) break
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
  }
  return keys
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'hour') {
    const h = Number(key.slice(11, 13))
    const suffix = h < 12 ? 'a. m.' : 'p. m.'
    return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`
  }
  const [y, m, d] = key.split('-').map(Number)
  if (granularity === 'day') return `${d} ${MONTHS[m - 1]}`
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  general: 'General',
  personalizado: 'Personalizado',
}

export const COMPARISON_LABELS: Record<RangePreset, string> = {
  hoy: 'vs. ayer',
  '7d': 'vs. 7 días anteriores',
  '30d': 'vs. 30 días anteriores',
  general: '',
  personalizado: 'vs. periodo anterior',
}

/** Valor para <input type="datetime-local"> con la hora de Bogotá. */
export function toBogotaInput(date: Date): string {
  return new Date(date.getTime() - OFFSET_MS).toISOString().slice(0, 16)
}

/** Interpreta el valor de un <input type="datetime-local"> como hora de Bogotá. */
export function fromBogotaInput(value: string): Date {
  return new Date(`${value}:00-05:00`)
}
