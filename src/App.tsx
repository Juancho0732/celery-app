import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './auth/AuthPages'
import { BusinessLayout, PlainLayout } from './layout/AppShell'
import { isConfigured } from './lib/supabase'
import { Spinner } from './components/ui'
import { BusinessesPage } from './pages/BusinessesPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductEditorPage } from './pages/ProductEditorPage'
import { InventoryPage } from './pages/InventoryPage'
import { CustomersPage } from './pages/CustomersPage'
import { OrdersPage } from './pages/OrdersPage'
import { OrderEditorPage } from './pages/OrderEditorPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { QuotesPage } from './pages/QuotesPage'
import { QuoteEditorPage } from './pages/QuoteEditorPage'
import { QuoteDetailPage } from './pages/QuoteDetailPage'
import { SettingsPage } from './pages/SettingsPage'

// El dashboard trae la librería de gráficas: se carga aparte para que el resto
// de la app abra rápido.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CombinedDashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.CombinedDashboardPage })))

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, recovering } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  // Quien llega del enlace de recuperación debe fijar la nueva contraseña primero.
  if (recovering) return <Navigate to="/restablecer" replace />
  return <>{children}</>
}

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="text-xl font-semibold">Falta conectar la base de datos</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver <code>.env.example</code> y el README).
      </p>
    </div>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/recuperar" element={<ForgotPasswordPage />} />
          <Route path="/restablecer" element={<ResetPasswordPage />} />

          <Route path="/" element={<RequireAuth><BusinessesPage /></RequireAuth>} />
          <Route element={<RequireAuth><PlainLayout /></RequireAuth>}>
            <Route path="/todos" element={<Suspense fallback={<Spinner />}><CombinedDashboardPage /></Suspense>} />
          </Route>
          <Route path="/n/:businessId" element={<RequireAuth><BusinessLayout /></RequireAuth>}>
            <Route index element={<Suspense fallback={<Spinner />}><DashboardPage /></Suspense>} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="pedidos/nuevo" element={<OrderEditorPage />} />
            <Route path="pedidos/:orderId" element={<OrderDetailPage />} />
            <Route path="pedidos/:orderId/editar" element={<OrderEditorPage />} />
            <Route path="cotizaciones" element={<QuotesPage />} />
            <Route path="cotizaciones/nueva" element={<QuoteEditorPage />} />
            <Route path="cotizaciones/:quoteId" element={<QuoteDetailPage />} />
            <Route path="cotizaciones/:quoteId/editar" element={<QuoteEditorPage />} />
            <Route path="productos" element={<ProductsPage />} />
            <Route path="productos/:productId" element={<ProductEditorPage />} />
            <Route path="inventario" element={<InventoryPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="configuracion" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
