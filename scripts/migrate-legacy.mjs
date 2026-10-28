#!/usr/bin/env node
/* =========================================================
   Migración única: suite antigua (public.*) → besta v2 (besta.*)

   Por defecto NO escribe nada (dry run): lee, transforma y deja el
   resultado en scripts/out/migration-preview.json. Solo --apply
   escribe en besta.* y copia los audios al bucket privado «musica».
   Idempotente: ids deterministas + upsert; se puede repetir hasta
   el día del cambio.

   Uso:
     node scripts/migrate-legacy.mjs [--env-file .env.migrate] [--members-map scripts/members-map.json]
     node scripts/migrate-legacy.mjs --apply [--skip-storage]
     node scripts/migrate-legacy.mjs --from-snapshot <dir>     (sin red, lee JSON locales)

   Node 22, sin dependencias. Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
if (flag("--help") || flag("-h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).join("\n"));
  process.exit(0);
}
const APPLY = flag("--apply");
const SNAPSHOT = opt("--from-snapshot");
const SKIP_STORAGE = flag("--skip-storage");
const OUT = path.resolve(opt("--out") ?? path.join(HERE, "out", "migration-preview.json"));
const MAP_PATH = opt("--members-map") ?? path.join(HERE, "members-map.json");
const ENV_FILE = opt("--env-file");

if (APPLY && SNAPSHOT) die("--apply no se puede combinar con --from-snapshot (los snapshots son muestras parciales).");

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ---------- avisos ----------
const warnings = [];
const seenWarn = new Set();
const warn = (area, msg) => { const k = `${area}|${msg}`; if (!seenWarn.has(k)) { seenWarn.add(k); warnings.push({ area, msg }); } };

// ---------- utilidades ----------
const isoOf = v => {
  if (!v) return undefined;
  // «2026-10-24 10:51:31.868669+00» → ISO
  const s = String(v).trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00").replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const madridDate = v => {
  const iso = isoOf(v);
  return iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(iso)) : undefined;
};
const cents = v => Math.round(Number(v || 0) * 100);
const slug = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const str = v => (typeof v === "string" ? v : v == null ? "" : String(v));
const clean = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
const lower = s => str(s).trim().toLowerCase();

// ---------- acordes (port de src/suite/modules/ensayos/lib.ts) ----------
const CHORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M|°|ø|\+)?\d*((maj|sus|add|b|#|\+|-)?\d+)*(\([#b]?\d+\))?(\/[A-G](#|b)?)?\)?$/;
const FILLER = /^(\||\/|-|%|x\d+|\d+x|N\.?C\.?|\.+|\(|\))$/i;

function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    if (CHORD.test(t)) chords++;
    else if (!FILLER.test(t)) return false;
  }
  return chords > 0;
}

function parseChordText(text) {
  const rows = str(text).replace(/\r/g, "").replace(/\t/g, "    ").split("\n").map(r => r.replace(/\s+$/, ""));
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (isChordLine(r)) {
      const next = rows[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next)) { out.push({ chords: r, lyric: next }); i++; }
      else out.push({ chords: r, lyric: "" });
    } else out.push({ chords: "", lyric: r });
  }
  return out;
}

/** Una fila con [Am] dentro → acordes encima, en su columna (mismo algoritmo que extra.ts). */
function inlineRow(row) {
  let lyric = "", chords = "";
  row.split(/(\[[^\]]+\])/).forEach(part => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (m) {
      if (chords.length > lyric.length) lyric += " ".repeat(chords.length - lyric.length);
      chords += " ".repeat(Math.max(0, lyric.length - chords.length)) + m[1] + " ";
    } else lyric += part;
  });
  return { chords: chords.replace(/\s+$/, ""), lyric: lyric.replace(/\s+$/, "") };
}

/** Letra de la app antigua → líneas. Sin [x]: acordes encima de la letra (parseChordText
    sobre todo el bloque, así una línea de acordes se empareja con la de debajo). Con [x]:
    esas filas se resuelven en línea y el resto, por tramos, con parseChordText. */
function lyricsToLines(text) {
  const t = str(text).replace(/\r/g, "");
  if (!/\[[^\]]+\]/.test(t)) return parseChordText(t);
  const out = [];
  let buf = [];
  const flush = () => { if (buf.length) out.push(...parseChordText(buf.join("\n"))); buf = []; };
  for (const row of t.split("\n")) {
    if (/\[[^\]]+\]/.test(row)) { flush(); out.push(inlineRow(row)); } else buf.push(row);
  }
  flush();
  // como extra.ts: fuera líneas vacías en los bordes; dentro se respetan
  while (out.length && !out[0].chords.trim() && !out[0].lyric.trim()) out.shift();
  while (out.length && !out.at(-1).chords.trim() && !out.at(-1).lyric.trim()) out.pop();
  return out;
}

/** Sección antigua {lyrics, chords} → líneas (regla de songFromJson en extra.ts). */
function legacySectionLines(lyrics, chords) {
  const hasInline = /\[[^\]]+\]/.test(str(lyrics));
  return [
    ...(str(chords).trim() && !hasInline ? [{ chords: str(chords).trim(), lyric: "" }] : []),
    ...lyricsToLines(lyrics),
  ];
}

