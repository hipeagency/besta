/* Dibuja la letra de un instante en un canvas. Función pura del tiempo:
   la vista previa y la exportación fotograma a fotograma pintan lo mismo. */
import type { LyricStyle, LyricSync, LyricWord } from "@/data/types";
import { lineEnd, wordTimes } from "../sync";
import { SIZES, hash, lineVariant, rng } from "./style";

/* Paleta del vídeo: fija, no depende del tema claro/oscuro de la suite. */
export const PAL = { noche: "#0F0B08", tubo: "#1C1510", marco: "#241A13", senal: "#E8662C", senalSuave: "#F08A57", crema: "#F6E6CC" };

const FAMILY = {
  jost: (px: number) => `800 ${px}px Jost, system-ui, sans-serif`,
  fina: (px: number) => `400 ${px}px Jost, system-ui, sans-serif`,
  mono: (px: number) => `500 ${px}px "DM Mono", ui-monospace, monospace`,
};

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const noise = (...xs: number[]) => (hash(...xs) % 10000) / 10000;

const shown = (w: LyricWord, caps: LyricStyle["caps"]) =>
  caps === "mayus" ? w.text.toLocaleUpperCase("es") : caps === "minus" ? w.text.toLocaleLowerCase("es") : w.text;

/* Línea visible en t (o -1). */
function lineAt(sync: LyricSync, t: number) {
  for (let i = sync.lines.length - 1; i >= 0; i--) {
    const l = sync.lines[i];
    if (l.t == null || l.t > t) continue;
    const e = lineEnd(sync.lines, i, sync.durationSec)!;
    return t < e ? i : -1;
  }
  return -1;
}

interface Look { alpha: number; scale: number; dy: number; blur: number; glitch: number }
const NONE: Look = { alpha: 1, scale: 1, dy: 0, blur: 0, glitch: 0 };

/* Efecto de una animación con progreso p (0 = fuera, 1 = del todo dentro). */
function look(kind: string, p: number, entering: boolean, H: number, t: number): Look {
  if (p >= 1) return NONE;
  const e = easeOut(p);
  switch (kind) {
    case "fade": return { ...NONE, alpha: e };
    case "subir": return { ...NONE, alpha: e, dy: (1 - e) * H * 0.06 * (entering ? 1 : -1) };
    case "zoom": return { ...NONE, alpha: e, scale: entering ? 0.6 + 0.4 * e : 1 + (1 - e) * 0.25 };
    case "desenfoque": return { ...NONE, alpha: e, blur: (1 - e) * H * 0.025 };
    case "glitch": return { ...NONE, alpha: noise(Math.floor(t * 30), 3) > 0.25 ? 1 : 0.15, glitch: 1 - p };
    case "parpadeo": return { ...NONE, alpha: Math.floor(p * 9) % 2 ? 1 : 0.1 };
    case "maquina": return entering ? NONE : { ...NONE, alpha: e };
    default: return NONE;   // corte
  }
}

type Item = { k: number; text: string; px: number; w: number };

