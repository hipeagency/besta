/* Copia para el directo sin internet: lo que ensayos necesita para
   arrancar y tocar sin cobertura. La escribe «descargar para el
   directo» (ensayos → ajustes) y la usan los datos y la sesión
   cuando no llega respuesta del servidor. */
import type { Member, Setlist, Song } from "./types";

export const OFFLINE_KEY = "besta:ensayos:offline";
export interface OfflineCopy { at: string; userId?: string; songs: Song[]; setlists: Setlist[]; members: Member[] }

export function readOffline(): OfflineCopy | null {
  try { const r = localStorage.getItem(OFFLINE_KEY); return r ? (JSON.parse(r) as OfflineCopy) : null; } catch { return null; }
}

/** La colección guardada en la copia, si es de las que se guardan. */
export function offlineList(k: string): unknown[] | null {
  const c = readOffline();
  if (!c || !(k === "songs" || k === "setlists" || k === "members")) return null;
  return c[k] ?? null;
}

/** Espera la respuesta del servidor, pero si tarda o falla y hay copia, tira de la copia.
    En un bolo la cobertura suele ser «falsa» (wifi sin internet, una raya): no basta con navigator.onLine. */
export function withOffline<T>(copy: T | null, p: Promise<T>, ms = 6000): Promise<T> {
  if (copy == null) return p;
  const slow = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("sin respuesta")), ms));
  return Promise.race([p, slow]).catch(() => copy);
}
