-- Tipos de entrada por evento y venta en taquilla.
--
-- Los tipos viven dentro del doc del evento (events.doc->'types'):
--   { id, name, priceCents, channel: online|puerta|ambos, limit?, salesStart?, salesEnd?, active, note? }
-- Un evento sin tipos vende una sola «general» a priceCents, como hasta ahora.
--
-- Los pedidos llevan sus líneas (items: [{ typeId, name, qty, unitCents }]),
-- el canal (online | puerta) y, en taquilla, cómo se cobró (efectivo | bizum |
-- tarjeta) y quién vendió. Las entradas de taquilla nacen ya «dentro»
-- (quien paga en la puerta entra en ese momento).
--
-- reserve_order (la de antes) se queda tal cual para que la función de
-- checkout vieja siga funcionando mientras se despliega la nueva.

-- ---------- tipos ----------
create or replace function besta.event_types(e jsonb) returns jsonb
language sql immutable set search_path = besta, public as $$
  select case
    when jsonb_typeof(e->'types') = 'array' and jsonb_array_length(e->'types') > 0 then e->'types'
    else jsonb_build_array(jsonb_build_object(
      'id', 'general', 'name', 'general', 'priceCents', coalesce((e->>'priceCents')::int, 0),
      'channel', 'ambos', 'active', true))
  end
$$;

-- Ocupadas de un tipo: entradas emitidas (no canceladas, sin invitaciones)
-- + pedidos en pago de los últimos 32 minutos (como taken_seats).
create or replace function besta.type_taken(ev text, tid text) returns integer
language sql stable security definer set search_path = besta, public as $$
  select
    (select count(*) from besta.tickets t
      where t.event_id = ev and t.status <> 'cancelada'
        and coalesce(t.doc->>'kind', 'general') = 'general'
        and coalesce(t.doc->>'typeId', 'general') = tid)::int
  + coalesce((select sum((i->>'qty')::int)
      from besta.orders o,
           jsonb_array_elements(coalesce(o.doc->'items',
             jsonb_build_array(jsonb_build_object('typeId', 'general', 'qty', o.doc->'qty')))) i
      where o.event_id = ev and o.status = 'pendiente' and o.created_at > now() - interval '32 minutes'
        and i->>'typeId' = tid), 0)::int
$$;

-- ---------- crear un pedido (en pago) ----------
-- Comprueba tipos, canal, fechas, límites por tipo y aforo con el evento
-- bloqueado. Solo la llaman las Edge Functions (clave de servidor) y
-- door_sale; nunca el navegador directamente.
create or replace function besta.make_order(
  ev text, want jsonb, channel text, email text, newsletter boolean, method text default null, sold_by text default null
) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  e jsonb;
  types jsonb;
  w jsonb;
  t jsonb;
  q int;
  lim int;
  taken int;
  total int := 0;
  amount int := 0;
  items jsonb := '[]'::jsonb;
  cap int;
  n int;
  o_id text := 'ord-' || replace(gen_random_uuid()::text, '-', '');
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
  num int;
  order_doc jsonb;
