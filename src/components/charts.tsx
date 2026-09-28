import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, type Granularity } from '../lib/dateRange'
import { formatCOP, formatCOPCompact, formatInt } from '../lib/format'
import type { Breakdown } from '../lib/stats'

/** Ventas en el tiempo: una serie, línea de 2px con un lavado suave debajo. */
export function SalesOverTime({ series, granularity }: {
  series: { key: string; sales: number; orders: number }[]
  granularity: Granularity
}) {
  const [asTable, setAsTable] = useState(false)
  const data = series.map((p) => ({ ...p, label: bucketLabel(p.key, granularity) }))
  const total = series.reduce((s, p) => s + p.sales, 0)

  return (
    <div>
      <div className="flex justify-end px-5 pt-3">
        <button type="button" className="text-xs text-ink-muted hover:text-ink hover:underline" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Ver gráfica' : 'Ver como tabla'}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto px-5 pb-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-faint"><tr><th className="py-1.5 font-medium">Periodo</th><th className="py-1.5 text-right font-medium">Pedidos</th><th className="py-1.5 text-right font-medium">Ventas</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 text-right tabular">{formatInt(p.orders)}</td>
                  <td className="py-1.5 text-right tabular">{formatCOP(p.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : total === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-ink-muted">No hubo ventas en este periodo.</p>
      ) : (
        <div className="h-72 px-2 pb-3" role="img" aria-label={`Ventas en el tiempo: total ${formatCOP(total)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--color-grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--color-axis)' }} tick={{ fill: 'var(--color-ink-faint)', fontSize: 12 }} minTickGap={24} />
              <YAxis tickFormatter={formatCOPCompact} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-ink-faint)', fontSize: 12 }} width={64} />
              <Tooltip
                cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as (typeof data)[number]
                  return (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium">{p.label}</p>
                      <p className="tabular">{formatCOP(p.sales)}</p>
                      <p className="text-xs text-ink-muted">{formatInt(p.orders)} {p.orders === 1 ? 'pedido' : 'pedidos'}</p>
                    </div>
                  )
                }}
              />
              <Area type="monotone" dataKey="sales" stroke="var(--color-series-1)" strokeWidth={2} fill="var(--color-series-1)" fillOpacity={0.1}
                activeDot={{ r: 5, stroke: 'var(--color-surface)', strokeWidth: 2 }} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/**
 * Barras horizontales simples (HTML) para comparar categorías: etiqueta, barra
 * y valor. Una sola tinta: la longitud es lo que se compara.
 */
export function BarList({ items, metric = 'sales', empty = 'Sin ventas en este periodo.', limit = 8 }: {
  items: Breakdown[]
  metric?: 'sales' | 'units'
  empty?: string
  limit?: number
}) {
  const shown = items.slice(0, limit)
  const max = Math.max(...shown.map((i) => i[metric]), 0)
  if (!shown.length || max === 0) return <p className="px-5 py-10 text-center text-sm text-ink-muted">{empty}</p>
  const total = items.reduce((s, i) => s + i[metric], 0)
  return (
    <ul className="flex flex-col gap-3 px-5 py-4">
      {shown.map((i) => (
        <li key={i.key} className="group" title={`${i.label}: ${formatCOP(i.sales)} · ${formatInt(i.units)} und. · ${formatInt(i.orders)} pedidos`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 tabular text-ink-muted">
              {metric === 'sales' ? formatCOP(i.sales) : `${formatInt(i.units)} und.`}
              <span className="ml-2 text-xs text-ink-faint">{total ? Math.round((i[metric] / total) * 100) : 0} %</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div className="h-2 rounded-full bg-series-1 transition-[width] group-hover:opacity-80" style={{ width: `${(i[metric] / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
