/* Fondos: los generados (animaciones que salen del código, gratis, en
   la paleta de BESTA y que pueden reaccionar al audio) y los archivos
   propios (foto, vídeo, GIF). Todos son funciones del tiempo. */
import type { LyricBg } from "@/data/types";
import type { AudioFeat } from "../track";
import { PAL } from "./text";
import { hash, rng } from "./style";

export interface BgCtx { seed: number; feat: AudioFeat; media: MediaSource }
/* Quien da los archivos ya cargados (ver media.ts). */
export interface MediaSource { frame(id: string, t: number): { img: CanvasImageSource; w: number; h: number } | null }

type Gen = (g: CanvasRenderingContext2D, W: number, H: number, t: number, tint: string, c: BgCtx) => void;

const fill = (g: CanvasRenderingContext2D, W: number, H: number, c: string) => { g.fillStyle = c; g.fillRect(0, 0, W, H); };

/* Ruido: lienzos pequeños que se rehacen en cada fotograma. El de la
   tele es grueso a propósito; el grano, fino. */
const noiseCvs = new Map<string, { cv: HTMLCanvasElement; key: number }>();
function noiseCanvas(frame: number, w = 192, h = 108) {
  const id = `${w}x${h}`;
  let n = noiseCvs.get(id);
  if (!n) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; n = { cv, key: -1 }; noiseCvs.set(id, n); }
  if (n.key !== frame) {
    n.key = frame;
    const c = n.cv.getContext("2d")!;
    const img = c.createImageData(w, h);
    const r = rng(hash(frame, 99, w));
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = v; img.data[i + 1] = v * 0.92; img.data[i + 2] = v * 0.82; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }
  return n.cv;
}
const frameOf = (t: number) => Math.floor(t * 24);

const GENS: Record<string, { name: string; reacts?: boolean; draw: Gen }> = {
  negro: { name: "negro", draw: (g, W, H) => fill(g, W, H, PAL.noche) },

  respira: {
    name: "respira", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      const lv = c.feat.level(t);
      const r = Math.max(W, H) * (0.32 + 0.28 * lv + 0.03 * Math.sin(t * 0.8));
      const grd = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, r);
      grd.addColorStop(0, tint); grd.addColorStop(1, "rgba(15,11,8,0)");
      g.globalAlpha = 0.25 + 0.45 * lv;
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    },
  },

  niebla: {
    name: "niebla",
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      const r = rng(c.seed);
      for (let k = 0; k < 5; k++) {
        const ph = r() * 6.28, sp = 0.05 + r() * 0.08;
        const x = W * (0.5 + 0.45 * Math.sin(t * sp + ph)), y = H * (0.5 + 0.4 * Math.cos(t * sp * 1.3 + ph));
        const rad = H * (0.5 + r() * 0.5);
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, k % 2 ? PAL.marco : tint); grd.addColorStop(1, "rgba(15,11,8,0)");
        g.globalAlpha = k % 2 ? 0.7 : 0.22;
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = 1;
    },
  },

  ruido: {
    name: "ruido de tele", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      g.imageSmoothingEnabled = false;
      g.globalAlpha = 0.28 + 0.3 * c.feat.hit(t);
      g.drawImage(noiseCanvas(frameOf(t)), 0, 0, W, H);
      g.imageSmoothingEnabled = true;
      // banda que baja, como una tele mal sintonizada
      const y = ((t * 0.15) % 1.2 - 0.1) * H;
      g.globalAlpha = 0.12; g.fillStyle = tint; g.fillRect(0, y, W, H * 0.08);
      g.globalAlpha = 1;
    },
  },

  barras: {
    name: "barras de color", reacts: true,
    draw: (g, W, H, t, _tint, c) => {
      const cols = [PAL.crema, PAL.senalSuave, PAL.senal, PAL.marco, PAL.crema, PAL.tubo, PAL.senal];
      const hit = c.feat.hit(t);
      const roll = hit > 0.6 ? (hash(frameOf(t)) % 100) / 100 * H * 0.2 : 0;
      const bw = W / cols.length;
      fill(g, W, H, PAL.noche);
      cols.forEach((col, k) => { g.fillStyle = col; g.fillRect(k * bw, -roll, bw + 1, H * 0.72); g.fillRect(k * bw, H - roll, bw + 1, H * 0.72); });
      for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? PAL.tubo : PAL.crema; g.fillRect(k * W / 8, H * 0.76 - roll, W / 8, H * 0.08); }
      g.globalAlpha = 0.55; fill(g, W, H, PAL.noche); g.globalAlpha = 1;   // apagado para que se lea la letra
    },
  },

  rejilla: {
    name: "rejilla retro", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      const hz = H * 0.52, vx = W / 2;
      const grd = g.createLinearGradient(0, hz - H * 0.3, 0, hz);
      grd.addColorStop(0, "rgba(15,11,8,0)"); grd.addColorStop(1, tint);
      g.globalAlpha = 0.25 + 0.3 * c.feat.level(t); g.fillStyle = grd; g.fillRect(0, hz - H * 0.3, W, H * 0.3);
      g.globalAlpha = 0.85; g.strokeStyle = tint; g.lineWidth = Math.max(1, H / 540);
      g.beginPath();
      for (let k = -14; k <= 14; k++) { g.moveTo(vx + k * W * 0.012, hz); g.lineTo(vx + k * W * 0.16, H); }
      const off = (t * 0.6) % 1;
      for (let k = 0; k < 14; k++) { const z = (k + off) / 14, y = hz + (H - hz) * z * z; g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke();
      g.globalAlpha = 1;
    },
  },

  pulso: {
    name: "pulso", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      g.strokeStyle = tint; g.lineWidth = H * 0.006;
      for (let k = c.feat.hits.length - 1; k >= 0; k--) {
        const age = t - c.feat.hits[k];
        if (age < 0) continue;
        if (age > 1.6) break;
        g.globalAlpha = (1 - age / 1.6) * 0.8;
        g.beginPath(); g.arc(W / 2, H / 2, H * 0.08 + age * H * 0.55, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
    },
  },

  teles: {
    name: "muro de teles", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      const cols = 5, rows = 3, gap = H * 0.025;
      const cw = (W - gap * (cols + 1)) / cols, ch = (H - gap * (rows + 1)) / rows;
      // cada golpe cambia qué teles están encendidas
      const beat = c.feat.hits.filter(h => h <= t).length;
      const nz = noiseCanvas(frameOf(t));
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const px = gap + x * (cw + gap), py = gap + y * (ch + gap);
        const st = hash(c.seed, x, y, beat) % 7;
        g.fillStyle = PAL.marco; roundRect(g, px - gap * 0.3, py - gap * 0.3, cw + gap * 0.6, ch + gap * 0.6, gap * 0.8); g.fill();
        g.save(); roundRect(g, px, py, cw, ch, gap * 0.6); g.clip();
        if (st < 3) { g.globalAlpha = 0.5; g.imageSmoothingEnabled = false; g.drawImage(nz, (x * 37) % 120, (y * 23) % 60, 64, 36, px, py, cw, ch); g.imageSmoothingEnabled = true; }
        else if (st < 5) { g.globalAlpha = 0.2 + 0.3 * c.feat.level(t); g.fillStyle = tint; g.fillRect(px, py, cw, ch); }
        else { g.globalAlpha = 1; g.fillStyle = PAL.tubo; g.fillRect(px, py, cw, ch); }
        g.restore(); g.globalAlpha = 1;
      }
      g.globalAlpha = 0.5; fill(g, W, H, PAL.noche); g.globalAlpha = 1;
    },
  },

  franjas: {
    name: "franjas", reacts: true,
    draw: (g, W, H, t, tint, c) => {
      fill(g, W, H, PAL.noche);
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.35);
      const bw = H * 0.12, off = (t * H * 0.08) % (bw * 2), lv = c.feat.level(t);
      g.fillStyle = tint; g.globalAlpha = 0.1 + 0.25 * lv;
      for (let x = -W - off; x < W; x += bw * 2) g.fillRect(x, -W, bw, W * 2);
      g.restore(); g.globalAlpha = 1;
    },
  },
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}

