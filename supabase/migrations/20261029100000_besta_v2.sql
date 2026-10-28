-- =========================================================
-- besta v2 · esquema «besta»
--
-- Va al lado de las tablas de la suite antigua (public.*), que no
-- se tocan: las dos conviven hasta el día del cambio.
--
-- Cada colección guarda el registro tal cual lo usa la app (doc
-- jsonb, mismos campos que src/data/types.ts) y solo saca a columnas
-- lo que hace falta para filtrar, ordenar o dar permisos. Añadir un
-- campo en la app no necesita migración.
--
-- Permisos: admin ve todo; músico y staff, lo de sus módulos
-- (besta.can). La web pública no lee tablas: llama a funciones que
-- devuelven solo lo publicable.
-- =========================================================

create schema if not exists besta;
grant usage on schema besta to anon, authenticated, service_role;

-- En Postgres cualquiera puede ejecutar una función nueva. Aquí no:
-- cada función dice abajo quién puede llamarla.
alter default privileges in schema besta revoke execute on functions from public;

-- ---------- miembros ----------
-- user_id enlaza con la cuenta de Supabase Auth. Sin cuenta todavía
-- (invitación pendiente o miembro antiguo sin login) queda en null.
create table if not exists besta.members (
  id          text primary key,
  user_id     uuid unique references auth.users(id) on delete set null,
  email       text unique,
  doc         jsonb not null default '{}'::jsonb,
  role        text generated always as (coalesce(doc->>'role', 'musico')) stored,
  active      boolean generated always as (coalesce((doc->>'active')::boolean, true)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- Lo que puede abrir cada rol si no se le cambian los permisos a mano
-- (el mismo reparto que src/suite/nav.ts).
create or replace function besta.role_scopes(r text) returns text[]
language sql immutable as $$
  select case r
    when 'musico' then array['inicio','ensayos','composicion','bolos','rider']
    when 'staff'  then array['inicio','entradas','puerta','merch']
    else array[]::text[]
  end
$$;

-- ¿Puede la persona conectada usar este módulo? Security definer para
-- poder leer members sin que la propia política de members la llame.
create or replace function besta.can(scope text) returns boolean
language sql stable security definer set search_path = besta, public as $$
  select exists (
    select 1 from besta.members m
    where m.user_id = auth.uid() and m.active
      and (m.role = 'admin'
           or scope = any(coalesce(
                (select array_agg(x) from jsonb_array_elements_text(m.doc->'scopes') x),
                besta.role_scopes(m.role))))
  )
$$;

create or replace function besta.is_admin() returns boolean
language sql stable security definer set search_path = besta, public as $$
  select exists (select 1 from besta.members where user_id = auth.uid() and active and role = 'admin')
$$;

create or replace function besta.is_member() returns boolean
language sql stable security definer set search_path = besta, public as $$
  select exists (select 1 from besta.members where user_id = auth.uid() and active)
$$;

-- ---------- colecciones ----------
-- Todas con la misma forma; las columnas extra salen del doc.
do $$
declare t text;
begin
  foreach t in array array[
    'gigs','events','orders','tickets','songs','setlists','ideas','riders',
    'quotes','leads','products','moves','requests','subscribers',
    'expenses','incomes','settlements','audit','categories'
  ] loop
    execute format($f$
      create table if not exists besta.%I (
        id          text primary key,
        doc         jsonb not null default '{}'::jsonb,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now(),
        updated_by  uuid default auth.uid(),
        legacy      jsonb   -- el registro original de la suite antigua, si viene de ahí
      )$f$, t);
  end loop;
end $$;

-- Columnas de búsqueda y de permisos.
alter table besta.gigs     add column if not exists date      text    generated always as (doc->>'date') stored;  -- ISO, ordena bien como texto
alter table besta.gigs     add column if not exists published boolean generated always as (coalesce((doc->>'published')::boolean, false)) stored;
alter table besta.events   add column if not exists gig_id    text    generated always as (doc->>'gigId') stored;
alter table besta.orders   add column if not exists event_id  text    generated always as (doc->>'eventId') stored;
alter table besta.orders   add column if not exists status    text    generated always as (doc->>'status') stored;
alter table besta.orders   add column if not exists token     text    generated always as (doc->>'token') stored;
alter table besta.orders   add column if not exists stripe_session text;
alter table besta.tickets  add column if not exists event_id  text    generated always as (doc->>'eventId') stored;
alter table besta.tickets  add column if not exists order_id  text    generated always as (doc->>'orderId') stored;
alter table besta.tickets  add column if not exists status    text    generated always as (doc->>'status') stored;
alter table besta.requests add column if not exists status    text    generated always as (doc->>'status') stored;
alter table besta.subscribers add column if not exists email  text    generated always as (lower(doc->>'email')) stored;

create unique index if not exists orders_token_idx   on besta.orders (token);
create unique index if not exists orders_stripe_idx  on besta.orders (stripe_session) where stripe_session is not null;
create index if not exists orders_event_idx          on besta.orders (event_id, status);
create index if not exists tickets_event_idx         on besta.tickets (event_id, status);
create index if not exists tickets_order_idx         on besta.tickets (order_id);
create index if not exists gigs_date_idx             on besta.gigs (date);
create unique index if not exists subscribers_email_idx on besta.subscribers (email);

-- ---------- updated_at ----------
create or replace function besta.touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
    'quotes','leads','products','moves','requests','subscribers',
    'expenses','incomes','settlements','audit','categories'
  ] loop
    execute format('drop trigger if exists %1$s_touch on besta.%1$I', t);
    execute format('create trigger %1$s_touch before update on besta.%1$I for each row execute function besta.touch()', t);
  end loop;
end $$;

-- ---------- permisos ----------
grant select, insert, update, delete on all tables in schema besta to authenticated;
grant all on all tables in schema besta to service_role;
alter default privileges in schema besta grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema besta grant all on tables to service_role;

do $$
declare
  rec record;
begin
  -- tabla → módulo que da acceso
  for rec in select * from (values
    ('gigs','bolos'), ('events','entradas'), ('orders','entradas'), ('tickets','entradas'),
    ('songs','ensayos'), ('setlists','ensayos'), ('ideas','composicion'), ('riders','rider'),
    ('quotes','presupuestos'), ('leads','presupuestos'),
    ('products','merch'), ('moves','merch'), ('requests','merch'),
    ('expenses','finanzas'), ('incomes','finanzas'), ('settlements','finanzas'),
    ('audit','finanzas'), ('categories','finanzas'), ('subscribers','usuarios')
  ) as v(tbl, scope) loop
    execute format('alter table besta.%I enable row level security', rec.tbl);
    execute format('drop policy if exists %1$s_scope on besta.%1$I', rec.tbl);
    execute format('create policy %1$s_scope on besta.%1$I for all to authenticated using (besta.can(%2$L)) with check (besta.can(%2$L))', rec.tbl, rec.scope);
  end loop;
end $$;

-- Lecturas cruzadas que necesitan los módulos: la agenda de bolos
-- la ven todos los miembros (inicio, ensayos, merch, finanzas…); los
-- eventos, quien lleva puerta o merch (puesto del bolo).
drop policy if exists gigs_read_members on besta.gigs;
create policy gigs_read_members on besta.gigs for select to authenticated using (besta.is_member());
drop policy if exists events_read_ops on besta.events;
create policy events_read_ops on besta.events for select to authenticated using (besta.can('puerta') or besta.can('bolos') or besta.can('finanzas'));
drop policy if exists orders_read_ops on besta.orders;
create policy orders_read_ops on besta.orders for select to authenticated using (besta.can('puerta') or besta.can('finanzas'));
drop policy if exists tickets_read_ops on besta.tickets;
create policy tickets_read_ops on besta.tickets for select to authenticated using (besta.can('puerta') or besta.can('finanzas'));
drop policy if exists moves_read_fin on besta.moves;
create policy moves_read_fin on besta.moves for select to authenticated using (besta.can('finanzas') or besta.can('bolos'));
drop policy if exists products_read_bolos on besta.products;
create policy products_read_bolos on besta.products for select to authenticated using (besta.can('bolos'));
drop policy if exists categories_read on besta.categories;
create policy categories_read on besta.categories for select to authenticated using (besta.is_member());

-- Miembros: todos ven a todos (nombres en ensayos, merch…); solo
-- admin da altas, cambia roles o borra. Cada uno edita su ficha
-- salvo rol y permisos (lo vigila el trigger de abajo).
alter table besta.members enable row level security;
drop policy if exists members_read on besta.members;
create policy members_read on besta.members for select to authenticated using (besta.is_member());
drop policy if exists members_admin on besta.members;
create policy members_admin on besta.members for all to authenticated using (besta.is_admin()) with check (besta.is_admin());
drop policy if exists members_self on besta.members;
create policy members_self on besta.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function besta.members_guard() returns trigger language plpgsql security definer set search_path = besta, public as $$
begin
  if besta.is_admin() or auth.uid() is null then return new; end if;  -- admin o servidor
  if (new.doc->>'role') is distinct from (old.doc->>'role')
     or (new.doc->'scopes') is distinct from (old.doc->'scopes')
     or (new.doc->'active') is distinct from (old.doc->'active')
     or new.user_id is distinct from old.user_id then
    raise exception 'Solo un admin puede cambiar permisos.';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on besta.members;
create trigger members_guard before update on besta.members for each row execute function besta.members_guard();

-- Que nunca se quede la banda sin ningún admin.
create or replace function besta.keep_one_admin() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from besta.members where role = 'admin' and active) then
    raise exception 'Tiene que quedar al menos un admin.';
  end if;
  return null;
