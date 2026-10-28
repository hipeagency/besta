# Edge Functions de besta

Servidor de la web y la suite (Deno, Supabase Edge Functions). Todas leen y
escriben en el esquema `besta` (ver `../migrations/20261029100000_besta_v2.sql`).

| función | quién la llama | JWT | qué hace |
|---|---|---|---|
| `checkout` | web (POST `{eventId, qty, email, newsletter}`) | no | reserva plazas (`besta.reserve_order`) y abre Stripe Checkout → `{url}` |
| `stripe-webhook` | Stripe | no (firma) | pago completado → `besta.fulfill_order` + email de entradas; sesión caducada → pedido `caducado`; devolución → `devuelto` + entradas canceladas + email |
| `ticket-qr` | emails (GET `?code=BST-XXXXXX`) | no | PNG del QR `BESTA:T:<code>` |
| `public-forms` | web (POST `{type: "lead" \| "merch" \| "subscribe", …}`) | no | contratación, solicitud de merch y «avísame» (+ Brevo) |
| `order-actions` | suite (POST `{action: "refund" \| "resend", orderId}`) | sí, módulo `entradas` | devolución en Stripe / reenvío de entradas |
| `invite-user` | suite (POST `{name, email, role, scopes?, instrument?, band?}`) | sí, admin | invitación de Supabase Auth + ficha en `besta.members` |
| `bandsintown-import` | pg_cron, diario 06:00 Madrid | no (`x-cron-secret`) | conciertos de Bandsintown → `besta.gigs` |
| `reminders` | pg_cron, cada hora | no (`x-cron-secret`) | «gracias» el día después del concierto |

`_shared/` tiene lo común: secretos (`env.ts`), CORS y errores (`http.ts`),
clientes de Supabase (`supabase.ts`), Stripe, Brevo, plantillas de email
(`emails.ts`) y la lógica de pedidos (`orders.ts`).

Los errores para el usuario llegan como `{ "error": "mensaje en castellano" }`
(400 si es algo que puede corregir, 500 si es nuestro).

## Secretos

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los pone
Supabase solo. El resto:

| secreto | para qué |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (o `sk_test_…` para probar) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint del webhook |
| `STRIPE_TAX_RATE_ID` | `txr_…` del IVA (incluido en el precio). Opcional: sin él la factura sale sin desglose |
| `BREVO_API_KEY` | clave API v3 de Brevo |
| `BREVO_LIST_ID` | id numérico de la lista de la newsletter |
| `BREVO_DOI_TEMPLATE_ID` | id de la plantilla de doble confirmación (tipo «double opt-in») |
| `SENDER_EMAIL` | remitente verificado en Brevo (por defecto `besta@besta.es`) |
| `NOTIFY_EMAILS` | a quién avisar de contrataciones y merch, separados por comas |
| `SITE_URL` | `https://besta.es` (sin barra final) |
| `ALLOWED_ORIGINS` | otros orígenes con CORS, separados por comas; admite `*` (p. ej. `https://*.besta.workers.dev`) |
| `BANDSINTOWN_APP_ID` | app_id de la API de Bandsintown |
| `CRON_SECRET` | cadena larga aleatoria; la misma que se guarda en Vault como `cron_secret` |

```sh
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  BREVO_API_KEY=xkeysib-xxx \
  BREVO_LIST_ID=0 \
  BREVO_DOI_TEMPLATE_ID=0 \
  SENDER_EMAIL=besta@besta.es \
  NOTIFY_EMAILS=besta@besta.es \
  SITE_URL=https://besta.es \
  ALLOWED_ORIGINS=https://besta-v2.xxx.workers.dev \
  BANDSINTOWN_APP_ID=xxx \
  CRON_SECRET=$(openssl rand -hex 32)
```

## Antes de desplegar

- **Exponer el esquema `besta`** en la API (Dashboard → Project Settings → Data API →
  Exposed schemas, o `schemas` en `[api]` de `config.toml`). Sin eso, el cliente
  con `db.schema = "besta"` no encuentra ni tablas ni funciones.
- Brevo: dominio `besta.es` verificado (SPF/DKIM) para que `SENDER_EMAIL` no caiga
  en spam; atributos de contacto `NOMBRE`, `CIUDAD` e `INTERESES` (texto) creados.
- Auth → URL Configuration: añadir `https://besta.es/suite/` a Redirect URLs
  (la invitación vuelve ahí).

## Desplegar

Solo: al subir a `v2` algo de `supabase/`, el workflow
`.github/workflows/supabase.yml` aplica las migraciones pendientes y despliega
todas las funciones (también a mano desde Actions → supabase → Run workflow).
Necesita el secreto del repo `SUPABASE_ACCESS_TOKEN`.

A mano:

```sh
supabase functions deploy checkout stripe-webhook ticket-qr public-forms \
  order-actions invite-user bandsintown-import reminders
```

`verify_jwt` de cada una está en `../config.toml` (`[functions.*]`).

Comprobar tipos sin instalar Deno:

```sh
cd supabase && npx -y deno@2 check --node-modules-dir=none functions/*/index.ts
```

## Stripe

Webhook (Developers → Webhooks → Add endpoint):

```
https://<ref>.supabase.co/functions/v1/stripe-webhook
```

Eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`

El `whsec_…` que da Stripe va en `STRIPE_WEBHOOK_SECRET`. Para probar en local:
`stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`.

## Cron

`../migrations/20261029110000_cron.sql` programa con pg_cron + pg_net:

- `besta-bandsintown`: `bandsintown-import` a las 06:00 de Madrid.
- `besta-reminders`: `reminders` cada hora (minuto 10).

Lee la URL y el secreto de Vault. Antes de aplicar la migración, en el SQL editor:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
```

Lanzar una a mano: `select besta.call_function('bandsintown-import');` y mirar la
respuesta en `net._http_response`.

## Notas

- Los emails marcan en el pedido cuándo salieron (`emailSentAt`, `refundEmailAt`,
  `thanksSentAt`): Stripe y el cron pueden repetir sin duplicar.
- `stripe-webhook` responde 500 si algo falla a medias para que Stripe reintente;
  todo lo que hace aguanta repetirse.
- `bandsintown-import` nunca borra bolos. Guarda lo último que vio en
  `doc.bandsintown` y solo sobrescribe fecha, hora, sala, ciudad o enlace si cambian
  en Bandsintown, así que lo retocado en la suite se respeta. Un bolo creado a mano el
  mismo día se enlaza en vez de duplicarse.
- Las solicitudes de merch no apartan stock: lo hace la banda al confirmar en la suite.
