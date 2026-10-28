-- =========================================================
-- 1. Sold out. Un bolo con doc.soldOut sale en la web con el cartel
--    y sin botón de entradas. Solo en la rama pública: un bolo en
--    secreto no vende, así que no tiene nada que agotar. Misma firma
--    que antes (los triggers *_rebuild_web la comparan).
-- 2. patch_doc: un campo a null se BORRA del doc. Antes `doc || patch`
--    dejaba la clave con null (o, si la app mandaba undefined, la
--    antigua tal cual), así que vaciar un campo no lo vaciaba.
-- =========================================================

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
      -- sin sold out el resultado es idéntico al de antes: no recompila nada
      || case when coalesce((doc->>'soldOut')::boolean, false) then '{"soldOut": true}'::jsonb else '{}'::jsonb end
  end
$$;

create or replace function besta.patch_doc(tbl text, row_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = besta, public as $$
declare n int;
begin
  if tbl not in ('members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
                 'quotes','leads','products','moves','requests','subscribers',
                 'expenses','incomes','settlements','audit','categories') then
    raise exception 'Colección desconocida: %', tbl;
  end if;
  execute format(
    'update besta.%I set doc = (doc - array(select k from jsonb_each($1) as e(k, v) where v = ''null''::jsonb))'
    ' || (select coalesce(jsonb_object_agg(k, v), ''{}''::jsonb) from jsonb_each($1) as e(k, v) where v <> ''null''::jsonb)'
    ' where id = $2', tbl) using patch, row_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No existe % %', tbl, row_id; end if;
end $$;
