import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBusiness } from '../layout/BusinessContext'
import { getProduct, saveProduct, type VariantDraft } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Button, Card, ErrorBox, Field, Input, MoneyInput, PageHeader, Spinner, Textarea, readImageAsDataUrl, useAction } from '../components/ui'

const emptyVariant = (): VariantDraft => ({ option1: '', option2: '', sku: '', price: 0, cost: 0, low_stock_threshold: 5, active: true })

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export function ProductEditorPage() {
  const { productId } = useParams()
  const isNew = productId === 'nuevo'
  const { business, labels } = useBusiness()
  const navigate = useNavigate()
  const loaded = useAsync(() => (isNew ? Promise.resolve(null) : getProduct(productId!)), [productId])

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [active, setActive] = useState(true)
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()])
  const [removed, setRemoved] = useState<string[]>([])
  const [bulk1, setBulk1] = useState('')
  const [bulk2, setBulk2] = useState('')
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    const p = loaded.data
    if (!p) return
    setName(p.name)
    setCategory(p.category ?? '')
    setDescription(p.description ?? '')
    setImageUrl(p.image_url)
    setActive(p.active)
    setVariants(p.product_variants.map((v) => ({
      id: v.id, option1: v.option1 ?? '', option2: v.option2 ?? '', sku: v.sku ?? '',
      price: v.price, cost: v.cost, low_stock_threshold: v.low_stock_threshold, active: v.active,
    })))
  }, [loaded.data])

  if (!isNew && loaded.loading) return <Spinner />
  if (loaded.error) return <ErrorBox error={loaded.error} onRetry={loaded.reload} />

  function update(i: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  }

  function removeRow(i: number) {
    const v = variants[i]
    if (v.id) setRemoved((r) => [...r, v.id!])
    setVariants((vs) => vs.filter((_, j) => j !== i))
  }

  /** Crea todas las combinaciones (p. ej. tallas S, M, L × colores Rosa, Azul). */
  function generate() {
    const ones = splitList(bulk1)
    const twos = labels.option2 ? splitList(bulk2) : []
    if (!ones.length) return
    const base = variants.find((v) => v.price || v.cost) ?? emptyVariant()
    const existing = new Set(variants.map((v) => `${v.option1.toLowerCase()}|${v.option2.toLowerCase()}`))
    const combos = ones.flatMap((a) => (twos.length ? twos.map((b) => [a, b]) : [[a, '']]))
      .filter(([a, b]) => !existing.has(`${a.toLowerCase()}|${b.toLowerCase()}`))
      .map(([a, b]) => ({ ...emptyVariant(), option1: a, option2: b, price: base.price, cost: base.cost, low_stock_threshold: base.low_stock_threshold }))
    setVariants((vs) => [...vs.filter((v) => v.id || v.option1 || v.option2 || v.price || v.cost), ...combos])
    setBulk1('')
    setBulk2('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!variants.length) {
      setError(new Error(`Agrega al menos una ${labels.option1.toLowerCase()}.`))
      return
    }
    const keys = variants.map((v) => `${v.option1.trim().toLowerCase()}|${v.option2.trim().toLowerCase()}`)
    if (new Set(keys).size !== keys.length) {
      setError(new Error('Hay variantes repetidas: cada combinación debe aparecer una sola vez.'))
      return
    }
    const id = await run(() => saveProduct(
      business.id,
      { id: isNew ? undefined : productId, name, category, description, image_url: imageUrl, active },
      variants,
      removed,
    ))
    if (id) navigate('..', { relative: 'path' })
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={isNew ? `Nuevo ${labels.product.toLowerCase()}` : name || labels.product}
        actions={<>
          <Button onClick={() => navigate('..', { relative: 'path' })}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card title="Información" className="self-start">
          <div className="flex flex-col gap-4 p-5">
            <Field label="Nombre">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} placeholder={business.kind === 'perecedero' ? 'Mango' : 'Pijama Luna'} />}</Field>
            <Field label="Categoría" hint="Opcional, para agrupar.">{(id) => <Input id={id} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={business.kind === 'perecedero' ? 'Frutas tropicales' : 'Short'} />}</Field>
            <Field label="Descripción">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
            <Field label="Foto" hint="Se reduce automáticamente.">
              {(id) => (
                <div className="flex items-center gap-3">
                  {imageUrl && <img src={imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                  <input id={id} type="file" accept="image/*" className="text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) await run(async () => setImageUrl(await readImageAsDataUrl(file, 300)))
                    }} />
                  {imageUrl && <Button size="sm" variant="ghost" onClick={() => setImageUrl(null)}>Quitar</Button>}
                </div>
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Activo (aparece al crear pedidos)
            </label>
          </div>
        </Card>

        <Card title={`${labels.option1}${labels.option2 ? ` y ${labels.option2.toLowerCase()}` : ''}`}>
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
            <Field label={`Agregar varias ${labels.option1Plural.toLowerCase()}`} hint="Separadas por coma" className="min-w-40 flex-1">
              {(id) => <Input id={id} value={bulk1} onChange={(e) => setBulk1(e.target.value)} placeholder={business.kind === 'perecedero' ? '250 g, 500 g, 1 kg' : 'S, M, L, XL'} />}
            </Field>
            {labels.option2 && (
              <Field label="Colores" hint="Separados por coma" className="min-w-40 flex-1">
                {(id) => <Input id={id} value={bulk2} onChange={(e) => setBulk2(e.target.value)} placeholder="Rosa, Azul" />}
              </Field>
            )}
            <Button onClick={generate} disabled={!bulk1.trim()}>Generar</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">{labels.option1}</th>
                  {labels.option2 && <th className="px-3 py-2 font-medium">{labels.option2}</th>}
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Costo</th>
                  <th className="px-3 py-2 font-medium" title="Avisar cuando queden estas unidades o menos">Alerta</th>
                  <th className="px-3 py-2 font-medium">Activa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={v.id ?? `new-${i}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2"><Input aria-label={labels.option1} value={v.option1} placeholder={labels.option1Placeholder} onChange={(e) => update(i, { option1: e.target.value })} className="min-w-20" /></td>
                    {labels.option2 && <td className="px-3 py-2"><Input aria-label={labels.option2} value={v.option2} placeholder={labels.option2Placeholder ?? ''} onChange={(e) => update(i, { option2: e.target.value })} className="min-w-20" /></td>}
                    <td className="px-3 py-2"><Input aria-label="SKU" value={v.sku} onChange={(e) => update(i, { sku: e.target.value })} className="min-w-20" /></td>
                    <td className="px-3 py-2 min-w-32"><MoneyInput aria-label="Precio" value={v.price} onChange={(price) => update(i, { price })} /></td>
                    <td className="px-3 py-2 min-w-32"><MoneyInput aria-label="Costo" value={v.cost} onChange={(cost) => update(i, { cost })} /></td>
                    <td className="px-3 py-2"><Input aria-label="Alerta de existencia baja" type="number" min={0} value={v.low_stock_threshold} onChange={(e) => update(i, { low_stock_threshold: Math.max(0, Number(e.target.value)) })} className="w-20 text-right" /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" aria-label="Activa" checked={v.active} onChange={(e) => update(i, { active: e.target.checked })} /></td>
                    <td className="px-3 py-2"><Button size="sm" variant="ghost" aria-label="Quitar variante" onClick={() => removeRow(i)}>✕</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3">
            <Button size="sm" onClick={() => setVariants((vs) => [...vs, emptyVariant()])}>+ Agregar {labels.option1.toLowerCase()}</Button>
            {removed.length > 0 && <p className="mt-2 text-xs text-ink-faint">Las variantes quitadas se desactivan para conservar el historial de ventas.</p>}
          </div>
        </Card>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>
    </form>
  )
}
