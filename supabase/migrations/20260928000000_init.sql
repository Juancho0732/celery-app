-- Celery App — esquema inicial.
--
-- Modelo multiempresa: cada fila de negocio lleva business_id y las políticas
-- RLS dejan leer/escribir solo a los miembros de ese negocio. La separación la
-- hace cumplir la base de datos, no la interfaz: aunque el frontend tenga un
-- error, un socio de Libelle no puede leer ni escribir datos de Purpal.
--
-- Las relaciones entre tablas de un negocio usan llaves foráneas compuestas
-- (business_id, id) para que una fila nunca pueda apuntar a una fila de otro
-- negocio (las FK no pasan por RLS, así que sin esto se podría referenciar un
-- id ajeno).

-- ───────────────────────── Tipos ─────────────────────────

-- 'perecedero' activa lotes con fecha de vencimiento y descuento FEFO (Purpal);
-- 'ropa' usa variantes talla × color sin lotes (Libelle).
create type public.business_kind as enum ('perecedero', 'ropa');
create type public.member_role as enum ('admin', 'socio');
create type public.movement_type as enum ('entrada', 'venta', 'ajuste', 'devolucion');
create type public.order_status as enum ('nuevo', 'preparando', 'enviado', 'listo', 'entregado', 'cancelado');
create type public.payment_status as enum ('pendiente', 'pagado');
create type public.quote_status as enum ('borrador', 'enviada', 'aceptada', 'rechazada');

-- ───────────────────────── Negocios y miembros ─────────────────────────

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind public.business_kind not null,
  legal_id text,
  phone text,
  email text,
  address text,
  city text,
  instagram text,
  -- Logo como data URL (PNG/JPG pequeño): evita depender de Storage.
  logo_url text check (logo_url is null or length(logo_url) < 400000),
  expiry_warning_days int not null default 7 check (expiry_warning_days between 0 and 365),
  quote_validity_days int not null default 15 check (quote_validity_days between 1 and 365),
  quote_terms text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'socio',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

-- Invitaciones a correos que aún no tienen cuenta: se convierten en membresía
-- cuando esa persona entra con el correo ya confirmado (claim_invites).
create table public.business_invites (
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role public.member_role not null default 'socio',
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (business_id, email)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

-- Segunda llave hacia profiles para poder traer el correo de cada miembro.
alter table public.business_members
  add constraint business_members_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;

-- ───────────────────────── Catálogo ─────────────────────────

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text,
  description text,
  image_url text check (image_url is null or length(image_url) < 400000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create index on public.products (business_id);

-- Purpal: option1 = presentación (250 g, 500 g, 1 kg); el sabor es el producto.
-- Libelle: option1 = talla, option2 = color; el modelo es el producto.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  option1 text,
  option2 text,
  sku text,
  price bigint not null default 0 check (price >= 0),
  cost bigint not null default 0 check (cost >= 0),
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade
);
create index on public.product_variants (business_id, product_id);

-- ───────────────────────── Inventario ─────────────────────────

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  variant_id uuid not null,
  code text,
  produced_on date,
  expires_on date not null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id) on delete cascade
);
create index on public.lots (business_id, variant_id, expires_on);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  document text,
  address text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create index on public.customers (business_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number int not null,
  customer_id uuid,
  status public.quote_status not null default 'borrador',
  valid_until date,
  discount bigint not null default 0 check (discount >= 0),
  shipping_cost bigint not null default 0 check (shipping_cost >= 0),
  notes text,
  order_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete set null (customer_id)
);
create index on public.quotes (business_id, created_at);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number int not null,
  customer_id uuid,
  channel text not null default 'tienda'
    check (channel in ('tienda', 'whatsapp', 'instagram', 'web', 'otro')),
  status public.order_status not null default 'nuevo',
  payment_method text
    check (payment_method in ('efectivo', 'transferencia', 'nequi', 'daviplata', 'tarjeta', 'otro')),
  payment_status public.payment_status not null default 'pendiente',
  discount bigint not null default 0 check (discount >= 0),
  shipping_cost bigint not null default 0 check (shipping_cost >= 0),
  carrier text,
  tracking_number text,
  notes text,
  quote_id uuid,
  -- true mientras las unidades del pedido estén descontadas del inventario.
  stock_applied boolean not null default false,
  delivered_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete set null (customer_id),
  foreign key (business_id, quote_id) references public.quotes (business_id, id) on delete set null (quote_id)
);
create index on public.orders (business_id, created_at);
create index on public.orders (business_id, status);

