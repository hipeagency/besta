-- patch_doc fallaba siempre: EXECUTE no actualiza FOUND, así que tras un
-- update correcto seguía en false y lanzaba «No existe» (deshaciendo el
-- cambio). Se cuenta con ROW_COUNT.
create or replace function besta.patch_doc(tbl text, row_id text, patch jsonb) returns void
language plpgsql security invoker set search_path = besta, public as $$
declare n int;
begin
  if tbl not in ('members','gigs','events','orders','tickets','songs','setlists','ideas','riders',
                 'quotes','leads','products','moves','requests','subscribers',
                 'expenses','incomes','settlements','audit','categories') then
    raise exception 'Colección desconocida: %', tbl;
  end if;
  execute format('update besta.%I set doc = doc || $1 where id = $2', tbl) using patch, row_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No existe % %', tbl, row_id; end if;
end $$;