begin
  if channel is null or channel not in ('online', 'puerta') then raise exception 'Canal de venta no válido.'; end if;
  select doc into e from besta.events where id = ev for update;
  if e is null then raise exception 'Este evento ya no existe.'; end if;

  if channel = 'online' then
    if not coalesce((e->>'salesEnabled')::boolean, false) then raise exception 'La venta de este concierto está cerrada.'; end if;
    if e ? 'salesEnd' and (e->>'salesEnd')::timestamptz < now() then raise exception 'La venta online ya ha terminado.'; end if;
  elsif method is null or method not in ('efectivo', 'bizum', 'tarjeta') then
    raise exception 'Forma de pago no válida.';
  end if;

  if jsonb_typeof(want) is distinct from 'array' or jsonb_array_length(want) > 20 then raise exception 'Revisa las entradas.'; end if;
  types := besta.event_types(e);

  for w in select value from jsonb_array_elements(want) loop
    if jsonb_typeof(w->'qty') is distinct from 'number' then raise exception 'Revisa cuántas entradas.'; end if;
    q := (w->>'qty')::numeric;
    if q < 0 or q::numeric <> (w->>'qty')::numeric then raise exception 'Revisa cuántas entradas.'; end if;
    continue when q = 0;

    select x into t from jsonb_array_elements(types) x where x->>'id' = w->>'typeId';
    if t is null then raise exception 'Ese tipo de entrada ya no existe.'; end if;
    if not coalesce((t->>'active')::boolean, true) then raise exception '«%» no está a la venta ahora.', t->>'name'; end if;

    if channel = 'online' then
      if t->>'channel' = 'puerta' then raise exception '«%» solo se vende en taquilla.', t->>'name'; end if;
      if t ? 'salesStart' and (t->>'salesStart')::timestamptz > now() then raise exception '«%» aún no está a la venta.', t->>'name'; end if;
      if t ? 'salesEnd' and (t->>'salesEnd')::timestamptz < now() then raise exception 'La venta de «%» ya ha terminado.', t->>'name'; end if;
    elsif t->>'channel' = 'online' then
      raise exception '«%» no se vende en taquilla.', t->>'name';
    end if;

    if coalesce((t->>'priceCents')::int, 0) <= 0 then raise exception '«%» no tiene precio.', t->>'name'; end if;

    lim := (t->>'limit')::int;
    if lim is not null then
      taken := besta.type_taken(ev, t->>'id');
      if taken + q > lim then
        if lim - taken > 0 then raise exception 'De «%» solo quedan %.', t->>'name', lim - taken; end if;
        raise exception '«%» está agotada.', t->>'name';
      end if;
    end if;

    items := items || jsonb_build_array(jsonb_build_object(
      'typeId', t->>'id', 'name', t->>'name', 'qty', q, 'unitCents', (t->>'priceCents')::int));
    total := total + q;
    amount := amount + q * (t->>'priceCents')::int;
  end loop;

  if total < 1 then raise exception 'Elige al menos una entrada.'; end if;
  if channel = 'online' and total > coalesce((e->>'maxPerOrder')::int, 10) then
    raise exception 'Puedes comprar entre 1 y % entradas.', coalesce((e->>'maxPerOrder')::int, 10);
  end if;
  if total > 50 then raise exception 'Como mucho 50 entradas de una vez.'; end if;

  cap := (e->>'capacity')::int;
  n := besta.taken_seats(ev);
  if n + total > cap then
    if cap - n > 0 then raise exception 'Solo quedan % entradas.', cap - n; end if;
    raise exception 'No quedan entradas: aforo completo.';
  end if;

  num := nextval('besta.order_number_seq');
  order_doc := jsonb_build_object(
    'id', o_id, 'number', num, 'eventId', ev, 'email', lower(trim(coalesce(email, ''))),
    'qty', total, 'amountCents', amount, 'items', items, 'channel', channel,
    'status', 'pendiente', 'newsletter', coalesce(newsletter, false), 'createdAt', now(), 'token', tok);
  if channel = 'puerta' then
    order_doc := order_doc || jsonb_build_object('method', method, 'soldBy', coalesce(nullif(trim(sold_by), ''), 'taquilla'));
  end if;
  insert into besta.orders (id, doc) values (o_id, order_doc);
  return order_doc;
end $$;

-- ---------- pago confirmado ----------
-- Igual que antes (idempotente, un QR por entrada) pero con el tipo en
-- cada entrada. Las de taquilla nacen «dentro». session puede ir vacío
-- (efectivo, Bizum).
create or replace function besta.fulfill_order(o_id text, session text) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  o jsonb;
  it jsonb;
  i int;
  code text;
  tdoc jsonb;
  door boolean;
begin
  select doc into o from besta.orders where id = o_id for update;
  if o is null then raise exception 'Pedido % no encontrado', o_id; end if;
  if o->>'status' = 'pagado' then return o; end if;
  update besta.orders
     set doc = doc || jsonb_build_object('status', 'pagado', 'paidAt', now()),
         stripe_session = coalesce(session, stripe_session)
   where id = o_id;
  door := o->>'channel' = 'puerta';
  for it in select value from jsonb_array_elements(coalesce(o->'items',
      jsonb_build_array(jsonb_build_object('qty', o->'qty')))) loop
    for i in 1..coalesce((it->>'qty')::int, 0) loop
      loop
        code := 'BST-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
        exit when not exists (select 1 from besta.tickets where id = code);
      end loop;
      tdoc := jsonb_build_object('code', code, 'orderId', o_id, 'eventId', o->>'eventId', 'kind', 'general', 'status', 'valida');
      if it ? 'typeId' then tdoc := tdoc || jsonb_build_object('typeId', it->>'typeId', 'typeName', it->>'name'); end if;
      if door then
        tdoc := tdoc || jsonb_build_object('status', 'usada', 'checkedInAt', now(), 'checkedInBy', coalesce(o->>'soldBy', 'taquilla'));
      end if;
      insert into besta.tickets (id, doc) values (code, tdoc);
    end loop;
  end loop;
  select doc into o from besta.orders where id = o_id;
  return o;