export const GENERATED = Object.entries(GENS).map(([id, x]) => ({ id, name: x.name, reacts: !!x.reacts }));

export function drawBg(g: CanvasRenderingContext2D, W: number, H: number, t: number, bg: LyricBg, c: BgCtx) {
  if (bg.kind === "gen") {
    (GENS[bg.id] ?? GENS.negro).draw(g, W, H, t, bg.tint === "crema" ? PAL.crema : PAL.senal, c);
    return;
  }
  fill(g, W, H, PAL.noche);
  const f = c.media.frame(bg.id, t);
  if (!f) return;
  const s = bg.fit === "cover" ? Math.max(W / f.w, H / f.h) : Math.min(W / f.w, H / f.h);
  const w = f.w * s, h = f.h * s;
  g.drawImage(f.img, (W - w) / 2, (H - h) / 2, w, h);
  g.globalAlpha = 0.35; fill(g, W, H, PAL.noche); g.globalAlpha = 1;   // oscurecer: que se lea la letra
}

/* Textura de época por encima de todo. */
export function drawOverlay(g: CanvasRenderingContext2D, W: number, H: number, t: number, o: { scan: boolean; grain: boolean; vignette: boolean }) {
  if (o.grain) {
    g.globalAlpha = 0.06;
    g.drawImage(noiseCanvas(frameOf(t) + 7, 640, 360), 0, 0, W, H);
    g.globalAlpha = 1;
  }
  if (o.scan) {
    g.fillStyle = "rgba(0,0,0,.18)";
    const step = Math.max(3, Math.round(H / 360)), lh = Math.max(1, Math.round(step / 3));
    for (let y = 0; y < H; y += step) g.fillRect(0, y, W, lh);
  }
  if (o.vignette) {
    const grd = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,.6)");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
}
