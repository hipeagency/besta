#!/usr/bin/env python3
"""Arregla el merch que vino de la suite antigua (migrate-legacy.mjs).

En la suite antigua una reserva NO restaba stock (el stock era lo que
había en la caja); en la v2 sí lo aparta al apuntarse (el stock es lo
libre). Además, al entregar, la antigua creaba una venta aparte y dejaba
la reserva cerrada; la v2 convierte la propia reserva en venta. Así que:

  1. Reservas migradas aún abiertas → se resta su cantidad del stock
     (si no, esas unidades se podrían vender dos veces).
  2. Reservas migradas ya cerradas → se borran; su venta gemela guarda
     cuándo se reservó (reservedAt). Las anuladas, también fuera.
  3. Ventas con «bolo: X» en la nota → se enlazan a ese bolo (gigId).
  4. «maximestebanc» → Maxim y «thedng13» → Víctor en «atendió».

Solo toca filas migradas (legacy no nulo). Idempotente: cada arreglo
deja una marca y no se repite. El registro original sigue en
public.merch_movements y en la columna legacy.

Uso (desde besta-v2):
  python3 scripts/fix-merch-legacy.py           # simulación: no escribe
  python3 scripts/fix-merch-legacy.py --apply   # escribe, en una transacción
"""
import json, os, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = dict(l.rstrip("\n").split("=", 1) for l in open(os.path.join(ROOT, "supabase", ".env.local")) if "=" in l and not l.lstrip().startswith("#"))
P, TOKEN = env["SUPABASE_PROJECT_REF"].strip(), env["SUPABASE_ACCESS_TOKEN"].strip()
APPLY = "--apply" in sys.argv
BY = {"maximestebanc": "Maxim", "thedng13": "Víctor"}


def sql(q):
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{P}/database/query", data=json.dumps({"query": q}).encode(), method="POST",
                               headers={"Authorization": "Bearer " + TOKEN, "content-type": "application/json", "user-agent": "curl/8.7.1"})
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read() or b"[]")
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ SQL: {e.code} {e.read()[:400]}")


# Reservas cerradas → su venta gemela: misma talla, cliente, cantidad y precio, posterior, la primera libre.
PAIRS = """
with r as (
  select id, doc from besta.moves
  where legacy is not null and doc->>'kind' = 'reserva' and not coalesce((doc->>'open')::boolean, false)
), v as (
  select id, doc from besta.moves where legacy is not null and doc->>'kind' = 'venta' and doc->'reservedAt' is null
)
select r.id as reserve_id, r.doc as reserve, coalesce((r.doc->>'cancelled')::boolean, false) as cancelled,
  (select v.id from v where v.doc->>'variantId' = r.doc->>'variantId'
     and lower(coalesce(v.doc->>'customer','')) = lower(coalesce(r.doc->>'customer',''))
     and v.doc->>'qty' = r.doc->>'qty' and v.doc->>'unitCents' = r.doc->>'unitCents'
     and v.doc->>'at' >= r.doc->>'at'
   order by v.doc->>'at' limit 1) as sale_id
from r order by r.doc->>'at'
"""

products = {p["id"]: p["doc"] for p in sql("select id, doc from besta.products")}
name = lambda d: (products.get(d["productId"], {}).get("name", "?") + " " + next((v["label"] for v in products.get(d["productId"], {}).get("variants", []) if v["id"] == d["variantId"]), "?")).strip()

print("1 · reservas abiertas que no restaron stock")
opened = sql("select id, doc from besta.moves where legacy is not null and doc->>'kind' = 'reserva' and coalesce((doc->>'open')::boolean, false) and doc->'stockFixed' is null order by doc->>'at'")
for r in opened:
    d = r["doc"]
    print(f"   −{-int(d['qty'])} {name(d)} · {d.get('customer','?')}")
if not opened: print("   nada")

