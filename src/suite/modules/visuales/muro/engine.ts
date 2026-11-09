/* Estudio de visuales, el motor: muro CRT y portada flotante.
   Antes vivía suelto en public/suite/estudio-visuales.html y se veía
   en un iframe; ahora es parte de la suite. El dibujo es el mismo:
   una pared de teles en la que se detecta cada pantalla por su brillo
   y se le asigna lo que emite, o una portada con PNG a la deriva. Todo
   cierra en bucle: el tiempo t va de 0 a 1 en los segundos del muro.

   El estado es mutable a propósito (se pinta 60 veces por segundo); la
   interfaz se entera de los cambios con subscribe() y relee lo que
   necesite. Cada cambio de ajustes se guarda solo (ver persist.ts). */
import { idb, loadSnapshot, saveSnapshot, type Snapshot } from "./persist";

export type Mode = "wall" | "scene";
export type Role = "logo" | "media" | "text" | "static" | "flat" | "roll" | "off";
export type Noise = "no" | "grano" | "vhs" | "both";
export type Tint = "cream" | "orange";
export type Fill = "blur" | "crop" | "flat";
export type MediaEl = HTMLImageElement | HTMLVideoElement;

export interface Screen {
  i: number;                                   // número de canal, desde 1
  x: number; y: number; w: number; h: number;  // caja con margen para la máscara suave
  cx: number; cy: number; cw: number; ch: number;   // caja de la pantalla en sí
  mask: HTMLCanvasElement; maskW: HTMLCanvasElement;
  lum: number; wing: boolean;
  role: Role; role0: Role;
  media: string | null; el: MediaEl | null; mkey: string | null;
  fit: "cover" | "contain"; aged: number; gain: number; col: Tint;
  ph: number; k: number; rate: number;
  vdur: number; vin: number; vlen: number; vrate: number;
  txt: string; tsize: number; nz: Noise; nzA: number;
}

export interface Layer {
  name: string; el: HTMLImageElement; mkey: string | null;
  x: number; y: number; s: number; op: number; amp: number; spd: number;
  rot: number; br: number; aged: number; ph: number;
}

export interface Settings {
  aspect: string;    // "2" | "1.7778" | "0" (original)
  scale: number; secs: number; fps: number;
  scan: number; grain: number; sweep: number; flick: number;
  vfmt: string;
}

export interface Ticker { on: boolean; txt: string; pos: "bottom" | "top"; rate: number; h: number; col: Tint }

export const ROLES: { id: Role; label: string }[] = [
  { id: "logo", label: "Logo original" },
  { id: "media", label: "Foto o vídeo…" },
  { id: "text", label: "Rótulo con texto" },
  { id: "static", label: "Nieve / estática" },
  { id: "flat", label: "Color plano" },
  { id: "roll", label: "Imagen desenganchada" },
  { id: "off", label: "Apagada" },
];
/* roles con velocidad propia (la nieve, la desenganchada, la banda, el parpadeo) */
export const RATED: Role[] = ["static", "flat", "roll", "off", "text"];
export const DEF_SETTINGS: Settings = { aspect: "2", scale: 2, secs: 10, fps: 30, scan: 42, grain: 34, sweep: 30, flick: 35, vfmt: "mp4" };
export const DEF_TICK: Ticker = { on: false, txt: "@besta_oficial", pos: "bottom", rate: 1, h: 6, col: "cream" };
const SCREEN_DEF = {
  fit: "cover", aged: 70, gain: 100, col: "cream", rate: 1, vdur: 0, vin: 0, vlen: 0, vrate: 1,
  txt: "@besta_oficial", tsize: 100, nz: "no", nzA: 45,
} as const;

const CREAM = [232, 220, 197], ORANGE = [206, 96, 42], TAU = Math.PI * 2;
const MONO = `ui-monospace,"SF Mono",Menlo,Consolas,monospace`;

export const fmt = (v: number, n = 1) => (isFinite(v) ? v : 0).toFixed(n).replace(".", ",");
export const newCv = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;

/* ══ recorte y velocidad de los vídeos ═════════════════════════════ */
export const isVid = (s: Screen | undefined): s is Screen & { el: HTMLVideoElement } => !!s?.el && s.el.tagName === "VIDEO";
export const sRate = (s: Screen) => Math.max(0, s.rate ?? 1);   // 0 = imagen congelada
export const vDur = (s: Screen) => (s.vdur > 0 ? s.vdur : 0);
export const vIn = (s: Screen) => { const d = vDur(s); return d ? Math.min(Math.max(0, s.vin || 0), Math.max(0, d - 0.1)) : 0; };
export const vLen = (s: Screen) => {
  const d = vDur(s);
  if (!d) return Math.max(0.1, s.vlen || 1);
  const a = vIn(s);
  return Math.max(0.1, Math.min(s.vlen || d - a, d - a));
};
export const vRate = (s: Screen) => Math.max(0.1, s.vrate || 1);
/* segundo exacto del vídeo para el instante normalizado t del muro */
export const vTime = (s: Screen, t: number, secs: number) => vIn(s) + ((t * secs * vRate(s)) % vLen(s));
export const nzAmt = (s: Screen | undefined) => (s && s.nz && s.nz !== "no" ? (s.nzA ?? 45) / 100 : 0);