/** Acordes que no reconoce el parser (para avisar). */
function badChordTokens(lyrics, chords) {
  const bad = new Set();
  for (const m of str(lyrics).matchAll(/\[([^\]]+)\]/g)) {
    const t = m[1].trim();
    if (!CHORD.test(t)) bad.add(`[${t}]`);
  }
  for (const raw of str(chords).split(/[\s|]+/)) {
    const t = raw.trim();
    if (!t || FILLER.test(t) || /^[–—-]+$/.test(t)) continue;
    if (!CHORD.test(t)) bad.add(t);
  }
  return [...bad];
}

// ---------- secciones antiguas: rótulo y notas (port de ensayos.html) ----------
const SECTION_TYPES = { intro: "Intro", verse: "Estrofa", pre_chorus: "Pre-Estribillo", chorus: "Estribillo", bridge: "Puente", solo: "Solo", interlude: "Interludio", outro: "Outro", custom: "Otro" };
const ROLES = ["all", "drums", "piano", "guitar_rhythm", "guitar_lead", "bass", "voice"];

function inferSectionType(name) {
  const t = str(name).trim().toLowerCase();
  if (!t) return "custom";
  if (/^intro\b/.test(t)) return "intro";
  if (/^pre[\s-]?(estribillo|chorus)\b/.test(t)) return "pre_chorus";
  if (/^(estribillo|chorus|coro)\b/.test(t)) return "chorus";
  if (/^(estrofa|verso|verse)\b/.test(t)) return "verse";
  if (/^(puente|bridge)\b/.test(t)) return "bridge";
  if (/^solo\b/.test(t)) return "solo";
  if (/^(interludio|interlude|build)\b/.test(t)) return "interlude";
  if (/^(outro|coda|final)\b/.test(t)) return "outro";
  return "custom";
}
const sectionTypeOf = sec => (sec?.type in SECTION_TYPES ? sec.type : inferSectionType(sec?.name));

/** Rótulos tal y como los enseñaba la app antigua (sectionDisplayLabels). */
function sectionDisplayLabels(list) {
  const types = list.map(sectionTypeOf);
  const keyOf = sec => str(sec?.lyrics).replace(/\[[^\]]+\]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const byType = {};
  const numbers = list.map((sec, i) => {
    const store = byType[types[i]] || (byType[types[i]] = { count: 0, seen: new Map() });
    const key = keyOf(sec);
    if (key && store.seen.has(key)) return store.seen.get(key);
    store.count += 1;
    if (key) store.seen.set(key, store.count);
    return store.count;
  });
  return list.map((sec, i) => {
    const t = types[i];
    // «Otro» con nombre puesto a mano (no «Sección 3» ni «Nueva sección»): se respeta el nombre
    const own = str(sec?.name).trim();
    if (t === "custom" && own && !/^(secci[oó]n|nueva secci[oó]n|parte)\s*\d*$/i.test(own)) return own;
    const base = t === "custom" ? "Sección" : SECTION_TYPES[t] || "Sección";
    return byType[t].count > 1 ? `${base} ${numbers[i]}` : base;
  });
}

function normalizeSectionNotes(raw) {
  const out = {};
  const n = raw || {};
  for (const r of ROLES) out[r] = typeof n[r] === "string" ? n[r] : "";
  if (!out.guitar_rhythm && typeof n.guitar === "string" && n.guitar) out.guitar_rhythm = n.guitar;
  return out;
}

// ---------- fuentes ----------
const TABLES = [
  "songs", "merch_products", "merch_variants", "merch_movements",
  "finance_members", "finance_expenses", "finance_settlements", "finance_categories", "finance_audit",
  "rider_docs", "booking_quotes", "composition_notebooks", "composition_comments",
];
/* En el snapshot cada tabla es <tabla>.json; songs está partida en song.json + lists.json,
   los usuarios de Auth en users.json y el listado del bucket en audio.json. */
const SNAPSHOT_FILES = { songs: ["songs.json", "song.json", "lists.json"] };

function readSnapshot(dir) {
  const read = f => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return null;
    const v = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(v) ? v : v?.users ?? v?.data ?? [v];
  };
  const src = {};
  for (const t of TABLES) {
    const files = SNAPSHOT_FILES[t] ?? [`${t}.json`];
    const rows = files.map(read).filter(Boolean);
    if (!rows.length) warn("fuente", `snapshot sin ${files.join(" / ")}: ${t} vacío`);
    src[t] = rows.flat();
  }
  src.authUsers = read("users.json") ?? (warn("fuente", "snapshot sin users.json"), []);
  const audio = read("audio.json");
  if (!audio) warn("fuente", "snapshot sin audio.json: no se comprueban los audios");
  src.audioObjects = (audio ?? []).map(o => ({ path: o.name ?? o.path, size: Number(o.tam ?? o.size ?? o.metadata?.size ?? 0), createdAt: o.created_at }));
  src.audioListed = !!audio;
  return src;
}

