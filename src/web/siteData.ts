/* Datos de la web pública al compilar: bolos publicados, eventos con
   venta y merch. En modo de prueba salen del seed; con Supabase, de la
   función public_site (solo lo publicable: sin cachés, contactos ni
   costes). */
import { createSeed } from "@/data/seed";
import type { Gig, Product, TicketEvent } from "@/data/types";

export interface SiteData { gigs: Gig[]; events: TicketEvent[]; products: Product[] }

export async function loadSiteData(): Promise<SiteData> {
  if (import.meta.env.PUBLIC_DATA_MODE !== "supabase") {
    const db = createSeed();
    const gigs = db.gigs.map(publicGig).filter((g): g is Gig => !!g);
    const open = new Set(gigs.filter(g => !g.teaser).map(g => g.id));
    return { gigs, events: db.events.filter(e => open.has(e.gigId)), products: db.products.filter(p => p.published && !p.archived) };
  }
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY para compilar la web.");
  const res = await fetch(`${url}/rest/v1/rpc/public_site`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "besta", "Accept-Profile": "besta" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`public_site respondió ${res.status}: ${await res.text()}`);
  const d = await res.json() as { gigs: Partial<Gig>[]; events: TicketEvent[]; products: Product[] };
  // Lo publicable no trae lo interno: se rellena con vacíos para que encaje en los tipos.
  return {
    gigs: d.gigs.map(g => ({ schedule: [], contacts: [], checklist: {}, published: true, ...g }) as Gig),
    events: d.events,
    products: d.products,
  };
}

/* Lo mismo que besta.public_gig (SQL) para el modo de prueba: un bolo en
   secreto pierde lo no desvelado y cambia de id. */
function publicGig(g: Gig): Gig | null {
  if (!g.published || g.status === "cancelado") return null;
  const t = g.teaser;
  // Solo el mes: ni día ni hora. date ya es el último día del mes.
  if (!t) return g.dateTbc ? { ...g, time: "", doors: undefined } : g;
  const exact = t.date === "exacta" && !g.dateTbc;
  const d = new Date(`${g.date}T12:00:00`);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: `secreto-${[...g.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`, status: "confirmado", ticketing: "ninguna", published: true,
    teaser: { ...t, date: exact ? "exacta" : "mes" },
    date: !g.date ? "" : exact ? g.date : `${monthEnd.getFullYear()}-${pad(monthEnd.getMonth() + 1)}-${pad(monthEnd.getDate())}`,
    time: exact ? g.time : "",
    city: t.city ? g.city : "", venue: t.venue ? g.venue : "", event: t.event ? g.event : undefined,
    schedule: [], contacts: [], checklist: {},
  };
}
