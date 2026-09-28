// Formato para Colombia: pesos sin decimales y fechas en la hora de Bogotá.

export const TIME_ZONE = 'America/Bogota'

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const int = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 })

/** $ 1.250.000 */
export function formatCOP(value: number): string {
  // Intl pone un espacio duro entre "$" y el número; se normaliza para que
  // las pruebas y el PDF no dependan del carácter exacto.
  return cop.format(Math.round(value)).replace(/ /g, ' ')
}

/** $1,2 M — para ejes de gráficas. */
export function formatCOPCompact(value: number): string {
  return `$${compact.format(value).replace(/ /g, ' ')}`
}

export function formatInt(value: number): string {
  return int.format(value)
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')} %`
}

const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
})

/** 5 mar 2026 — para timestamps (se convierten a la hora de Bogotá). */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

/** Para columnas `date` (YYYY-MM-DD) que no llevan hora: no se convierten de zona. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/** Convierte lo que se escribe en un campo de dinero ("1.250.000", "$ 9000") a entero. */
export function parseMoney(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}
