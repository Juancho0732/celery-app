import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { BusinessContext, makeBusinessCtx } from './BusinessContext'
import { Button, EmptyState, ErrorBox, Spinner } from '../components/ui'
import { Icon, type IconName } from '../components/icons'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '', label: 'Dashboard', icon: 'dashboard' },
  { to: 'pedidos', label: 'Pedidos', icon: 'orders' },
  { to: 'cotizaciones', label: 'Cotizaciones', icon: 'quotes' },
  { to: 'productos', label: 'Productos', icon: 'products' },
  { to: 'inventario', label: 'Inventario', icon: 'inventory' },
  { to: 'clientes', label: 'Clientes', icon: 'customers' },
  { to: 'configuracion', label: 'Configuración', icon: 'settings' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-brand-soft font-medium text-brand-text' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
  }`
}

function Sidebar({ children }: { children?: ReactNode }) {
  const { session, businesses, signOut } = useAuth()
  const { businessId } = useParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <span className="font-semibold tracking-tight">Celery App</span>
      </div>

      <div className="px-3">
        <label htmlFor="business-switch" className="mb-1 block px-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Negocio</label>
        <select
          id="business-switch"
          className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium outline-none focus:border-brand"
          value={businessId ?? (pathname === '/todos' ? 'todos' : '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'todos') navigate('/todos')
            else if (v === 'nuevo') navigate('/?nuevo=1')
            else if (v) navigate(`/n/${v}`)
          }}
        >
          {!businessId && <option value="">Elige un negocio…</option>}
          {businesses.length > 1 && <option value="todos">Todos mis negocios</option>}
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          <option value="nuevo">+ Crear negocio</option>
        </select>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">{children}</nav>

      <div className="border-t border-border px-4 py-3">
        <p className="truncate text-xs text-ink-faint" title={session?.user.email}>{session?.user.email}</p>
        <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={() => void signOut()}>Cerrar sesión</Button>
      </div>
    </aside>
  )
}

/** Marco para las páginas de un negocio: valida el acceso y da el contexto. */
export function BusinessLayout() {
  const { businessId } = useParams()
  const { businesses, businessesLoading, businessesError, reloadBusinesses } = useAuth()
  const business = businesses.find((b) => b.id === businessId)

  let content: ReactNode
  if (business) {
    content = (
      <BusinessContext.Provider value={makeBusinessCtx(business)}>
        <Outlet />
      </BusinessContext.Provider>
    )
  } else if (businessesLoading) {
    content = <Spinner />
  } else if (businessesError) {
    content = <ErrorBox error={businessesError} onRetry={() => void reloadBusinesses()} />
  } else {
    content = <EmptyState title="No tienes acceso a este negocio">Pídele a un administrador del negocio que te invite con tu correo.</EmptyState>
  }

  return (
    <div className="flex min-h-full">
      <Sidebar>
        {business && NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === ''} className={navClass}>
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </Sidebar>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-7xl">{content}</div>
      </main>
    </div>
  )
}

/** Marco para páginas que no son de un negocio (vista combinada). */
export function PlainLayout() {
  const { businesses } = useAuth()
  return (
    <div className="flex min-h-full">
      <Sidebar>
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Ir a</p>
        {businesses.map((b) => (
          <NavLink key={b.id} to={`/n/${b.id}`} className={navClass}>
            <Icon name="store" />
            {b.name}
          </NavLink>
        ))}
      </Sidebar>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-7xl"><Outlet /></div>
      </main>
    </div>
  )
}
