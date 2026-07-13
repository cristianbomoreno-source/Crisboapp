-- ============================================================
-- Mi Restaurante — esquema de base de datos para Supabase
-- ============================================================
-- Cómo usarlo:
-- 1. Entra a tu proyecto en supabase.com
-- 2. En el menú lateral, ve a "SQL Editor"
-- 3. Toca "New query"
-- 4. Pega todo este archivo completo
-- 5. Toca "Run"
-- ============================================================

-- Una sola tabla guarda todos los datos de la app (productos,
-- ventas, insumos, caja, historial, datos del negocio), cada
-- "colección" identificada por una clave (key). Es el mismo
-- formato que ya usaba la app, pero ahora en una base de datos
-- real, sincronizada entre dispositivos y protegida por usuario.

create table if not exists public.app_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Activa la seguridad a nivel de fila (RLS). Sin esto, cualquier
-- usuario autenticado podría leer los datos de todos los demás.
alter table public.app_data enable row level security;

-- Cada política dice: "solo puedes ver/crear/editar/borrar filas
-- donde user_id sea igual a tu propio ID de sesión (auth.uid())".

create policy "Los usuarios ven solo sus propios datos"
  on public.app_data for select
  using (auth.uid() = user_id);

create policy "Los usuarios crean solo sus propios datos"
  on public.app_data for insert
  with check (auth.uid() = user_id);

create policy "Los usuarios editan solo sus propios datos"
  on public.app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Los usuarios borran solo sus propios datos"
  on public.app_data for delete
  using (auth.uid() = user_id);

-- Índice para que las consultas por usuario sean rápidas a medida
-- que crece la tabla.
create index if not exists app_data_user_id_idx on public.app_data (user_id);
