/* Teoría mínima para dibujar acordes: tónica + intervalos, posturas de
   guitarra (abiertas y con cejilla) y qué diagrama ve cada miembro.
   Portado tal cual de la app antigua de ensayos. */
import type { Member } from "@/data/types";

const SEMITONES: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const QUALITY_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7], M: [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7],
  dim: [0, 3, 6], aug: [0, 4, 8], "5": [0, 7], "7": [0, 4, 7, 10], M7: [0, 4, 7, 11],
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7], "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9], "9": [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
};

export interface ParsedChord { root: number; intervals: number[]; bass: number | null; quality: string }

export function parseChord(chord: string): ParsedChord | null {
  const m = chord.trim().match(/^([A-G])(b|#)?(.*)$/);
  if (!m) return null;
  const root = SEMITONES[m[1] + (m[2] || "")];
  if (root === undefined) return null;
  const rest = m[3] || "";
  let quality = rest;
  let bass: number | null = null;
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    quality = rest.slice(0, slash);
    const bm = rest.slice(slash + 1).match(/^([A-G])(b|#)?/);
    if (bm) bass = SEMITONES[bm[1] + (bm[2] || "")] ?? null;
  }
  return { root, intervals: QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS[""], bass, quality };
}

/** Notas (0–11) que suenan en el acorde, con el bajo si lo hay. */
export function chordNotes(p: ParsedChord) {
  const notes = new Set(p.intervals.map(i => (p.root + i) % 12));
  if (p.bass !== null) notes.add(p.bass);
  return notes;
}

// ---------- guitarra ----------
/* Cuerdas: 1 = mi agudo, 6 = mi grave. Para SVGuitar los trastes son
   RELATIVOS a `position` (1 = primer traste dibujado). */
export type Fing = [number, number | "x", string?];
export interface Barre { fromString: number; toString: number; fret: number }
export interface GuitarShape { position?: number; fingers: Fing[]; barres: Barre[] }

const OPEN: Record<string, GuitarShape> = {
  C: { fingers: [[5, 3, "3"], [4, 2, "2"], [2, 1, "1"], [1, 0], [3, 0], [6, "x"]], barres: [] },
  D: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "1"], [1, 2, "2"], [2, 3, "3"]], barres: [] },
  E: { fingers: [[6, 0], [5, 2, "2"], [4, 2, "3"], [3, 1, "1"], [2, 0], [1, 0]], barres: [] },
  G: { fingers: [[6, 3, "2"], [5, 2, "1"], [4, 0], [3, 0], [2, 0], [1, 3, "3"]], barres: [] },
  A: { fingers: [[6, "x"], [5, 0], [4, 2, "1"], [3, 2, "2"], [2, 2, "3"], [1, 0]], barres: [] },
  Dm: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "2"], [2, 3, "3"], [1, 1, "1"]], barres: [] },
  Em: { fingers: [[6, 0], [5, 2, "2"], [4, 2, "3"], [3, 0], [2, 0], [1, 0]], barres: [] },
  Am: { fingers: [[6, "x"], [5, 0], [4, 2, "2"], [3, 2, "3"], [2, 1, "1"], [1, 0]], barres: [] },
  C7: { fingers: [[6, "x"], [5, 3, "3"], [4, 2, "2"], [3, 3, "4"], [2, 1, "1"], [1, 0]], barres: [] },
  D7: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "2"], [2, 1, "1"], [1, 2, "3"]], barres: [] },
  E7: { fingers: [[6, 0], [5, 2, "2"], [4, 0], [3, 1, "1"], [2, 0], [1, 0]], barres: [] },
  G7: { fingers: [[6, 3, "3"], [5, 2, "2"], [4, 0], [3, 0], [2, 0], [1, 1, "1"]], barres: [] },
  A7: { fingers: [[6, "x"], [5, 0], [4, 2, "2"], [3, 0], [2, 2, "3"], [1, 0]], barres: [] },
  B7: { fingers: [[6, "x"], [5, 2, "2"], [4, 1, "1"], [3, 2, "3"], [2, 0], [1, 2, "4"]], barres: [] },
  Am7: { fingers: [[6, "x"], [5, 0], [4, 2, "2"], [3, 0], [2, 1, "1"], [1, 0]], barres: [] },
  Em7: { fingers: [[6, 0], [5, 2, "2"], [4, 0], [3, 0], [2, 3, "3"], [1, 0]], barres: [] },
  Dm7: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "2"], [2, 1, "1"], [1, 1, "1"]], barres: [] },
  Cmaj7: { fingers: [[6, "x"], [5, 3, "3"], [4, 2, "2"], [3, 0], [2, 0], [1, 0]], barres: [] },
  Dmaj7: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "1"], [2, 2, "2"], [1, 2, "3"]], barres: [] },
  Gmaj7: { fingers: [[6, 3, "2"], [5, 2, "1"], [4, 0], [3, 0], [2, 0], [1, 2, "3"]], barres: [] },
  Fmaj7: { fingers: [[6, "x"], [5, 3, "3"], [4, 2, "2"], [3, 2, "4"], [2, 1, "1"], [1, 0]], barres: [] },
  Dsus4: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "1"], [2, 3, "2"], [1, 3, "3"]], barres: [] },
  Asus4: { fingers: [[6, "x"], [5, 0], [4, 2, "1"], [3, 2, "2"], [2, 3, "3"], [1, 0]], barres: [] },
  Esus4: { fingers: [[6, 0], [5, 2, "2"], [4, 2, "3"], [3, 2, "4"], [2, 0], [1, 0]], barres: [] },
  Dsus2: { fingers: [[6, "x"], [5, "x"], [4, 0], [3, 2, "1"], [2, 3, "3"], [1, 0]], barres: [] },
  Asus2: { fingers: [[6, "x"], [5, 0], [4, 2, "1"], [3, 2, "2"], [2, 0], [1, 0]], barres: [] },
  Em6: { fingers: [[6, 0], [5, 2, "2"], [4, 2, "3"], [3, 0], [2, 2, "4"], [1, 0]], barres: [] },
  A5: { fingers: [[6, "x"], [5, 0], [4, 2, "1"], [3, 2, "2"], [2, "x"], [1, "x"]], barres: [] },
  E5: { fingers: [[6, 0], [5, 2, "1"], [4, 2, "2"], [3, "x"], [2, "x"], [1, "x"]], barres: [] },
};

