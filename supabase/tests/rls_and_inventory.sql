-- Pruebas de la base de datos: aislamiento entre negocios (RLS), invitaciones,
-- consecutivos y la lógica de inventario (FEFO, cancelaciones).
-- Se ejecutan con `npm run test:db` contra el Supabase local; todo corre dentro
-- de una transacción que se revierte al final.

\set ON_ERROR_STOP on
begin;

-- Usuarios de prueba: dueño de los dos negocios, un socio de cada uno.
insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'dueno@test.co', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'socio.purpal@test.co', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'socio.libelle@test.co', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'sin.confirmar@test.co', null, 'authenticated', 'authenticated');

create function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok  %', p_label;
    return;
  end;
  raise exception 'FALLÓ: se esperaba error en "%"', p_label;
end;
$$;

create function pg_temp.check(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLÓ: %', p_label; end if;
  raise notice 'ok  %', p_label;
end;
$$;

grant execute on all functions in schema pg_temp to authenticated;

-- Solo el dueño es administrador de la app.
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-00000000000a');

set local role authenticated;

-- ── Un usuario que no es administrador de la app no puede crear negocios ──
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(not public.is_app_admin(), 'un socio no es administrador de la app');
select pg_temp.expect_error($q$select public.create_business('Mi negocio', 'ropa')$q$, 'un socio no puede crear negocios');
select pg_temp.expect_error('select count(*) from public.app_admins', 'nadie lee la tabla de administradores desde la app');

-- ── El dueño crea los dos negocios ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.is_app_admin(), 'el dueño es administrador de la app');
select id as purpal from public.create_business('Purpal', 'perecedero') \gset
select id as libelle from public.create_business('Libelle', 'ropa') \gset
select pg_temp.check((select count(*) from public.businesses) = 2, 'el dueño ve sus 2 negocios');

select pg_temp.check(public.invite_member(:'purpal', 'socio.purpal@test.co') = 'added', 'socio con cuenta queda agregado');
select pg_temp.check(public.invite_member(:'libelle', 'SOCIO.Libelle@test.co ') = 'added', 'invitación normaliza el correo');
select pg_temp.check(public.invite_member(:'purpal', 'nuevo@test.co') = 'invited', 'correo sin cuenta queda invitado');
select pg_temp.check(public.invite_member(:'purpal', 'sin.confirmar@test.co') = 'invited', 'correo sin confirmar no entra directo');

-- ── Catálogo de Purpal ──
insert into public.products (business_id, name) values (:'purpal', 'Mango') returning id as mango \gset
insert into public.product_variants (business_id, product_id, option1, price, cost)
values (:'purpal', :'mango', '500 g', 9000, 4000) returning id as mango500 \gset

insert into public.lots (business_id, variant_id, code, expires_on)
values (:'purpal', :'mango500', 'L-TARDE', current_date + 30) returning id as lot_late \gset
insert into public.lots (business_id, variant_id, code, expires_on)
values (:'purpal', :'mango500', 'L-PRONTO', current_date + 5) returning id as lot_soon \gset
insert into public.inventory_movements (business_id, variant_id, lot_id, quantity, type) values
  (:'purpal', :'mango500', :'lot_late', 10, 'entrada'),
  (:'purpal', :'mango500', :'lot_soon', 4, 'entrada');

-- ── Aislamiento: el socio de Libelle no ve nada de Purpal ──
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.businesses) = 1, 'socio de Libelle ve solo Libelle');
select pg_temp.check((select count(*) from public.products where business_id = :'purpal') = 0, 'socio de Libelle no ve productos de Purpal');
select pg_temp.check((select count(*) from public.lot_stock) = 0, 'socio de Libelle no ve lotes de Purpal');
select pg_temp.expect_error(format($q$insert into public.customers (business_id, name) values (%L, 'Intruso')$q$, :'purpal'),
  'socio de Libelle no puede escribir en Purpal');
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'x@test.co')$q$, :'purpal'),
  'socio de Libelle no puede invitar en Purpal');
select pg_temp.expect_error(format($q$select public.save_order('{"business_id":"%s"}', '[{"variant_id":"%s","quantity":1}]')$q$, :'purpal', :'mango500'),
  'socio de Libelle no puede crear pedidos en Purpal');