end $$;

-- ---------- taquilla: efectivo y Bizum ----------
-- Quien lleva la puerta cobra y aquí se apunta: pedido pagado y
-- entradas ya dentro. La tarjeta va por Stripe (Edge Function «taquilla»).
create or replace function besta.door_sale(ev text, want jsonb, method text) returns jsonb
language plpgsql security definer set search_path = besta, public as $$
declare
  who text;
  o jsonb;
begin
  if not (besta.can('puerta') or besta.can('entradas')) then raise exception 'Sin permiso para la taquilla.'; end if;
  if method is null or method not in ('efectivo', 'bizum') then raise exception 'Con tarjeta se cobra con el QR de Stripe.'; end if;
  select doc->>'name' into who from besta.members where user_id = auth.uid();
  o := besta.make_order(ev, want, 'puerta', '', false, method, who);
  return besta.fulfill_order(o->>'id', null);
end $$;

-- ---------- web pública ----------
-- Lo de siempre más los tipos que se venden online (con lo que queda
-- de cada uno). Nada de límites ni ventas: solo lo que hay que enseñar.
create or replace function besta.public_site() returns jsonb
language sql stable security definer set search_path = besta, public as $$
  select jsonb_build_object(
    'gigs', coalesce((select jsonb_agg(besta.public_gig(g.id, g.doc) order by g.date)
      from besta.gigs g where besta.public_gig(g.id, g.doc) is not null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'gigId', e.gig_id, 'name', e.doc->'name', 'description', e.doc->'description',
        'image', e.doc->'image', 'priceCents', e.doc->'priceCents', 'maxPerOrder', e.doc->'maxPerOrder',
        'salesEnabled', e.doc->'salesEnabled',
        'free', f.free,
        'types', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', t->>'id', 'name', t->'name', 'priceCents', t->'priceCents', 'note', t->'note',
              'channel', t->'channel', 'active', true,
              'salesStart', t->'salesStart', 'salesEnd', t->'salesEnd',
              'free', case when t ? 'limit' and t->>'limit' is not null
                        then greatest(0, least(f.free, (t->>'limit')::int - besta.type_taken(e.id, t->>'id')))
                        else f.free end)))
            from jsonb_array_elements(besta.event_types(e.doc)) t
            where coalesce((t->>'active')::boolean, true) and coalesce(t->>'channel', 'ambos') <> 'puerta'), '[]'::jsonb)))
      from besta.events e
      join besta.gigs g on g.id = e.gig_id
      cross join lateral (select greatest(0, (e.doc->>'capacity')::int - besta.taken_seats(e.id)) as free) f
      where g.published and jsonb_typeof(g.doc->'teaser') is distinct from 'object'), '[]'::jsonb),
    'products', coalesce((select jsonb_agg((p.doc - 'costCents') || jsonb_build_object('id', p.id))
      from besta.products p
      where coalesce((p.doc->>'published')::boolean, false)
        and not coalesce((p.doc->>'archived')::boolean, false)), '[]'::jsonb)
  )
$$;

-- ---------- permisos ----------
revoke execute on function besta.event_types(jsonb), besta.type_taken(text, text),
  besta.make_order(text, jsonb, text, text, boolean, text, text), besta.fulfill_order(text, text),
  besta.door_sale(text, jsonb, text) from public, anon;
grant execute on function besta.door_sale(text, jsonb, text) to authenticated;
grant execute on function besta.public_site() to anon, authenticated;
grant execute on function besta.event_types(jsonb), besta.type_taken(text, text),
  besta.make_order(text, jsonb, text, text, boolean, text, text), besta.fulfill_order(text, text),
  besta.door_sale(text, jsonb, text) to service_role;
