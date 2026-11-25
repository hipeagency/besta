/* Tema de la suite: automático (sigue al sistema), claro u oscuro.
   Se guarda por aparato. El script de pages/suite/index.astro lo
   aplica antes de pintar para que no haya parpadeo. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "auto" | "claro" | "oscuro";
const KEY = "besta:tema";
const ACCENT_KEY = "besta:acento";

/* Colores de acento que se ofrecen en ajustes. El primero es el de la marca («señal»). */
export const ACCENTS = [
  { name: "señal", hex: "#E8662C" },
  { name: "rojo", hex: "#E5484D" },
  { name: "ámbar", hex: "#F5A524" },
  { name: "lima", hex: "#A8D543" },
  { name: "menta", hex: "#3DD68C" },
  { name: "cian", hex: "#2CC8E0" },
  { name: "azul", hex: "#6E8BFF" },
  { name: "violeta", hex: "#A78BFA" },
  { name: "rosa", hex: "#F472B6" },
] as const;
const BRAND = ACCENTS[0].hex;

const readAccent = (): string => {
  try { const v = localStorage.getItem(ACCENT_KEY); if (v && /^#[0-9a-f]{6}$/i.test(v)) return v; } catch { /* */ }
  return BRAND;
};

/* El acento se pinta en línea sobre <html>: gana a las variables del tema
   (claro u oscuro) y todo lo que usa «senal» lo hereda sin tocar nada más. */
function applyAccent(hex: string) {
  const r = document.documentElement.style;
  if (hex.toLowerCase() === BRAND.toLowerCase()) { r.removeProperty("--color-senal"); r.removeProperty("--color-senal-suave"); return; }
  r.setProperty("--color-senal", hex);
  r.setProperty("--color-senal-suave", `color-mix(in srgb, ${hex} 78%, var(--color-crema))`);
}

const read = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); if (v === "claro" || v === "oscuro") return v; } catch { /* */ }
  return "auto";
};

const systemLight = () => window.matchMedia("(prefers-color-scheme: light)").matches;

function apply(pref: ThemePref) {
  const light = pref === "claro" || (pref === "auto" && systemLight());
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F7F0E4" : "#0F0B08");
}

function useThemeState() {
  const [pref, setPrefState] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    if (pref !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const h = () => apply("auto");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [pref]);
  const setPref = (p: ThemePref) => {
    try { p === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p); } catch { /* */ }
    setPrefState(p);
  };
  const next = () => setPref(pref === "auto" ? "claro" : pref === "claro" ? "oscuro" : "auto");
  const [accent, setAccentState] = useState<string>(readAccent);
  useEffect(() => { applyAccent(accent); }, [accent]);
  const setAccent = (hex: string) => {
    try { hex.toLowerCase() === BRAND.toLowerCase() ? localStorage.removeItem(ACCENT_KEY) : localStorage.setItem(ACCENT_KEY, hex); } catch { /* */ }
    setAccentState(hex);
  };
  return { pref, setPref, next, accent, setAccent, brandAccent: BRAND };
}

const Ctx = createContext<ReturnType<typeof useThemeState> | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useThemeState()}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme fuera de ThemeProvider");
  return c;
}

/* Script en línea para el <head>: mismo criterio que apply(). */
export const themeBootScript = `(function(){try{var p=localStorage.getItem("${KEY}");var l=p==="claro"||(p!=="oscuro"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=l?"light":"dark";var a=localStorage.getItem("${ACCENT_KEY}");if(a&&/^#[0-9a-f]{6}$/i.test(a)){var s=document.documentElement.style;s.setProperty("--color-senal",a);s.setProperty("--color-senal-suave","color-mix(in srgb, "+a+" 78%, var(--color-crema))");}}catch(e){}})();`;

export const themeLabel: Record<ThemePref, string> = { auto: "tema: automático", claro: "tema: claro", oscuro: "tema: oscuro" };