print("2 · reservas cerradas (se borran; la venta guarda la fecha de reserva)")
pairs = sql(PAIRS)
used = set()
for p in pairs:
    d = p["reserve"]
    sale = p["sale_id"] if p["sale_id"] not in used and not p["cancelled"] else None
    if sale: used.add(sale)
    p["sale_id"] = sale
    what = "anulada → fuera" if p["cancelled"] else (f"→ venta {sale[:8]}" if sale else "SIN venta gemela → se deja")
    print(f"   {-int(d['qty'])}× {name(d)} · {d.get('customer','?')} · {d['at'][:10]} · {what}")

print("3 · ventas con el bolo en la nota")
gigs = sql("select id, doc->>'city' as city, doc->>'date' as date from besta.gigs order by date")
# Bolos pasados que la suite antigua no tenía como tales y la v2 necesita para enlazar las ventas.
# Se crean ocultos en la web.
PAST = [{"id": "benicarlo-2026-08-29", "date": "2026-08-29", "time": "22:00", "city": "Benicarló", "venue": "El Catxull",
         "status": "confirmado", "published": False, "ticketing": "ninguna", "schedule": [], "contacts": [], "checklist": {}}]
new_gigs = [g for g in PAST if not any(x["id"] == g["id"] or (x["city"] == g["city"] and x["date"] == g["date"]) for x in gigs)]
for g in new_gigs:
    print(f"   + bolo pasado {g['city']} · {g['venue']} · {g['date']} (oculto en la web)")
gigs += [{"id": g["id"], "city": g["city"], "date": g["date"]} for g in new_gigs]
tagged = sql("select id, doc from besta.moves where legacy is not null and doc->>'note' ~ 'bolo: ' and doc->>'gigId' is null")
links = []
for t in tagged:
    d = t["doc"]
    place = d["note"].split("bolo: ", 1)[1].split(" · ")[0].strip()
    cands = [g for g in gigs if g["city"] and g["city"].lower() == place.lower() and g["date"] <= d["at"][:10]]
    g = cands[-1] if cands else None
    note = " · ".join(x for x in d["note"].split(" · ") if not x.startswith("bolo: "))
    links.append((t["id"], g and g["id"], note))
    print(f"   {-int(d['qty'])}× {name(d)} · «{place}» → {g['id'] if g else 'NO HAY BOLO con esa ciudad: se deja'}")

print("4 · nombres de quién atendía")
for k, v in BY.items():
    n = sql(f"select count(*) as n from besta.moves where legacy is not null and doc->>'by' = '{k}'")[0]["n"]
    print(f"   {k} → {v}: {n}")

if not APPLY:
    print("\nSimulación: no se ha escrito nada. Para aplicarlo: --apply")
    sys.exit()

q = lambda s: "'" + str(s).replace("'", "''") + "'"
stmts = []
for g in new_gigs:
    stmts.append(f"insert into besta.gigs (id, doc) values ({q(g['id'])}, {q(json.dumps(g, ensure_ascii=False))}::jsonb);")
for r in opened:
    d = r["doc"]
    stmts.append(f"perform besta.adjust_stock({q(d['productId'])}, {q(d['variantId'])}, {int(d['qty'])}, false);")
    stmts.append(f"update besta.moves set doc = doc || '{{\"stockFixed\": true}}' where id = {q(r['id'])};")
for p in pairs:
    if p["sale_id"]:
        stmts.append(f"update besta.moves set doc = doc || jsonb_build_object('reservedAt', {q(p['reserve']['at'])}) where id = {q(p['sale_id'])};")
    if p["sale_id"] or p["cancelled"]:
        stmts.append(f"delete from besta.moves where id = {q(p['reserve_id'])};")
for mid, gid, note in links:
    if gid:
        patch = {"gigId": gid, "note": note} if note else {"gigId": gid}
        stmts.append(f"update besta.moves set doc = (doc - 'note') || {q(json.dumps(patch, ensure_ascii=False))}::jsonb where id = {q(mid)};")
for k, v in BY.items():
    stmts.append(f"update besta.moves set doc = doc || {q(json.dumps({'by': v}, ensure_ascii=False))}::jsonb where legacy is not null and doc->>'by' = {q(k)};")

sql("do $$ begin\n" + "\n".join(stmts) + "\nend $$;")
print(f"\n✓ Aplicado ({len(stmts)} cambios, en una sola transacción).")