alter table public.quotes
  add foreign key (business_id, order_id) references public.orders (business_id, id) on delete set null (order_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  variant_id uuid not null,
  description text not null,
  quantity int not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  unit_cost bigint not null default 0 check (unit_cost >= 0),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references public.product_variants (business_id, id)
);
create index on public.order_items (business_id, order_id);
create index on public.order_items (business_id, variant_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  quote_id uuid not null,
  variant_id uuid not null,
  description text not null,
  quantity int not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  foreign key (business_id, quote_id) references public.quotes (business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references public.product_variants (business_id, id)
);
create index on public.quote_items (business_id, quote_id);

-- Libro de movimientos: el inventario es la suma de estas filas. No se editan
-- ni se borran (no hay políticas de UPDATE/DELETE): una corrección es otro
-- movimiento de tipo 'ajuste', así queda el historial de quién cambió qué.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  variant_id uuid not null,
  lot_id uuid,
  quantity int not null check (quantity <> 0),
  type public.movement_type not null,
  note text,
  order_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id) on delete cascade,
  foreign key (business_id, lot_id) references public.lots (business_id, id) on delete cascade,
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete set null (order_id)
);
create index on public.inventory_movements (business_id, variant_id);
create index on public.inventory_movements (business_id, lot_id);
create index on public.inventory_movements (business_id, created_at);

-- Consecutivos por negocio (pedido #1, #2… y cotización #1, #2…).
create table public.business_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('order', 'quote')),
  last_value int not null default 0,
  primary key (business_id, kind)
);

-- ───────────────────────── Vistas ─────────────────────────

create view public.variant_stock with (security_invoker = true) as
select v.business_id, v.id as variant_id, coalesce(sum(m.quantity), 0)::int as stock
from public.product_variants v
left join public.inventory_movements m on m.business_id = v.business_id and m.variant_id = v.id
group by v.business_id, v.id;

create view public.lot_stock with (security_invoker = true) as
select l.business_id, l.id as lot_id, l.variant_id, l.code, l.produced_on, l.expires_on,
       coalesce(sum(m.quantity), 0)::int as stock
from public.lots l
left join public.inventory_movements m on m.business_id = l.business_id and m.lot_id = l.id
group by l.business_id, l.id;

-- ───────────────────────── Funciones de acceso ─────────────────────────
-- SECURITY DEFINER para que las políticas puedan consultar business_members sin
-- recursión de RLS. Solo responden sobre el usuario autenticado actual.

create function public.is_member(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = auth.uid()
  );
$$;

create function public.is_admin(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = auth.uid() and role = 'admin'
  );
$$;

