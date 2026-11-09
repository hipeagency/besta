/* Estilos de letra: presets con nombre, el «sorpréndeme» y la suerte
   determinista (misma semilla → mismo vídeo, siempre). */
import type { LyricAnim, LyricBg, LyricMode, LyricStyle, LyricVideo } from "@/data/types";

/* Números al azar repetibles: mulberry32. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (...xs: number[]) => xs.reduce((h, x) => Math.imul(h ^ (x | 0), 2654435761) >>> 0, 2166136261);
export const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];

export const MODES: { id: LyricMode; label: string }[] = [
  { id: "linea", label: "línea" },
  { id: "palabra", label: "palabra a palabra" },
  { id: "karaoke", label: "karaoke" },
  { id: "una", label: "una a una" },
];
export const ANIMS: { id: LyricAnim; label: string }[] = [
  { id: "fade", label: "fundido" },
  { id: "subir", label: "deslizar" },
  { id: "zoom", label: "zoom" },
  { id: "maquina", label: "máquina" },
  { id: "glitch", label: "glitch" },
  { id: "parpadeo", label: "parpadeo" },
  { id: "desenfoque", label: "desenfoque" },
  { id: "corte", label: "corte seco" },
];

const base: LyricStyle = { mode: "linea", size: "l", pos: "centro", font: "jost", caps: "mayus", color: "crema", box: false, in: "zoom", out: "fade", variar: false };

export const PRESETS: { id: string; name: string; desc: string; style: LyricStyle }[] = [
  { id: "directo", name: "Directo", desc: "líneas grandes en mayúsculas", style: base },
  { id: "karaoke", name: "Karaoke", desc: "la palabra que suena se enciende", style: { ...base, mode: "karaoke", size: "m", pos: "abajo", caps: "normal", in: "fade", out: "fade" } },
  { id: "grito", name: "Grito", desc: "una palabra enorme cada vez", style: { ...base, mode: "una", size: "xl", in: "zoom", out: "corte" } },
  { id: "tele", name: "Tele vieja", desc: "mono, parpadeo y glitch, sitio al azar", style: { ...base, font: "mono", pos: "azar", in: "parpadeo", out: "glitch", variar: true } },
  { id: "maquina", name: "Máquina", desc: "se escribe letra a letra", style: { ...base, mode: "linea", size: "m", font: "mono", caps: "normal", in: "maquina", out: "fade" } },
  { id: "balada", name: "Balada", desc: "fina, en minúsculas, palabra a palabra", style: { ...base, mode: "palabra", size: "m", font: "fina", caps: "minus", in: "desenfoque", out: "fade" } },
  { id: "subtitulo", name: "Subtítulo", desc: "abajo, pequeño, con franja", style: { ...base, size: "s", pos: "abajo", font: "jost", caps: "normal", box: true, in: "fade", out: "fade" } },
  { id: "senal", name: "Señal", desc: "naranja, deslizando, cada línea distinta", style: { ...base, color: "senal", in: "subir", out: "subir", variar: true } },
];

/* Un estilo nuevo al azar, pero con reglas para que siempre quede bien. */
export function surprise(seed: number): LyricStyle {
  const r = rng(seed);
  const mode = pick(r, ["linea", "linea", "palabra", "karaoke", "una"] as const);
  const font = pick(r, ["jost", "jost", "fina", "mono"] as const);
  return {
    mode,
    size: mode === "una" ? pick(r, ["l", "xl"] as const) : pick(r, ["m", "l", "l", "xl"] as const),
    pos: pick(r, ["centro", "centro", "abajo", "azar"] as const),
    font,
    caps: font === "fina" ? pick(r, ["normal", "minus"] as const) : pick(r, ["mayus", "mayus", "normal"] as const),
    color: r() < 0.25 ? "senal" : "crema",
    box: r() < 0.15,
    in: pick(r, ["fade", "subir", "zoom", "maquina", "glitch", "parpadeo", "desenfoque"] as const),
    out: pick(r, ["fade", "subir", "zoom", "glitch", "corte"] as const),
    variar: r() < 0.5,
  };
}

export const defaultBg: LyricBg = { kind: "gen", id: "respira", tint: "senal" };

export function defaultVideo(): LyricVideo {
  return {
    style: base, preset: "directo", seed: 1, bg: defaultBg, bySection: {},
    overlay: { scan: true, grain: true, vignette: true },
    width: 1920, height: 1080, fps: 30, updatedAt: new Date().toISOString(),
  };
}

export const SIZES = { s: 0.055, m: 0.08, l: 0.11, xl: 0.16 } as const;   // alto de letra / alto del vídeo

/* Lo que cambia en cada línea si «variar» está activo. */
export function lineVariant(style: LyricStyle, seed: number, line: number) {
  const r = rng(hash(seed, line, 7));
  if (!style.variar) return { in: style.in, out: style.out, pos: style.pos, scale: 1, dx: 0, dy: 0, tilt: 0 };
  return {
    in: pick(r, ANIMS.filter(a => a.id !== "corte").map(a => a.id)),
    out: pick(r, ANIMS.map(a => a.id)),
    pos: pick(r, ["centro", "arriba", "abajo", "azar"] as const),
    scale: 0.85 + r() * 0.35,
    dx: (r() - 0.5) * 0.3,
    dy: (r() - 0.5) * 0.3,
    tilt: (r() - 0.5) * 0.08,
  };
}
