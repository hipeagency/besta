-- =========================================================
-- besta v2 · tareas programadas (pg_cron + pg_net)
--
-- Llaman a las Edge Functions con la cabecera x-cron-secret. La URL y
-- el secreto viven en Vault, no aquí. Antes de aplicar esto, una vez:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
--   select vault.create_secret('<el mismo CRON_SECRET de las funciones>', 'cron_secret');
--
-- pg_cron va en UTC: para «las 06:00 de Madrid» todo el año se programa
-- a las 04:00 y 05:00 UTC y solo dispara la que cae a las 6 en Madrid
-- (horario de verano o de invierno).
-- =========================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function besta.call_function(fn text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if base is null or secret is null then
    raise warning 'Faltan los secretos functions_url / cron_secret en Vault';
    return null;
  end if;
  return net.http_post(
    url := rtrim(base, '/') || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function besta.call_function(text) from public, anon, authenticated;

-- Volver a aplicar la migración no duplica tareas.
select cron.unschedule(jobname) from cron.job where jobname in ('besta-bandsintown', 'besta-reminders');

select cron.schedule('besta-bandsintown', '0 4,5 * * *', $$
  select besta.call_function('bandsintown-import')
  where extract(hour from now() at time zone 'Europe/Madrid') = 6
$$);

-- Cada hora (a y 10, para no coincidir con todo lo que corre en punto).
select cron.schedule('besta-reminders', '10 * * * *', $$
  select besta.call_function('reminders')
$$);
