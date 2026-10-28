#!/usr/bin/env python3
"""Paso a producción de besta v2 sobre el proyecto real de Supabase.

Lee las claves de supabase/.env.local (no las imprime) y hace, en orden:
  1. Vault (URL de funciones y secreto del cron) + migraciones besta_v2 y cron
  2. Publica el esquema «besta» en la API
  3. Auth: URLs de vuelta y correo por Brevo (SMTP)
  4. Stripe real: IVA 10 % incluido y webhook
  5. Secretos de las funciones
  6. Sube las funciones
  7. Traspaso de datos: simulación, y solo si respondes «s», escritura

Las tablas antiguas (public.*) no se tocan. Se puede repetir: cada paso
comprueba lo que ya existe.

Uso (desde besta-v2):  python3 scripts/go-live.py
"""
import json, os, secrets, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENVF = os.path.join(ROOT, "supabase", ".env.local")
SITE = "https://besta.es"
WORKERS = "https://besta.bestamusicoficial.workers.dev"


def load():
    env = {}
    for l in open(ENVF):
        if "=" in l and not l.lstrip().startswith("#"):
            k, v = l.rstrip("\n").split("=", 1)
            env[k.strip()] = v.strip()
    return env


def save(k, v):
    lines = open(ENVF).read().splitlines()
    if any(l.split("=", 1)[0].strip() == k for l in lines):
        lines = [f"{k}={v}" if l.split("=", 1)[0].strip() == k else l for l in lines]
    else:
        lines.append(f"{k}={v}")
    open(ENVF, "w").write("\n".join(lines) + "\n")


def req(method, url, headers, body=None, form=False):
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body, doseq=True).encode() if form else json.dumps(body).encode()
        headers = {**headers, "content-type": "application/x-www-form-urlencoded" if form else "application/json"}
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"user-agent": "curl/8.7.1", "accept": "application/json", **headers})
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read()
            return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t[:300]


def ok(res, what):
    s, r = res
    if s >= 300:
        sys.exit(f"✗ {what}: {s} {r}")
    return r


env = load()
for k in ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "STRIPE_LIVE_KEY", "BREVO_API_KEY", "BREVO_SMTP_KEY", "BREVO_LIST_ID"]:
    if not env.get(k):
        sys.exit(f"Falta {k} en supabase/.env.local")
P = env["SUPABASE_PROJECT_REF"]
FN = f"https://{P}.supabase.co/functions/v1"
SB = {"Authorization": "Bearer " + env["SUPABASE_ACCESS_TOKEN"]}
ST = {"Authorization": "Bearer " + env["STRIPE_LIVE_KEY"]}
sbm = lambda m, path, body=None: req(m, "https://api.supabase.com/v1" + path, SB, body)
sql = lambda q: ok(sbm("POST", f"/projects/{P}/database/query", {"query": q}), "SQL")
lit = lambda v: "'" + v.replace("'", "''") + "'"

name = ok(sbm("GET", f"/projects/{P}"), "proyecto")["name"]
print(f"Proyecto: {name} ({P})\n")

# 1 · Vault + migraciones
if not env.get("PROD_CRON_SECRET"):
    save("PROD_CRON_SECRET", secrets.token_hex(24))
    env = load()
sql(f"select vault.create_secret({lit(FN)}, 'functions_url') where not exists (select 1 from vault.secrets where name='functions_url');"
    f"select vault.create_secret({lit(env['PROD_CRON_SECRET'])}, 'cron_secret') where not exists (select 1 from vault.secrets where name='cron_secret');")
done = {r["version"] for r in sql("select version from supabase_migrations.schema_migrations")}
for v, n in [("20261029100000", "besta_v2"), ("20261029110000", "cron")]:
    if v in done:
        print(f"· migración {n}: ya estaba")
        continue
    body = open(os.path.join(ROOT, "supabase", "migrations", f"{v}_{n}.sql")).read()
    sql(f"begin;\n{body}\ninsert into supabase_migrations.schema_migrations(version, name) values ('{v}', '{n}');\ncommit;")
    print(f"✓ migración {n}")

# 2 · Esquema en la API
pg = ok(sbm("GET", f"/projects/{P}/postgrest"), "postgrest")
schemas = [s.strip() for s in pg["db_schema"].split(",")]
if "besta" not in schemas:
    ok(sbm("PATCH", f"/projects/{P}/postgrest", {"db_schema": ",".join(schemas + ["besta"])}), "postgrest")
print("✓ esquema besta publicado")

