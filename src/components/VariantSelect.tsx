import type { ProductWithVariants } from '../lib/types'
import { variantLabel } from '../lib/businessKind'
import { formatCOP } from '../lib/format'
import { Select } from './ui'

/** Lista desplegable de variantes agrupadas por producto (solo las activas). */
export function VariantSelect({ id, products, value, onChange, stock, showPrice, placeholder = 'Elige un producto…' }: {
  id?: string
  products: ProductWithVariants[]
  value: string
  onChange: (variantId: string) => void
  stock?: Map<string, number>
  showPrice?: boolean
  placeholder?: string
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {products.filter((p) => p.active || p.product_variants.some((v) => v.id === value)).map((p) => (
        <optgroup key={p.id} label={p.name}>
          {p.product_variants.filter((v) => v.active || v.id === value).map((v) => (
            <option key={v.id} value={v.id}>
              {p.name} · {variantLabel(v)}
              {showPrice ? ` — ${formatCOP(v.price)}` : ''}
              {stock ? ` (${stock.get(v.id) ?? 0} disp.)` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

export function findVariant(products: ProductWithVariants[], variantId: string) {
  for (const p of products) {
    const v = p.product_variants.find((x) => x.id === variantId)
    if (v) return { product: p, variant: v }
  }
  return null
}