/* ══ 1. morfología y detección ═════════════════════════════════════ */
function minF(src: Uint8Array, w: number, h: number, r: number) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= w || !src[o + xx]) { v = 0; break; } }
      a[o + x] = v;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 1;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy < 0 || yy >= h || !a[yy * w + x]) { v = 0; break; } }
    b[y * w + x] = v;
  }
  return b;
}
function maxF(src: Uint8Array, w: number, h: number, r: number) {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w && src[o + xx]) { v = 1; break; } }
      a[o + x] = v;
    }
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h && a[yy * w + x]) { v = 1; break; } }
    b[y * w + x] = v;
  }
  return b;
}
function fillHoles(m: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h), st: number[] = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const p = st.pop()!;
    if (seen[p] || m[p]) continue;
    seen[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) st.push(p - 1); if (x < w - 1) st.push(p + 1);
    if (y > 0) st.push(p - w); if (y < h - 1) st.push(p + w);
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = m[i] || !seen[i] ? 1 : 0;
  return o;
}
interface Box { x: number; y: number; w: number; h: number; area: number; id: number }
function detect(px: Uint8ClampedArray, w: number, h: number) {
  let m: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = l > 130 || (r > 110 && r - b > 55 && g < r * 0.85) ? 1 : 0;
  }
  const R = Math.max(2, Math.round(w / 1000));
  m = maxF(minF(m, w, h, R), w, h, R);            // apertura
  m = minF(maxF(m, w, h, R * 2), w, h, R * 2);    // cierre
  m = fillHoles(m, w, h);

  const lab = new Int32Array(w * h).fill(-1), out: Box[] = [];
  const st = new Int32Array(w * h);
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    let sp = 0;
    st[sp++] = i; lab[i] = id;
    let x0 = i % w, x1 = x0, y0 = (i / w) | 0, y1 = y0, n = 0;
    while (sp) {
      const p = st[--sp]; n++;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && m[q] && lab[q] < 0) { lab[q] = id; st[sp++] = q; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ar = bw / bh;
    if (bw >= w * 0.019 && bh >= h * 0.024 && n / (bw * bh) >= 0.55 && ar > 0.7 && ar < 2.5)
      out.push({ x: x0, y: y0, w: bw, h: bh, area: n, id });
    id++;
  }
  out.sort((a, b) => b.area - a.area);
  return { boxes: out, lab };
}

/* ══ 2. texturas cíclicas (se crean una vez) ═══════════════════════ */
let TILES: HTMLCanvasElement[] = [], GRAIN: HTMLCanvasElement[] = [], SPECK: HTMLCanvasElement[] = [];
function buildTiles() {
  if (TILES.length) return;
  const noise = (w: number, h: number, px: (i: number, d: Uint8ClampedArray) => void) => {
    const c = newCv(w, h), g = ctx2d(c), im = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) px(i, im.data);
    g.putImageData(im, 0, 0);
    return c;
  };
  for (let n = 0; n < 12; n++) TILES.push(noise(192, 144, (i, d) => {
    const v = 110 + Math.random() * 145;
    d[i * 4] = v; d[i * 4 + 1] = v * 0.95; d[i * 4 + 2] = v * 0.86; d[i * 4 + 3] = 255;
  }));
  for (let n = 0; n < 6; n++) GRAIN.push(noise(220, 220, (i, d) => {
    const v = 128 + (Math.random() - 0.5) * 150;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }));
  // chispas: casi todo negro con algún punto encendido. Sumadas al grano
  // son lo único que se ve hervir en las zonas oscuras, como el logo.
  for (let n = 0; n < 6; n++) SPECK.push(noise(220, 220, (i, d) => {
    const v = Math.random() < 0.045 ? 60 + Math.random() * 195 : 0;
    d[i * 4] = v; d[i * 4 + 1] = v * 0.95; d[i * 4 + 2] = v * 0.86; d[i * 4 + 3] = 255;
  }));
}
function vignette(g: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.62);
  r.addColorStop(0, "rgba(0,0,0,0)"); r.addColorStop(1, `rgba(0,0,0,${amt})`);
  g.globalCompositeOperation = "source-over"; g.fillStyle = r; g.fillRect(0, 0, w, h);
}
function lines(g: CanvasRenderingContext2D, w: number, h: number, px: number, amt: number) {
  if (amt <= 0) return;
  g.globalCompositeOperation = "multiply";
  g.fillStyle = `rgba(0,0,0,${amt})`;
  for (let y = 0; y < h; y += px * 2) g.fillRect(0, y, w, px);
  g.globalCompositeOperation = "source-over";
}

/* ══ 3. ruido propio de cada televisor ═══════════════════════════════
   grano — la emulsión hierve y el tubo respira; rayas — bandas de VHS
   que suben arrastrando la imagen de lado. Avanza a saltos enteros
   dentro de t∈[0,1), así que el bucle exportado encadena sin salto.   */
