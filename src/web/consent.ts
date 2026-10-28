/* Consentimiento de cookies. Nada de analítica ni publicidad se carga
   hasta que la persona lo acepta, y se puede cambiar cuando quiera
   desde «cookies» en el pie. Las necesarias (sesión de la suite, tu
   elección de cookies) no piden permiso porque sin ellas no funciona. */
import { trackers } from "./content";

export interface Consent { analitica: boolean; publicidad: boolean; at: string; v: 1 }
const KEY = "besta:cookies";

export function readConsent(): Consent | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) || "null"); return c?.v === 1 ? c : null; } catch { return null; }
}

export function saveConsent(c: Omit<Consent, "at" | "v">) {
  const full: Consent = { ...c, at: new Date().toISOString(), v: 1 };
  try { localStorage.setItem(KEY, JSON.stringify(full)); } catch { /* sin almacenamiento: se volverá a preguntar */ }
  loadTrackers(full);
}

/* Hay que tener algo que pedir: sin ids configurados no sale el banner. */
export const needsBanner = () => Boolean(trackers.googleAnalyticsId || trackers.metaPixelId);

const loaded = new Set<string>();
function addScript(id: string, src?: string, inline?: string) {
  if (loaded.has(id)) return;
  loaded.add(id);
  const s = document.createElement("script");
  if (src) { s.src = src; s.async = true; }
  if (inline) s.text = inline;
  document.head.appendChild(s);
}

/* Revocar no descarga lo ya cargado: se aplica al recargar la página. */
export function loadTrackers(c: Consent | null) {
  if (!c) return;
  if (c.analitica && trackers.googleAnalyticsId) {
    const id = trackers.googleAnalyticsId;
    addScript("ga", `https://www.googletagmanager.com/gtag/js?id=${id}`);
    addScript("ga-init", undefined, `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});`);
  }
  if (c.publicidad && trackers.metaPixelId) {
    addScript("meta", undefined, `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${trackers.metaPixelId}');fbq('track','PageView');`);
  }
}
