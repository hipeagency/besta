/* =========================================================
   besta · suite — service worker del directo sin internet.
   Guarda la app (la página de la suite y sus archivos) para que
   abra sin cobertura. Las canciones no van aquí: las guarda la
   propia suite en «descargar para el directo».

   VERSION y FILES los rellena la compilación (astro.config.mjs):
   cada despliegue trae una lista nueva, el navegador ve que este
   archivo ha cambiado y descarga la app nueva antes de soltar la vieja.
   ========================================================= */
const VERSION = "__VERSION__";
const FILES = __FILES__;
const CACHE = "besta-suite-" + VERSION;

/* De golpe (addAll): o se guarda la app entera o no se toca la copia
   anterior. Si falla, la instalación falla y sigue mandando la vieja. */
const download = async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(FILES.map(url => new Request(url, { cache: "reload" })));
};

self.addEventListener("install", event => {
  event.waitUntil(download().then(() => self.skipWaiting()));
});

/* Borra versiones anteriores, incluida la de la suite antigua. */
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* «Descargar para el directo»: vuelve a bajarlo todo y contesta. */
self.addEventListener("message", event => {
  if (event.data?.type !== "DOWNLOAD") return;
  const port = event.ports[0];
  event.waitUntil(download()
    .then(() => port?.postMessage({ ok: true, version: VERSION }))
    .catch(() => port?.postMessage({ ok: false })));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Supabase y demás servidores, nunca: los datos tienen su propia copia.
  if (url.origin !== self.location.origin) return;

  // Páginas: primero la red (siempre la versión publicada); sin red, la suite guardada.
  if (req.mode === "navigate") {
    if (!url.pathname.startsWith("/suite")) return;
    event.respondWith(fetch(req).catch(async () =>
      (await caches.match("/suite/")) || Response.error()));
    return;
  }

  // Archivos: los de la app guardada salen de la copia (llevan huella en el nombre, no cambian).
  event.respondWith((async () => (await caches.match(req)) || fetch(req))());
});
