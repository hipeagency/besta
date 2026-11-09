/* =========================================================
   Arregla acordes mal escritos en besta.songs (los que vinieron así
   de la app antigua) y lista las canciones que no tienen acordes.

   Solo toca `chords` de cada línea (y la letra cuando los acordes se
   colaron en ella). Ensayo por defecto: enseña los cambios y no escribe.

     node scripts/fix-chords.mjs --prod                           # ensayo en el proyecto real
     node scripts/fix-chords.mjs --prod --apply                   # escribir en el real
     node scripts/fix-chords.mjs --env-file .env.migrate          # ensayo
     node scripts/fix-chords.mjs --env-file .env.migrate --apply  # escribir
     node scripts/fix-chords.mjs --from-preview scripts/out/migration-preview.json

   Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (no se imprimen).
   Node 22, sin dependencias.
   ========================================================= */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const die = m => { console.error(m); process.exit(1); };

const envFile = opt("--env-file");
if (envFile) for (const row of readFileSync(envFile, "utf8").split("\n")) {
  const m = row.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Igual que CHORD en src/suite/modules/ensayos/lib.ts
const CHORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M|°|ø|\+)?\d*((maj|sus|add|b|#|\+|-)?\d+)*(\([#b]?\d+\))?(\/[A-G](#|b)?)?\)?$/;
const isChord = t => CHORD.test(t.replace(/^\(|\)$/g, ""));
const isChordLine = s => { const t = s.trim().split(/\s+/).filter(Boolean); return t.length > 0 && t.some(isChord) && t.every(x => isChord(x) || /^(-|x\d+|\|)$/.test(x)); };
const LABEL = /^(intro|estribillo|estrofa|puente|outro|pre-?estribillo|solo)$/i;

/** Una palabra de una línea de acordes → cómo debería ir. */
function fixToken(t) {
  if (t === "EM") return "Em";                       // «C-G-EM-D»: en el resto de la canción es Em
  if (/^doble$/i.test(t)) return "x2";
  const bare = t.replace(/\.+$/, "");                // «A.» → «A»
  if (isChord(bare)) return bare;
  const up = bare[0]?.toUpperCase() + bare.slice(1); // «em», «c» → «Em», «C»
  if (/^[a-g]/.test(bare) && isChord(up)) return up;
  if (bare.includes("-")) {                          // «G-C-Em-D», «E-», «-G»
    const parts = bare.split("-").map(p => p && fixToken(p));
    if (parts.some(Boolean) && parts.every(p => !p || isChord(p))) return parts.join(" - ").trim();
  }
  return t;
}

/** Devuelve la línea arreglada (o la misma si no hay nada que hacer). */
function fixLine(l) {
  const chords = l.chords ?? "", lyric = l.lyric ?? "";
  // «Intro» en acordes y los acordes en la letra → los acordes a su sitio
  if (LABEL.test(chords.trim()) && isChordLine(lyric)) return { ...l, chords: lyric.trim(), lyric: "" };
  // una etiqueta sola en acordes («Estribillo») → a la letra, como indicación
  if (LABEL.test(chords.trim()) && !lyric.trim()) return { ...l, chords: "", lyric: `(${chords.trim()})` };
  if (!chords.trim()) return l;
  let c = chords.replace(/\bx\s+(\d)/gi, "x$1");     // «x 2» → «x2»
  /* Palabra a palabra, sin tocar los huecos. Con letra debajo, «Am-G» no se
     separa: movería las columnas de los acordes que van detrás. */
  c = c.replace(/\S+/g, tok => { const f = fixToken(tok); return lyric.trim() && f.includes(" ") ? tok : f; });
  return c === chords ? l : { ...l, chords: c };
}

/* --prod: la clave de servicio del proyecto real se pide en el momento con el
   token de gestión de supabase/.env.local (como go-live.py). No se guarda. */
if (args.includes("--prod")) {
  const e = readFileSync(new URL("../supabase/.env.local", import.meta.url), "utf8");
  const g = k => ((e.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m")) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
  const P = g("SUPABASE_PROJECT_REF"), T = g("SUPABASE_ACCESS_TOKEN");
  if (!P || !T) die("Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN en supabase/.env.local.");
  const r = await fetch(`https://api.supabase.com/v1/projects/${P}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${T}` } });
  if (!r.ok) die(`No se pudo pedir la clave: ${r.status}`);
  process.env.SUPABASE_URL = `https://${P}.supabase.co`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = (await r.json()).find(k => k.name === "service_role")?.api_key ?? "";
  console.log(`Proyecto real (${P.slice(0, 4)}…)\n`);
}

// ---------- datos ----------
let songs;
const preview = opt("--from-preview");
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "besta", "Content-Profile": "besta" };
if (preview) {
  if (APPLY) die("--apply no va con --from-preview: hay que leer los datos de verdad.");
  songs = JSON.parse(readFileSync(preview, "utf8")).collections.songs.map(r => ({ id: r.id, doc: r.doc }));
} else {
  if (!url || !key) die("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (entorno o --env-file).");
  const r = await fetch(`${url}/rest/v1/songs?select=id,doc`, { headers: H });
  if (!r.ok) die(`No se pudieron leer las canciones: ${r.status} ${await r.text()}`);
  songs = await r.json();
}

// ---------- arreglar ----------
const changed = [], noChords = [];
for (const { id, doc } of songs) {
  let n = 0, chordCount = 0;
  const sections = (doc.sections ?? []).map(sec => ({
    ...sec,
    lines: (sec.lines ?? []).map((l, i) => {
      const f = fixLine(l);
      if (f !== l) { n++; console.log(`${doc.title} · ${sec.name} #${i + 1}\n  - ${JSON.stringify(l.chords)} / ${JSON.stringify(l.lyric)}\n  + ${JSON.stringify(f.chords)} / ${JSON.stringify(f.lyric)}`); }
      chordCount += f.chords.split(/[\s|]+/).filter(isChord).length;
      return f;
    }),
  }));
  const own = Object.values(doc.memberChords ?? {}).some(Boolean);
  if (!chordCount && !own) noChords.push(`${doc.title}${doc.artist ? ` — ${doc.artist}` : ""} (${id}, ${(doc.sections ?? []).reduce((a, s) => a + (s.lines?.length ?? 0), 0)} líneas)`);
  if (n) changed.push({ id, title: doc.title, doc: { ...doc, sections } });
}

console.log(`\n${changed.length} canciones con arreglos.`);
console.log(`\nSin acordes (${noChords.length}):\n  ${noChords.join("\n  ")}`);

if (!APPLY) { console.log("\nEnsayo: no se ha escrito nada. Añade --apply para guardar."); process.exit(0); }

for (const { id, title, doc } of changed) {
  const r = await fetch(`${url}/rest/v1/songs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ doc, updated_at: new Date().toISOString() }),
  });
  console.log(r.ok ? `guardada: ${title}` : `ERROR ${title}: ${r.status} ${await r.text()}`);
}
