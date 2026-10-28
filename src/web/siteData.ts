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
    return { gigs: db.gigs, events: db.events, products: db.products };
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