create function public.shares_business(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- ───────────────────────── RLS ─────────────────────────

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.lots enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.quote_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.business_counters enable row level security;

-- Negocios: los ven sus miembros, solo el admin edita los datos. Se crean con
-- create_business() para que el creador quede como admin en la misma operación.
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

-- Miembros e invitaciones: visibles para los miembros; se modifican solo por
-- las funciones invite_member / remove_member / set_member_role.
create policy members_select on public.business_members for select to authenticated
  using (public.is_member(business_id));
create policy invites_select on public.business_invites for select to authenticated
  using (public.is_admin(business_id));

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_business(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Datos operativos: cualquier miembro del negocio los lee y escribe.
do $$
declare t text;
begin
  foreach t in array array['products', 'product_variants', 'lots', 'customers', 'quotes',
                           'orders', 'order_items', 'quote_items']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member(business_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_member(business_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.is_member(business_id))', t);
  end loop;
end $$;

-- Un pedido que ya descontó inventario no se borra (se cancela), para que el
-- historial de movimientos siga explicando cada unidad que salió.
drop policy orders_delete on public.orders;
create policy orders_delete on public.orders for delete to authenticated
  using (public.is_member(business_id) and not stock_applied);

-- Movimientos: solo lectura e inserción (historial inmutable).
create policy movements_select on public.inventory_movements for select to authenticated
  using (public.is_member(business_id));
create policy movements_insert on public.inventory_movements for insert to authenticated
  with check (public.is_member(business_id) and created_by = auth.uid());
-- business_counters: sin políticas; solo lo tocan los triggers SECURITY DEFINER.

revoke all on all tables in schema public from anon;
revoke all on public.business_counters from authenticated;

-- ───────────────────────── Triggers ─────────────────────────

-- Perfil automático al registrarse.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Consecutivo por negocio para pedidos y cotizaciones.
create function public.assign_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text := case tg_table_name when 'orders' then 'order' else 'quote' end;
begin
  insert into public.business_counters as c (business_id, kind, last_value)
  values (new.business_id, v_kind, 1)
  on conflict (business_id, kind) do update set last_value = c.last_value + 1
  returning last_value into new.number;
  return new;
end;
$$;
create trigger orders_number before insert on public.orders
  for each row execute function public.assign_number();
create trigger quotes_number before insert on public.quotes
  for each row execute function public.assign_number();

-- Un pedido ya descontado del inventario no puede cambiar sus productos: hay
-- que cancelarlo (devuelve las unidades) y crear otro. Así el inventario nunca
-- queda desalineado con lo vendido.
create function public.guard_order_items()
returns trigger language plpgsql set search_path = '' as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if exists (select 1 from public.orders where id = v_order and stock_applied) then
    raise exception 'El pedido ya fue entregado: cancélalo para modificar sus productos'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger order_items_guard before insert or update or delete on public.order_items
  for each row execute function public.guard_order_items();

-- El estado y la marca de inventario de un pedido solo cambian a través de
-- set_order_status, que es la que descuenta o devuelve unidades. Un UPDATE
-- directo desde la app (o desde afuera) no puede marcar "entregado" sin mover
-- el inventario.
create function public.guard_order_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.status is distinct from old.status or new.stock_applied is distinct from old.stock_applied)
     and coalesce(current_setting('app.order_status_change', true), '') <> 'on' then
    raise exception 'El estado del pedido se cambia con set_order_status' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger orders_status_guard before update on public.orders
  for each row execute function public.guard_order_status();

-- ───────────────────────── Lógica de inventario ─────────────────────────

-- Descuenta del inventario las unidades del pedido. En negocios perecederos
-- sale primero lo que vence primero (FEFO); si los lotes no alcanzan, el resto
-- se registra sin lote y el inventario queda en negativo para que se note.
create function public.apply_order_stock(p_order uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_order public.orders;
  v_kind public.business_kind;
  v_item record;
  v_lot record;
  v_remaining int;
  v_take int;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order.stock_applied then return; end if;
  select kind into v_kind from public.businesses where id = v_order.business_id;

  for v_item in
    select variant_id, sum(quantity)::int as quantity
    from public.order_items where order_id = p_order group by variant_id
  loop
    v_remaining := v_item.quantity;
    if v_kind = 'perecedero' then
      for v_lot in
        select lot_id, stock from public.lot_stock
        where variant_id = v_item.variant_id and business_id = v_order.business_id and stock > 0
        order by expires_on, lot_id
      loop
        exit when v_remaining = 0;
        v_take := least(v_remaining, v_lot.stock);
        insert into public.inventory_movements (business_id, variant_id, lot_id, quantity, type, order_id)
        values (v_order.business_id, v_item.variant_id, v_lot.lot_id, -v_take, 'venta', p_order);
        v_remaining := v_remaining - v_take;
      end loop;
    end if;
    if v_remaining > 0 then
      insert into public.inventory_movements (business_id, variant_id, quantity, type, order_id)
      values (v_order.business_id, v_item.variant_id, -v_remaining, 'venta', p_order);
    end if;
  end loop;

  update public.orders set stock_applied = true where id = p_order;
end;
$$;

-- Devuelve al inventario (a los mismos lotes) lo que el pedido había descontado.
create function public.revert_order_stock(p_order uuid)
returns void language plpgsql set search_path = '' as $$
declare v_row record;
begin
  perform 1 from public.orders where id = p_order and stock_applied for update;
  if not found then return; end if;
  for v_row in
    select business_id, variant_id, lot_id, sum(quantity)::int as net
    from public.inventory_movements where order_id = p_order
    group by business_id, variant_id, lot_id
    having sum(quantity) <> 0
  loop
    insert into public.inventory_movements (business_id, variant_id, lot_id, quantity, type, order_id, note)
    values (v_row.business_id, v_row.variant_id, v_row.lot_id, -v_row.net, 'devolucion', p_order, 'Pedido cancelado');
  end loop;
  update public.orders set stock_applied = false where id = p_order;
end;
$$;

-- Cambia el estado de un pedido y mantiene el inventario al día:
-- entregado → descuenta; cancelado → devuelve lo descontado.
create function public.set_order_status(p_order uuid, p_status public.order_status)
returns public.orders language plpgsql set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelado' and p_status <> 'cancelado' then
    raise exception 'Un pedido cancelado no se puede reabrir; crea uno nuevo' using errcode = 'P0001';
  end if;
  perform set_config('app.order_status_change', 'on', true);

  if p_status = 'entregado' then
    perform public.apply_order_stock(p_order);
    update public.orders set status = p_status, delivered_at = coalesce(delivered_at, now())
    where id = p_order returning * into v_order;
  elsif p_status = 'cancelado' then
    perform public.revert_order_stock(p_order);
    update public.orders set status = p_status where id = p_order returning * into v_order;
  else
    if v_order.stock_applied then
      raise exception 'El pedido ya fue entregado; solo se puede cancelar' using errcode = 'P0001';
    end if;
    update public.orders set status = p_status where id = p_order returning * into v_order;
  end if;
  perform set_config('app.order_status_change', 'off', true);
  return v_order;
end;
$$;

-- Crea o actualiza un pedido con sus productos en una sola transacción.
-- p_order: campos del pedido (id opcional para editar). p_items: [{variant_id,
-- quantity, unit_price}]. La descripción y el costo se copian del catálogo al
-- momento de la venta para que los reportes no cambien si luego cambia el precio.
create function public.save_order(p_order jsonb, p_items jsonb)
returns public.orders language plpgsql set search_path = '' as $$
declare
  v_id uuid := nullif(p_order ->> 'id', '')::uuid;
  v_business uuid := (p_order ->> 'business_id')::uuid;
  v_status public.order_status := coalesce(nullif(p_order ->> 'status', ''), 'nuevo')::public.order_status;
  v_existing public.orders;
  v_result public.orders;
begin
  if not public.is_member(v_business) then
    raise exception 'Sin acceso a este negocio' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido debe tener al menos un producto' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.orders (business_id, customer_id, channel, payment_method, payment_status,
                               discount, shipping_cost, carrier, tracking_number, notes, quote_id, created_at)
    values (v_business,
            nullif(p_order ->> 'customer_id', '')::uuid,
            coalesce(nullif(p_order ->> 'channel', ''), 'tienda'),
            nullif(p_order ->> 'payment_method', ''),
            coalesce(nullif(p_order ->> 'payment_status', ''), 'pendiente')::public.payment_status,
            coalesce((p_order ->> 'discount')::bigint, 0),
            coalesce((p_order ->> 'shipping_cost')::bigint, 0),
            nullif(p_order ->> 'carrier', ''),
            nullif(p_order ->> 'tracking_number', ''),
            nullif(p_order ->> 'notes', ''),
            nullif(p_order ->> 'quote_id', '')::uuid,
            coalesce(nullif(p_order ->> 'created_at', '')::timestamptz, now()))
    returning id into v_id;
  else
    select * into v_existing from public.orders where id = v_id and business_id = v_business for update;
    if not found then
      raise exception 'Pedido no encontrado' using errcode = 'P0002';
    end if;
    if v_existing.stock_applied or v_existing.status = 'cancelado' then
      raise exception 'Un pedido entregado o cancelado no se puede editar' using errcode = 'P0001';
    end if;
    update public.orders set
      customer_id = nullif(p_order ->> 'customer_id', '')::uuid,
      channel = coalesce(nullif(p_order ->> 'channel', ''), 'tienda'),
      payment_method = nullif(p_order ->> 'payment_method', ''),
      payment_status = coalesce(nullif(p_order ->> 'payment_status', ''), 'pendiente')::public.payment_status,
      discount = coalesce((p_order ->> 'discount')::bigint, 0),
      shipping_cost = coalesce((p_order ->> 'shipping_cost')::bigint, 0),
      carrier = nullif(p_order ->> 'carrier', ''),
      tracking_number = nullif(p_order ->> 'tracking_number', ''),
      notes = nullif(p_order ->> 'notes', ''),
      created_at = coalesce(nullif(p_order ->> 'created_at', '')::timestamptz, created_at)
    where id = v_id;
    delete from public.order_items where order_id = v_id;
  end if;

  insert into public.order_items (business_id, order_id, variant_id, description, quantity, unit_price, unit_cost)
  select v_business, v_id, v.id,
         p.name || coalesce(' · ' || nullif(concat_ws(' / ', v.option1, v.option2), ''), ''),
         (i ->> 'quantity')::int,
         coalesce((i ->> 'unit_price')::bigint, v.price),
         v.cost
  from jsonb_array_elements(p_items) i
  join public.product_variants v on v.id = (i ->> 'variant_id')::uuid and v.business_id = v_business
  join public.products p on p.id = v.product_id and p.business_id = v_business;

  if (select count(*) from public.order_items where order_id = v_id) <> jsonb_array_length(p_items) then
    raise exception 'Algún producto no pertenece a este negocio' using errcode = 'P0001';
  end if;

  select * into v_result from public.orders where id = v_id;
  if v_status <> v_result.status then
    v_result := public.set_order_status(v_id, v_status);
  end if;
  return v_result;
end;
$$;

-- Crea o actualiza una cotización con sus productos.
create function public.save_quote(p_quote jsonb, p_items jsonb)
returns public.quotes language plpgsql set search_path = '' as $$
declare
  v_id uuid := nullif(p_quote ->> 'id', '')::uuid;
  v_business uuid := (p_quote ->> 'business_id')::uuid;
  v_existing public.quotes;
  v_result public.quotes;
begin
  if not public.is_member(v_business) then
    raise exception 'Sin acceso a este negocio' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La cotización debe tener al menos un producto' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.quotes (business_id, customer_id, status, valid_until, discount, shipping_cost, notes)
    values (v_business,
            nullif(p_quote ->> 'customer_id', '')::uuid,
            coalesce(nullif(p_quote ->> 'status', ''), 'borrador')::public.quote_status,
            nullif(p_quote ->> 'valid_until', '')::date,
            coalesce((p_quote ->> 'discount')::bigint, 0),
            coalesce((p_quote ->> 'shipping_cost')::bigint, 0),
            nullif(p_quote ->> 'notes', ''))
    returning id into v_id;
  else
    select * into v_existing from public.quotes where id = v_id and business_id = v_business for update;
    if not found then
      raise exception 'Cotización no encontrada' using errcode = 'P0002';
    end if;
    if v_existing.order_id is not null then
      raise exception 'La cotización ya se convirtió en pedido y no se puede editar' using errcode = 'P0001';
    end if;
    update public.quotes set
      customer_id = nullif(p_quote ->> 'customer_id', '')::uuid,
      status = coalesce(nullif(p_quote ->> 'status', ''), 'borrador')::public.quote_status,
      valid_until = nullif(p_quote ->> 'valid_until', '')::date,
      discount = coalesce((p_quote ->> 'discount')::bigint, 0),
      shipping_cost = coalesce((p_quote ->> 'shipping_cost')::bigint, 0),
      notes = nullif(p_quote ->> 'notes', '')
    where id = v_id;
    delete from public.quote_items where quote_id = v_id;
  end if;

  insert into public.quote_items (business_id, quote_id, variant_id, description, quantity, unit_price)
  select v_business, v_id, v.id,
         p.name || coalesce(' · ' || nullif(concat_ws(' / ', v.option1, v.option2), ''), ''),
         (i ->> 'quantity')::int,
         coalesce((i ->> 'unit_price')::bigint, v.price)
  from jsonb_array_elements(p_items) i
  join public.product_variants v on v.id = (i ->> 'variant_id')::uuid and v.business_id = v_business
  join public.products p on p.id = v.product_id and p.business_id = v_business;

  if (select count(*) from public.quote_items where quote_id = v_id) <> jsonb_array_length(p_items) then
    raise exception 'Algún producto no pertenece a este negocio' using errcode = 'P0001';
  end if;

  select * into v_result from public.quotes where id = v_id;
  return v_result;
end;
$$;

-- Convierte una cotización en pedido (nuevo) con los mismos precios.
create function public.convert_quote_to_order(p_quote uuid)
returns public.orders language plpgsql set search_path = '' as $$
declare
  v_quote public.quotes;
  v_order public.orders;
begin
  select * into v_quote from public.quotes where id = p_quote for update;
  if not found then
    raise exception 'Cotización no encontrada' using errcode = 'P0002';
  end if;
  if v_quote.order_id is not null then
    raise exception 'Esta cotización ya se convirtió en pedido' using errcode = 'P0001';
  end if;

  v_order := public.save_order(
    jsonb_build_object(
      'business_id', v_quote.business_id,
      'customer_id', v_quote.customer_id,
      'channel', 'otro',
      'discount', v_quote.discount,
      'shipping_cost', v_quote.shipping_cost,
      'notes', v_quote.notes,
      'quote_id', v_quote.id),
    (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity, 'unit_price', unit_price))
     from public.quote_items where quote_id = p_quote));

  update public.quotes set status = 'aceptada', order_id = v_order.id where id = p_quote;
  return v_order;