/* Formas móviles con cejilla (1 = traste de la cejilla). E: tónica en la 6ª; A: en la 5ª. */
interface Movable { mute?: number[]; barres?: Barre[]; fingers: Fing[] }
const B6: Barre = { fromString: 6, toString: 1, fret: 1 };
const B5: Barre = { fromString: 5, toString: 1, fret: 1 };

const SHAPE_E: Record<string, Movable> = {
  maj: { barres: [B6], fingers: [[5, 3, "3"], [4, 3, "4"], [3, 2, "2"]] },
  m: { barres: [B6], fingers: [[5, 3, "3"], [4, 3, "4"]] },
  "7": { barres: [B6], fingers: [[5, 3, "3"], [3, 2, "2"]] },
  m7: { barres: [B6], fingers: [[5, 3, "3"]] },
  maj7: { barres: [B6], fingers: [[5, 3, "4"], [4, 2, "2"], [3, 2, "3"]] },
  sus4: { barres: [B6, { fromString: 5, toString: 3, fret: 3 }], fingers: [] },
  aug: { mute: [2, 1], fingers: [[6, 1, "1"], [5, 4, "4"], [4, 3, "3"], [3, 2, "2"]] },
  "5": { mute: [3, 2, 1], fingers: [[6, 1, "1"], [5, 3, "3"], [4, 3, "4"]] },
};

const SHAPE_A: Record<string, Movable> = {
  maj: { mute: [6], barres: [B5], fingers: [[4, 3, "2"], [3, 3, "3"], [2, 3, "4"]] },
  m: { mute: [6], barres: [B5], fingers: [[4, 3, "3"], [3, 3, "4"], [2, 2, "2"]] },
  "7": { mute: [6], barres: [B5], fingers: [[4, 3, "3"], [2, 3, "4"]] },
  m7: { mute: [6], barres: [B5], fingers: [[4, 3, "3"], [2, 2, "2"]] },
  maj7: { mute: [6, 1], fingers: [[5, 1, "1"], [4, 3, "3"], [3, 2, "2"], [2, 3, "4"]] },
  "6": { mute: [6], barres: [B5, { fromString: 4, toString: 1, fret: 3 }], fingers: [] },
  m6: { mute: [6], fingers: [[5, 1, "1"], [4, 3, "3"], [3, 3, "4"], [2, 2, "2"], [1, 3, "4"]] },
  sus4: { mute: [6], barres: [B5], fingers: [[4, 3, "2"], [3, 3, "3"], [2, 4, "4"]] },
  sus2: { mute: [6], barres: [B5], fingers: [[4, 3, "3"], [3, 3, "4"]] },
  dim: { mute: [6, 1], fingers: [[5, 1, "1"], [4, 2, "2"], [3, 3, "4"], [2, 2, "3"]] },
  m7b5: { mute: [6, 1], fingers: [[5, 1, "1"], [4, 2, "2"], [3, 1, "1"], [2, 2, "3"]] },
  aug: { mute: [6], fingers: [[5, 1, "1"], [4, 4, "4"], [3, 3, "3"], [2, 3, "2"], [1, 2, "1"]] },
  "9": { mute: [6], barres: [B5], fingers: [[4, 3, "3"], [3, 2, "2"], [2, 3, "4"]] },
  "5": { mute: [6, 3, 2, 1], fingers: [[5, 1, "1"], [4, 3, "3"]] },
};