-- Un producto de Libelle no puede apuntar a una variante de Purpal (FK compuesta).
insert into public.products (business_id, name) values (:'libelle', 'Pijama Luna') returning id as luna \gset
select pg_temp.expect_error(format($q$insert into public.product_variants (business_id, product_id) values (%L, %L)$q$, :'libelle', :'mango'),
  'variante de Libelle no puede colgar de un producto de Purpal');
select pg_temp.expect_error(format($q$select public.save_order('{"business_id":"%s"}', '[{"variant_id":"%s","quantity":1}]')$q$, :'libelle', :'mango500'),
  'pedido de Libelle no puede incluir productos de Purpal');

-- ── Socio de Purpal: roles ──
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.businesses) = 1, 'socio de Purpal ve solo Purpal');
select pg_temp.expect_error(format($q$select public.invite_member(%L, 'x@test.co')$q$, :'purpal'),
  'un socio (no admin) no puede invitar');
update public.businesses set name = 'Hackeado' where id = :'purpal';
select pg_temp.check((select name from public.businesses where id = :'purpal') = 'Purpal', 'un socio no puede editar los datos del negocio');
update public.inventory_movements set quantity = 999 where business_id = :'purpal';
delete from public.inventory_movements where business_id = :'purpal';
select pg_temp.check((select sum(quantity) from public.inventory_movements where business_id = :'purpal') = 14,
  'los movimientos no se pueden editar ni borrar');

-- ── Pedido con FEFO: 6 unidades salen 4 del lote que vence pronto y 2 del otro ──
select id as order1, number as order1_number from public.save_order(
  format('{"business_id":"%s","channel":"whatsapp","status":"entregado"}', :'purpal')::jsonb,
  format('[{"variant_id":"%s","quantity":6}]', :'mango500')::jsonb) \gset
select pg_temp.check(:order1_number = 1, 'primer pedido es el #1');
select pg_temp.check((select stock from public.lot_stock where lot_id = :'lot_soon') = 0, 'FEFO agota primero el lote que vence antes');
select pg_temp.check((select stock from public.lot_stock where lot_id = :'lot_late') = 8, 'FEFO toma el resto del lote siguiente');
select pg_temp.check((select stock from public.variant_stock where variant_id = :'mango500') = 8, 'existencia total 14 - 6 = 8');
select pg_temp.check((select unit_cost from public.order_items where order_id = :'order1') = 4000, 'el costo se copia al vender');
select pg_temp.check((select description from public.order_items where order_id = :'order1') = 'Mango · 500 g', 'la descripción se copia del catálogo');

select pg_temp.expect_error(format($q$update public.orders set status = 'nuevo', stock_applied = false where id = %L$q$, :'order1'),
  'el estado no se cambia con un UPDATE directo');
select pg_temp.expect_error(format($q$select public.revert_order_stock(%L)$q$, :'order1'),
  'no se puede devolver inventario sin cancelar el pedido');
select id as draft from public.save_order(
  format('{"business_id":"%s"}', :'purpal')::jsonb,
  format('[{"variant_id":"%s","quantity":1}]', :'mango500')::jsonb) \gset
select pg_temp.expect_error(format($q$update public.orders set status = 'entregado' where id = %L$q$, :'draft'),
  'no se puede marcar entregado sin descontar inventario');
update public.orders set payment_status = 'pagado', notes = 'ok' where id = :'draft';
select pg_temp.check((select payment_status from public.orders where id = :'draft') = 'pagado', 'el pago sí se actualiza directamente');
delete from public.orders where id = :'draft';
select pg_temp.expect_error(format($q$select public.save_order('{"id":"%s","business_id":"%s"}', '[{"variant_id":"%s","quantity":1}]')$q$, :'order1', :'purpal', :'mango500'),
  'un pedido entregado no se puede editar');
select pg_temp.expect_error(format($q$delete from public.order_items where order_id = %L$q$, :'order1'),
  'los productos de un pedido entregado no se pueden borrar');