function tvNoise(g: CanvasRenderingContext2D, c: HTMLCanvasElement, w: number, h: number, t: number, s: Screen, secsRaw: number, SC: number) {
  const a = nzAmt(s);
  if (a <= 0) return;
  const secs = Math.max(1, Math.round(secsRaw));
  // ruido repetible: el mismo fotograma da siempre el mismo grano
  const R = (n: number) => { const v = Math.sin(n * 12.9898 + s.ph * 78.233 + s.i * 1.7) * 43758.5453; return v - Math.floor(v); };

  if ((s.nz === "grano" || s.nz === "both") && GRAIN.length) {
    const NS = GRAIN.length * secs * 2;
    const st = Math.floor(t * NS) % NS;
    const tl = GRAIN[st % GRAIN.length];
    g.save();
    g.translate(-Math.round(R(st + 1) * tl.width), -Math.round(R(st + 7) * tl.height));
    g.globalCompositeOperation = "overlay";
    g.globalAlpha = Math.min(0.85, 0.36 * a);
    g.fillStyle = g.createPattern(tl, "repeat")!;
    g.fillRect(0, 0, w + tl.width, h + tl.height);
    g.restore();
    const sp = SPECK[(st + 2) % SPECK.length];
    g.save();
    g.translate(-Math.round(R(st + 11) * sp.width), -Math.round(R(st + 5) * sp.height));
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.min(0.8, 0.55 * a);
    g.fillStyle = g.createPattern(sp, "repeat")!;
    g.fillRect(0, 0, w + sp.width, h + sp.height);
    g.restore();
    const fl = 0.09 * a * Math.sin(TAU * (t * (2 + (s.k || 1)) + s.ph)) + 0.05 * a * (R(st + 3) - 0.5);
    g.globalCompositeOperation = fl > 0 ? "lighter" : "multiply";
    g.globalAlpha = Math.min(0.6, Math.abs(fl));
    g.fillStyle = fl > 0 ? "#FFF4E1" : "#6B6259";
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  if (s.nz === "vhs" || s.nz === "both") {
    const px = Math.max(1, Math.round(SC));
    const NB = 2 + Math.round(3 * a);                   // más ruido, más bandas
    const stT = Math.floor(t * TILES.length * secs) % TILES.length;
    for (let i = 0; i < NB; i++) {
      const spd = 1 + ((i * 2 + 1) % 5);                // vueltas enteras por bucle
      const bh = Math.max(2 * px, Math.round(h * (0.02 + 0.1 * R(i + 1)) * (0.4 + 0.8 * a)));
      const yb = Math.round(((t * spd + s.ph * 3 + i * 0.37) % 1) * (h + bh)) - bh;
      const y0 = Math.max(0, yb), y1 = Math.min(h, yb + bh);
      if (y1 <= y0) continue;
      const sh = y1 - y0;
      const dx = Math.round((1 + 9 * a * R(i + 9)) * SC) * (R(i + 5) < 0.5 ? -1 : 1);
      g.drawImage(c, 0, y0, w, sh, dx, y0, w, sh);      // la banda arrastra la imagen
      g.save();
      g.beginPath(); g.rect(0, y0, w, sh); g.clip();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.08 + 0.2 * a;
      g.fillStyle = g.createPattern(TILES[(stT + i) % TILES.length], "repeat")!;
      g.fillRect(0, y0, w, sh);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.fillStyle = `rgba(255,244,225,${0.05 + 0.1 * a})`; g.fillRect(0, y0, w, sh);
      g.restore();
      g.fillStyle = `rgba(0,0,0,${0.22 + 0.34 * a})`;    // el corte de arriba de la banda
      g.fillRect(0, y0, w, px);
    }
  }
}

function screenContent(s: Screen, t: number, SC: number, secs: number, plate: HTMLCanvasElement) {
  const w = Math.round(s.w * SC), h = Math.round(s.h * SC);
  const c = newCv(w, h), g = ctx2d(c);
  const lin = Math.max(1, Math.round(2 * SC));
  const gain = s.gain / 100;
  g.fillStyle = "#0C0A09"; g.fillRect(0, 0, w, h);   // base opaca: tapa el logo de debajo

  if (s.role === "media" && s.el) {
    const el = s.el;
    const mw = "videoWidth" in el ? el.videoWidth : el.naturalWidth, mh = "videoHeight" in el ? el.videoHeight : el.naturalHeight;
    if (mw && mh) {
      const sr = mw / mh, dr = w / h;
      let dw: number, dh: number;
      const cover = s.fit === "cover";
      if ((sr > dr) === cover) { dh = h; dw = h * sr; } else { dw = w; dh = w / sr; }
      const a = s.aged / 100;
      g.filter = `grayscale(${0.3 * a}) sepia(${0.34 * a}) contrast(${1 - 0.16 * a}) brightness(${(0.92 - 0.1 * a) * gain}) saturate(${1 - 0.22 * a})`;
      g.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
      g.filter = "none";
      g.globalCompositeOperation = "overlay";
      g.fillStyle = `rgba(232,220,197,${0.3 * a})`; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
      lines(g, w, h, lin, 0.2 * a + 0.06);
      vignette(g, w, h, 0.34 + 0.16 * a);
    }
  } else if (s.role === "text") {
    const c3 = s.col === "orange" ? ORANGE : CREAM;
    const txt = (s.txt ?? "@besta_oficial").trim();
    if (txt) {
      const r = sRate(s);
      const pulso = r ? 0.84 + 0.16 * Math.sin(TAU * (t * r * 4 + s.ph)) : 1;   // latido de tubo
      // 100 % = el texto llena el ancho de la pantalla; el resto es proporción
      const F = (n: number) => `700 ${n}px ${MONO}`;
      g.font = F(100);
      const w100 = g.measureText(txt).width || 1;
      const lleno = Math.min((w * 0.88 * 100) / w100, h * 0.62);
      const fs = Math.max(6, Math.round((lleno * (s.tsize || 100)) / 100));
      g.font = F(fs);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.globalAlpha = Math.min(1, gain * pulso);
      g.shadowColor = `rgba(${c3.join(",")},.8)`; g.shadowBlur = fs * 0.55;
      g.fillStyle = `rgb(${c3.join(",")})`;
      g.fillText(txt, w / 2, h / 2); g.fillText(txt, w / 2, h / 2);   // dos pasadas: más brasa
      g.shadowBlur = 0; g.globalAlpha = 1;
    }
    lines(g, w, h, lin, 0.2); vignette(g, w, h, 0.44);
  } else if (s.role === "static") {
    // el grano avanza a saltos: 12 por segundo a 1×, 0 = congelada
    const st = Math.floor(t * secs * 12 * sRate(s));
    const tile = TILES[st % TILES.length];
    const ox = ((st * 0.37) % 1) * tile.width, oy = ((st * 0.71) % 1) * tile.height;
    g.globalAlpha = Math.min(1, (s.lum / 150) * gain);
    for (let y = -1; y <= Math.ceil(h / tile.height); y++)
      for (let x = -1; x <= Math.ceil(w / tile.width); x++) g.drawImage(tile, x * tile.width - ox, y * tile.height - oy);
    g.globalAlpha = 1;
    lines(g, w, h, lin, 0.12); vignette(g, w, h, 0.4);
  } else if (s.role === "flat") {
    const c3 = s.col === "orange" ? ORANGE : CREAM;
    g.fillStyle = `rgb(${c3.map(v => Math.round(v * 0.92 * gain)).join(",")})`;
    g.fillRect(0, 0, w, h);
    const yb = ((t * 2 * sRate(s) + s.ph) % 1) * h;
    const gr = g.createLinearGradient(0, yb - h * 0.16, 0, yb + h * 0.16);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.10)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    lines(g, w, h, lin, 0.1); vignette(g, w, h, 0.38);
  } else if (s.role === "roll") {
    const sh = ((t * s.k * sRate(s)) % 1) * h;
    g.globalAlpha = gain;
    g.drawImage(plate, s.x, s.y, s.w, s.h, 0, sh, w, h);
    g.drawImage(plate, s.x, s.y, s.w, s.h, 0, sh - h, w, h);
    g.globalAlpha = 1;
    g.fillStyle = "rgba(0,0,0,.62)"; g.fillRect(0, sh - 3 * SC, w, 3 * SC);
    g.fillRect(0, sh - h - 3 * SC, w, 3 * SC);
    lines(g, w, h, lin, 0.14);
  } else if (s.role === "off") {
    const tt = t * sRate(s);
    const fl = Math.exp(-Math.pow((((tt + s.ph) % 1) - 0.5) / 0.016, 2) / 2);
    g.globalAlpha = (0.1 + 0.05 * Math.sin(TAU * (tt * s.k + s.ph)) + 0.55 * fl) * gain;
    g.drawImage(plate, s.x, s.y, s.w, s.h, 0, 0, w, h);
    g.globalAlpha = 1; vignette(g, w, h, 0.5);
  } else if (s.role === "logo") {
    if (nzAmt(s) <= 0) return null;             // sin ruido, se deja la placa original
    g.drawImage(plate, s.x, s.y, s.w, s.h, 0, 0, w, h);
  } else return null;

  tvNoise(g, c, w, h, t, s, secs, SC);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(s.mask, 0, 0, w, h);
  return c;
}

