/* Un fotograma completo: fondo (el de la sección que suena, con fundido
   al cambiar), letra y textura. Función del tiempo y nada más. */
import type { LyricBg, LyricSync, LyricVideo } from "@/data/types";
import type { AudioFeat } from "../track";
import { drawBg, drawOverlay, type MediaSource } from "./backgrounds";
import { drawLyrics } from "./text";

export interface Scene { sync: LyricSync; video: LyricVideo; feat: AudioFeat; media: MediaSource }

const FADE = 0.5;
const same = (a: LyricBg, b: LyricBg) => a.kind === b.kind && a.id === b.id && (a.kind !== "gen" || b.kind !== "gen" || a.tint === b.tint);

/* Fondo en t: el de la sección de la última línea que ha empezado
   (los instrumentales siguen con el fondo de lo anterior). */
function bgAt(s: Scene, t: number): { bg: LyricBg; prev?: LyricBg; since: number } {
  const { lines } = s.sync, { bg, bySection } = s.video;
  const of = (i: number) => (i < 0 ? bg : bySection[lines[i].sectionId ?? ""] ?? bg);
  let c = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].t != null && lines[i].t! <= t) c = i;
  const cur = of(c);
  // desde cuándo está este fondo: primera línea del tramo seguido con el mismo fondo
  let k = c;
  while (k >= 0) {
    let p = k - 1;
    while (p >= 0 && lines[p].t == null) p--;
    if (p < 0 || !same(of(p), cur)) break;
    k = p;
  }
  if (c < 0) return { bg: cur, since: 0 };
  let p = k - 1;
  while (p >= 0 && lines[p].t == null) p--;
  return { bg: cur, prev: of(p), since: lines[k].t! };
}

export function renderFrame(g: CanvasRenderingContext2D, W: number, H: number, t: number, s: Scene) {
  const ctx = { seed: s.video.seed, feat: s.feat, media: s.media };
  g.save();
  g.globalAlpha = 1; g.filter = "none";
  const { bg, prev, since } = bgAt(s, t);
  const age = t - since;
  if (prev && !same(prev, bg) && age < FADE) {
    drawBg(g, W, H, t, prev, ctx);
    g.globalAlpha = age / FADE;
    // el fondo nuevo a medias: se pinta en una capa aparte para poder fundirlo
    const layer = offscreen(W, H);
    const lg = layer.getContext("2d")!;
    lg.clearRect(0, 0, W, H);
    drawBg(lg, W, H, t, bg, ctx);
    g.drawImage(layer, 0, 0);
    g.globalAlpha = 1;
  } else drawBg(g, W, H, t, bg, ctx);
  g.restore();

  drawLyrics(g, W, H, t, s.sync, s.video.style, s.video.seed);

  g.save();
  drawOverlay(g, W, H, t, s.video.overlay);
  g.restore();
}

let layerCv: HTMLCanvasElement | null = null;
function offscreen(W: number, H: number) {
  layerCv ??= document.createElement("canvas");
  if (layerCv.width !== W) layerCv.width = W;
  if (layerCv.height !== H) layerCv.height = H;
  return layerCv;
}