function loadEnv() {
  if (ENV_FILE) {
    if (!fs.existsSync(ENV_FILE)) die(`No existe ${ENV_FILE}`);
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (entorno o --env-file).");
  return { url, key };
}

function client({ url, key }) {
  const base = { apikey: key, Authorization: `Bearer ${key}` };
  const req = async (p, init = {}) => {
    const res = await fetch(url + p, { ...init, headers: { ...base, ...(init.headers || {}) } });
    return res;
  };
  const json = async (p, init) => {
    const res = await req(p, init);
    const text = await res.text();
    if (!res.ok) { const e = new Error(`${init?.method ?? "GET"} ${p.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`); e.status = res.status; e.body = text; throw e; }
    return text ? JSON.parse(text) : null;
  };
  return { req, json };
}

async function readNetwork(api) {
  const src = {};
  for (const t of TABLES) {
    const rows = [];
    try {
      for (let from = 0; ; from += 1000) {
        const page = await api.json(`/rest/v1/${t}?select=*`, {
          headers: { "Accept-Profile": "public", Range: `${from}-${from + 999}`, "Range-Unit": "items" },
        });
        rows.push(...page);
        if (page.length < 1000) break;
      }
    } catch (e) {
      if (e.status === 404 || /does not exist|schema cache/i.test(e.body ?? "")) warn("fuente", `public.${t} no existe: vacío`);
      else throw e;
    }
    src[t] = rows;
  }
  // Auth
  const users = [];
  for (let page = 1; ; page++) {
    const r = await api.json(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const list = r?.users ?? [];
    users.push(...list.map(u => ({ id: u.id, email: u.email })));
    if (list.length < 1000) break;
  }
  src.authUsers = users;
  // Bucket «audio» (recursivo: las carpetas vienen con id null)
  src.audioObjects = await listBucket(api, "audio");
  src.audioListed = true;
  return src;
}

async function listBucket(api, bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await api.json(`/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id == null) out.push(...(await listBucket(api, bucket, p)));
      else out.push({ path: p, size: Number(it.metadata?.size ?? 0), createdAt: it.created_at, mimetype: it.metadata?.mimetype });
    }
    if (items.length < 1000) break;
  }
  return out;
}

// ---------- miembros ----------
const DEFAULT_MAP = JSON.parse(fs.readFileSync(path.join(HERE, "members-map.example.json"), "utf8"));

function loadMembersMap() {
  let raw = DEFAULT_MAP;
  if (fs.existsSync(MAP_PATH)) raw = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  else warn("miembros", `no hay ${path.relative(process.cwd(), MAP_PATH)}: se usa members-map.example.json (sin emails → nadie queda enlazado a su cuenta)`);
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => !k.startsWith("_") && v && typeof v === "object"));
}

function buildMembers(map, src) {
  const byEmail = new Map(src.authUsers.filter(u => u.email).map(u => [lower(u.email), u]));
  const used = new Set();
  const rows = Object.entries(map).map(([id, m]) => {
    const email = m.email ? lower(m.email) : undefined;
    const user = email ? byEmail.get(email) : undefined;
    if (email && !user) warn("miembros", `${id}: ${email} no tiene cuenta en Auth todavía (user_id null)`);
    if (!email) warn("miembros", `${id}: sin email en el mapa`);
    if (user) used.add(user.id);
    const doc = clean({
      id, name: m.name ?? id, instrument: m.instrument ?? "", role: m.role ?? "admin",
      email, band: m.band ?? true, active: m.active ?? true, scopes: m.scopes,
    });
    return { id, email: email ?? null, user_id: user?.id ?? null, doc };
  });
  for (const u of src.authUsers) if (!used.has(u.id)) warn("miembros", `cuenta de Auth sin miembro: ${u.email} (${u.id})`);

  // rol antiguo (voice, bass…) → miembro
  const roleToMember = {};
  for (const [id, m] of Object.entries(map)) for (const r of m.legacyRoleKeys ?? []) roleToMember[r] = id;
  for (const r of ROLES.filter(r => r !== "all")) if (!roleToMember[r]) warn("miembros", `rol antiguo «${r}» sin miembro (legacyRoleKeys)`);

  // finance_members (uuid) → miembro
  const finToMember = {};
  for (const fm of src.finance_members) {
    const n = lower(fm.name);
    const hit = Object.entries(map).find(([id, m]) =>
      [].concat(m.financeMemberName ?? []).some(x => lower(x) === n))
      ?? Object.entries(map).find(([id, m]) => n && (lower(m.name) === n || id === slug(fm.name) || (lower(m.name) && (lower(m.name).startsWith(n) || n.startsWith(lower(m.name))))));
    if (hit) finToMember[fm.id] = hit[0];
    else { finToMember[fm.id] = `legacy-${slug(fm.name)}`; warn("finanzas", `finance_member «${fm.name}» (${fm.id}) sin miembro: queda como ${finToMember[fm.id]}`); }
  }
  // auth uid → nombre (autor de ideas, etc.)
  const uidToName = {};
  for (const r of rows) if (r.user_id) uidToName[r.user_id] = r.doc.name;
  return { rows, roleToMember, finToMember, uidToName };
}

// ---------- transformaciones ----------
const sbUrl = p => `sb://musica/${str(p).replace(/^\/+/, "")}`;

function transformSongs(src, ctx) {
  const rows = src.songs.filter(r => !String(r.id).startsWith("__") && r.data?._type !== "lists_meta");
  const out = [];
  for (const row of rows) {
    const d = row.data ?? {};
    const id = String(row.id);
    if (!d.title) warn("canciones", `${id}: sin título`);
    const legacySecs = Array.isArray(d.sections) ? d.sections : [];
    const labels = sectionDisplayLabels(legacySecs);
    const sectionNotes = {};
    const memberChords = {};
    const sections = legacySecs.map((s, i) => {
      const sid = `${id}-s${i + 1}`;
      const lines = legacySectionLines(s.lyrics, s.chords);
      const bad = badChordTokens(s.lyrics, s.chords);
      if (bad.length) warn("canciones", `${id} · sección ${i + 1} (${labels[i]}): acordes no reconocidos ${bad.join(" ")}`);
      const notes = normalizeSectionNotes(s.notes);
      for (const r of ROLES) {
        if (r === "all" || !notes[r].trim()) continue;
        const mid = ctx.roleToMember[r];
        if (!mid) { warn("canciones", `${id} · ${labels[i]}: nota de «${r}» sin miembro, se pierde`); continue; }
        (sectionNotes[sid] ??= {})[mid] = notes[r];
      }
      // versiones propias de acordes por rol → memberChords[miembro][sección] = filas de acordes
      for (const [r, v] of Object.entries(s.chordsByRole ?? {})) {
        if (!v || (!str(v.lyrics).trim() && !str(v.chords).trim())) continue;
        const mid = ctx.roleToMember[r];
        if (!mid) { warn("canciones", `${id} · ${labels[i]}: acordes propios de «${r}» sin miembro`); continue; }
        const own = legacySectionLines(str(v.lyrics).trim() ? v.lyrics : s.lyrics, str(v.chords).trim() ? v.chords : s.chords);
        const lyr = ls => ls.map(l => l.lyric.trim()).filter(Boolean).join("\n");
        if (lyr(own) !== lyr(lines)) warn("canciones", `${id} · ${labels[i]}: acordes propios de ${mid} con letra distinta a la de la banda (pueden quedar desalineados)`);
        (memberChords[mid] ??= {})[sid] = own.map(l => l.chords).join("\n");
      }
      return clean({ id: sid, name: labels[i], note: notes.all.trim() ? notes.all : undefined, lines });
    });

    const links = [];
    (Array.isArray(d.links) ? d.links : []).forEach((l, i) => {
      const url = str(l?.url).trim();
      if (url) links.push({ id: `l${i + 1}`, label: str(l.label).trim(), url });
    });
    const video = str(d.video).trim();
    if (video && !links.some(l => l.url === video)) links.unshift({ id: "video", label: "Referencia YouTube", url: video });

    const audios = (Array.isArray(d.audio) ? d.audio : []).filter(a => a?.path).map((a, i) => {
      ctx.audioRefs.push({ path: a.path, where: `canción ${id}` });
      return { id: `a${i + 1}-${slug(path.basename(a.path)).slice(0, 40)}`, name: str(a.name) || path.basename(a.path), url: sbUrl(a.path) };
    });

    for (const f of Array.isArray(d.folders) ? d.folders : []) ctx.folders.add(str(f).trim());

    const bpm = Number(d.bpm);
    const doc = clean({
      id, title: str(d.title) || id, artist: str(d.artist),
      // las ideas pasadas a ensayos desde composición llegan sin artista: también son propias
      own: lower(d.artist) === "besta" || (!str(d.artist).trim() && id.startsWith("composition-")),
      key: str(d.key).trim(), bpm: bpm > 0 ? Math.round(bpm) : undefined, duration: str(d.duration).trim() || undefined,
      sections: sections.length ? sections : [{ id: `${id}-s1`, name: "Estrofa", lines: [] }],
      instrumentNotes: {}, memberChords, comments: [],
      audios, links, notes: str(d.notes).trim() ? d.notes : undefined,
      sectionNotes: Object.keys(sectionNotes).length ? sectionNotes : undefined,
    });
    if (!sections.length) warn("canciones", `${id}: sin secciones`);
    out.push({ id, doc, legacy: row, created_at: isoOf(row.created_at) });
  }
  return out;
}

function transformSetlists(src, songIds, ctx) {
  const meta = src.songs.find(r => r.id === "__besta_lists_meta" || r.data?._type === "lists_meta");
  if (!meta) { warn("setlists", "no hay fila __besta_lists_meta"); return []; }
  const lists = meta.data?.lists ?? meta.data?.setlists ?? {};
  const out = [];
  const seen = new Set();
  for (const [key, m] of Object.entries(lists)) {
    let id = slug(key);
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const order = (Array.isArray(m.order) ? m.order : []).map(String);
    const missing = order.filter(s => !songIds.has(s));
    if (missing.length) warn("setlists", `${id}: ${missing.length} canción(es) que no existen en songs (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""})`);
    const rawItems = Array.isArray(m.items) ? m.items : [];
    const notesOf = it => (Array.isArray(it.notes) ? it.notes : [it.note]).map(n => str(n).trim()).filter(Boolean).join("\n") || undefined;
    const items = rawItems.flatMap((it, i) => {
      const iid = str(it.uid).trim() || `i${i + 1}`;
      if (it.type === "song" && it.songId) return [clean({ id: iid, type: "song", songId: String(it.songId), notes: notesOf(it) })];
      if (it.type === "cue" || it.type === "block") return [clean({ id: iid, type: it.type === "cue" ? "momento" : "bloque", title: str(it.title), notes: notesOf(it) })];
      warn("setlists", `${id}: elemento de tipo «${it.type}» ignorado`);
      return [];
    });
    const doc = clean({
      id, name: str(m.name) || key, songIds: order, closed: false,
      items: items.length ? items : undefined,
      date: str(m.date).trim() || undefined, venue: str(m.venue).trim() || undefined,
      notes: str(m.notes).trim() || undefined, time: str(m.time).trim() || undefined,
    });
    if (items.length) {
      const fromItems = items.filter(i => i.type === "song").map(i => i.songId);
      if (fromItems.join() !== order.join()) warn("setlists", `${id}: el orden de la lista y el de la hoja (items) no coinciden; manda songIds`);
    }
    out.push({ id, doc, legacy: { key, ...m } });
  }
  for (const f of ctx.folders) if (f && !Object.values(lists).some(m => lower(m.name) === lower(f) || lower(f) === lower(Object.keys(lists).find(k => lists[k] === m))))
    warn("setlists", `carpeta «${f}» de canciones sin lista equivalente: no se migra como setlist`);
  return out;
}

const IDEA_STATUS = { idea: "idea", writing: "desarrollo", ready: "lista" };

function transformIdeas(src, ctx) {
  const commentsBy = new Map();
  for (const c of src.composition_comments) {
    if (!commentsBy.has(c.notebook_id)) commentsBy.set(c.notebook_id, []);
    commentsBy.get(c.notebook_id).push(c);
  }
  const songIds = new Set(src.songs.map(r => String(r.id)));
  const audioDate = new Map(ctx.audioObjects.map(o => [o.path, madridDate(o.createdAt)]));
  return src.composition_notebooks.map(row => {
    const d = row.data ?? {};
    const secs = Array.isArray(d.sections) ? d.sections : [];
    const author = ctx.uidToName[row.updated_by] ?? "besta";
    if (!(row.status in IDEA_STATUS)) warn("ideas", `${row.id}: estado «${row.status}» desconocido → idea`);
    const demos = [];
    for (const s of secs) for (const a of Array.isArray(s.audio) ? s.audio : []) {
      if (!a?.path) continue;
      ctx.audioRefs.push({ path: a.path, where: `idea ${row.id}` });
      demos.push(clean({
        id: `d${demos.length + 1}`, version: demos.length + 1, by: author,
        date: audioDate.get(a.path) ?? madridDate(row.updated_at) ?? madridDate(row.created_at),
        url: sbUrl(a.path), name: str(a.name) || undefined, section: str(s.title) || undefined,
      }));
    }
    const secTitle = id => secs.find(s => s.id === id)?.title;
    const comments = (commentsBy.get(row.id) ?? [])
      .sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)))
      .map(c => clean({ id: c.id, who: str(c.author_name) || ctx.uidToName[c.created_by] || "Miembro", text: c.body, where: secTitle(c.section_id), createdAt: isoOf(c.created_at) }));
    const lyrics = secs.filter(s => str(s.lyrics).trim())
      .map(s => `[${str(s.title) || "Sección"}]\n${str(s.lyrics).replace(/\s+$/, "")}`).join("\n\n");
    for (const s of secs) {
      const bad = badChordTokens("", s.chords);
      if (bad.length) warn("ideas", `${row.id} · ${s.title}: acordes no reconocidos ${bad.join(" ")}`);
    }
    const doc = clean({
      id: row.id, title: str(row.title) || "Idea nueva", status: IDEA_STATUS[row.status] ?? "idea", author,
      lyrics, sections: secs.map((s, i) => ({ id: s.id || `${row.id}-s${i + 1}`, name: str(s.title), chords: str(s.chords) })),
      demos, comments, updatedAt: isoOf(row.updated_at) ?? isoOf(row.created_at),
      notes: str(d.notes).trim() || undefined,
      songId: songIds.has(`composition-${row.id}`) ? `composition-${row.id}` : undefined,
    });
    return { id: row.id, doc, legacy: row, created_at: isoOf(row.created_at) };
  });
}

function transformRiders(src, ctx) {
  return src.rider_docs.map(row => {
    const d = row.data ?? {};
    const off = d.off ?? {};
    const arr = v => (Array.isArray(v) ? v : str(v).split("\n")).map(x => str(x).trim()).filter(Boolean);
    const list = xs => xs.map(x => `· ${x}`).join("\n");
    const inputs = (Array.isArray(d.channels) ? d.channels : []).map((c, i) => clean({
      ch: String(i + 1).padStart(2, "0"), source: str(c.src), mic: str(c.mic), stand: str(c.stand),
      phantom: c.ph ? true : undefined, note: str(c.note).trim() || undefined,
    }));
    // plano: el antiguo tenía iconos con etiqueta; el nuevo, posiciones por miembro
    const names = Object.fromEntries(ctx.memberRows.map(m => [m.id, lower(m.doc.name)]));
    const byKind = { drums: ctx.roleToMember.drums, keys: ctx.roleToMember.piano, bass: ctx.roleToMember.bass };
    const stage = [];
    const items = Array.isArray(d.stage?.items) ? d.stage.items : [];
    for (const it of items) {
      const label = lower(it.label);
      let mid = Object.keys(names).find(id => names[id] && label.includes(names[id]));
      if (!mid && byKind[it.kind]) mid = byKind[it.kind];
      if (!mid && it.kind === "mic" && /^voz/.test(label)) mid = ctx.roleToMember.voice;
      if (!mid || stage.some(s => s.memberId === mid)) { warn("riders", `${row.slug}: elemento del plano «${it.label || it.kind}» sin miembro, se omite (queda en legacy)`); continue; }
      stage.push({ memberId: mid, label: str(it.label) || mid, x: Number(it.x) || 50, y: Number(it.y) || 50 });
    }
    const members = Array.isArray(d.members) ? d.members : [];
    const t = d.times ?? {};
    const contacts = (Array.isArray(d.contacts) ? d.contacts : []).filter(c => c && (c.name || c.phone || c.email))
      .map(c => `${str(c.role) || "Contacto"}: ${[c.name, c.phone, c.email].map(str).filter(x => x.trim()).join(" · ")}`);
    const backlineBand = arr(d.backlineBand), backlineVenue = arr(d.backlineVenue);
    const text = (id, name, body, offKey) => ({ id, name, enabled: !off[offKey] && !!body.trim(), body });
    const blocks = [
      text("musicos", "necesidades por músico", members.map(m => `${[m.name, m.role].map(str).filter(Boolean).join(" · ")}\n${list(arr(m.needs))}`).join("\n\n"), "members"),
      { id: "inputs", name: "input list", enabled: !off.channels },
      { id: "plano", name: "plano de escenario", enabled: !off.stage },
      text("backline", "backline", [backlineBand.length ? `Lo lleva la banda:\n${list(backlineBand)}` : "", backlineVenue.length ? `Lo pone la sala:\n${list(backlineVenue)}` : ""].filter(Boolean).join("\n\n"), "backline"),
      text("monitores", "monitoraje", list(arr(d.monitors)), "monitors"),
      text("corriente", "corriente", list(arr(d.power)), "power"),
      text("tiempos", "tiempos", [["Carga", t.load], ["Prueba", t.check], ["Show", t.show]].filter(([, v]) => str(v).trim()).map(([k, v]) => `${k}: ${v}`).join("\n"), "times"),
      text("camerino", "camerino y catering", list(arr(d.hospitality)), "hospitality"),
      text("contactos", "contactos", contacts.join("\n"), "contacts"),
      text("notas", "notas", str(d.notes).trim(), "notes"),
    ];
    const size = [d.stage?.width, d.stage?.depth].map(str).map(s => s.trim()).filter(Boolean);
    if (row.archived) warn("riders", `${row.slug}: estaba archivado (se migra igual, archived: true)`);
    const doc = clean({
      id: row.id, name: str(row.name), version: str(row.version) || "1", blocks, inputs, stage,
      stageSize: size.length === 2 ? `${size[0].replace(/\s*m$/, "")} × ${size[1]}` : size.join(" × "),
      sentTo: [], subtitle: str(d.subtitle).trim() || undefined, archived: row.archived ? true : undefined,
    });
    return { id: row.id, doc, legacy: row, created_at: isoOf(row.created_at) };
  });
}

const QUOTE_STATUS = new Set(["borrador", "enviado", "aceptado", "rechazado"]);

function transformQuotes(src) {
  return src.booking_quotes.map(row => {
    const d = row.data ?? {};
    const gig = d.gig ?? {};
    const date = [row.event_date, gig.date].map(str).find(x => x && !x.startsWith("0001-01-01"));
    const lines = (Array.isArray(d.lines) ? d.lines : []).map((l, i) => clean({
      id: str(l.id) || `l${i + 1}`, name: str(l.concept), note: str(l.detail).trim() || undefined,
      amountCents: Math.round(Number(l.price || 0) * Number(l.qty ?? 1) * 100),
    }));
    if (Number(d.discount) > 0) lines.push({ id: "descuento", name: "descuento", amountCents: -cents(d.discount) });
    if (!QUOTE_STATUS.has(row.status)) warn("presupuestos", `${row.number}: estado «${row.status}» → borrador`);
    if (row.archived) warn("presupuestos", `${row.number}: archivado en la app antigua (el nuevo no tiene archivo; se migra igual)`);
    const conds = Array.isArray(d.conditions) ? d.conditions : str(d.conditions).split("\n");
    const doc = clean({
      id: row.id, number: str(row.number), status: QUOTE_STATUS.has(row.status) ? row.status : "borrador",
      client: str(d.client?.name).trim() || str(row.client), contactEmail: str(d.client?.email).trim() || undefined,
      eventDate: date ? date.slice(0, 10) : undefined,
      place: [gig.venue, gig.city].map(str).map(s => s.trim()).filter(Boolean).join(", ") || undefined,
      format: str(gig.format).trim() || undefined, lines,
      ivaPct: Number(d.vat ?? 21), irpfPct: Number(d.irpf ?? 0),
      conditions: conds.map(str).map(s => s.trim()).filter(Boolean).join("\n"),
      createdAt: isoOf(row.created_at),
    });
    const totalOld = Number(row.total);
    const base = lines.reduce((a, l) => a + l.amountCents, 0);
    const totalNew = Math.round(base * (1 + doc.ivaPct / 100 - doc.irpfPct / 100));
    if (Number.isFinite(totalOld) && Math.abs(totalNew - cents(totalOld)) > 1) warn("presupuestos", `${row.number}: total antiguo ${totalOld} € ≠ recalculado ${(totalNew / 100).toFixed(2)} €`);
    return { id: row.id, doc, legacy: row, created_at: isoOf(row.created_at) };
  });
}

function transformMerch(src, ctx) {
  const varsBy = new Map();
  for (const v of src.merch_variants) {
    if (!varsBy.has(v.product_id)) varsBy.set(v.product_id, []);
    varsBy.get(v.product_id).push(v);
  }
  const variantProduct = new Map(src.merch_variants.map(v => [v.id, v.product_id]));
  const archivedVariants = new Set(src.merch_variants.filter(v => v.archived).map(v => v.id));
  const products = src.merch_products.map(p => {
    const vs = (varsBy.get(p.id) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const v of vs) {
      if (v.price != null && cents(v.price) !== cents(p.price)) warn("merch", `${p.name} · ${v.label || "única"}: precio propio ${v.price} € ≠ producto ${p.price} € (el nuevo modelo no tiene precio por talla; manda el del producto)`);
      if (v.archived) warn("merch", `${p.name} · ${v.label || "única"}: talla archivada, no se migra (stock ${v.stock})`);
    }
    if (!vs.length) warn("merch", `${p.name}: sin tallas en merch_variants`);
    const doc = clean({
      id: p.id, name: str(p.name), priceCents: cents(p.price), costCents: cents(p.cost),
      variants: vs.filter(v => !v.archived).map(v => ({ id: v.id, label: str(v.label), stock: Number(v.stock) || 0 })),
      archived: !!p.archived, published: !p.archived, color: "senal", info: str(p.info).trim() || undefined,
    });
    return { id: p.id, doc, legacy: { ...p, variants: vs }, created_at: isoOf(p.created_at) };
  });
  const KIND = { sale: "venta", reserve: "reserva", gift: "regalo", restock: "reposicion", adjust: "recuento" };
  const SIGN = { sale: -1, reserve: -1, gift: -1, restock: 1, adjust: 1 };
  const PAY = new Set(["efectivo", "bizum", "tarjeta", "otro"]);
  const moves = src.merch_movements.map(m => {
    const productId = variantProduct.get(m.variant_id) ?? m.product_id;
    if (!productId) warn("merch", `movimiento ${m.id}: talla ${m.variant_id} no existe`);
    if (archivedVariants.has(m.variant_id)) warn("merch", `movimiento ${m.id}: apunta a una talla archivada`);
    if (!KIND[m.kind]) warn("merch", `movimiento ${m.id}: tipo «${m.kind}» desconocido → recuento`);
    if (m.status === "cancelled") warn("merch", `movimiento ${m.id} (${m.kind}) cancelado: se migra con cancelled: true`);
    const qty = Number(m.qty) || 0;
    const note = [str(m.note).trim(), str(m.event).trim() ? `bolo: ${str(m.event).trim()}` : ""].filter(Boolean).join(" · ");
    const doc = clean({
      id: m.id, variantId: m.variant_id, productId, kind: KIND[m.kind] ?? "recuento",
      qty: (SIGN[m.kind] ?? 1) * (m.kind === "adjust" ? qty : Math.abs(qty)),
      unitCents: cents(m.unit_price), payment: PAY.has(m.payment) ? m.payment : undefined,
      by: str(m.by_name).trim() || ctx.uidToName[m.created_by] || "", customer: str(m.customer).trim() || undefined,
      gigId: null, open: m.kind === "reserve" ? m.status === "open" : undefined,
      cancelled: m.status === "cancelled" ? true : undefined,
      note: note || undefined, at: isoOf(m.created_at),
    });
    return { id: m.id, doc, legacy: m, created_at: isoOf(m.created_at) };
  });
  return { products, moves };
}

function transformFinance(src, ctx) {
  const fm = id => ctx.finToMember[id] ?? (warn("finanzas", `finance_member ${id} desconocido`), `legacy-${id}`);
  const expenses = src.finance_expenses.map(e => {
    const parts = Array.isArray(e.participant_ids) ? e.participant_ids : JSON.parse(e.participant_ids || "[]");
    const doc = { id: e.id, title: str(e.title), amountCents: cents(e.amount), payerId: fm(e.payer_id), participantIds: parts.map(fm), category: str(e.category) || "otros", date: madridDate(e.created_at) };
    return { id: e.id, doc, legacy: e, created_at: isoOf(e.created_at) };
  });
  const settlements = src.finance_settlements.map(s => ({
    id: s.id,
    doc: clean({ id: s.id, fromId: fm(s.debtor_id), toId: fm(s.creditor_id), amountCents: cents(s.amount), date: madridDate(s.created_at), note: str(s.note).trim() || undefined }),
    legacy: s, created_at: isoOf(s.created_at),
  }));
  const catNames = new Set();
  const categories = src.finance_categories.map(c => { catNames.add(c.name); return { id: c.name, doc: { name: c.name }, legacy: c, created_at: isoOf(c.created_at) }; });
  for (const name of new Set(expenses.map(e => e.doc.category))) if (!catNames.has(name)) warn("finanzas", `categoría «${name}» usada en gastos pero no está en finance_categories`);
  const audit = src.finance_audit.map(a => {
    const det = a.details ?? {};
    const action = str(det.message || det.summary).trim() || [a.action, a.entity, a.entity_id].map(str).filter(Boolean).join(" ");
    return { id: a.id, doc: { id: a.id, who: str(a.actor) || "sistema", action, at: isoOf(a.created_at) }, legacy: a, created_at: isoOf(a.created_at) };
  });
  return { expenses, settlements, categories, audit };
}

// ---------- escritura ----------
async function upsert(api, table, rows, now) {
  const body = rows.map(r => ({ id: r.id, doc: r.doc, legacy: r.legacy ?? null, created_at: r.created_at ?? now }));
  for (let i = 0; i < body.length; i += 200) {
    await api.json(`/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Profile": "besta", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body.slice(i, i + 200)),
    });
  }
}

async function upsertMembers(api, rows) {
  // de uno en uno: así un user_id null no pisa un enlace hecho a mano en otra fila
  for (const r of rows) {
    const row = { id: r.id, email: r.email, doc: r.doc };
    if (r.user_id) row.user_id = r.user_id;
    await api.json(`/rest/v1/members?on_conflict=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Profile": "besta", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([row]),
    });
  }
}

