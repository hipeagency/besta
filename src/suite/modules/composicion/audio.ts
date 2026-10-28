/* Utilidades de audio de composición.
   Con datos reales las demos se suben al almacenamiento (demo.url =
   «sb://musica/…»). En modo de prueba viven solo en esta pestaña y no
   se guardan en el doc: un blob: muerto tras recargar sería peor que nada. */
import { useEffect, useState } from "react";
import type { IdeaDemo } from "@/data/types";

const sessionUrls = new Map<string, string>();

export const rememberDemoUrl = (demoId: string, url: string) => { sessionUrls.set(demoId, url); };
export const demoUrl = (d: IdeaDemo | undefined) => (d ? sessionUrls.get(d.id) ?? d.url : undefined);

/** «0:42» → 42 · «1:02:03» → 3723 · vacío o raro → null */
export function parseTime(s?: string): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** 42 → «0:42» */
export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Barras decorativas, siempre las mismas para la misma demo. */
export function bars(seedText: string, n = 56): number[] {
  let seed = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 11);
  return Array.from({ length: n }, (_, i) => {
    seed = (seed * 9301 + 49297) % 233280;
    const env = 0.55 + 0.45 * Math.sin((i / n) * Math.PI); // un poco más alto en el centro
    return Math.round((15 + (seed / 233280) * 85) * env);
  });
}

export function useMedia(query: string) {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [ok, setOk] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setOk(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return ok;
}

export const canRecord = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
