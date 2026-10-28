#!/usr/bin/env python3
"""Aplica al proyecto real las migraciones de supabase/migrations que aún
no estén en supabase_migrations.schema_migrations. Cada una va en su
propia transacción: si falla, no queda a medias y el script se para.

Uso (desde besta-v2):  python3 scripts/apply-migrations.py
"""
import json, os, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for l in open(os.path.join(ROOT, "supabase", ".env.local")):
    if "=" in l and not l.lstrip().startswith("#"):
        k, v = l.rstrip("\n").split("=", 1)
        env[k.strip()] = v.strip()
P = env["SUPABASE_PROJECT_REF"]


def query(q):
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{P}/database/query",
                               data=json.dumps({"query": q}).encode(), method="POST",
                               headers={"Authorization": "Bearer " + env["SUPABASE_ACCESS_TOKEN"],
                                        "content-type": "application/json", "user-agent": "curl/8.7.1"})
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ {e.code}: {e.read()[:500].decode(errors='replace')}")


done = {r["version"] for r in query("select version from supabase_migrations.schema_migrations")}
folder = os.path.join(ROOT, "supabase", "migrations")
pending = [f for f in sorted(os.listdir(folder)) if f.endswith(".sql") and f.split("_", 1)[0] not in done]
if not pending:
    print("Nada pendiente.")
for f in pending:
    v, n = f[:-4].split("_", 1)
    body = open(os.path.join(folder, f)).read()
    query(f"begin;\n{body}\ninsert into supabase_migrations.schema_migrations(version, name) values ('{v}', '{n}');\ncommit;")
    print(f"✓ {f}")
