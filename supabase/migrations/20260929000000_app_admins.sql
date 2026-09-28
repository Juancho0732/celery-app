-- Solo los administradores de la app pueden crear negocios.
--
-- Los socios invitados entran únicamente a los negocios donde los agregan; ya
-- no pueden crear negocios propios. El primer administrador se registra a mano
-- después de crear la cuenta (ver README):
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'tu-correo@ejemplo.com';

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Sin políticas: nadie la lee ni la escribe desde la app. Se consulta con
-- is_app_admin() y se administra desde el SQL Editor de Supabase.
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.create_business(p_name text, p_kind public.business_kind)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare v_business public.businesses;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if not public.is_app_admin() then
    raise exception 'Solo el administrador de la app puede crear negocios' using errcode = '42501';
  end if;
  insert into public.businesses (name, kind, created_by)
  values (trim(p_name), p_kind, auth.uid())
  returning * into v_business;
  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, auth.uid(), 'admin');
  return v_business;
end;
$$;

revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;
