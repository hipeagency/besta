-- =========================================================
-- Merch que no sale en la web.
--
-- Hasta ahora salía todo lo no archivado. Ahora un producto sale solo
-- con doc.published (el interruptor «visible en la web» de la ficha);
-- los nuevos nacen ocultos. Los que ya había siguen saliendo.
-- =========================================================

update besta.products set doc = doc || '{"published": true}'::jsonb
where doc->'published' is null and not coalesce((doc->>'archived')::boolean, false);

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
      from besta.products p
      where coalesce((p.doc->>'published')::boolean, false)
        and not coalesce((p.doc->>'archived')::boolean, false)), '[]'::jsonb)
  )
$$;
