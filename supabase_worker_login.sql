-- ============================================================
-- Login de trabajadores desde cualquier dispositivo
-- ============================================================
-- Antes, un trabajador solo podía iniciar sesión en un celular donde
-- el administrador ya había iniciado sesión primero (porque los datos
-- vivían solo en la sesión del administrador). Este script agrega una
-- forma segura de que cualquier trabajador inicie sesión desde CERO en
-- cualquier dispositivo, sin exponer contraseñas de nadie.
--
-- Cómo usarlo:
-- 1. Entra a tu proyecto en supabase.com
-- 2. En el menú lateral, ve a "SQL Editor"
-- 3. Toca "New query"
-- 4. Pega todo este archivo completo
-- 5. Toca "Run"
-- ============================================================

-- Directorio de trabajadores: una copia liviana (usuario, contraseña,
-- nombre, rol, foto) de la lista de trabajadores de cada negocio. La
-- app la mantiene sincronizada automáticamente cada vez que el
-- administrador crea, edita o borra un trabajador. Un dispositivo de
-- trabajador NUNCA lee esta tabla directamente -- solo a través de las
-- funciones seguras de abajo.
create table if not exists public.worker_directory (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  worker_id text not null,
  username text not null,
  password text not null,
  name text,
  role text,
  photo text,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, worker_id)
);

alter table public.worker_directory enable row level security;

-- Solo el dueño de la cuenta (administrador con sesión real) puede
-- crear, editar o borrar filas de su propio directorio.
create policy "El dueño administra su propio directorio"
  on public.worker_directory for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create index if not exists worker_directory_username_idx
  on public.worker_directory (lower(username));

-- Función de inicio de sesión: recibe usuario y contraseña y, si
-- coinciden con algún trabajador, dice a qué negocio pertenece. No
-- necesita ninguna sesión activa. SECURITY DEFINER le permite mirar la
-- tabla saltándose RLS, pero SOLO devuelve datos si las credenciales
-- son correctas -- nunca deja ver el resto de la tabla.
create or replace function public.login_worker(p_username text, p_password text)
returns table (worker_id text, owner_user_id uuid, name text, role text, photo text)
language sql
security definer
set search_path = public
as $$
  select worker_id, owner_user_id, name, role, photo
  from public.worker_directory
  where lower(username) = lower(p_username) and password = p_password
  limit 1;
$$;

grant execute on function public.login_worker(text, text) to anon, authenticated;

-- Lectura de datos del negocio (productos, ventas, caja, etc.) para un
-- trabajador que inició sesión con login_worker, sin sesión de
-- Supabase. Revalida usuario y contraseña en cada llamada, así que
-- nunca se puede leer nada sin credenciales correctas.
create or replace function public.worker_get_data(
  p_owner_user_id uuid,
  p_username text,
  p_password text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not exists (
    select 1 from public.worker_directory
    where owner_user_id = p_owner_user_id
      and lower(username) = lower(p_username)
      and password = p_password
  ) then
    raise exception 'Credenciales inválidas';
  end if;

  select value into v_value
  from public.app_data
  where user_id = p_owner_user_id and key = p_key;

  return v_value;
end;
$$;

grant execute on function public.worker_get_data(uuid, text, text, text) to anon, authenticated;

-- Escritura de datos del negocio para un trabajador (por ejemplo,
-- registrar una venta o marcar un pedido como entregado). También
-- revalida usuario y contraseña antes de escribir nada.
create or replace function public.worker_set_data(
  p_owner_user_id uuid,
  p_username text,
  p_password text,
  p_key text,
  p_value jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.worker_directory
    where owner_user_id = p_owner_user_id
      and lower(username) = lower(p_username)
      and password = p_password
  ) then
    raise exception 'Credenciales inválidas';
  end if;

  insert into public.app_data (user_id, key, value, updated_at)
  values (p_owner_user_id, p_key, p_value, now())
  on conflict (user_id, key)
  do update set value = excluded.value, updated_at = now();

  return true;
end;
$$;

grant execute on function public.worker_set_data(uuid, text, text, text, jsonb) to anon, authenticated;
