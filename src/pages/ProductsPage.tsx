import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { listProducts, listVariantStock } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatCOP, formatInt } from '../lib/format'
import { variantLabel } from '../lib/businessKind'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Table, Td, Th } from '../components/ui'

export function ProductsPage() {
  const { business, labels } = useBusiness()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([listProducts(business.id), listVariantStock([business.id])]),
    [business.id],
  )
  const [products, stock] = data ?? [[], new Map<string, number>()]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) =>
      (showInactive || p.active) &&
      (!q || p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q) ||
        p.product_variants.some((v) => (v.sku ?? '').toLowerCase().includes(q))))
  }, [products, query, showInactive])

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={`Cada ${labels.product.toLowerCase()} tiene variantes por ${[labels.option1, labels.option2].filter(Boolean).join(' y ').toLowerCase()}, con su propio precio, costo e inventario.`}
        actions={<Link to="nuevo"><Button variant="primary">+ Nuevo {labels.product.toLowerCase()}</Button></Link>}
      />
      <ErrorBox error={error} onRetry={reload} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Input className="max-w-xs" placeholder="Buscar por nombre, categoría o SKU…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar productos" />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
        {loading && !data ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState title={products.length ? 'Nada coincide con la búsqueda' : 'Aún no hay productos'}>
            {products.length ? 'Prueba con otra palabra.' : `Crea tu primer ${labels.product.toLowerCase()} con sus ${labels.option1Plural.toLowerCase()} y precios.`}
          </EmptyState>
        ) : (
          <Table head={<>
            <Th>{labels.product}</Th><Th>{[labels.option1, labels.option2].filter(Boolean).join(' / ')}</Th>
            <Th className="text-right">Precio</Th><Th className="text-right">Costo</Th><Th className="text-right">Margen</Th><Th className="text-right">Existencia</Th>
          </>}>
            {filtered.flatMap((p) => {
              const variants = p.product_variants.filter((v) => showInactive || v.active)
              if (!variants.length) {
                return [(
                  <tr key={p.id}>
                    <Td><Link to={p.id} className="font-medium hover:underline">{p.name}</Link></Td>
                    <Td className="text-ink-faint" >Sin variantes</Td><Td /><Td /><Td /><Td />
                  </tr>
                )]
              }
              return variants.map((v, i) => {
                const qty = stock.get(v.id) ?? 0
                const margin = v.price > 0 ? (v.price - v.cost) / v.price : null
                return (
                  <tr key={v.id} className="hover:bg-surface-muted/60">
                    <Td>
                      {i === 0 && (
                        <div className="flex items-center gap-3">
                          {p.image_url && <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />}
                          <div>
                            <Link to={p.id} className="font-medium hover:underline">{p.name}</Link>
                            <div className="flex gap-1.5">
                              {p.category && <span className="text-xs text-ink-faint">{p.category}</span>}
                              {!p.active && <Badge>Inactivo</Badge>}
                            </div>
                          </div>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {variantLabel(v)}
                      {v.sku && <span className="ml-2 text-xs text-ink-faint">{v.sku}</span>}
                      {!v.active && <span className="ml-2"><Badge>Inactiva</Badge></span>}
                    </Td>
                    <Td className="text-right tabular">{formatCOP(v.price)}</Td>
                    <Td className="text-right tabular text-ink-muted">{formatCOP(v.cost)}</Td>
                    <Td className="text-right tabular text-ink-muted">{margin === null ? '—' : `${Math.round(margin * 100)} %`}</Td>
                    <Td className="text-right tabular">
                      {qty <= 0 ? <Badge tone="bad">⚠ {formatInt(qty)}</Badge>
                        : qty <= v.low_stock_threshold ? <Badge tone="warning">▼ {formatInt(qty)}</Badge>
                        : formatInt(qty)}
                    </Td>
                  </tr>
                )
              })
            })}
          </Table>
        )}
      </Card>
    </>
  )
}
