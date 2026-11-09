/* Letra con tiempos: construirla desde la canción, repartir palabras
   dentro de cada línea y saber qué suena en cada instante. Sin React:
   lo usan el estudio de sincronía y, luego, el motor del vídeo. */
import type { LyricLine, LyricSync, LyricWord, Song } from "@/data/types";

/* Las líneas con letra de la canción, en orden. */
export function linesFromSong(song: Song): LyricLine[] {
  const out: LyricLine[] = [];
  for (const sec of song.sections) {
    sec.lines.forEach((l, i) => {
      const words = l.lyric.trim().split(/\s+/).filter(Boolean).map((text): LyricWord => ({ text }));
      if (words.length) out.push({ id: `${sec.id}:${i}`, sectionId: sec.id, section: sec.name, words });
    });
  }
  return out;
}

const lineText = (l: LyricLine) => l.words.map(w => w.text).join(" ");

/* Letra cambiada en ensayos: se rehace y se conservan tiempos y énfasis
   de las líneas que siguen igual (por texto, en orden). */
export function mergeLines(old: LyricLine[], fresh: LyricLine[]): LyricLine[] {
  let from = 0;
  return fresh.map(l => {
    const i = old.findIndex((o, k) => k >= from && lineText(o) === lineText(l));
    if (i < 0) return l;
    from = i + 1;
    return { ...l, t: old[i].t, end: old[i].end, words: old[i].words };
  });
}

/* Hasta cuándo se ve una línea: su fin marcado o el inicio de la siguiente
   con tiempo, sin pasar de la duración. */
export function lineEnd(lines: LyricLine[], i: number, duration: number): number | undefined {
  const l = lines[i];
  if (l.t == null) return undefined;
  if (l.end != null && l.end > l.t) return l.end;
  const next = lines.slice(i + 1).find(x => x.t != null);
  return Math.min(next?.t ?? duration, duration);
}

/* Inicio de cada palabra. Las marcadas a mano mandan; las demás se
   reparten entre sus vecinas según lo largas que son. */
export function wordTimes(line: LyricLine, end: number): number[] {
  const n = line.words.length;
  const start = line.t ?? 0;
  const times: (number | undefined)[] = line.words.map(w => w.t);
  times[0] = times[0] ?? start;
  const weight = (w: LyricWord) => w.text.length + 2;
  let a = 0;
  while (a < n) {
    let b = a + 1;
    while (b < n && times[b] == null) b++;
    const tA = times[a]!, tB = b < n ? times[b]! : end;
    // las últimas palabras ocupan como mucho lo que tocaría a su ritmo
    const span = tB - tA;
    const ws = line.words.slice(a, b).map(weight);
    const total = ws.reduce((s, x) => s + x, 0);
    let acc = tA;
    for (let k = a + 1; k < b; k++) { acc += (ws[k - a - 1] / total) * span; times[k] = acc; }
    a = b;
  }
  return times as number[];
}

/* Qué suena en t: índice de línea (o -1) y de palabra dentro de ella. */
export function at(sync: LyricSync, t: number): { line: number; word: number } {
  const { lines, durationSec } = sync;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.t == null || l.t > t) continue;
    const end = lineEnd(lines, i, durationSec)!;
    if (t >= end) return { line: -1, word: -1 };
    const ts = wordTimes(l, end);
    let w = 0;
    while (w + 1 < ts.length && ts[w + 1] <= t) w++;
    return { line: i, word: w };
  }
  return { line: -1, word: -1 };
}

export const EMPHASIS: { id: LyricWord["em"]; label: string }[] = [
  { id: undefined, label: "normal" },
  { id: "fuerte", label: "fuerte" },
  { id: "impacto", label: "impacto" },
  { id: "temblor", label: "temblor" },
];
export const nextEmphasis = (em: LyricWord["em"]) => EMPHASIS[(EMPHASIS.findIndex(e => e.id === em) + 1) % EMPHASIS.length].id;

/* 83.456 → «1:23.45» */
export const clock = (s: number) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
};

/* Picos para dibujar la forma de onda: máximo absoluto por columna. */
export function peaks(buf: AudioBuffer, cols: number): Float32Array {
  const out = new Float32Array(cols);
  const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const step = buf.length / cols;
  for (let i = 0; i < cols; i++) {
    let max = 0;
    const from = Math.floor(i * step), to = Math.min(buf.length, Math.floor((i + 1) * step));
    for (const d of ch) for (let j = from; j < to; j += 4) { const v = Math.abs(d[j]); if (v > max) max = v; }
    out[i] = max;
  }
  return out;
}