/* Sufijos raros → la familia más parecida (Cadd9 → mayor, Am9 → m7…):
   mejor un diagrama aproximado que ninguno. */
const FAMILY: Record<string, string> = {
  "": "maj", M: "maj", maj: "maj", major: "maj", add9: "maj", add2: "maj", "6/9": "6", "69": "6",
  m: "m", min: "m", "-": "m", "7": "7", dom7: "7", "9": "9", "11": "7", "13": "7", "7b9": "7", "7#9": "7",
  "7b5": "7", "7#5": "aug", M7: "maj7", maj7: "maj7", Maj7: "maj7", maj9: "maj7", M9: "maj7",
  m7: "m7", min7: "m7", m9: "m7", m11: "m7", m7add11: "m7", "6": "6", M6: "6", m6: "m6", min6: "m6",
  sus4: "sus4", sus: "sus4", "4": "sus4", "7sus4": "sus4", "7sus": "sus4", sus2: "sus2", "2": "sus2",
  dim: "dim", dim7: "dim", o: "dim", "°": "dim", m7b5: "m7b5", "ø": "m7b5", halfdim: "m7b5",
  aug: "aug", "+": "aug", aug7: "aug", "5": "5", no3: "5",
};

function family(q: string) {
  if (FAMILY[q] !== undefined) return FAMILY[q];
  const minor = /^(m|min|-)(?!a)/.test(q);
  if (/maj7|M7|Δ/.test(q)) return minor ? "m7" : "maj7";
  if (/7|9|11|13/.test(q)) return minor ? "m7" : "7";
  if (/sus2/.test(q)) return "sus2";
  if (/sus/.test(q)) return "sus4";
  if (/dim|°/.test(q)) return "dim";
  if (/aug|\+/.test(q)) return "aug";
  return minor ? "m" : "maj";
}

/** Postura para cualquier acorde: abierta si existe; si no, la cejilla más cerca del clavijero. */
export function guitarShape(chord: string): GuitarShape | null {
  if (OPEN[chord]) return OPEN[chord];
  const p = parseChord(chord);
  if (!p) return null;
  const fam = family(p.quality);
  const cands: { position: number; shape: Movable }[] = [];
  const add = (table: Record<string, Movable>, open: number) => {
    const shape = table[fam];
    if (!shape) return;
    let position = ((p.root - open) % 12 + 12) % 12;
    if (position === 0) position = 12;
    cands.push({ position, shape });
  };
  add(SHAPE_E, 4);
  add(SHAPE_A, 9);
  if (!cands.length) return null;
  const best = cands.sort((a, b) => a.position - b.position)[0];
  return {
    position: best.position,
    fingers: [...(best.shape.mute ?? []).map((s): Fing => [s, "x"]), ...best.shape.fingers],
    barres: (best.shape.barres ?? []).map(b => ({ ...b })),
  };
}

// ---------- quién ve qué ----------
export type DiagramKind = "guitarra" | "piano" | "bajo" | null;

/* Cada miembro ve el diagrama de SU instrumento. La voz (Maxim) también
   toca la guitarra; la batería no lo necesita y no se le enseña nada. */
export function diagramKind(m: Pick<Member, "instrument">): DiagramKind {
  const i = m.instrument.toLowerCase();
  if (/bater|drum|perc/.test(i)) return null;
  if (/piano|teclad|key|synth/.test(i)) return "piano";
  if (/bajo|bass/.test(i)) return "bajo";
  return "guitarra";
}
