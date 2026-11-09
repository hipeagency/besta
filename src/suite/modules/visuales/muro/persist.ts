/* Sesión del estudio del muro, guardada en ESTE ordenador: los ajustes
   en localStorage y los archivos pesados (la pared, la portada y cada
   foto, vídeo o PNG) en IndexedDB. Las claves son las mismas que usaba
   el estudio suelto, así que lo que hubiera guardado se recupera. */
import type { Fill, Mode, Noise, Role, Ticker, Tint } from "./engine";

const LS = "besta-estudio-ajustes", IDB = "besta-estudio-media";

export interface Snapshot {
  v: 1; mid: number; mode: Mode; tick: Ticker;
  ui: Partial<Record<"aspect" | "scale" | "secs" | "fps" | "scan" | "grain" | "sweep" | "flick" | "vfmt", string>>;
  scene: {
    fill: Fill; gain: number; op: number; col: string; bgName: string; bgKey: string | null; lid: number; sel: number;
    layers: { name: string; mkey: string | null; x: number; y: number; s: number; op: number; amp: number; spd: number; rot: number; br: number; aged: number; ph: number }[];
  };
  screens: {
    role: Role; fit: "cover" | "contain"; aged: number; gain: number; col: Tint; ph: number; k: number; rate: number;
    txt: string; tsize: number; media: string | null; mkey: string | null; nz: Noise; nzA: number;
    vdur: number; vin: number; vlen: number; vrate: number;
  }[];
}

export function loadSnapshot(): Snapshot | null {
  try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; }
}
/** Guarda (o borra con null). Lanza si no cabe: el estudio lo avisa. */
export function saveSnapshot(s: Snapshot | null) {
  if (s) localStorage.setItem(LS, JSON.stringify(s));
  else try { localStorage.removeItem(LS); } catch { /* nada que borrar */ }
}

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((ok, ko) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("f");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; ko(r.error); };
  });
  return dbp;
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const d = await db();
  return new Promise((ok, ko) => {
    const t = d.transaction("f", mode);
    const req = fn(t.objectStore("f"));
    t.oncomplete = () => ok((req ? req.result : undefined) as T);
    t.onerror = () => ko(t.error);
  });
}

export const idb = {
  get: (k: string) => tx<Blob | undefined>("readonly", s => s.get(k)).then(v => v ?? null),
  put: (k: string, v: Blob) => tx<void>("readwrite", s => { s.put(v, k); }),
  del: (k: string) => tx<void>("readwrite", s => { s.delete(k); }),
  clear: () => tx<void>("readwrite", s => { s.clear(); }),
};
