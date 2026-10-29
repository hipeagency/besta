-- =========================================================
-- 1. Ajustes de la banda (besta.settings): un documento por tema.
--    De momento «checklist»: las tareas a mano de todos los bolos.
--    Lo ven todos los miembros; lo cambia quien lleva bolos.
-- 2. Bolos con lo que se sepa: sin fecha (date ""), solo con el mes
--    (doc.dateTbc, date = último día del mes) o sin hora. En la web,
--    un bolo con dateTbc sale con mes y año, sin día ni hora.
--    Festival o evento (doc.event, «Sonorama Ribera»): sale en la web; en
--    secreto, solo si se desvela (teaser.event).
-- 3. Bolos en secreto: la fecha se desvela exacta o con mes y año. El
--    «oculta» de antes pasa a enseñar mes y año (lo pidió la banda).
-- =========================================================

create table if not exists besta.settings (
  id          text primary key,
  doc         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  legacy      jsonb
);

drop trigger if exists settings_touch on besta.settings;
create trigger settings_touch before update on besta.settings for each row execute function besta.touch();

grant select, insert, update, delete on besta.settings to authenticated;
grant all on besta.settings to service_role;

alter table besta.settings enable row level security;
drop policy if exists settings_read on besta.settings;
create policy settings_read on besta.settings for select to authenticated using (besta.is_member());
drop policy if exists settings_write on besta.settings;
create policy settings_write on besta.settings for all to authenticated using (besta.can('bolos')) with check (besta.can('bolos'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'besta' and tablename = 'settings') then
    alter publication supabase_realtime add table besta.settings;
  end if;
end $$;

-- patch_doc: igual que antes, con settings en la lista.
create or replace function besta.patch_doc(tbl text, row_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = besta, public as $$
declare n int;
begin
  if tbl not in ('members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
                 'quotes','leads','products','moves','requests','subscribers',
                 'expenses','incomes','settlements','audit','categories','settings') then
    raise exception 'Colección desconocida: %', tbl;
  end if;
  execute format(
    'update besta.%I set doc = (doc - array(select k from jsonb_each($1) as e(k, v) where v = ''null''::jsonb))'
    ' || (select coalesce(jsonb_object_agg(k, v), ''{}''::jsonb) from jsonb_each($1) as e(k, v) where v <> ''null''::jsonb)'
    ' where id = $2', tbl) using patch, row_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No existe % %', tbl, row_id; end if;
end $$;

-- Lo que la web puede ver de un bolo (null si no sale). Misma firma.
create or replace function besta.public_gig(id text, doc jsonb) returns jsonb
language sql immutable set search_path = besta, public as $$
  select case
    when not coalesce((doc->>'published')::boolean, false) or coalesce(doc->>'status', '') = 'cancelado' then null
    when jsonb_typeof(doc->'teaser') = 'object' then jsonb_build_object(
      'id', 'secreto-' || left(md5(id), 10),
      'status', 'confirmado', 'ticketing', 'ninguna',
      'teaser', case when doc->'teaser'->>'date' = 'exacta' and not coalesce((doc->>'dateTbc')::boolean, false)
                     then doc->'teaser' else jsonb_set(doc->'teaser', '{date}', '"mes"') end,
      -- «mes» (mes y año; el «oculta» de antes cuenta igual): el último día,
      -- para que no cuente como pasado antes de tiempo. Si del bolo solo se
      -- sabe el mes, «exacta» tampoco puede desvelar más.
      'date', case
        when coalesce(doc->>'date', '') = '' then to_jsonb(''::text)
        when doc->'teaser'->>'date' = 'exacta' and not coalesce((doc->>'dateTbc')::boolean, false) then doc->'date'
        else to_jsonb(to_char(date_trunc('month', (doc->>'date')::date) + interval '1 month - 1 day', 'YYYY-MM-DD')) end,
      'time', case when doc->'teaser'->>'date' = 'exacta' and not coalesce((doc->>'dateTbc')::boolean, false) then doc->'time' else to_jsonb(''::text) end,
      'city', case when coalesce((doc->'teaser'->>'city')::boolean, false) then doc->'city' else to_jsonb(''::text) end,
      'venue', case when coalesce((doc->'teaser'->>'venue')::boolean, false) then doc->'venue' else to_jsonb(''::text) end)
      || case when coalesce((doc->'teaser'->>'event')::boolean, false) and coalesce(doc->>'event', '') <> '' then jsonb_build_object('event', doc->'event') else '{}'::jsonb end
    else jsonb_build_object(
      'id', id, 'date', doc->'date', 'time', doc->'time', 'doors', doc->'doors',
      'city', doc->'city', 'venue', doc->'venue', 'address', doc->'address',
      'status', doc->'status', 'ticketing', doc->'ticketing', 'externalUrl', doc->'externalUrl')
      || case when coalesce((doc->>'soldOut')::boolean, false) then '{"soldOut": true}'::jsonb else '{}'::jsonb end
      || case when coalesce(doc->>'event', '') <> '' then jsonb_build_object('event', doc->'event') else '{}'::jsonb end
      -- solo el mes: ni día ni hora (el día guardado es el último del mes)
      || case when coalesce((doc->>'dateTbc')::boolean, false) then '{"dateTbc": true, "time": "", "doors": null}'::jsonb else '{}'::jsonb end
  end
$$;
