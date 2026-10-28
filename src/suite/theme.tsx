/* Tema de la suite: automático (sigue al sistema), claro u oscuro.
   Se guarda por aparato. El script de pages/suite/index.astro lo
   aplica antes de pintar para que no haya parpadeo. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "auto" | "claro" | "oscuro";
const KEY = "besta:tema";

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
  return { pref, setPref, next };
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
export const themeBootScript = `(function(){try{var p=localStorage.getItem("${KEY}");var l=p==="claro"||(p!=="oscuro"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=l?"light":"dark";}catch(e){}})();`;

export const themeLabel: Record<ThemePref, string> = { auto: "tema: automático", claro: "tema: claro", oscuro: "tema: oscuro" };