export function drawLyrics(g: CanvasRenderingContext2D, W: number, H: number, t: number, sync: LyricSync, style: LyricStyle, seed: number) {
  const i = lineAt(sync, t);
  if (i < 0) return;
  const line = sync.lines[i];
  const s = line.t!, e = lineEnd(sync.lines, i, sync.durationSec)!;
  const dur = e - s;
  const v = lineVariant(style, seed, i);
  const wt = wordTimes(line, e);
  let cur = 0;
  while (cur + 1 < wt.length && wt[cur + 1] <= t) cur++;

  const base = style.color === "senal" ? PAL.senal : PAL.crema;
  const accent = style.color === "senal" ? PAL.crema : PAL.senal;
  const family = FAMILY[style.font];
  g.save();
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.shadowColor = "rgba(0,0,0,.45)";

  // IMPACTO: la palabra sola, enorme, mientras suena
  const cw = line.words[cur];
  if (cw?.em === "impacto" && style.mode !== "una") {
    drawImpact(g, W, H, shown(cw, style.caps === "minus" ? "minus" : "mayus"), t - wt[cur], family);
    g.restore();
    return;
  }

  // qué palabras se ven y con qué tamaño
  const una = style.mode === "una";
  let px = H * SIZES[style.size] * v.scale * (una ? 1.6 : 1);
  const words = una ? [cur] : line.words.map((_, k) => k);
  const maxW = W * 0.84;

  // maquetar en filas; si una sola palabra no cabe, se encoge todo
  let rows: { items: Item[]; width: number }[] = [];
  for (let tries = 0; tries < 6; tries++) {
    rows = layout(g, words.map(k => {
      const w = line.words[k];
      const wpx = px * (w.em === "fuerte" ? 1.2 : 1);
      g.font = family(wpx);
      const text = shown(w, style.caps);
      return { k, text, px: wpx, w: g.measureText(text).width };
    }), maxW, px * 0.28);
    if (rows.every(r => r.width <= maxW)) break;
    px *= 0.85;
  }
  const rowH = px * 1.18;
  const blockH = rows.length * rowH;

  // dónde
  const pr = rng(hash(seed, i, 3));
  let cy = v.pos === "arriba" ? H * 0.24 : v.pos === "abajo" ? H * 0.8 : H / 2;
  let cx = W / 2;
  if (v.pos === "azar") { cy = H * (0.28 + pr() * 0.44); cx = W * (0.5 + (pr() - 0.5) * 0.24); }
  cx += v.dx * W * 0.5; cy += v.dy * H * 0.3;
  const widest = Math.max(...rows.map(r => r.width));
  cx = clamp(cx, widest / 2 + W * 0.06, W - widest / 2 - W * 0.06);
  cy = clamp(cy, blockH / 2 + H * 0.07, H - blockH / 2 - H * 0.07);

  // animación de entrada y salida (de la línea, o de cada palabra en «una a una»)
  const st = una ? wt[cur] : s;
  const en = una ? (wt[cur + 1] ?? e) : e;
  const span = en - st;
  const chars = line.words.reduce((n, w) => n + w.text.length + 1, 0);
  const inD = v.in === "corte" ? 0 : v.in === "maquina" ? Math.min(span * 0.6, 0.035 * chars + 0.15) : Math.min(una ? 0.12 : 0.35, span * 0.3);
  const outD = v.out === "corte" ? 0 : Math.min(una ? 0.1 : 0.3, span * 0.25);
  const pIn = inD > 0 ? clamp((t - st) / inD) : 1;
  const pOut = outD > 0 ? clamp((en - t) / outD) : 1;
  const a = look(v.in, pIn, true, H, t), b = look(v.out, pOut, false, H, t);
  const L: Look = { alpha: a.alpha * b.alpha, scale: a.scale * b.scale, dy: a.dy + b.dy, blur: Math.max(a.blur, b.blur), glitch: Math.max(a.glitch, b.glitch) };
  const typed = v.in === "maquina" ? Math.floor(pIn * chars) : Infinity;

  g.translate(cx, cy + L.dy);
  if (v.tilt) g.rotate(v.tilt);
  g.scale(L.scale, L.scale);
  if (L.blur > 0.5) g.filter = `blur(${L.blur.toFixed(1)}px)`;
  g.shadowBlur = px * 0.15;

  // franja detrás
  if (style.box) {
    g.save();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(15,11,8,.78)";
    rows.forEach((r, ri) => {
      const y = -blockH / 2 + ri * rowH;
      g.fillRect(-r.width / 2 - px * 0.3, y + rowH * 0.06, r.width + px * 0.6, rowH * 0.94);
    });
    g.restore();
  }

  let typedSoFar = 0;
  rows.forEach((r, ri) => {
    let x = -r.width / 2;
    const y = -blockH / 2 + ri * rowH + rowH / 2;
    for (const it of r.items) {
      const w = line.words[it.k];
      let alpha = L.alpha, color = w.em === "fuerte" ? accent : base;
      if (style.mode === "palabra") alpha *= wt[it.k] <= t ? clamp((t - wt[it.k]) / 0.12) : 0;
      if (style.mode === "karaoke") {
        if (it.k === cur) color = accent;
        else if (it.k > cur) alpha *= 0.35;
      }
      let text = it.text;
      if (typed !== Infinity) {
        const left = typed - typedSoFar;
        text = left <= 0 ? "" : text.slice(0, left);
        typedSoFar += it.text.length + 1;
      }
      let ox = 0, oy = 0;
      if (w.em === "temblor" && (style.mode !== "palabra" || wt[it.k] <= t)) {
        const f = Math.floor(t * 24);
        ox = (noise(f, it.k, 1) - 0.5) * it.px * 0.09;
        oy = (noise(f, it.k, 2) - 0.5) * it.px * 0.09;
      }
      if (alpha > 0.01 && text) {
        g.font = family(it.px);
        if (L.glitch > 0) {
          const f = Math.floor(t * 30);
          g.globalAlpha = alpha * 0.7;
          g.fillStyle = PAL.senal;
          g.fillText(text, x + ox + (noise(f, it.k, 5) - 0.5) * it.px * 0.5 * L.glitch, y + oy);
          g.fillStyle = PAL.senalSuave;
          g.fillText(text, x + ox - (noise(f, it.k, 6) - 0.5) * it.px * 0.5 * L.glitch, y + oy);
        }
        g.globalAlpha = alpha;
        g.fillStyle = color;
        g.fillText(text, x + ox, y + oy);
      }
      x += it.w + px * 0.28;
    }
  });
  g.restore();
}

function layout(g: CanvasRenderingContext2D, items: Item[], maxW: number, space: number) {
  const rows: { items: Item[]; width: number }[] = [];
  let row: Item[] = [], w = 0;
  for (const it of items) {
    const add = (row.length ? space : 0) + it.w;
    if (row.length && w + add > maxW) { rows.push({ items: row, width: w }); row = [it]; w = it.w; }
    else { row.push(it); w += add; }
  }
  if (row.length) rows.push({ items: row, width: w });
  // equilibrar dos filas: que la segunda no quede con una palabra suelta
  if (rows.length === 2 && rows[1].items.length === 1 && rows[0].items.length > 2) {
    const moved = rows[0].items.pop()!;
    rows[0].width -= moved.w + space;
    rows[1].items.unshift(moved);
    rows[1].width += moved.w + space;
  }
  return rows;
}

function drawImpact(g: CanvasRenderingContext2D, W: number, H: number, text: string, age: number, family: (px: number) => string) {
  let px = H * 0.42;
  g.font = family(px);
  const w = g.measureText(text).width;
  if (w > W * 0.86) px *= (W * 0.86) / w;
  const pop = age < 0.12 ? 1.25 - 0.25 * easeOut(age / 0.12) : 1;
  g.translate(W / 2, H / 2);
  g.scale(pop, pop);
  g.font = family(px);
  g.textAlign = "center";
  g.shadowBlur = px * 0.12;
  g.fillStyle = PAL.senal;
  g.fillText(text, 0, 0);
}
