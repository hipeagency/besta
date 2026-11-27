-- Entradas gratis: un tipo a 0 € sirve de registro de aforo (se
-- «compra» sin pagar, con su QR, y cuenta en el aforo como cualquiera).
-- Único cambio en make_order: el precio puede ser 0, no negativo.
-- Un pedido que suma 0 € no pasa por Stripe: lo emite la función
-- «checkout» al momento (fulfill_order sin sesión).
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

    if coalesce((t->>'priceCents')::int, -1) < 0 then raise exception '«%» no tiene precio.', t->>'name'; end if;

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
