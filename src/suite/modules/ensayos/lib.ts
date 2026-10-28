/* Piezas comunes de ensayos: el formato de texto «acordes encima de
   la letra», cómo se enseña una canción (modo, tono, notación, quién
   la mira) y las preferencias que viven en este dispositivo. */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ID, Setlist, Song, SongLine, SongSection } from "@/data/types";
import { toLatin, transposeKey, transposeLine } from "@/lib/chords";
import { useMe } from "@/suite/session";
import { uid } from "@/data/api";

// ---------- texto con acordes ----------
export const CHORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M|°|ø|\+)?\d*((maj|sus|add|b|#|\+|-)?\d+)*(\([#b]?\d+\))?(\/[A-G](#|b)?)?\)?$/;
const FILLER = /^(\||\/|-|%|x\d+|\d+x|N\.?C\.?|\.+|\(|\))$/i;

/** ¿Es una línea solo de acordes? («G   D/F#   Em7 |») */
export function isChordLine(line: string) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    if (CHORD.test(t)) chords++;
    else if (!FILLER.test(t)) return false;
  }
  return chords > 0;
}

/** Texto plano (acordes encima de la letra) → líneas. */
export function parseChordText(text: string): SongLine[] {
  const rows = text.replace(/\r/g, "").replace(/\t/g, "    ").split("\n").map(r => r.replace(/\s+$/, ""));
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const out: SongLine[] = [];
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

/** Líneas → texto plano para editar. */
export const linesToText = (lines: SongLine[]) =>
  lines.map(l => [l.chords, l.lyric].filter(Boolean).join("\n")).join("\n");

const HEADER = /^\s*\[?\s*((intro|estrofa|verso|pre-?estribillo|pre-?coro|estribillo|coro|puente|solo|interludio|instrumental|outro|final|coda|bridge|chorus|verse|pre-?chorus)\b[^\]:]*)\]?\s*:?\s*$/i;
const BRACKETED = /^\s*\[([^\]]+)\]\s*$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Letra entera pegada → secciones (se cortan por líneas en blanco). */
export function importSections(text: string): SongSection[] {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map(b => b.split("\n")).filter(b => b.some(l => l.trim()));
  let n = 0;
  return blocks.map(rows => {
    let name = "";
    const first = rows[0]?.trim() ?? "";
    const m = first.match(HEADER) ?? (!isChordLine(first) ? first.match(BRACKETED) : null);
    if (m) { name = cap(m[1].trim()); rows = rows.slice(1); }
    n++;
    return { id: uid(), name: name || `Parte ${n}`, lines: parseChordText(rows.join("\n")) };
  }).filter(s => s.lines.length || s.name);
}

/** Primer acorde de la letra: buen candidato a tono. */
export function guessKey(sections: SongSection[]) {
  for (const s of sections) for (const l of s.lines) {
    const t = l.chords.trim().split(/\s+/)[0];
    const m = t?.match(/^\(?([A-G](#|b)?m?)/);
    if (m) return m[1];
  }
  return "";
}

// ---------- cómo se enseña ----------
/** Transpone y/o pasa a Do Re Mi sin mover los acordes de su columna. */
export function displayChords(line: string, semis: number, latin: boolean) {
  if (!line || (!semis && !latin)) return line;
  const pos = [...line.matchAll(/\S+/g)].map(m => m.index ?? 0);
  let conv = transposeLine(line, semis);
  if (latin) conv = toLatin(conv);
  const toks = conv.trim().split(/\s+/);
  let out = "";
  toks.forEach((t, i) => {
    const p = pos[i] ?? out.length + 1;
    if (out.length < p) out += " ".repeat(p - out.length);
    else if (out.length) out += " ";
    out += t;
  });
  return out;
}

export function displayKey(key: string, semis: number, latin: boolean) {
  if (!key) return "—";
  const k = transposeKey(key, semis);
  return latin ? toLatin(k) : k;
}

/* «limpio»: solo letra, sin acordes, notas ni diagramas (para leer y ya). */
export type ViewMode = "letra" | "acordes" | "mis" | "limpio";

export interface ShownSection { sec: SongSection; lines: SongLine[]; own: boolean }

/** Secciones tal y como se ven: según modo, miembro, tono y notación. */
export function shownSections(song: Song, mode: ViewMode, memberId: ID, semis: number, latin: boolean): ShownSection[] {
  return song.sections.map(sec => {
    if (mode === "letra" || mode === "limpio") return { sec, own: false, lines: sec.lines.filter(l => l.lyric.trim()).map(l => ({ chords: "", lyric: l.lyric })) };
    const mine = mode === "mis" ? song.memberChords[memberId]?.[sec.id] : undefined;
    let lines = sec.lines;
    if (mine != null) {
      const rows = mine.split("\n");
      lines = sec.lines.map((l, i) => ({ chords: rows[i] ?? "", lyric: l.lyric }));
      rows.slice(sec.lines.length).forEach(r => lines.push({ chords: r, lyric: "" }));
    }
    return {
      sec, own: mine != null,
      lines: lines.filter(l => l.chords.trim() || l.lyric.trim()).map(l => ({ chords: displayChords(l.chords, semis, latin), lyric: l.lyric })),
    };
  });
}

/** «3:41» → 221 */
export function durationSecs(d?: string) {
  if (!d) return 210;
  const [m, s] = d.split(":").map(Number);
  return (m || 0) * 60 + (s || 0) || 210;
}
export const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- preferencias de este dispositivo ----------
const EVT = "besta-ensayos-pref";

function readPref<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r == null ? fallback : (JSON.parse(r) as T); } catch { return fallback; }
}

/** Estado guardado en localStorage y compartido entre componentes. */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => readPref(key, fallback));
  useEffect(() => {
    setV(readPref(key, fallback));
    const h = (e: Event) => { if ((e as CustomEvent<string>).detail === key) setV(readPref(key, fallback)); };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((nv: T) => {
    try { localStorage.setItem(key, JSON.stringify(nv)); } catch { /* sin almacenamiento */ }
    setV(nv);
    window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
  }, [key]);
  return [v, set];
}

/** Lo que cada uno elige para leer: no va a los datos de la banda. */
export function useView() {
  const { me } = useMe();
  const [viewAs, setViewAs] = usePref<ID>(`besta:ensayos:${me.id}:ver-como`, me.id);
  const [mode, setMode] = usePref<ViewMode>(`besta:ensayos:${me.id}:modo`, "acordes");
  const [latin, setLatin] = usePref<boolean>(`besta:ensayos:${me.id}:latino`, false);
  const [diagrams, setDiagrams] = usePref<boolean>(`besta:ensayos:${me.id}:diagramas`, false);
  return { me, viewAs, setViewAs, mode, setMode, latin, setLatin, diagrams, setDiagrams };
}

/** Semitonos de transposición: por persona y por canción. */
export function useTranspose(songId: ID | undefined): [number, (n: number) => void] {
  const { me } = useMe();
  const [all, setAll] = usePref<Record<ID, number>>(`besta:ensayos:${me.id}:tono`, {});
  const semis = songId ? all[songId] ?? 0 : 0;
  const set = (n: number) => {
    if (!songId) return;
    const next = { ...all };
    const v = ((n % 12) + 18) % 12 - 6; // −6…+5
    if (v) next[songId] = v; else delete next[songId];
    setAll(next);
  };
  return [semis, set];
}

export function useLastSong() {
  const { me } = useMe();
  return usePref<ID | null>(`besta:ensayos:${me.id}:ultima`, null);
}

// ---------- conexión y pantalla ----------
const onlineSub = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
export const useOnline = () => useSyncExternalStore(onlineSub, () => navigator.onLine, () => true);

/** Pantalla siempre encendida mientras se toca. Se pierde al cambiar de app: se vuelve a pedir. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const get = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (dead) l.release().catch(() => {}); else lock = l;
      } catch { /* sin permiso o batería baja */ }
    };
    get();
    const vis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [active]);
}