const encPath = p => p.split("/").map(encodeURIComponent).join("/");

async function copyAudio(api, objects) {
  let copied = 0, skipped = 0, failed = 0;
  for (const o of objects) {
    const head = await api.req(`/storage/v1/object/authenticated/musica/${encPath(o.path)}`, { method: "HEAD" });
    if (head.ok) { skipped++; continue; }
    const get = await api.req(`/storage/v1/object/authenticated/audio/${encPath(o.path)}`);
    if (!get.ok) { failed++; warn("storage", `no se pudo bajar audio/${o.path}: ${get.status}`); continue; }
    const buf = Buffer.from(await get.arrayBuffer());
    const put = await api.req(`/storage/v1/object/musica/${encPath(o.path)}`, {
      method: "POST",
      headers: { "Content-Type": get.headers.get("content-type") || o.mimetype || "application/octet-stream", "x-upsert": "true", "cache-control": "3600" },
      body: buf,
    });
    if (!put.ok) { failed++; warn("storage", `no se pudo subir musica/${o.path}: ${put.status} ${(await put.text()).slice(0, 200)}`); continue; }
    copied++;
    process.stdout.write(`  ↑ musica/${o.path}\n`);
  }
  return { copied, skipped, failed };
}

// ---------- main ----------
async function main() {
  let api = null;
  let src;
  if (SNAPSHOT) {
    src = readSnapshot(path.resolve(SNAPSHOT));
  } else {
    api = client(loadEnv());
    src = await readNetwork(api);
  }

  const map = loadMembersMap();
  const members = buildMembers(map, src);
  const ctx = { ...members, memberRows: members.rows, audioRefs: [], folders: new Set(), audioObjects: src.audioObjects };

  const songs = transformSongs(src, ctx);
  const setlists = transformSetlists(src, new Set(songs.map(s => s.id)), ctx);
  const ideas = transformIdeas(src, ctx);
  const riders = transformRiders(src, ctx);
  const quotes = transformQuotes(src);
  const { products, moves } = transformMerch(src, ctx);
  const { expenses, settlements, categories, audit } = transformFinance(src, ctx);

  // audios referenciados vs. bucket
  const inBucket = new Set(src.audioObjects.map(o => o.path));
  if (src.audioListed) {
    for (const r of ctx.audioRefs) if (!inBucket.has(r.path)) warn("storage", `${r.where}: audio ${r.path} no está en el bucket «audio»`);
    const refd = new Set(ctx.audioRefs.map(r => r.path));
    const orphans = src.audioObjects.filter(o => !refd.has(o.path));
    if (orphans.length) warn("storage", `${orphans.length} archivo(s) del bucket sin canción/idea que los use (se copian igual): ${orphans.slice(0, 3).map(o => o.path).join(", ")}${orphans.length > 3 ? "…" : ""}`);
  }

  const collections = { members: members.rows, songs, setlists, ideas, riders, quotes, products, moves, expenses, settlements, categories, audit };
  const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length]));
  const storage = { bucketFrom: "audio", bucketTo: "musica", objects: src.audioObjects.length, bytes: src.audioObjects.reduce((a, o) => a + (o.size || 0), 0), paths: src.audioObjects.map(o => o.path) };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", source: SNAPSHOT ? `snapshot:${path.resolve(SNAPSHOT)}` : "supabase",
    counts, storage, warnings, collections,
  }, null, 2));

  console.log(`\nbesta · migración ${APPLY ? "APPLY" : "dry run"} (${SNAPSHOT ? "snapshot local" : "Supabase"})`);
  console.log("─".repeat(52));
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}`);
  console.log(`  ${"audio→musica".padEnd(12)} ${String(storage.objects).padStart(5)} archivos (${(storage.bytes / 1048576).toFixed(1)} MB)`);
  if (warnings.length) {
    console.log(`\n${warnings.length} aviso(s):`);
    for (const w of warnings.slice(0, 60)) console.log(`  · [${w.area}] ${w.msg}`);
    if (warnings.length > 60) console.log(`  … y ${warnings.length - 60} más en el informe`);
  }
  console.log(`\nInforme: ${path.relative(process.cwd(), OUT) || OUT}`);

  if (!APPLY) { console.log("Nada escrito. Repite con --apply para migrar.\n"); return; }

  const now = new Date().toISOString();
  console.log("\nEscribiendo en besta.* …");
  await upsertMembers(api, members.rows);
  console.log(`  ✓ members (${members.rows.length})`);
  for (const [table, rows] of Object.entries(collections)) {
    if (table === "members" || !rows.length) continue;
    await upsert(api, table, rows, now);
    console.log(`  ✓ ${table} (${rows.length})`);
  }
  if (SKIP_STORAGE) console.log("  · storage omitido (--skip-storage)");
  else {
    console.log("Copiando audio → musica …");
    const r = await copyAudio(api, src.audioObjects);
    console.log(`  ✓ ${r.copied} copiados, ${r.skipped} ya estaban, ${r.failed} fallidos`);
  }
  console.log("Hecho.\n");
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
