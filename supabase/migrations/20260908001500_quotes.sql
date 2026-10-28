-- =========================================================
-- BESTA · suite → presupuestos
-- Un presupuesto es una foto: lo que se le mandó a ese cliente ese día,
-- con sus precios y sus condiciones. Por eso el cuerpo va entero en jsonb
-- y solo se suben a columnas los campos por los que se lista o se busca.
-- La aplica `supabase db push`. Es idempotente.
-- =========================================================

create table if not exists public.booking_quotes (
  id          uuid primary key default gen_random_uuid(),
  number      text not null,                  -- BESTA-2026-001
  status      text not null default 'borrador'
              check (status in ('borrador','enviado','aceptado','rechazado')),
  client      text not null default '',       -- sala, ayuntamiento, promotor…
  event_date  date,                           -- fecha del bolo (si ya se sabe)
  total       numeric(12,2) not null default 0,  -- copia del total, para el listado
  archived    boolean not null default false,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create index if not exists booking_quotes_list_idx
  on public.booking_quotes (archived, created_at desc);
create index if not exists booking_quotes_number_idx
  on public.booking_quotes (number);

create or replace function public.booking_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists booking_quotes_touch on public.booking_quotes;
create trigger booking_quotes_touch
  before update on public.booking_quotes
  for each row execute function public.booking_touch();

alter table public.booking_quotes enable row level security;

drop policy if exists "booking_quotes_auth" on public.booking_quotes;
create policy "booking_quotes_auth" on public.booking_quotes
  for all to authenticated using (true) with check (true);