select pg_temp.expect_error(format($q$select public.set_order_status(%L, 'enviado')$q$, :'order1'),
  'un pedido entregado no puede volver a un estado anterior');

-- Cancelar devuelve las unidades a los mismos lotes.
select public.set_order_status(:'order1', 'cancelado');
select pg_temp.check((select stock from public.lot_stock where lot_id = :'lot_soon') = 4, 'cancelar devuelve al lote que vence pronto');
select pg_temp.check((select stock from public.lot_stock where lot_id = :'lot_late') = 10, 'cancelar devuelve al lote siguiente');
select pg_temp.expect_error(format($q$select public.set_order_status(%L, 'nuevo')$q$, :'order1'),
  'un pedido cancelado no se reabre');

-- Vender más de lo que hay: el faltante queda sin lote y la existencia en negativo.
select id as order2, number as order2_number from public.save_order(
  format('{"business_id":"%s","status":"entregado"}', :'purpal')::jsonb,
  format('[{"variant_id":"%s","quantity":16}]', :'mango500')::jsonb) \gset
select pg_temp.check(:order2_number = 3, 'los consecutivos no se reutilizan aunque se borre un pedido');
select pg_temp.check((select stock from public.variant_stock where variant_id = :'mango500') = -2, 'sobreventa deja existencia negativa visible');

-- ── Cotización → pedido ──
select id as quote1, number as quote1_number from public.save_quote(
  format('{"business_id":"%s","discount":1000}', :'purpal')::jsonb,
  format('[{"variant_id":"%s","quantity":3,"unit_price":8500}]', :'mango500')::jsonb) \gset
select pg_temp.check(:quote1_number = 1, 'la numeración de cotizaciones es independiente');
select id as order3 from public.convert_quote_to_order(:'quote1') \gset
select pg_temp.check((select status from public.quotes where id = :'quote1') = 'aceptada', 'la cotización queda aceptada');
select pg_temp.check((select unit_price from public.order_items where order_id = :'order3') = 8500, 'el pedido conserva el precio cotizado');
select pg_temp.check((select discount from public.orders where id = :'order3') = 1000, 'el pedido conserva el descuento');
select pg_temp.expect_error(format($q$select public.convert_quote_to_order(%L)$q$, :'quote1'),
  'una cotización no se convierte dos veces');

-- ── Numeración por negocio: Libelle empieza en #1 ──
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.product_variants (business_id, product_id, option1, option2, price)
values (:'libelle', :'luna', 'M', 'Rosa', 85000) returning id as luna_m \gset
select number as libelle_first from public.save_order(
  format('{"business_id":"%s","status":"entregado"}', :'libelle')::jsonb,
  format('[{"variant_id":"%s","quantity":1}]', :'luna_m')::jsonb) \gset
select pg_temp.check(:libelle_first = 1, 'cada negocio tiene su propio consecutivo');
select pg_temp.check((select stock from public.variant_stock where variant_id = :'luna_m') = -1, 'ropa descuenta sin lotes');

-- ── Invitaciones pendientes ──
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.check(public.claim_invites() = 0, 'un correo sin confirmar no reclama invitaciones');
select pg_temp.check((select count(*) from public.businesses) = 0, 'sin confirmar no ve negocios');

reset role;
insert into auth.users (id, email, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-00000000000e', 'nuevo@test.co', now(), 'authenticated', 'authenticated');
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.check(public.claim_invites() = 1, 'al registrarse reclama su invitación');
select pg_temp.check((select string_agg(name, ',') from public.businesses) = 'Purpal', 'el invitado entra solo a Purpal');

-- ── Siempre queda un administrador ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error(format($q$select public.remove_member(%L, '00000000-0000-0000-0000-00000000000a')$q$, :'purpal'),
  'no se puede quitar al último administrador');
select public.remove_member(:'purpal', '00000000-0000-0000-0000-00000000000b');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.businesses) = 0, 'un socio removido pierde el acceso');

-- ── Anónimo no ve nada ──
reset role;
set local role anon;
select pg_temp.expect_error('select count(*) from public.businesses', 'anónimo no puede leer negocios');

rollback;
\echo 'Todas las pruebas de base de datos pasaron'