end;
$$;

-- ───────────────────────── Negocios y miembros (RPC) ─────────────────────────

create function public.create_business(p_name text, p_kind public.business_kind)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare v_business public.businesses;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  insert into public.businesses (name, kind, created_by)
  values (trim(p_name), p_kind, auth.uid())
  returning * into v_business;
  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, auth.uid(), 'admin');
  return v_business;
end;
$$;

-- Da acceso a un correo. Si ya tiene cuenta queda como miembro de inmediato;
-- si no, queda invitado y entra en cuanto se registre y confirme ese correo.
create function public.invite_member(p_business uuid, p_email text, p_role public.member_role default 'socio')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not public.is_admin(p_business) then
    raise exception 'Solo un administrador puede invitar socios' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo no válido' using errcode = 'P0001';
  end if;

  select id into v_user from auth.users
  where lower(email) = v_email and email_confirmed_at is not null;

  if v_user is not null then
    insert into public.business_members (business_id, user_id, role)
    values (p_business, v_user, p_role)
    on conflict (business_id, user_id) do update set role = excluded.role;
    delete from public.business_invites where business_id = p_business and email = v_email;
    return 'added';
  end if;

  insert into public.business_invites (business_id, email, role)
  values (p_business, v_email, p_role)
  on conflict (business_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

create function public.cancel_invite(p_business uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_business) then
    raise exception 'Solo un administrador puede cancelar invitaciones' using errcode = '42501';
  end if;
  delete from public.business_invites where business_id = p_business and email = lower(trim(p_email));
end;
$$;

-- Convierte en membresías las invitaciones dirigidas al correo del usuario
-- actual. Solo si el correo está confirmado: si no, cualquiera podría
-- registrarse con el correo de un socio y quedarse con su acceso.
create function public.claim_invites()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_count int;
begin
  select lower(email) into v_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  insert into public.business_members (business_id, user_id, role)
  select business_id, auth.uid(), role from public.business_invites where email = v_email
  on conflict (business_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  delete from public.business_invites where email = v_email;
  return v_count;
end;
$$;

-- Quita a un miembro (o a uno mismo). Siempre debe quedar al menos un admin.
create function public.remove_member(p_business uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin(p_business) or p_user = auth.uid()) then
    raise exception 'Solo un administrador puede quitar socios' using errcode = '42501';
  end if;
  if exists (select 1 from public.business_members where business_id = p_business and user_id = p_user and role = 'admin')
     and (select count(*) from public.business_members where business_id = p_business and role = 'admin') = 1 then
    raise exception 'El negocio debe tener al menos un administrador' using errcode = 'P0001';
  end if;
  delete from public.business_members where business_id = p_business and user_id = p_user;
end;
$$;

create function public.set_member_role(p_business uuid, p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_business) then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  if p_role = 'socio'
     and exists (select 1 from public.business_members where business_id = p_business and user_id = p_user and role = 'admin')
     and (select count(*) from public.business_members where business_id = p_business and role = 'admin') = 1 then
    raise exception 'El negocio debe tener al menos un administrador' using errcode = 'P0001';
  end if;
  update public.business_members set role = p_role where business_id = p_business and user_id = p_user;
end;
$$;

-- Las funciones solo las llaman usuarios autenticados.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_member(uuid), public.is_admin(uuid), public.shares_business(uuid),
  public.set_order_status(uuid, public.order_status),
  public.apply_order_stock(uuid), public.revert_order_stock(uuid),
  public.save_order(jsonb, jsonb), public.save_quote(jsonb, jsonb),
  public.convert_quote_to_order(uuid),
  public.create_business(text, public.business_kind),
  public.invite_member(uuid, text, public.member_role),
  public.cancel_invite(uuid, text), public.claim_invites(),
  public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, public.member_role)
to authenticated;