# 3 · Auth
_, acc = req("GET", "https://api.brevo.com/v3/account", {"api-key": env["BREVO_API_KEY"]})
relay = acc["relay"]["data"]
ok(sbm("PATCH", f"/projects/{P}/config/auth", {
    "site_url": SITE,
    "uri_allow_list": ",".join([f"{SITE}/suite/**", f"https://www.besta.es/suite/**", f"{WORKERS}/suite/**",
                                "https://antigua.besta.es/**", "http://localhost:4321/suite/**"]),
    "disable_signup": True,
    "smtp_host": relay["relay"], "smtp_port": str(relay["port"]),
    "smtp_user": relay["userName"], "smtp_pass": env["BREVO_SMTP_KEY"],
    "smtp_admin_email": "besta@besta.es", "smtp_sender_name": "besta",
}), "auth")
print("✓ auth: URLs y correo por Brevo")

# 4 · Stripe real
assert env["STRIPE_LIVE_KEY"].startswith(("rk_live_", "sk_live_")), "STRIPE_LIVE_KEY no es de modo real"
if not env.get("PROD_STRIPE_TAX_RATE_ID"):
    tr = ok(req("POST", "https://api.stripe.com/v1/tax_rates", {**ST, "Idempotency-Key": "besta-iva-10-live"},
                {"display_name": "IVA", "percentage": "10", "inclusive": "true", "country": "ES", "jurisdiction": "ES",
                 "description": "IVA entradas espectáculos en directo", "tax_type": "vat"}, form=True), "IVA")
    save("PROD_STRIPE_TAX_RATE_ID", tr["id"])
hook_url = f"{FN}/stripe-webhook"
hooks = ok(req("GET", "https://api.stripe.com/v1/webhook_endpoints?limit=50", ST), "webhooks")["data"]
if not (env.get("PROD_STRIPE_WEBHOOK_SECRET") and any(h["url"] == hook_url for h in hooks)):
    w = ok(req("POST", "https://api.stripe.com/v1/webhook_endpoints", ST, {
        "url": hook_url, "description": "besta",
        "enabled_events[]": ["checkout.session.completed", "checkout.session.async_payment_succeeded",
                             "checkout.session.expired", "charge.refunded"]}, form=True), "webhook")
    save("PROD_STRIPE_WEBHOOK_SECRET", w["secret"])
env = load()
print("✓ Stripe real: IVA y webhook")

# 5 · Secretos
secrets_ = {
    "STRIPE_SECRET_KEY": env["STRIPE_LIVE_KEY"],
    "STRIPE_WEBHOOK_SECRET": env["PROD_STRIPE_WEBHOOK_SECRET"],
    "STRIPE_TAX_RATE_ID": env["PROD_STRIPE_TAX_RATE_ID"],
    "BREVO_API_KEY": env["BREVO_API_KEY"],
    "BREVO_LIST_ID": env["BREVO_LIST_ID"],
    "SENDER_EMAIL": env.get("SENDER_EMAIL") or "besta@besta.es",
    "NOTIFY_EMAILS": "besta@besta.es",
    "SITE_URL": SITE,
    "ALLOWED_ORIGINS": f"https://www.besta.es,{WORKERS},http://localhost:4321",
    "CRON_SECRET": env["PROD_CRON_SECRET"],
}
if env.get("BREVO_DOI_TEMPLATE_ID"):
    secrets_["BREVO_DOI_TEMPLATE_ID"] = env["BREVO_DOI_TEMPLATE_ID"]
ok(sbm("POST", f"/projects/{P}/secrets", [{"name": k, "value": v} for k, v in secrets_.items()]), "secretos")
print("✓ secretos de las funciones")

# 6 · Funciones
r = subprocess.run(["npx", "-y", "supabase@2.122.0", "functions", "deploy", "--project-ref", P, "--use-api"],
                   cwd=ROOT, env={**os.environ, "SUPABASE_ACCESS_TOKEN": env["SUPABASE_ACCESS_TOKEN"]},
                   capture_output=True, text=True)
if r.returncode:
    sys.exit("✗ funciones:\n" + r.stderr[-2000:])
print("✓ funciones subidas")

# 7 · Traspaso de datos
keys = {k["name"]: k["api_key"] for k in ok(sbm("GET", f"/projects/{P}/api-keys?reveal=true"), "claves")}
with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as f:
    f.write(f"SUPABASE_URL=https://{P}.supabase.co\nSUPABASE_SERVICE_ROLE_KEY={keys['service_role']}\n")
    tmp = f.name
try:
    script = os.path.join(ROOT, "scripts", "migrate-legacy.mjs")
    subprocess.run(["node", script, "--env-file", tmp], cwd=ROOT, check=True)
    if input("\n¿Escribir estos datos en el proyecto real? (s/n) ").strip().lower() == "s":
        subprocess.run(["node", script, "--apply", "--env-file", tmp], cwd=ROOT, check=True)
    else:
        print("Traspaso no aplicado. Puedes repetir el script cuando quieras.")
finally:
    os.unlink(tmp)

print(f"\nListo. Para la web (Cloudflare → Variables de compilación):\n"
      f"  PUBLIC_DATA_MODE=supabase\n  PUBLIC_SUPABASE_URL=https://{P}.supabase.co\n  PUBLIC_SUPABASE_ANON_KEY={keys['anon']}")
