-- Merch: encargos. Una reserva puede apuntarse aunque no haya stock: lo
-- libre de la talla queda en negativo (−2 = faltan 2 por pedir) y, al
-- reponer, lo que entra cubre primero esas reservas.
-- Antes, con allow_negative el resultado se recortaba a 0, y eso perdía
-- unidades: ahora se guarda tal cual. Sin allow_negative (vender, regalar,
-- borrar un apunte) sigue sin poder bajar de 0.
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
  if cur + delta < 0 and not allow_negative then raise exception 'No queda stock suficiente (quedan %).', greatest(0, cur); end if;
  update besta.products set doc = jsonb_set(doc, array['variants', idx::text, 'stock'], to_jsonb(cur + delta)) where id = product_id;
  return cur + delta;
end $$;
