import type { ProductWithVariants } from '../lib/types'
import { formatCOP } from '../lib/format'
import { findVariant, VariantSelect } from './VariantSelect'
import { Button, Input, MoneyInput } from './ui'

export interface LineDraft {
  key: string
  variant_id: string
  quantity: number
  unit_price: number
}

let seq = 0
export const newLine = (): LineDraft => ({ key: `l${++seq}`, variant_id: '', quantity: 1, unit_price: 0 })

export function linesSubtotal(lines: LineDraft[]): number {
  return lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
}

/** Tabla editable de productos para pedidos y cotizaciones. */
export function LineItemsEditor({ products, stock, lines, onChange }: {
  products: ProductWithVariants[]
  stock?: Map<string, number>
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
}) {
  function update(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="w-24 px-3 py-2 font-medium">Cant.</th>
              <th className="w-40 px-3 py-2 font-medium">Precio unit.</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const available = stock && l.variant_id ? stock.get(l.variant_id) ?? 0 : null
              return (
                <tr key={l.key} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2">
                    <VariantSelect
                      products={products}
                      value={l.variant_id}
                      stock={stock}
                      showPrice
                      onChange={(variant_id) => {
                        const found = findVariant(products, variant_id)
                        update(l.key, { variant_id, unit_price: found?.variant.price ?? 0 })
                      }}
                    />
                    {available !== null && l.quantity > available && (
                      <p className="mt-1 text-xs text-warning-text">⚠ Solo hay {available} disponibles; el inventario quedará en negativo.</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label="Cantidad" type="number" min={1} step={1} className="text-right tabular" value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                  </td>
                  <td className="px-3 py-2"><MoneyInput aria-label="Precio unitario" value={l.unit_price} onChange={(unit_price) => update(l.key, { unit_price })} /></td>
                  <td className="px-3 py-2 pt-4 text-right tabular font-medium">{formatCOP(l.quantity * l.unit_price)}</td>
                  <td className="px-1 py-2">
                    <Button size="sm" variant="ghost" aria-label="Quitar producto" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>✕</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-3">
        <Button size="sm" onClick={() => onChange([...lines, newLine()])}>+ Agregar producto</Button>
      </div>
    </div>
  )
}

export function TotalsBox({ subtotal, discount, shipping }: { subtotal: number; discount: number; shipping: number }) {
  const total = Math.max(0, subtotal - discount) + shipping
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
      <dt className="text-ink-muted">Subtotal</dt><dd className="text-right tabular">{formatCOP(subtotal)}</dd>
      {discount > 0 && <><dt className="text-ink-muted">Descuento</dt><dd className="text-right tabular">−{formatCOP(discount)}</dd></>}
      {shipping > 0 && <><dt className="text-ink-muted">Envío</dt><dd className="text-right tabular">{formatCOP(shipping)}</dd></>}
      <dt className="mt-1 border-t border-border pt-2 font-semibold">Total</dt>
      <dd className="mt-1 border-t border-border pt-2 text-right text-lg font-semibold tabular">{formatCOP(total)}</dd>
    </dl>
  )
}