/* ══ 4. portada flotante ═════════════════════════════════════════════
   Frecuencias enteras respecto al bucle: el vídeo encadena sin salto. */
function lPos(L: Layer, t: number) {
  const n = L.spd || 1, a = TAU * (n * t + L.ph), b = TAU * (2 * n * t + L.ph * 1.7 + 0.15);
  return { dx: (L.amp / 1000) * Math.sin(a), dy: (L.amp / 1000) * 0.62 * Math.sin(b), rot: (L.rot / 1000) * Math.sin(a + 1.1), sc: 1 + (L.br / 100) * Math.sin(b + 0.6) };
}

/* ══ 5. el estudio ═══════════════════════════════════════════════════ */
export interface Busy { lbl: string; sub: string; pct: number | null }

export class Studio {
  readonly cv = newCv(2, 1);
  private ctx = ctx2d(this.cv);
  mode: Mode = "wall";
  set: Settings = { ...DEF_SETTINGS };
  tick: Ticker = { ...DEF_TICK };
  wall = {
    plate: null as HTMLCanvasElement | null, PW: 0, PH: 0, PAD: 0, srcW: 0, srcH: 0,
    file: null as Blob | null, screens: [] as Screen[], mid: 0,
  };
  scene = {
    bg: null as HTMLImageElement | null, bgName: "", bgKey: null as string | null,
    fill: "blur" as Fill, gain: 100, op: 100, col: "#0a0908", layers: [] as Layer[], lid: 0,
  };
  sel = -1;                       // pantalla principal elegida
  selSet = new Set<number>();
  layerSel = -1;
  playing = false;
  private t0 = 0;
  busy: Busy | null = null;
  saved: { ok: boolean; text: string } = { ok: false, text: "sin guardar" };
  private canSave = true;
  private restoring = false;
  private saveT: ReturnType<typeof setTimeout> | undefined;
  private subs = new Set<() => void>();
  private rev = 0;
  private disposed = false;

  constructor() { buildTiles(); }

  /* ── avisos a la interfaz ── */
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  version = () => this.rev;
  emit() { this.rev++; this.subs.forEach(f => f()); }
  setBusy(lbl: string | false, sub = "", pct: number | null = null) {
    this.busy = lbl === false ? null : { lbl, sub, pct };
    this.emit();
  }
  /** Cambio de ajustes desde el panel: repinta si está en pausa, avisa y guarda. */
  change(fn?: () => void, save = true) {
    fn?.();
    if (!this.playing) this.draw(this.now());
    this.emit();
    if (save) this.autosave();
  }

  /* ── medidas del lienzo según el modo ── */
  get ready() { return this.mode === "scene" ? !!this.scene.bg : !!this.wall.plate; }
  dims() {
    if (this.mode === "wall") return { PW: this.wall.PW, PH: this.wall.PH };
    const bg = this.scene.bg;
    if (!bg) return { PW: 0, PH: 0 };
    const want = Number(this.set.aspect);
    const H = Math.min(bg.naturalHeight, 720);   // base; la resolución final la da ×N
    return { PW: want ? Math.round(H * want) : Math.round((H * bg.naturalWidth) / bg.naturalHeight), PH: H };
  }
  outSize() { const { PW, PH } = this.dims(); return { w: Math.round(PW * this.set.scale), h: Math.round(PH * this.set.scale) }; }
  now() { return this.playing ? ((performance.now() - this.t0) / 1000 / this.set.secs) % 1 : 0; }

  /* ── selección de pantallas ── */
  selScreens() { return [...this.selSet].sort((a, b) => a - b).map(i => this.wall.screens[i]).filter(Boolean); }
  apply(fn: (s: Screen) => void) { this.change(() => this.selScreens().forEach(fn)); }
  select(i: number, add: boolean) {
    this.change(() => {
      if (add) {
        if (this.selSet.has(i)) {
          this.selSet.delete(i);
          if (this.sel === i) this.sel = this.selSet.size ? [...this.selSet][this.selSet.size - 1] : -1;
        } else { this.selSet.add(i); this.sel = i; }
      } else { this.selSet = new Set([i]); this.sel = i; }
    }, false);
  }
  setSel(list: number[]) {
    this.change(() => {
      this.selSet = new Set(list);
      this.sel = this.selSet.has(this.sel) ? this.sel : this.selSet.size ? [...this.selSet][0] : -1;
    }, false);
  }

