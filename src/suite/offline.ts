/* La app guardada para el directo sin internet (el service worker de
   public/suite/sw.js). Solo en la web compilada: en desarrollo no hay
   lista de archivos que guardar. */
const ENABLED = import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** Llamar una vez al arrancar la suite. */
export function registerOffline() {
  if (!ENABLED) return;
  navigator.serviceWorker.register("/suite/sw.js", { scope: "/suite/" }).catch(() => {});
}

/** Vuelve a descargar la app entera; true si ha quedado guardada. */
export async function downloadApp(): Promise<boolean> {
  if (!ENABLED) return !import.meta.env.PROD;
  try {
    // Que el navegador no la borre si se queda sin espacio (Chrome/Android; Safari decide él).
    navigator.storage?.persist?.().catch(() => {});
    const reg = await navigator.serviceWorker.ready;
    const sw = reg.active;
    if (!sw) return false;
    return await new Promise<boolean>(resolve => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(false), 60000);
      ch.port1.onmessage = e => { clearTimeout(t); resolve(!!e.data?.ok); };
      sw.postMessage({ type: "DOWNLOAD" }, [ch.port2]);
    });
  } catch { return false; }
}

/** ¿Está la app guardada en este aparato? */
export async function appSaved(): Promise<boolean> {
  if (!ENABLED) return !import.meta.env.PROD;
  try { return !!(await caches.match("/suite/")); } catch { return false; }
}
