import type { BusinessKind, Variant } from './types'

/** Cómo se llaman las cosas en cada tipo de negocio. */
export interface KindLabels {
  kindName: string
  product: string
  products: string
  option1: string
  option1Plural: string
  option2: string | null
  option1Placeholder: string
  option2Placeholder: string | null
  usesLots: boolean
}

export const KIND_LABELS: Record<BusinessKind, KindLabels> = {
  perecedero: {
    kindName: 'Productos perecederos (lotes y vencimiento)',
    product: 'Sabor',
    products: 'Sabores',
    option1: 'Presentación',
    option1Plural: 'Presentaciones',
    option2: null,
    option1Placeholder: '500 g',
    option2Placeholder: null,
    usesLots: true,
  },
  ropa: {
    kindName: 'Ropa (tallas y colores)',
    product: 'Modelo',
    products: 'Modelos',
    option1: 'Talla',
    option1Plural: 'Tallas',
    option2: 'Color',
    option1Placeholder: 'M',
    option2Placeholder: 'Rosa',
    usesLots: false,
  },
}

export function variantLabel(v: Pick<Variant, 'option1' | 'option2'>): string {
  return [v.option1, v.option2].filter(Boolean).join(' / ') || 'Única'
}