  /* ── reproducción ── */
  play(on = !this.playing) {
    this.playing = on;
    const vids = this.wall.screens.filter(isVid);
    if (on) {
      this.t0 = performance.now();
      vids.forEach(s => void s.el.play().catch(() => {}));
      const loop = () => {
        if (!this.playing || this.disposed) return;
        this.syncVideos(); this.draw(this.now());
        requestAnimationFrame(loop);
      };
      loop();
    } else vids.forEach(s => s.el.pause());
    this.emit();
  }
  private syncVideos() {                      // durante la reproducción en vivo
    for (const s of this.wall.screens) {
      if (!isVid(s)) continue;
      const v = s.el, r = vRate(s);
      if (v.playbackRate !== r) v.playbackRate = r;
      const a = vIn(s), b = a + vLen(s);
      if (v.currentTime < a - 0.06 || v.currentTime > b) v.currentTime = a;
    }
  }
  previewSeek(s: Screen) {                    // con el muro en pausa
    if (!isVid(s)) return;
    const v = s.el;
    v.addEventListener("seeked", () => { if (!this.playing) this.draw(this.now()); }, { once: true });
    v.currentTime = vTime(s, this.now(), this.set.secs);
  }
  /** Coloca cada vídeo en su fotograma exacto (para exportar). */
  async seekAll(t: number) {
    await Promise.all(this.wall.screens.filter(isVid).map(s => new Promise<void>(r => {
      const v = s.el, target = vTime(s, t, this.set.secs);
      if (Math.abs(v.currentTime - target) < 1e-3) return r();
      v.addEventListener("seeked", () => r(), { once: true });
      v.currentTime = target;
      setTimeout(r, 300);
    })));
  }

