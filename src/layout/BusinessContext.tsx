import { createContext, useContext } from 'react'
import type { BusinessWithRole } from '../lib/types'
import { KIND_LABELS, type KindLabels } from '../lib/businessKind'

export interface BusinessCtx {
  business: BusinessWithRole
  labels: KindLabels
  isAdmin: boolean
}

export const BusinessContext = createContext<BusinessCtx | null>(null)

export function makeBusinessCtx(business: BusinessWithRole): BusinessCtx {
  return { business, labels: KIND_LABELS[business.kind], isAdmin: business.role === 'admin' }
}

export function useBusiness(): BusinessCtx {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness debe usarse dentro de una ruta de negocio')
  return ctx
}
