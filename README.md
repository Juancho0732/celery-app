# Celery App

Inventario, pedidos, cotizaciones y estadísticas para varios negocios con un
solo inicio de sesión. Cada negocio está completamente aislado: un socio solo
ve los negocios a los que fue invitado.

Negocios iniciales:

- **Purpal** — pulpas de fruta (tipo *perecedero*): cada entrada de producción
  es un lote con fecha de vencimiento y las ventas descuentan primero lo que
  vence primero (FEFO).
- **Libelle** — pijamas (tipo *ropa*): variantes por talla y color.

## Módulos

| Módulo | Qué hace |
|---|---|
| Dashboard | Ventas, pedidos, ticket promedio, ganancia estimada y unidades; filtros Hoy / 7 días / 30 días / General / Personalizado con comparación contra el periodo anterior; ventas por canal, productos, sabor/presentación o talla/color; clientes nuevos vs. recurrentes; conversión de cotizaciones; alertas. Vista combinada de todos tus negocios. |
| Pedidos | Canal (tienda, WhatsApp, Instagram…), estado, pago, envío y guía. Al marcar *entregado* se descuenta el inventario; al cancelar se devuelve. |
| Cotizaciones | PDF con logo y datos del negocio; se convierten en pedido con un clic. |
| Productos | Productos con variantes, precio y costo. |
| Inventario | Entradas, ajustes, lotes y vencimientos, historial inmutable. |
| Clientes | Datos de contacto e historial de compras. |
| Configuración | Datos del negocio, logo, socios e invitaciones. Solo el administrador de la app crea negocios. |

## Arquitectura

- **Frontend:** React + Vite + TypeScript + Tailwind, publicado en GitHub Pages.
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + autenticación).
  Todo el esquema está en `supabase/migrations/`.
- **Seguridad:** políticas RLS en cada tabla. La base de datos, no la interfaz,
  impide que un usuario lea o escriba datos de un negocio del que no es socio.
  El inventario solo cambia por movimientos registrados (no se editan ni borran).

## Puesta en marcha (producción)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. Aplica el esquema: en el panel, **SQL Editor** → pega el contenido de cada
   archivo de `supabase/migrations/`, **en orden** (primero
   `20260928000000_init.sql`, luego `20260929000000_app_admins.sql`) → **Run**.
   (O con la CLI: `npx supabase link --project-ref TU_REF && npx supabase db push`.)
3. **Authentication → Sign In / Providers → Email:** deja activado
   *Confirm email*. Es importante: las invitaciones a socios solo se aceptan
   con el correo confirmado.
4. **Authentication → URL Configuration:**
   - Site URL: `https://juancho0732.github.io/celery-app/`
   - Redirect URLs: `https://juancho0732.github.io/celery-app/**`
5. En GitHub, **Settings → Secrets and variables → Actions → Variables**, crea:
   - `VITE_SUPABASE_URL` = Project URL (Project Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = publishable (anon) key
6. **Settings → Pages → Source:** GitHub Actions. Cada push a `main` despliega.
7. Entra a la app publicada y **regístrate** con tu correo. Luego, en el
   **SQL Editor** de Supabase, conviértete en administrador de la app (solo
   los administradores pueden crear negocios; los socios no):

   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```

   Recarga la app: ya verás el botón **Crear negocio**.

## Desarrollo local

Requiere Node 22 y Docker.

```bash
npm install
npx supabase start          # Supabase local (API en :54321, base en :54322)
cp .env.example .env.local  # y pon la URL/llave que imprime `supabase start`
npm run dev                 # http://localhost:5173/celery-app/
```

Pruebas:

```bash
npm test          # utilidades (fechas en hora de Bogotá, estadísticas, vencimientos)
npm run test:db   # RLS, invitaciones, FEFO y pedidos contra el Supabase local
npm run lint
npm run build
```

## Pendiente para próximas versiones

- Importar el Excel histórico de Purpal.
- Materia prima (fruta) y recetas de producción de Purpal.
- Diseño para iPad y celular.
- IVA y facturación electrónica.
