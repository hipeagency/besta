-- =========================================================
-- Superadmin. Los admins de la banda siguen viéndolo y cambiándolo
-- todo, pero solo el superadmin (Maxim):
--   · da o quita el admin, y toca rol, módulos o acceso de otro admin
--   · borra usuarios
-- Los admins pueden invitar y ajustar a músicos y staff.
--
-- Va en una columna aparte, no en el doc: patch_doc solo toca el doc,
-- así que nadie puede hacerse superadmin desde la app. Se cambia solo
-- desde el servidor (SQL o service role).
-- =========================================================

alter table besta.members add column if not exists owner boolean not null default false;
update besta.members set owner = true where id = 'maxim';

create or replace function besta.is_owner() returns boolean
language sql stable security definer set search_path = besta, public as $$
  select exists (select 1 from besta.members where user_id = auth.uid() and active and owner)
$$;
revoke execute on function besta.is_owner() from public, anon;
grant execute on function besta.is_owner() to authenticated, service_role;

-- Altas y cambios: admin. Borrar: solo el superadmin.
drop policy if exists members_admin on besta.members;
drop policy if exists members_admin_insert on besta.members;
create policy members_admin_insert on besta.members for insert to authenticated with check (besta.is_admin());
drop policy if exists members_admin_update on besta.members;
create policy members_admin_update on besta.members for update to authenticated using (besta.is_admin()) with check (besta.is_admin());
drop policy if exists members_owner_delete on besta.members;
create policy members_owner_delete on besta.members for delete to authenticated using (besta.is_owner());

create or replace function besta.members_guard() returns trigger language plpgsql security definer set search_path = besta, public as $$
declare
  was_admin boolean := tg_op = 'UPDATE' and coalesce(old.doc->>'role', 'musico') = 'admin';
  now_admin boolean := tg_op <> 'DELETE' and coalesce(new.doc->>'role', 'musico') = 'admin';
begin
  -- Al superadmin no se le quita nada, ni desde el servidor (antes hay que bajarle owner a mano).
  if tg_op = 'DELETE' then
    if old.owner then raise exception 'Al superadmin no se le puede borrar.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.owner and new.owner
     and (not now_admin or not coalesce((new.doc->>'active')::boolean, true)) then
    raise exception 'Al superadmin no se le quita el admin ni el acceso.';
  end if;

  if auth.uid() is null then return new; end if;  -- servidor
  if new.owner and (tg_op = 'INSERT' or not old.owner) or (tg_op = 'UPDATE' and old.owner and not new.owner) then
    raise exception 'El superadmin solo se cambia desde el servidor.';
  end if;
  if besta.is_owner() then return new; end if;

  if tg_op = 'INSERT' then
    if now_admin then raise exception 'Solo el superadmin puede dar el admin.'; end if;
    return new;
  end if;

  if (new.doc->>'role') is distinct from (old.doc->>'role')
     or (new.doc->'scopes') is distinct from (old.doc->'scopes')
     or (new.doc->'active') is distinct from (old.doc->'active')
     or new.user_id is distinct from old.user_id then
    if not besta.is_admin() then raise exception 'Solo un admin puede cambiar permisos.'; end if;
    if was_admin or now_admin then
      raise exception 'Solo el superadmin puede dar o quitar el admin, o cambiar los permisos de otro admin.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists members_guard on besta.members;
create trigger members_guard before insert or update or delete on besta.members for each row execute function besta.members_guard();
