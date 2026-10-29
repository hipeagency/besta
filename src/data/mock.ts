/* =========================================================
   Datos de prueba: la API completa sobre localStorage, para
   enseñar y probar sin backend. La real está en supabase.ts;
   api.ts elige una u otra. Las dos tienen exactamente la misma
   forma (Api), así que las pantallas no saben cuál usan.
   ========================================================= */
import { createSeed, type DB } from "./seed";
import type {
  ID, Order, Ticket, ScanResult, Quote, Lead, Gig, Song, MerchMove, MerchRequest, PayMethod, Subscriber, Member, Product, TicketEvent, NewsInput, NewsStats, Topic,
} from "./types";

export type Collection = keyof DB;
type Item<K extends Collection> = DB[K] extends (infer T)[] ? T : never;

const KEY = "besta:datos-prueba:v10";  // subir la versión cuando cambie el seed
const isBrowser = typeof window !== "undefined";

let db: DB | null = null;
const listeners = new Set<() => void>();

function load(): DB {
  if (db) return db;
  if (isBrowser) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw) as DB; return db; }
    } catch { /* almacenamiento bloqueado: seguimos en memoria */ }
  }
  db = createSeed();
  return db;
}

function save() {
  if (!isBrowser || !db) return;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin espacio o bloqueado */ }
  listeners.forEach(l => l());
}

/* Otra pestaña (la web pública comprando) cambia los datos: la suite se entera. */
if (isBrowser) {
  window.addEventListener("storage", e => {
    if (e.key !== KEY) return;
    db = null;
    listeners.forEach(l => l());
  });
}

export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const ticketCode = () => "BST-" + Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
const tick = <T,>(v: T) => Promise.resolve(structuredClone(v));

