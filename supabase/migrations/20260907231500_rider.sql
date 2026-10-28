-- =========================================================
-- BESTA · suite → rider técnico
-- Un rider es un documento vivo: pocas filas, mucho contenido.
-- Por eso el cuerpo va en un jsonb (igual que songs.data en ensayos)
-- y solo se sacan a columnas los datos por los que se busca u ordena.
-- Cada formato de la banda (completa, acústico…) es una fila.
-- La aplica `supabase db push`. Es idempotente.
-- =========================================================

create table if not exists public.rider_docs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- banda-completa, acustico…
  name        text not null default 'Banda completa',
  version     text not null default '1',     -- versión del documento (2026.1)
  position    integer not null default 0,    -- orden en el selector
  archived    boolean not null default false,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create index if not exists rider_docs_position_idx
  on public.rider_docs (archived, position asc, created_at asc);

create or replace function public.rider_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists rider_docs_touch on public.rider_docs;
create trigger rider_docs_touch
  before update on public.rider_docs
  for each row execute function public.rider_touch();

-- Mismo criterio que en el resto de la suite: si has entrado, eres de la banda.
alter table public.rider_docs enable row level security;

drop policy if exists "rider_docs_auth" on public.rider_docs;
create policy "rider_docs_auth" on public.rider_docs
  for all to authenticated using (true) with check (true);