end $$;
drop trigger if exists keep_one_admin on besta.members;
create constraint trigger keep_one_admin after update or delete on besta.members
  deferrable initially deferred for each row execute function besta.keep_one_admin();

-- ---------- edición parcial de un doc ----------
-- La app cambia campos sueltos (api.update): se fusionan en el doc
-- sin pisar lo demás. Security invoker: aplica la política de la tabla.
create or replace function besta.patch_doc(tbl text, row_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = besta, public as $$
begin
  if tbl not in ('members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
                 'quotes','leads','products','moves','requests','subscribers',
                 'expenses','incomes','settlements','audit','categories') then
    raise exception 'Colección desconocida: %', tbl;
  end if;
  execute format('update besta.%I set doc = doc || $1 where id = $2', tbl) using patch, row_id;
  if not found then raise exception 'No existe % %', tbl, row_id; end if;
end $$;

-- ---------- entradas ----------
-- Plazas ocupadas: entradas válidas o usadas + pedidos a medio pagar
-- de los últimos 32 minutos (Stripe exige al menos 31 de sesión; uno
-- más de margen para no vender por encima del aforo).
create or replace function besta.taken_seats(ev text) returns integer
language sql stable security definer set search_path = besta, public as $$
  select
    (select count(*) from besta.tickets t where t.event_id = ev and t.status <> 'cancelada')::int
  + coalesce((select sum((o.doc->>'qty')::int) from besta.orders o
              where o.event_id = ev and o.status = 'pendiente' and o.created_at > now() - interval '32 minutes'), 0)::int
$$;

-- Reserva de plazas al empezar el pago. La llama la Edge Function de
-- checkout (con la clave de servidor), nunca el navegador. El bloqueo
-- de la fila del evento hace que dos compras a la vez no se pasen del aforo.
-- Número de pedido correlativo (#0001…) sin choques entre compras simultáneas.
create sequence if not exists besta.order_number_seq;
grant usage on sequence besta.order_number_seq to service_role;

create or replace function besta.reserve_order(ev text, qty int, email text, newsletter boolean) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  e jsonb;
  n int;
  o_id text := 'ord-' || replace(gen_random_uuid()::text, '-', '');
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
  num int;
  order_doc jsonb;
begin
  select doc into e from besta.events where id = ev for update;
  if e is null then raise exception 'Este evento ya no existe.'; end if;
  if not coalesce((e->>'salesEnabled')::boolean, false) then raise exception 'La venta de este concierto está cerrada.'; end if;
  if e ? 'salesEnd' and (e->>'salesEnd')::timestamptz < now() then raise exception 'La venta online ya ha terminado.'; end if;
  if qty < 1 or qty > coalesce((e->>'maxPerOrder')::int, 10) then raise exception 'Puedes comprar entre 1 y % entradas.', coalesce((e->>'maxPerOrder')::int, 10); end if;
  n := besta.taken_seats(ev);
  if n + qty > (e->>'capacity')::int then raise exception 'Solo quedan % entradas.', greatest(0, (e->>'capacity')::int - n); end if;
  num := nextval('besta.order_number_seq');
  order_doc := jsonb_build_object(
    'id', o_id, 'number', num, 'eventId', ev, 'email', lower(trim(email)), 'qty', qty,
    'amountCents', qty * (e->>'priceCents')::int, 'status', 'pendiente', 'newsletter', newsletter,
    'createdAt', now(), 'token', tok);
  insert into besta.orders (id, doc) values (o_id, order_doc);
  return order_doc;
end $$;

-- Pago confirmado (webhook de Stripe): marca el pedido y emite un QR
-- por entrada. Idempotente: Stripe puede avisar dos veces.
create or replace function besta.fulfill_order(o_id text, session text) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  o jsonb;
  i int;
  code text;
begin
  select doc into o from besta.orders where id = o_id for update;
  if o is null then raise exception 'Pedido % no encontrado', o_id; end if;
  if o->>'status' = 'pagado' then return o; end if;
  update besta.orders set doc = doc || jsonb_build_object('status', 'pagado', 'paidAt', now()), stripe_session = session where id = o_id;
  for i in 1..(o->>'qty')::int loop
    loop
      code := 'BST-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
      exit when not exists (select 1 from besta.tickets where id = code);
    end loop;
    insert into besta.tickets (id, doc) values (code, jsonb_build_object(
      'code', code, 'orderId', o_id, 'eventId', o->>'eventId', 'kind', 'general', 'status', 'valida'));
  end loop;
  select doc into o from besta.orders where id = o_id;
  return o;
end $$;

-- «Mis entradas»: el enlace del email lleva el token secreto del
-- pedido. Devuelve solo lo de ese pedido.
create or replace function besta.get_order(tok text) returns jsonb
language sql stable security definer set search_path = besta, public as $$
  select jsonb_build_object(
    'order', o.doc - 'token',
    'tickets', coalesce((select jsonb_agg(t.doc order by t.id) from besta.tickets t where t.order_id = o.id), '[]'::jsonb),
    'event', e.doc - 'salesEnabled',
    'gig', jsonb_build_object('date', g.doc->'date', 'time', g.doc->'time', 'doors', g.doc->'doors',
                              'city', g.doc->'city', 'venue', g.doc->'venue', 'address', g.doc->'address'))
  from besta.orders o
  left join besta.events e on e.id = o.event_id
  left join besta.gigs g on g.id = e.gig_id
  where o.token = tok and length(tok) >= 32
$$;

-- Puerta: comprobar y marcar en un solo paso. Si dos móviles escanean
-- la misma entrada a la vez, solo uno la ve «válida».
create or replace function besta.scan_ticket(code text, ev text) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  c text := upper(regexp_replace(trim(code), '^BESTA:T:', '', 'i'));
  who text;
  t jsonb;
  o jsonb;
begin
  if not (besta.can('puerta') or besta.can('entradas')) then raise exception 'Sin permiso para la puerta.'; end if;
  select coalesce(doc->>'name', 'puerta') into who from besta.members where user_id = auth.uid();

  update besta.tickets set doc = doc || jsonb_build_object('status', 'usada', 'checkedInAt', now(), 'checkedInBy', who)
   where id = c and event_id = ev and status = 'valida'
   returning doc into t;
  if t is not null then
    select doc into o from besta.orders where id = t->>'orderId';
    return jsonb_build_object('ok', true, 'ticket', t, 'order', o - 'token');
  end if;

  select doc into t from besta.tickets where id = c;
  if t is null then return jsonb_build_object('ok', false, 'reason', 'no-existe'); end if;
  select doc into o from besta.orders where id = t->>'orderId';
  return jsonb_build_object('ok', false,
    'reason', case when t->>'eventId' <> ev then 'otro-evento' when t->>'status' = 'cancelada' then 'cancelada' else 'usada' end,
    'ticket', t, 'order', o - 'token');
end $$;

-- ---------- merch: stock sin carreras ----------
-- Suma o resta unidades de una talla dentro del doc del producto.
create or replace function besta.adjust_stock(product_id text, variant_id text, delta int, allow_negative boolean default false) returns integer
language plpgsql security definer set search_path = besta, public as $$
declare
  p jsonb;
  idx int;
  cur int;
begin
  if not (besta.can('merch') or auth.uid() is null) then raise exception 'Sin permiso para merch.'; end if;
  select doc into p from besta.products where id = product_id for update;
  if p is null then raise exception 'Ese producto ya no existe.'; end if;
  select ord - 1, (v->>'stock')::int into idx, cur
    from jsonb_array_elements(p->'variants') with ordinality as x(v, ord) where v->>'id' = variant_id;
  if idx is null then raise exception 'Esa talla ya no existe.'; end if;
  if cur + delta < 0 and not allow_negative then raise exception 'No queda stock suficiente (quedan %).', cur; end if;
  update besta.products set doc = jsonb_set(doc, array['variants', idx::text, 'stock'], to_jsonb(greatest(0, cur + delta))) where id = product_id;
  return greatest(0, cur + delta);
end $$;

-- ---------- web pública ----------
-- Todo lo que la web necesita, ya filtrado: bolos publicados sin
-- datos internos (caché, contactos, notas), eventos con plazas libres
-- y merch con stock (sin coste). La llama el build y el navegador.
create or replace function besta.public_site() returns jsonb
language sql stable security definer set search_path = besta, public as $$
  select jsonb_build_object(
    'gigs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'date', g.doc->'date', 'time', g.doc->'time', 'doors', g.doc->'doors',
        'city', g.doc->'city', 'venue', g.doc->'venue', 'address', g.doc->'address',
        'status', g.doc->'status', 'ticketing', g.doc->'ticketing', 'externalUrl', g.doc->'externalUrl')
        order by g.date)
      from besta.gigs g where g.published and coalesce(g.doc->>'status', '') <> 'cancelado'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'gigId', e.gig_id, 'name', e.doc->'name', 'description', e.doc->'description',
        'image', e.doc->'image', 'priceCents', e.doc->'priceCents', 'maxPerOrder', e.doc->'maxPerOrder',
        'salesEnabled', e.doc->'salesEnabled',
        'free', greatest(0, (e.doc->>'capacity')::int - besta.taken_seats(e.id))))
      from besta.events e join besta.gigs g on g.id = e.gig_id where g.published), '[]'::jsonb),
    'products', coalesce((select jsonb_agg((p.doc - 'costCents') || jsonb_build_object('id', p.id))
      from besta.products p where not coalesce((p.doc->>'archived')::boolean, false)), '[]'::jsonb)
  )
