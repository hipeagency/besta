/* Archivos pesados de videolyrics guardados en ESTE ordenador
   (IndexedDB del navegador): las pistas de cada canción y la biblioteca
   de fotos, vídeos y GIF para fondos. No se suben a ningún sitio: cero
   coste y nada de esperar subidas de cientos de MB. En la canción solo
   se guarda el nombre, para saber cuál falta si se abre en otro equipo. */

export interface MediaItem { id: string; name: string; type: string; blob: Blob; createdAt: string }
interface TrackItem { songId: string; name: string; blob: Blob }

const DB = "besta-visuales";
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("media", { keyPath: "id" });
      r.result.createObjectStore("pistas", { keyPath: "songId" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; ko(r.error); };
  });
  return dbp;
}
async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((ok, ko) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => ko(req.error);
  });
}

export const media = {
  list: () => run<MediaItem[]>("media", "readonly", s => s.getAll()).then(xs => xs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  get: (id: string) => run<MediaItem | undefined>("media", "readonly", s => s.get(id)),
  add: async (file: File): Promise<MediaItem> => {
    const item: MediaItem = { id: crypto.randomUUID(), name: file.name, type: file.type, blob: file, createdAt: new Date().toISOString() };
    await run("media", "readwrite", s => s.put(item));
    return item;
  },
  remove: (id: string) => run("media", "readwrite", s => s.delete(id)),
};

export const tracks = {
  get: (songId: string) => run<TrackItem | undefined>("pistas", "readonly", s => s.get(songId)).catch(() => undefined),
  put: (songId: string, file: File) => run("pistas", "readwrite", s => s.put({ songId, name: file.name, blob: file } satisfies TrackItem)).catch(() => undefined),
};
