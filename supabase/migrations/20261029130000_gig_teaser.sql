-- =========================================================
-- Bolos en secreto y web que se recompila sola.
--
-- 1. Un bolo con doc.teaser sale en la web como teaser: solo con lo
--    desvelado (fecha exacta, solo el mes o nada; ciudad; sala). Lo
--    demás no sale de la base de datos, y el id se cambia por uno que
--    no delata fecha ni ciudad. Sin venta de entradas hasta que sea público.
-- 2. La web es estática: cuando cambia algo de lo que enseña, se llama
--    al deploy hook de Cloudflare (URL en Vault, «deploy_hook_url»).
-- =========================================================

-- Lo que la web puede ver de un bolo (null si no sale).
create or replace function besta.public_gig(id text, doc jsonb) returns jsonb
language sql immutable set search_path = besta, public as $$
  select case
    when not coalesce((doc->>'published')::boolean, false) or coalesce(doc->>'status', '') = 'cancelado' then null
    when jsonb_typeof(doc->'teaser') = 'object' then jsonb_build_object(
      'id', 'secreto-' || left(md5(id), 10),
      'status', 'confirmado', 'ticketing', 'ninguna', 'teaser', doc->'teaser',
      -- «mes»: el último día, para que no cuente como pasado antes de tiempo.
      'date', case doc->'teaser'->>'date'
        when 'exacta' then doc->'date'
        when 'mes' then to_jsonb(to_char(date_trunc('month', (doc->>'date')::date) + interval '1 month - 1 day', 'YYYY-MM-DD'))
        else to_jsonb(''::text) end,
      'time', case when doc->'teaser'->>'date' = 'exacta' then doc->'time' else to_jsonb(''::text) end,
      'city', case when coalesce((doc->'teaser'->>'city')::boolean, false) then doc->'city' else to_jsonb(''::text) end,
      'venue', case when coalesce((doc->'teaser'->>'venue')::boolean, false) then doc->'venue' else to_jsonb(''::text) end)
    else jsonb_build_object(
      'id', id, 'date', doc->'date', 'time', doc->'time', 'doors', doc->'doors',
      'city', doc->'city', 'venue', doc->'venue', 'address', doc->'address',
      'status', doc->'status', 'ticketing', doc->'ticketing', 'externalUrl', doc->'externalUrl')
  end
$$;

create or replace function besta.public_site() returns jsonb
language sql stable security definer set search_path = besta, public as $$
  select jsonb_build_object(
    'gigs', coalesce((select jsonb_agg(besta.public_gig(g.id, g.doc) order by g.date)
      from besta.gigs g where besta.public_gig(g.id, g.doc) is not null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'gigId', e.gig_id, 'name', e.doc->'name', 'description', e.doc->'description',
        'image', e.doc->'image', 'priceCents', e.doc->'priceCents', 'maxPerOrder', e.doc->'maxPerOrder',
        'salesEnabled', e.doc->'salesEnabled',
        'free', greatest(0, (e.doc->>'capacity')::int - besta.taken_seats(e.id))))
      from besta.events e join besta.gigs g on g.id = e.gig_id
      where g.published and jsonb_typeof(g.doc->'teaser') is distinct from 'object'), '[]'::jsonb),
    'products', coalesce((select jsonb_agg((p.doc - 'costCents') || jsonb_build_object('id', p.id))
      from besta.products p where not coalesce((p.doc->>'archived')::boolean, false)), '[]'::jsonb)
  )
$$;

-- La venta solo se abre para bolos públicos (no en secreto).
create or replace function besta.event_is_public(ev text) returns boolean
language sql stable security definer set search_path = besta, public as $$
  select exists (select 1 from besta.events e join besta.gigs g on g.id = e.gig_id
                 where e.id = ev and g.published and jsonb_typeof(g.doc->'teaser') is distinct from 'object')
$$;
revoke execute on function besta.event_is_public(text) from public, anon, authenticated;
grant execute on function besta.event_is_public(text) to service_role;

-- ---------- recompilar la web ----------
create or replace function besta.rebuild_web() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text := (select decrypted_secret from vault.decrypted_secrets where name = 'deploy_hook_url');
begin
  if url is not null then
    perform net.http_post(url := url, body := '{}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return null;
end $$;
revoke execute on function besta.rebuild_web() from public, anon, authenticated;

-- Solo cuando cambia lo que la web enseña (editar notas o contactos no recompila).
drop trigger if exists gigs_rebuild_web on besta.gigs;
drop trigger if exists gigs_rebuild_web_new on besta.gigs;
drop trigger if exists gigs_rebuild_web_gone on besta.gigs;
create trigger gigs_rebuild_web after update on besta.gigs for each row
  when (besta.public_gig(old.id, old.doc) is distinct from besta.public_gig(new.id, new.doc))
  execute function besta.rebuild_web();
create trigger gigs_rebuild_web_new after insert on besta.gigs for each row
  when (besta.public_gig(new.id, new.doc) is not null) execute function besta.rebuild_web();
create trigger gigs_rebuild_web_gone after delete on besta.gigs for each row
  when (besta.public_gig(old.id, old.doc) is not null) execute function besta.rebuild_web();

drop trigger if exists events_rebuild_web on besta.events;
create trigger events_rebuild_web after insert or update or delete on besta.events
  for each statement execute function besta.rebuild_web();

drop trigger if exists products_rebuild_web on besta.products;
create trigger products_rebuild_web after insert or update or delete on besta.products
  for each statement execute function besta.rebuild_web();
