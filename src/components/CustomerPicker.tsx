import { useState } from 'react'
import type { Customer } from '../lib/types'
import { CustomerModal } from '../pages/CustomersPage'
import { Button, Select } from './ui'

/** Selector de cliente con opción de crear uno nuevo sin salir del formulario. */
export function CustomerPicker({ id, customers, value, onChange, onCreated }: {
  id?: string
  customers: Customer[]
  value: string
  onChange: (customerId: string) => void
  onCreated: (c: Customer) => void
}) {
  const [creating, setCreating] = useState<Partial<Customer> | null>(null)
  return (
    <div className="flex gap-2">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin cliente (venta de mostrador)</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
      </Select>
      <Button onClick={() => setCreating({})}>+ Nuevo</Button>
      <CustomerModal
        customer={creating}
        onClose={() => setCreating(null)}
        onSaved={(c) => { setCreating(null); onCreated(c); onChange(c.id) }}
      />
    </div>
  )
}
