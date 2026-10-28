/* Campos de ensayos que aún no están en data/types (material, notas por
   sección y miembro, petición de borrado, momentos del setlist…). Viajan
   en el mismo objeto: el almacén acepta campos de más. Cuando haya
   backend pasan a sus columnas. */
import { api } from "@/data/api";
import type { ID, Setlist, Song, SongLine, SongSection } from "@/data/types";
import { parseChordText } from "./lib";

export interface SongAudio { id: ID; name: string; url: string }
export interface SongLink { id: ID; label: string; url: string }
/* Borrar una canción es de todos: alguien lo pide y se borra cuando lo aprueba toda la banda. */
export interface DeleteRequest { by: ID; name: string; at: string; approvals: ID[] }

export type SongX = Song & {
  audios?: SongAudio[];
  links?: SongLink[];
  video?: string;                                   // campo antiguo: un solo vídeo
  notes?: string;                                   // notas generales de la canción
  sectionNotes?: Record<ID, Record<ID, string>>;    // sección → miembro → nota
  deleteRequest?: DeleteRequest;
};

export const sx = (s: Song) => s as SongX;
export const updateSong = (id: ID, patch: Partial<SongX>) => api.update("songs", id, patch as Partial<Song>);

// ---------- links ----------
export function youTubeId(url: string) {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
export const isAudioUrl = (url: string) => /\.(mp3|m4a|wav|ogg|aac|flac)(\?|$)/i.test(url) || url.startsWith("blob:");

/** Links de la canción, con el «video» antiguo y el demoUrl como uno más. */
export function songLinks(song: Song): SongLink[] {
  const s = sx(song);
  const out = (s.links ?? []).filter(l => l.url.trim());
  const add = (url: string | undefined, label: string) => {
    const u = url?.trim();
    if (u && !isAudioUrl(u) && !out.some(l => l.url === u)) out.unshift({ id: `old-${label}`, label, url: u });
  };
  add(s.video, "referencia youtube");
  add(s.demoUrl, "demo");
  return out;
}

// ---------- setlist con momentos y bloques ----------
export type SetlistItem =
  | { id: ID; type: "song"; songId: ID; notes?: string }
  | { id: ID; type: "momento" | "bloque"; title: string; notes?: string };

export type SetlistX = Setlist & { items?: SetlistItem[]; venue?: string; date?: string };

export const updateSetlist = (id: ID, patch: Partial<SetlistX>) => api.update("setlists", id, patch as Partial<Setlist>);

/* El orden manda en songIds (lo leen bolos y el directo); items solo
   añade momentos, bloques y notas alrededor. Si no casan, se rehace. */
export function setlistItems(sl: Setlist): SetlistItem[] {
  const items = (sl as SetlistX).items ?? [];
  const songItems = new Map(items.filter(i => i.type === "song").map(i => [(i as { songId: ID }).songId, i]));
  const out: SetlistItem[] = [];
  let k = 0;
  for (const it of items) {
    if (it.type !== "song") { out.push(it); continue; }
    // cada hueco de canción se rellena con la siguiente de songIds (por si se reordenó fuera)
    const sid = sl.songIds[k++];
    if (sid) out.push(songItems.get(sid) ?? { id: `s-${sid}`, type: "song", songId: sid });
  }
  for (; k < sl.songIds.length; k++) {
    const sid = sl.songIds[k];
    out.push(songItems.get(sid) ?? { id: `s-${sid}`, type: "song", songId: sid });
  }
  return out;
}

export const songIdsOf = (items: SetlistItem[]) => items.flatMap(i => (i.type === "song" ? [i.songId] : []));

// ---------- importar JSON (app antigua o esta) ----------
interface LegacySection { name?: string; type?: string; lyrics?: string; chords?: string }
interface LegacySong { id?: string; title?: string; artist?: string; key?: string; bpm?: number | string; duration?: string; video?: string; links?: { label?: string; url?: string }[]; sections?: (LegacySection | SongSection)[] }

/** «[Am]hola [G]qué tal» → acordes encima, cada uno en su columna. */
function inlineToLines(text: string): SongLine[] {
  const out: SongLine[] = [];
  for (const row of text.replace(/\r/g, "").split("\n")) {
    if (!/\[[^\]]+\]/.test(row)) { out.push(...parseChordText(row)); continue; }
    let lyric = "", chords = "";
    row.split(/(\[[^\]]+\])/).forEach(part => {
      const m = part.match(/^\[([^\]]+)\]$/);
      if (m) { if (chords.length > lyric.length) lyric += " ".repeat(chords.length - lyric.length); chords += " ".repeat(Math.max(0, lyric.length - chords.length)) + m[1] + " "; }
      else lyric += part;
    });
    out.push({ chords: chords.replace(/\s+$/, ""), lyric: lyric.replace(/\s+$/, "") });
  }
  return out.filter(l => l.chords.trim() || l.lyric.trim());
}

export function songFromJson(raw: LegacySong, uid: (p?: string) => string): SongX | null {
  if (!raw || typeof raw !== "object" || !raw.title) return null;
  const sections: SongSection[] = (raw.sections ?? []).map((s, i) => {
    if ("lines" in s && Array.isArray(s.lines)) return { id: s.id || uid(), name: s.name || `Parte ${i + 1}`, note: s.note, lines: s.lines };
    const ls = s as LegacySection;
    const lines = [
      ...(ls.chords?.trim() && !/\[[^\]]+\]/.test(ls.lyrics ?? "") ? [{ chords: ls.chords.trim(), lyric: "" }] : []),
      ...inlineToLines(ls.lyrics ?? ""),
    ];
    return { id: uid(), name: ls.name || ls.type || `Parte ${i + 1}`, lines };
  });
  const bpm = Number(raw.bpm);
  const full = raw as Partial<SongX>;
  return {
    id: uid("song-"), title: String(raw.title), artist: raw.artist ?? "", own: full.own ?? !raw.artist, key: raw.key ?? "",
    bpm: bpm > 0 ? Math.round(bpm) : undefined, duration: raw.duration || undefined,
    sections: sections.length ? sections : [{ id: uid(), name: "Estrofa", lines: [] }],
    instrumentNotes: full.instrumentNotes ?? {}, memberChords: full.memberChords ?? {}, comments: full.comments ?? [],
    demoUrl: full.demoUrl, audios: full.audios?.filter(a => !a.url.startsWith("blob:")),
    links: (raw.links ?? []).filter(l => l.url).map(l => ({ id: uid("l"), label: l.label ?? "", url: l.url! })),
    video: raw.video,
  };
}