$$;

-- ---------- quién puede llamar a qué ----------
revoke execute on all functions in schema besta from public, anon;
grant execute on function besta.can(text), besta.is_admin(), besta.is_member(), besta.role_scopes(text) to authenticated;
grant execute on function besta.patch_doc(text, text, jsonb), besta.scan_ticket(text, text), besta.adjust_stock(text, text, int, boolean) to authenticated;
grant execute on function besta.get_order(text), besta.public_site() to anon, authenticated;
grant execute on all functions in schema besta to service_role;

-- ---------- archivos ----------
-- musica: audios de ensayos y demos de composición (privado, la banda).
-- recibos: fotos de tickets de gastos (privado, finanzas).
-- web: imágenes de eventos y merch (público, como las de la web).
insert into storage.buckets (id, name, public) values
  ('musica', 'musica', false), ('recibos', 'recibos', false), ('web', 'web', true)
on conflict (id) do nothing;

drop policy if exists besta_musica on storage.objects;
create policy besta_musica on storage.objects for all to authenticated
  using (bucket_id = 'musica' and (besta.can('ensayos') or besta.can('composicion')))
  with check (bucket_id = 'musica' and (besta.can('ensayos') or besta.can('composicion')));

drop policy if exists besta_recibos on storage.objects;
create policy besta_recibos on storage.objects for all to authenticated
  using (bucket_id = 'recibos' and besta.can('finanzas'))
  with check (bucket_id = 'recibos' and besta.can('finanzas'));

drop policy if exists besta_web_read on storage.objects;
create policy besta_web_read on storage.objects for select to anon, authenticated using (bucket_id = 'web');
drop policy if exists besta_web_write on storage.objects;
create policy besta_web_write on storage.objects for all to authenticated
  using (bucket_id = 'web' and (besta.can('entradas') or besta.can('bolos') or besta.can('merch')))
  with check (bucket_id = 'web' and (besta.can('entradas') or besta.can('bolos') or besta.can('merch')));

-- ---------- cambios en directo ----------
-- La suite se refresca sola cuando otro cambia algo (o entra una
-- compra). Realtime respeta las políticas: cada uno solo recibe lo suyo.
do $$
declare t text;
begin
  foreach t in array array[
    'members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
    'quotes','leads','products','moves','requests','expenses','incomes','settlements','audit','categories'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table besta.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
