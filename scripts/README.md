# scripts

## migrate-legacy.mjs — suite antigua → besta v2

Migración de una sola dirección: lee las tablas de la suite antigua (`public.*`)
y las escribe en el esquema nuevo `besta.*` (ver
`supabase/migrations/20261029100000_besta_v2.sql`). Las tablas antiguas no se
tocan. Cada fila nueva lleva el objeto de la app en `doc` (mismos campos que
`src/data/types.ts` + los extra de ensayos) y el registro original en `legacy`.

Node 22, sin dependencias.

### Antes de empezar

1. Aplica la migración de `besta.*` en el proyecto.
2. `cp scripts/members-map.example.json scripts/members-map.json` y pon el
   email de cada uno (el de su cuenta de Supabase Auth). Con eso se rellena
   `members.user_id`. `financeMemberName` es el nombre que tenía en
   `public.finance_members` (MAX, ALBERT…) y `legacyRoleKeys` el rol de la app
   de ensayos (`voice`, `guitar_lead`, `guitar_rhythm`, `piano`, `bass`, `drums`).
3. Variables `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno o en un
   archivo que se pasa con `--env-file` (el script no imprime la clave).

**No se suben a git**: `scripts/members-map.json` (emails) ni `scripts/out/`
(el informe lleva todos los datos migrados, también finanzas).

### Uso

```sh
# 1. Ensayo (por defecto): lee, transforma y no escribe nada
node scripts/migrate-legacy.mjs --env-file .env.migrate

# 2. Revisa scripts/out/migration-preview.json (conteos, avisos y docs completos)

# 3. Migrar de verdad
node scripts/migrate-legacy.mjs --env-file .env.migrate --apply
```

Opciones:

| opción | |
| --- | --- |
| `--apply` | escribe en `besta.*` (upsert) y copia los audios |
| `--skip-storage` | con `--apply`, no copia archivos |
| `--env-file <ruta>` | lee `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` de ahí |
| `--members-map <ruta>` | por defecto `scripts/members-map.json` (si no existe usa el ejemplo y avisa) |
| `--out <ruta>` | por defecto `scripts/out/migration-preview.json` |
| `--from-snapshot <dir>` | sin red: lee `<tabla>.json` de una carpeta (`song.json` + `lists.json`, `users.json`, `audio.json`…). Solo dry run |

Se puede repetir las veces que haga falta antes del cambio: los ids son los
antiguos (uuid o id de texto), se hace upsert por `id` y en storage se salta lo
que ya está copiado. Ojo: cada `--apply` vuelve a pisar `doc` con lo de la suite
antigua, así que el último se lanza justo antes de pasar a la v2 y después no se
vuelve a ejecutar.

### Qué va a dónde

| antiguo | nuevo |
| --- | --- |
| `finance_members` + Auth + `members-map.json` | `members` (ids fijos: maxim, pau, albert, carlinhos, lars, victor) |
| `songs` (fila por canción) | `songs`: secciones → líneas `{chords, lyric}` con las mismas reglas que `ensayos/lib.ts` (acordes encima de la letra, `[Am]` en línea); `notes.all` → nota de sección; notas por rol → `sectionNotes[sección][miembro]`; acordes propios por rol (`chordsByRole`) → `memberChords`; `video` + `links` → `links`; `audio` → `audios` con `sb://musica/<ruta>` |
| `songs` fila `__besta_lists_meta` | `setlists` (id = slug del nombre; `order` → `songIds`; `items` cue/block → momento/bloque) |
| `composition_notebooks` + `composition_comments` | `ideas` (idea/writing/ready → idea/desarrollo/lista; demos = audios de cada sección) |
| `rider_docs` | `riders` (canales → input list, iconos del plano → posiciones por miembro, resto en bloques de texto) |
| `booking_quotes` | `quotes` (importes en céntimos; descuento como línea negativa) |
| `merch_products` + `merch_variants` | `products` |
| `merch_movements` | `moves` (sale/reserve/gift/restock/adjust → venta/reserva/regalo/reposicion/recuento, cantidad con signo) |
| `finance_expenses` / `finance_settlements` / `finance_categories` / `finance_audit` | `expenses` / `settlements` / `categories` / `audit` |
| bucket público `audio` | bucket privado `musica`, misma ruta |
