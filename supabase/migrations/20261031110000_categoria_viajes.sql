-- Finanzas: la categoría «traslado» pasa a llamarse «viajes», también en
-- los gastos que ya la tenían. Las categorías nuevas se crean desde la
-- suite al apuntar un gasto.
insert into besta.categories (id, doc) values ('viajes', '{"name": "viajes"}'::jsonb) on conflict (id) do nothing;
update besta.expenses set doc = jsonb_set(doc, '{category}', '"viajes"') where doc->>'category' = 'traslado';
delete from besta.categories where id = 'traslado';