// ---------- genérico ----------
export const mockApi = {
  list<K extends Collection>(k: K): Promise<DB[K]> {
    return tick(load()[k]);
  },

  async insert<K extends Collection>(k: K, item: Item<K>): Promise<Item<K>> {
    (load()[k] as unknown as Item<K>[]).unshift(item);
    save();
    return item;
  },

  async update<K extends Collection>(k: K, id: ID, patch: Partial<Item<K>>, idField = "id"): Promise<void> {
    const arr = load()[k] as unknown as Record<string, unknown>[];
    const i = arr.findIndex(x => x[idField] === id);
    if (i < 0) throw new Error(`No existe ${String(k)} ${id}`);
    arr[i] = { ...arr[i], ...patch };
    // Como patch_doc: un campo a null o undefined se borra.
    for (const [key, v] of Object.entries(patch)) if (v === undefined || v === null) delete arr[i][key];
    save();
  },

  async remove<K extends Collection>(k: K, id: ID, idField = "id"): Promise<void> {
    const d = load();
    (d[k] as unknown as Record<string, unknown>[]) = (d[k] as unknown as Record<string, unknown>[]).filter(x => x[idField] !== id);
    save();
  },

  async reset(): Promise<void> {
    db = createSeed();
    save();
  },

  // ---------- web pública ----------
  /* Plazas libres de un evento (la web no puede leer pedidos). */
  async availability(eventId: ID): Promise<number> {
    const d = load();
    const ev = d.events.find(e => e.id === eventId);
    if (!ev) return 0;
    const taken = d.tickets.filter(t => t.eventId === ev.id && t.status !== "cancelada").length
      + d.orders.filter(o => o.eventId === ev.id && o.status === "pendiente").reduce((s, o) => s + o.qty, 0);
    return Math.max(0, ev.capacity - taken);
  },

  /* Merch publicable (sin coste) para la web. */
  async publicProducts(): Promise<Product[]> {
    return tick(load().products.filter(p => p.published && !p.archived).map(p => ({ ...p, costCents: 0 })));
  },

  // ---------- archivos ----------
  /* De prueba el archivo solo vive en esta pestaña. De verdad se sube
     al almacenamiento y se guarda como «sb://bucket/ruta». */
  async uploadFile(_bucket: "musica" | "recibos" | "web", file: File | Blob): Promise<string> {
    return URL.createObjectURL(file);
  },

  /* URL reproducible de un archivo guardado (las privadas caducan). */
  async fileUrl(url: string): Promise<string> { return url; },

  // ---------- usuarios ----------
  /* De verdad: invitación por email (Supabase Auth) + ficha. */
  async inviteMember(m: Member): Promise<void> {
    load().members.push({ ...m, id: m.id || uid("u-"), invitedAt: now() });
    save();
  },

  // ---------- entradas ----------
  /* Comprador → Stripe Checkout. De verdad: Edge Function que reserva
     plazas con bloqueo en SQL y devuelve la URL de Stripe. De prueba:
     el pago se da por hecho al momento. */
  async checkout(input: { eventId: ID; qty: number; email: string; newsletter: boolean }): Promise<{ order: Order; redirectUrl: string }> {
    const d = load();
    const ev = d.events.find(e => e.id === input.eventId);
    if (!ev) throw new Error("Este evento ya no existe.");
    if (!ev.salesEnabled) throw new Error("La venta de este concierto está cerrada.");
    const gig = d.gigs.find(g => g.id === ev.gigId);
    if (!gig?.published || gig.teaser) throw new Error("La venta de este concierto aún no está abierta.");
    if (input.qty < 1 || input.qty > ev.maxPerOrder) throw new Error(`Puedes comprar entre 1 y ${ev.maxPerOrder} entradas.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Revisa el email: ahí te llegan las entradas.");
    const taken = d.tickets.filter(t => t.eventId === ev.id && t.status !== "cancelada").length
      + d.orders.filter(o => o.eventId === ev.id && o.status === "pendiente").reduce((s, o) => s + o.qty, 0);
    if (taken + input.qty > ev.capacity) throw new Error(`Solo quedan ${Math.max(0, ev.capacity - taken)} entradas.`);

    const number = Math.max(0, ...d.orders.map(o => o.number)) + 1;
    const order: Order = {
      id: uid("ord-"), number, eventId: ev.id, email: input.email.trim().toLowerCase(), qty: input.qty,
      amountCents: input.qty * ev.priceCents, status: "pagado", newsletter: input.newsletter,
      createdAt: now(), token: uid("tk") + uid(),
    };
    d.orders.unshift(order);
    for (let i = 0; i < input.qty; i++) {
      d.tickets.push({ code: ticketCode(), orderId: order.id, eventId: ev.id, kind: "general", status: "valida" });
    }
    save();
    return { order: structuredClone(order), redirectUrl: `/entradas/?pedido=${order.token}&nuevo=1` };
  },

  async orderByToken(token: string): Promise<{ order: Order; tickets: Ticket[]; event?: TicketEvent; gig?: Gig } | null> {
    const d = load();
    const order = d.orders.find(o => o.token === token);
    if (!order) return null;
    const event = d.events.find(e => e.id === order.eventId);
    return tick({ order, tickets: d.tickets.filter(t => t.orderId === order.id), event, gig: d.gigs.find(g => g.id === event?.gigId) });
  },

  /* Check-in atómico. En SQL: UPDATE … SET status='usada' WHERE code=? AND status='valida' RETURNING. */
  async scan(code: string, eventId: ID, by: string): Promise<ScanResult> {
    const d = load();
    const clean = code.trim().toUpperCase().replace(/^BESTA:T:/, "");
    const t = d.tickets.find(x => x.code === clean);
    const order = t?.orderId ? d.orders.find(o => o.id === t.orderId) : undefined;
    if (!t) return { ok: false, reason: "no-existe" };
    if (t.eventId !== eventId) return tick({ ok: false as const, reason: "otro-evento" as const, ticket: t, order });
    if (t.status === "cancelada") return tick({ ok: false as const, reason: "cancelada" as const, ticket: t, order });
    if (t.status === "usada") return tick({ ok: false as const, reason: "usada" as const, ticket: t, order });
    t.status = "usada"; t.checkedInAt = now(); t.checkedInBy = by;
    save();
    return tick({ ok: true as const, ticket: t, order });
  },

  async refundOrder(orderId: ID): Promise<void> {
    const d = load();
    const o = d.orders.find(x => x.id === orderId);
    if (!o) return;
    o.status = "devuelto";
    d.tickets.forEach(t => { if (t.orderId === orderId) t.status = "cancelada"; });
    save();
  },

  async cancelTicket(code: string): Promise<void> {
    const t = load().tickets.find(x => x.code === code);
    if (t) { t.status = "cancelada"; save(); }
  },

  async checkInManual(code: string, by: string): Promise<void> {
    const t = load().tickets.find(x => x.code === code);
    if (t && t.status === "valida") { t.status = "usada"; t.checkedInAt = now(); t.checkedInBy = by; save(); }
  },

  async invite(eventId: ID, holder: string, qty: number): Promise<Ticket[]> {
    const d = load();
    const out: Ticket[] = [];
    for (let i = 0; i < qty; i++) {
      const t: Ticket = { code: "INV-" + Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase(), eventId, kind: "invitacion", holder, status: "valida" };
      d.tickets.push(t); out.push(t);
    }
    save();
    return out;
  },

  /* De verdad: reenvía el email por Brevo. De prueba: solo apunta cuándo. */
  async resendTickets(orderId: ID): Promise<void> {
    const o = load().orders.find(x => x.id === orderId);
    if (o) { o.emailSentAt ??= now(); o.resentAt = now(); save(); }
  },

  // ---------- avísame / newsletter ----------
  /* De verdad: Edge Function → Brevo (contacto + intereses + email de
     confirmación). Si ya estaba, se le suman los intereses nuevos. */
  async subscribe(input: Omit<Subscriber, "id" | "createdAt">): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Revisa el email.");
    if (!input.topics.length) throw new Error("Marca al menos una cosa.");
    const d = load();
    const email = input.email.trim().toLowerCase();
    const prev = d.subscribers.find(s => s.email === email);
    if (prev) prev.topics = Array.from(new Set([...prev.topics, ...input.topics]));
    else d.subscribers.unshift({ ...input, email, id: uid("sub-"), createdAt: now() });
    save();
  },

  // ---------- contratación ----------
  async submitLead(input: Omit<Lead, "id" | "createdAt" | "status">): Promise<void> {
    load().leads.unshift({ ...input, id: uid("lead-"), createdAt: now(), status: "nueva" });
    save();
  },

  async quoteFromLead(leadId: ID): Promise<Quote> {
    const d = load();
    const lead = d.leads.find(l => l.id === leadId);
    if (!lead) throw new Error("Esa solicitud ya no existe.");
    const q = newQuote(d, { client: lead.org || lead.name, contactEmail: lead.email, eventDate: lead.date, place: lead.city, leadId });
    d.quotes.unshift(q);
    lead.status = "presupuestada";
    save();
    return structuredClone(q);
  },

  async createQuote(): Promise<Quote> {
    const d = load();
    const q = newQuote(d, { client: "" });
    d.quotes.unshift(q);
    save();
    return structuredClone(q);
  },

  /* Presupuesto aceptado → nace el bolo. */
  async acceptQuote(quoteId: ID): Promise<Gig> {
    const d = load();
    const q = d.quotes.find(x => x.id === quoteId);
    if (!q) throw new Error("Ese presupuesto ya no existe.");
    q.status = "aceptado";
    if (q.gigId) { save(); return structuredClone(d.gigs.find(g => g.id === q.gigId)!); }
    const gig: Gig = {
      id: uid("gig-"), date: q.eventDate || new Date().toISOString().slice(0, 10), time: "21:00",
      city: q.place || "[ciudad]", venue: q.client, status: "confirmado", published: false, ticketing: "ninguna",
      feeCents: quoteBase(q), deal: "según presupuesto " + q.number, schedule: [], contacts: q.contactEmail ? [{ role: "contratación", name: q.client, email: q.contactEmail }] : [],
      quoteId: q.id, checklist: {},
    };
    d.gigs.unshift(gig);
    q.gigId = gig.id;
    save();
    return structuredClone(gig);
  },

  // ---------- música ----------
  async ideaToSong(ideaId: ID): Promise<Song> {
    const d = load();
    const idea = d.ideas.find(i => i.id === ideaId);
    if (!idea) throw new Error("Esa idea ya no existe.");
    if (idea.songId) return structuredClone(d.songs.find(s => s.id === idea.songId)!);
    const song: Song = {
      id: uid("song-"), title: idea.title, artist: "besta", own: true, key: idea.key || "", bpm: idea.bpm,
      sections: idea.sections.map(s => ({ id: uid(), name: s.name, lines: [{ chords: s.chords, lyric: "" }] })),
      instrumentNotes: {}, memberChords: {}, comments: [],
    };
    if (idea.lyrics) song.sections.push({ id: uid(), name: "Letra", lines: idea.lyrics.split("\n").map(l => ({ chords: "", lyric: l })) });
    d.songs.unshift(song);
    idea.songId = song.id; idea.status = "lista";
    save();
    return structuredClone(song);
  },

  // ---------- merch ----------
  async sell(items: { variantId: ID; qty: number }[], payment: PayMethod, by: string, gigId?: ID): Promise<void> {
    const d = load();
    for (const it of items) {
      const p = d.products.find(p => p.variants.some(v => v.id === it.variantId));
      const v = p?.variants.find(v => v.id === it.variantId);
      if (!p || !v) continue;
      if (v.stock < it.qty) throw new Error(`No queda stock de ${p.name} ${v.label}.`);
      v.stock -= it.qty;
      const m: MerchMove = { id: uid("m"), productId: p.id, variantId: v.id, kind: "venta", qty: -it.qty, unitCents: p.priceCents, payment, by, gigId, at: now() };
      d.moves.unshift(m);
    }
    save();
  },

  async moveStock(move: Omit<MerchMove, "id" | "at">): Promise<void> {
    const d = load();
    const p = d.products.find(p => p.id === move.productId);
    const v = p?.variants.find(v => v.id === move.variantId);
    if (!v) throw new Error("Esa talla ya no existe.");
    // qty lleva signo; en un recuento es la diferencia con lo contado.
    v.stock = Math.max(0, v.stock + move.qty);
    d.moves.unshift({ ...move, id: uid("m"), at: now() });
    save();
  },

  /* Web → suite. De verdad: Edge Function + email de «recibido» al
     comprador y aviso a la banda (Brevo). */
  async requestMerch(input: Omit<MerchRequest, "id" | "status" | "createdAt" | "moveId">): Promise<void> {
    const d = load();
    const v = d.products.find(p => p.id === input.productId && p.published && !p.archived)?.variants.find(v => v.id === input.variantId);
    if (!v) throw new Error("Esa talla ya no está disponible.");
    if (v.stock < input.qty) throw new Error(v.stock ? `Solo quedan ${v.stock}.` : "Esa talla está agotada.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Revisa el email: ahí te escribimos.");
    d.requests.unshift({ ...input, id: uid("rq"), status: "nueva", createdAt: now() });
    save();
  },

  /* Apartar = crear la reserva (resta stock) enlazada a la solicitud. */
  async reserveRequest(requestId: ID, by: string): Promise<void> {
    const d = load();
    const r = d.requests.find(x => x.id === requestId);
    const p = r && d.products.find(p => p.id === r.productId);
    const v = p?.variants.find(v => v.id === r!.variantId);
    if (!r || !p || !v) throw new Error("Esa solicitud ya no existe.");
    if (v.stock < r.qty) throw new Error(`No hay stock: quedan ${v.stock}.`);
    v.stock -= r.qty;
    const m: MerchMove = { id: uid("m"), productId: p.id, variantId: v.id, kind: "reserva", qty: -r.qty, unitCents: p.priceCents, by, customer: `${r.name} · web`, gigId: r.gigId, open: true, note: r.delivery === "envio" ? "envío" : r.delivery === "concierto" ? "recoge en concierto" : undefined, at: now() };
    d.moves.unshift(m);
    r.status = "apartada"; r.moveId = m.id;
    save();
  },

  async deliverReservation(moveId: ID, payment: PayMethod): Promise<void> {
    const d = load();
    const m = d.moves.find(x => x.id === moveId);
    if (!m) return;
    m.open = false; m.kind = "venta"; m.payment = payment; m.reservedAt = m.at; m.at = now();
    d.requests.forEach(r => { if (r.moveId === moveId) r.status = "entregada"; });
    save();
  },

  async cancelReservation(moveId: ID): Promise<void> {
    const d = load();
    const m = d.moves.find(x => x.id === moveId);
    if (!m) return;
    const v = d.products.find(p => p.id === m.productId)?.variants.find(v => v.id === m.variantId);
    if (v) v.stock -= m.qty; // la reserva restó: lo devolvemos
    d.moves = d.moves.filter(x => x.id !== moveId);
    d.requests.forEach(r => { if (r.moveId === moveId) r.status = "cancelada"; });
    save();
  },

  /* Borrar un apunte hecho por error: deshace lo que movió en el stock. */
  async deleteMove(moveId: ID): Promise<void> {
    const d = load();
    const m = d.moves.find(x => x.id === moveId);
    if (!m) return;
    const v = d.products.find(p => p.id === m.productId)?.variants.find(v => v.id === m.variantId);
    if (v && v.stock - m.qty < 0) throw new Error(`No se puede: quedan ${v.stock} y habría que quitar ${m.qty}.`);
    if (v) v.stock -= m.qty;
    d.moves = d.moves.filter(x => x.id !== moveId);
    d.requests.forEach(r => { if (r.moveId === moveId) r.status = "cancelada"; });
    save();
  },
  // ---------- avisos a la lista ----------
  /* De prueba: cuenta los suscriptores del navegador; enviar no manda nada. */
  async newsletterStats(): Promise<NewsStats> {
    const subs = load().subscribers;
    const by = (t: Topic) => subs.filter(s => s.topics.includes(t)).length;
    return { total: subs.length, byTopic: { fechas: by("fechas"), merch: by("merch"), lanzamientos: by("lanzamientos") }, recent: [] };
  },
  async newsletterSend(input: NewsInput, test?: string): Promise<{ recipients?: number }> {
    if (test) return {};
    const n = load().subscribers.filter(s => s.topics.includes(input.topic)).length;
    if (!n) throw new Error("Nadie de la lista ha pedido este tipo de aviso todavía.");
    return { recipients: n };
  },
};

function quoteBase(q: Quote) { return q.lines.reduce((s, l) => s + l.amountCents, 0); }

function newQuote(d: DB, p: Partial<Quote>): Quote {
  const year = new Date().getFullYear();
  const n = d.quotes.filter(q => q.number.includes(String(year))).length + 1;
  return {
    id: uid("q-"), number: `BESTA-${year}-${String(n + 16).padStart(3, "0")}`, status: "borrador", client: "",
    lines: [{ id: uid(), name: "actuación besta · banda completa", note: "75 min · 6 músicos", amountCents: 0 }],
    ivaPct: 21, irpfPct: 15, conditions: "50 % a la firma y 50 % el día del concierto. Sonido y luces a cargo de la organización según rider.",
    createdAt: new Date().toISOString(), ...p,
  };
}

export type { DB };