  /* ── dibujo de un fotograma ── */
  draw(t: number) {
    if (this.mode === "scene") return this.drawScene(t);
    const { plate, PAD } = this.wall;
    if (!plate) return;
    const SC = this.set.scale, ctx = this.ctx;
    const { w: W, h: H } = this.outSize();
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.filter = "none";
    ctx.drawImage(plate, 0, 0, W, H);

    const flick = this.set.flick / 100;
    for (const s of this.wall.screens) {
      const c = screenContent(s, t, SC, this.set.secs, plate);
      if (c) ctx.drawImage(c, Math.round(s.x * SC), Math.round(s.y * SC));
      if (s.role === "logo" && flick > 0) {          // parpadeo sutil del logo
        const f = 0.028 * flick * Math.sin(TAU * (t * s.k + s.ph));
        ctx.globalCompositeOperation = f > 0 ? "lighter" : "multiply";
        ctx.globalAlpha = Math.abs(f);
        ctx.drawImage(f > 0 ? s.maskW : s.mask, Math.round(s.x * SC), Math.round(s.y * SC), Math.round(s.w * SC), Math.round(s.h * SC));
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
    }

    if (PAD > 0) {                                    // laterales en penumbra
      const P2 = PAD * SC;
      const g1 = ctx.createLinearGradient(0, 0, P2, 0);
      g1.addColorStop(0, "rgba(0,0,0,.94)"); g1.addColorStop(1, "rgba(0,0,0,.30)");
      ctx.fillStyle = g1; ctx.fillRect(0, 0, P2, H);
      const g2 = ctx.createLinearGradient(W, 0, W - P2, 0);
      g2.addColorStop(0, "rgba(0,0,0,.94)"); g2.addColorStop(1, "rgba(0,0,0,.30)");
      ctx.fillStyle = g2; ctx.fillRect(W - P2, 0, P2, H);
    }
    this.overlays(W, H, t, SC);
  }

  layerBox(L: Layer) {                        // caja en fracciones del lienzo, en reposo
    const el = L.el;
    if (!el?.naturalWidth) return { w: 0, h: 0 };
    const { PW, PH } = this.dims();
    const w = (L.s || 30) / 100;
    return { w, h: (w * PW * (el.naturalHeight / el.naturalWidth)) / PH };
  }

  private drawScene(t: number) {
    const SC = this.set.scale, ctx = this.ctx, V = this.scene;
    const { w: W, h: H } = this.outSize();
    if (!W || !H) return;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.filter = "none";
    ctx.fillStyle = V.col || "#0a0908"; ctx.fillRect(0, 0, W, H);   // color de debajo

    if (V.bg && V.op > 0) {
      const r = V.bg.naturalWidth / V.bg.naturalHeight, dr = W / H;
      const br = V.gain / 100, op = V.op / 100;
      let dw: number, dh: number;
      if (V.fill === "blur") {                     // los lados, la propia portada difuminada
        if (r > dr) { dh = H; dw = H * r; } else { dw = W; dh = W / r; }
        ctx.globalAlpha = op;
        ctx.filter = `blur(${Math.max(4, Math.round(28 * SC))}px) brightness(${0.5 * br}) saturate(.8)`;
        ctx.drawImage(V.bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.filter = "none"; ctx.globalAlpha = 1;
      }
      if (V.fill === "crop") { if (r > dr) { dh = H; dw = H * r; } else { dw = W; dh = W / r; } }   // cubrir
      else { if (r > dr) { dw = W; dh = W / r; } else { dh = H; dw = H * r; } }                    // entera
      ctx.globalAlpha = op;
      if (br !== 1) ctx.filter = `brightness(${br})`;
      ctx.drawImage(V.bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.filter = "none"; ctx.globalAlpha = 1;
    }

    for (const L of V.layers) {
      if (!L.el?.naturalWidth) continue;
      const { w, h } = this.layerBox(L), m = lPos(L, t);
      const cx = (L.x + m.dx) * W, cy = (L.y + m.dy) * H;
      const dw = w * W * m.sc, dh = h * H * m.sc;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(m.rot);
      ctx.globalAlpha = (L.op ?? 100) / 100;
      const ag = (L.aged || 0) / 100;
      if (ag > 0) ctx.filter = `grayscale(${0.35 * ag}) sepia(${0.4 * ag}) contrast(${1 - 0.12 * ag}) brightness(${1 - 0.06 * ag}) saturate(${1 - 0.25 * ag})`;
      ctx.drawImage(L.el, -dw / 2, -dh / 2, dw, dh);
      ctx.filter = "none"; ctx.globalAlpha = 1;
      ctx.restore();
    }
    this.overlays(W, H, t, SC);
  }

  /* cinta de teletipo por delante de todo */
  private ticker(W: number, H: number, t: number, SC: number) {
    const T = this.tick, ctx = this.ctx;
    if (!T.on) return;
    const txt = (T.txt || "").trim();
    if (!txt) return;
    const bh = Math.max(8, Math.round((H * T.h) / 100));
    const y = T.pos === "top" ? 0 : H - bh;
    const c3 = T.col === "orange" ? ORANGE : CREAM;
    const px = Math.max(1, Math.round(SC));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, bh); ctx.clip();
    ctx.fillStyle = "rgba(8,7,6,.88)"; ctx.fillRect(0, y, W, bh);
    const fs = Math.round(bh * 0.58);
    ctx.font = `700 ${fs}px ${MONO}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const unit = txt + "   ·   ";
    const uw = Math.max(1, ctx.measureText(unit).width);
    const off = ((((t * T.rate) % 1) + 1) % 1) * uw;   // a 1× da una vuelta exacta por bucle
    ctx.shadowColor = `rgba(${c3.join(",")},.7)`; ctx.shadowBlur = fs * 0.4;
    ctx.fillStyle = `rgb(${c3.join(",")})`;
    for (let x = -uw - off; x < W + uw; x += uw) ctx.fillText(unit, x, y + bh / 2);
    ctx.shadowBlur = 0;
    lines(ctx, W, H, Math.max(1, Math.round(1.6 * SC)), 0.22);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, y, W, px); ctx.fillRect(0, y + bh - px, W, px);
    ctx.restore();
  }

  /* textura de época y cinta: común a los dos modos */
  private overlays(W: number, H: number, t: number, SC: number) {
    const ctx = this.ctx, p = this.set;
    this.ticker(W, H, t, SC);
    if (p.scan > 0) lines(ctx, W, H, Math.max(1, Math.round(1.6 * SC)), (0.09 * p.scan) / 100);
    if (p.sweep > 0) {
      const yb = (t % 1) * H * 1.3 - H * 0.15;
      const gr = ctx.createLinearGradient(0, yb - H * 0.16, 0, yb + H * 0.16);
      gr.addColorStop(0, "rgba(255,244,225,0)");
      gr.addColorStop(0.5, `rgba(255,244,225,${(0.055 * p.sweep) / 100})`);
      gr.addColorStop(1, "rgba(255,244,225,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (p.grain > 0) {
      const tl = GRAIN[((t * GRAIN.length * 8) | 0) % GRAIN.length];
      ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = (0.11 * p.grain) / 100;
      ctx.fillStyle = ctx.createPattern(tl, "repeat")!; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
  }

  /* ══ carga de archivos ═══════════════════════════════════════════ */
  async loadWall(file: Blob, keep = false) {
    this.setBusy("leyendo imagen");
    if (!keep) {                  // limpia solo lo de la pared, la escena no se toca
      for (const old of this.wall.screens) if (old.mkey) await idb.del(old.mkey).catch(() => {});
      await idb.put("wall", file).catch(() => this.noSave());
      this.wall.mid = 0;
    }
    const img = await elFromBlob(file);
    if (!(img instanceof HTMLImageElement) || !img.naturalWidth) { this.setBusy(false); throw new Error("No he podido leer esa imagen."); }
    const W = img.naturalWidth, H = img.naturalHeight;

    // lienzo extendido con laterales espejados (a brillo pleno; se oscurecen al pintar)
    const want = Number(this.set.aspect);
    const PAD = want ? Math.max(0, Math.round((want * H - W) / 2)) : 0;
    const PW = W + PAD * 2, PH = H;
    const plate = newCv(PW, PH), pc = ctx2d(plate);
    pc.drawImage(img, PAD, 0);
    if (PAD > 0) {
      pc.save(); pc.translate(PAD, 0); pc.scale(-1, 1);
      pc.drawImage(img, 0, 0, PAD, H, 0, 0, PAD, H); pc.restore();
      pc.save(); pc.translate(PAD + W + PAD, 0); pc.scale(-1, 1);
      pc.drawImage(img, W - PAD, 0, PAD, H, 0, 0, PAD, H); pc.restore();
    }

    this.setBusy("detectando pantallas", "analizando brillo del muro");
    await new Promise(r => setTimeout(r, 30));
    const px = pc.getImageData(0, 0, PW, PH).data;
    const { boxes, lab } = detect(px, PW, PH);

    // máscara suavizada por pantalla + nivel medio
    const screens: Screen[] = boxes.map((b, i) => {
      const F = Math.max(1, Math.round(Math.min(b.w, b.h) * 0.05));
      const raw = newCv(b.w + F * 4, b.h + F * 4), rc = ctx2d(raw);
      const im = rc.createImageData(b.w, b.h);
      let sum = 0, n = 0;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const p = (b.y + y) * PW + (b.x + x), k = (y * b.w + x) * 4;
        if (lab[p] === b.id) { im.data[k + 3] = 255; sum += 0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2]; n++; }
      }
      rc.putImageData(im, F * 2, F * 2);
      const mask = newCv(b.w + F * 4, b.h + F * 4), mc = ctx2d(mask);
      mc.filter = `blur(${F}px)`; mc.drawImage(raw, 0, 0);
      const maskW = newCv(mask.width, mask.height), wc = ctx2d(maskW);
      wc.drawImage(mask, 0, 0); wc.globalCompositeOperation = "source-in";
      wc.fillStyle = "#fff"; wc.fillRect(0, 0, mask.width, mask.height);
      const wing = b.x < PAD - 8 || b.x + b.w > PAD + W + 8;
      // los laterales espejados nunca muestran el logo del revés
      const role: Role = wing ? (["static", "flat", "off", "static"] as const)[i % 4] : "logo";
      return {
        i: i + 1, x: b.x - F * 2, y: b.y - F * 2, w: b.w + F * 4, h: b.h + F * 4,
        cx: b.x, cy: b.y, cw: b.w, ch: b.h, mask, maskW, lum: n ? sum / n : 120, wing,
        role, role0: role, media: null, el: null, mkey: null,
        ...SCREEN_DEF, ph: Math.random(), k: 1 + ((Math.random() * 3) | 0),
      };
    });

    Object.assign(this.wall, { plate, PW, PH, PAD, srcW: W, srcH: H, screens, file });
    URL.revokeObjectURL(img.src);
    this.sel = -1; this.selSet = new Set();
    this.setBusy(false);
    this.draw(0);
    this.emit();
    if (!keep) this.autosave();
  }

  /** Asigna una foto o vídeo a las pantallas elegidas. */
  async assignMedia(f: File) {
    const targets = this.selScreens();
    if (!targets.length) return;
    const vid = f.type.startsWith("video") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(f.name);
    const key = "m" + ++this.wall.mid;
    let saved = true;
    await idb.put(key, f).catch(() => { saved = false; this.noSave(); });
    let shared: MediaEl | null = null;
    for (let j = 0; j < targets.length; j++) {
      const s = targets[j];
      if (targets.length > 1) this.setBusy("cargando archivo", `pantalla ${j + 1} de ${targets.length}`, j / targets.length);
      // cada vídeo lleva su propio elemento (recorte independiente); las fotos lo comparten
      const el = vid ? await elFromBlob(f) : (shared ??= await elFromBlob(f));
      const d = el instanceof HTMLVideoElement && isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      Object.assign(s, { el, media: f.name, role: "media", mkey: saved ? key : null, vdur: d, vin: 0, vlen: d || this.set.secs, vrate: 1 });
      if (el instanceof HTMLVideoElement) { el.playbackRate = 1; if (this.playing) void el.play().catch(() => {}); }
    }
    this.setBusy(false);
    this.change();
  }

  async loadBg(f: File) {
    this.setBusy("leyendo portada", f.name);
    const el = await elFromBlob(f);
    if (!(el instanceof HTMLImageElement) || !el.naturalWidth) { this.setBusy(false); throw new Error("No he podido leer esa imagen."); }
    Object.assign(this.scene, { bg: el, bgName: f.name, bgKey: "bg" });
    await idb.put("bg", f).catch(() => this.noSave());
    this.setBusy(false);
    this.setMode("scene");
  }

  async addLayers(files: File[]) {
    const imgs = files.filter(f => f.type.startsWith("image"));
    if (!imgs.length) return;
    const { PW } = this.dims();
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      this.setBusy("cargando elementos", `${i + 1} de ${imgs.length}`, i / imgs.length);
      const el = await elFromBlob(f);
      if (!(el instanceof HTMLImageElement) || !el.naturalWidth) continue;
      const key = "L" + ++this.scene.lid;
      let ok = true;
      await idb.put(key, f).catch(() => { ok = false; this.noSave(); });
      // tamaño de partida: como venga el PNG respecto al lienzo, con tope
      const s = Math.max(4, Math.min(60, Math.round((el.naturalWidth / Math.max(1, PW)) * 100))) || 30;
      this.scene.layers.push({ name: f.name.replace(/\.[a-z0-9]+$/i, ""), el, mkey: ok ? key : null, x: 0.5, y: 0.5, s, op: 100, amp: 25, spd: 1, rot: 15, br: 4, aged: 0, ph: Math.random() });
    }
    this.setBusy(false);
    this.layerSel = this.scene.layers.length - 1;
    this.change();
  }

  setMode(m: Mode) { this.change(() => { this.mode = m; }); }

  /** Pone en bloque un rol a las elegidas (o a todo el muro si no hay ninguna). */
  bulkRole(v: Role | "mix") {
    const list = this.selSet.size ? this.selScreens() : this.wall.screens;
    this.change(() => list.forEach((s, j) => {
      if (v !== "mix") { s.role = v; return; }
      const pool: Role[] = s.wing ? ["static", "flat", "off"] : ["logo", "static", "flat", "off", "roll"];
      s.role = pool[(j * 3 + s.i) % pool.length];
    }));
  }

  resetAll() {
    this.change(() => {
      this.wall.screens.forEach(s => Object.assign(s, { role: s.role0, media: null, el: null, mkey: null, ...SCREEN_DEF }));
      this.tick = { ...DEF_TICK };
      Object.assign(this.set, { secs: 10, scan: 42, grain: 34, sweep: 30, flick: 35 });
      this.selSet = new Set(); this.sel = -1;
    });
  }

  /* ══ sesión guardada en este ordenador ═══════════════════════════ */
  noSave() { this.canSave = false; this.saved = { ok: false, text: "este navegador no deja guardar la sesión" }; this.emit(); }

  autosave() {
    if (this.restoring || !this.canSave || (!this.wall.screens.length && !this.scene.bg)) return;
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      try {
        saveSnapshot(this.snapshot());
        const d = new Date();
        this.saved = { ok: true, text: `guardado ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
      } catch { this.saved = { ok: false, text: "no se pudo guardar" }; }
      this.emit();
    }, 500);
  }

  private snapshot(): Snapshot {
    const V = this.scene, p = this.set;
    return {
      v: 1, mid: this.wall.mid, mode: this.mode, tick: { ...this.tick },
      ui: { aspect: p.aspect, scale: String(p.scale), secs: String(p.secs), fps: String(p.fps), scan: String(p.scan), grain: String(p.grain), sweep: String(p.sweep), flick: String(p.flick), vfmt: p.vfmt },
      scene: {
        fill: V.fill, gain: V.gain, op: V.op, col: V.col, bgName: V.bgName, bgKey: V.bgKey, lid: V.lid, sel: this.layerSel,
        layers: V.layers.map(L => ({ name: L.name, mkey: L.mkey, x: L.x, y: L.y, s: L.s, op: L.op, amp: L.amp, spd: L.spd, rot: L.rot, br: L.br, aged: L.aged, ph: L.ph })),
      },
      screens: this.wall.screens.map(s => ({
        role: s.role, fit: s.fit, aged: s.aged, gain: s.gain, col: s.col, ph: s.ph, k: s.k, rate: s.rate, txt: s.txt, tsize: s.tsize,
        media: s.media, mkey: s.mkey, nz: s.nz, nzA: s.nzA, vdur: s.vdur, vin: s.vin, vlen: s.vlen, vrate: s.vrate,
      })),
    };
  }

  /** Recupera la sesión anterior (la misma que guardaba el estudio suelto). Una sola vez. */
  private restored: Promise<boolean> | null = null;
  restore() { return (this.restored ??= this.doRestore()); }
  private async doRestore() {
    const cfg = loadSnapshot();
    const wall = await idb.get("wall").catch(() => null);
    const bg = await idb.get("bg").catch(() => null);
    if (!wall && !bg) return false;
    this.restoring = true;
    try {
      this.setBusy("recuperando sesión", "imágenes y archivos guardados");
      if (cfg?.ui) {
        const u = cfg.ui, num = (v: string | undefined, d: number) => (v != null && isFinite(Number(v)) ? Number(v) : d);
        Object.assign(this.set, {
          aspect: u.aspect ?? this.set.aspect, scale: num(u.scale, 2), secs: num(u.secs, 10), fps: num(u.fps, 30),
          scan: num(u.scan, 42), grain: num(u.grain, 34), sweep: num(u.sweep, 30), flick: num(u.flick, 35), vfmt: u.vfmt ?? "mp4",
        });
        this.wall.mid = cfg.mid || 0;
      }
      if (wall) await this.loadWall(wall, true);
      const A = cfg?.screens ?? [];
      for (let i = 0; i < Math.min(A.length, this.wall.screens.length); i++) {
        const a = A[i], s = this.wall.screens[i];
        Object.assign(s, {
          role: a.role, fit: a.fit, aged: a.aged, gain: a.gain, col: a.col, ph: a.ph, k: a.k, rate: a.rate ?? 1,
          media: a.media, mkey: a.mkey || null, txt: a.txt ?? "@besta_oficial", tsize: a.tsize || 100,
          nz: a.nz || "no", nzA: a.nzA ?? 45, vdur: a.vdur || 0, vin: a.vin || 0, vlen: a.vlen || 0, vrate: a.vrate || 1,
        });
        if (s.mkey) {
          const blob = await idb.get(s.mkey).catch(() => null);
          if (blob) {
            s.el = await elFromBlob(blob);
            if (isVid(s)) { s.el.playbackRate = vRate(s); s.el.currentTime = vIn(s); }
          }
        }
        if (s.role === "media" && !s.el) { s.role = "logo"; s.media = null; }
      }
      if (cfg?.tick) this.tick = { ...DEF_TICK, ...cfg.tick };
      const sc = cfg?.scene;
      if (bg && sc) {
        const el = await elFromBlob(bg);
        if (el instanceof HTMLImageElement) {
          Object.assign(this.scene, {
            bg: el, bgName: sc.bgName || "", bgKey: "bg", fill: sc.fill || "blur", gain: sc.gain ?? 100, op: sc.op ?? 100,
            col: sc.col || "#0a0908", lid: sc.lid || 0, layers: [],
          });
          for (const a of sc.layers || []) {
            const blob = a.mkey ? await idb.get(a.mkey).catch(() => null) : null;
            if (!blob) continue;
            const lel = await elFromBlob(blob);
            if (lel instanceof HTMLImageElement) this.scene.layers.push({ ...a, el: lel });
          }
          this.layerSel = sc.sel != null && sc.sel < this.scene.layers.length ? sc.sel : -1;
        }
      }
      this.mode = cfg?.mode === "scene" && this.scene.bg ? "scene" : "wall";
      this.saved = { ok: true, text: "sesión recuperada" };
    } finally {
      this.restoring = false;
      this.setBusy(false);
      this.draw(0);
      this.emit();
    }
    return true;
  }

  async clearSession() {
    clearTimeout(this.saveT);
    await idb.clear().catch(() => {});
    saveSnapshot(null);
  }

  /** La vista se monta (React puede montar, desmontar y volver a montar). */
  attach() { this.disposed = false; }
  dispose() {
    this.disposed = true;
    this.playing = false;
    clearTimeout(this.saveT);
    for (const s of this.wall.screens) if (isVid(s)) s.el.pause();
  }
}

export async function elFromBlob(b: Blob): Promise<MediaEl> {
  const url = URL.createObjectURL(b);
  if ((b.type || "").startsWith("video")) {
    const v = document.createElement("video");
    v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
    await new Promise(r => { v.onloadeddata = r; v.onerror = r; });
    return v;
  }
  const im = new Image();
  im.src = url;
  try { await im.decode(); } catch { /* imagen rota: naturalWidth = 0 */ }
  return im;
}