// ---------- ajustes de lectura de este aparato ----------
/** Tamaño de letra de la vista de canción (×1 = normal). Es del aparato, no de la persona. */
export const FONT_MIN = 0.7, FONT_MAX = 2.5;
export const useFontScale = () => usePref<number>("besta:ensayos:letra", 1);

/** Multiplicador del auto-scroll; la velocidad base sale del BPM. */
export const SPEED_MIN = 0.25, SPEED_MAX = 3;
export const useScrollSpeed = () => usePref<number>("besta:ensayos:autoscroll", 1);

/** Directo: todo seguido con scroll, o una estrofa cada vez (iPad en el atril). */
export type Pase = "continuo" | "estrofas";
export const usePase = () => usePref<Pase>("besta:ensayos:directo-pase", "continuo");

/* Modo concierto: no se guarda (se apaga al recargar), pero lo leen
   la cabecera de ensayos y la canción, así que vive fuera de React. */
let concert = false;
const concertSubs = new Set<() => void>();
export function setConcert(v: boolean) { concert = v; concertSubs.forEach(f => f()); }
export const useConcert = () => useSyncExternalStore(
  cb => { concertSubs.add(cb); return () => { concertSubs.delete(cb); }; },
  () => concert, () => false,
);

// ---------- copia para el directo sin internet ----------
/* De momento es una copia en localStorage; con el despliegue llega
   el service worker que guarda también la app. */
export const OFFLINE_KEY = "besta:ensayos:offline";
export interface OfflineCopy { at: string; songs: Song[]; setlists: Setlist[] }

export function readOffline(): OfflineCopy | null {
  try { const r = localStorage.getItem(OFFLINE_KEY); return r ? (JSON.parse(r) as OfflineCopy) : null; } catch { return null; }
}

export function writeOffline(songs: Song[], setlists: Setlist[]) {
  const copy: OfflineCopy = { at: new Date().toISOString(), songs, setlists };
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(copy)); } catch { return null; }
  window.dispatchEvent(new CustomEvent(EVT, { detail: OFFLINE_KEY }));
  return copy;
}

/** Fecha de la última copia (o null), y se entera cuando se rehace. */
export function useOfflineAt() {
  const [at, setAt] = useState<string | null>(() => readOffline()?.at ?? null);
  useEffect(() => {
    setAt(readOffline()?.at ?? null);
    const h = (e: Event) => { if ((e as CustomEvent<string>).detail === OFFLINE_KEY) setAt(readOffline()?.at ?? null); };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return at;
}

/** Acordes distintos de unas líneas, en orden de aparición. */
export function chordsIn(lines: SongLine[]) {
  const seen = new Set<string>();
  for (const l of lines) for (const raw of l.chords.split(/[\s|]+/)) {
    const t = raw.replace(/^\(|\)$/g, "");
    if (t && CHORD.test(t)) seen.add(t);
  }
  return [...seen];
}
