/* =========================================================
   Datos reales: la misma API que mock.ts, contra Supabase.
   - Tablas del esquema «besta»: cada fila es { id, doc }, y doc
     es el objeto de la app (types.ts) tal cual.
   - Lo delicado (aforo, emitir QR, escanear, stock) lo hacen
     funciones SQL de un solo paso; cobrar y mandar emails, las
     Edge Functions (supabase/functions).
   - Archivos privados: se guardan como «sb://bucket/ruta» y se
     piden con URL firmada al reproducirlos.
   ========================================================= */
import { createClient } from "@supabase/supabase-js";
import type { Collection, DB } from "./mock";
import { uid } from "./mock";
import type {
  ID, Order, Ticket, ScanResult, Quote, Lead, Gig, Song, MerchMove, MerchRequest, PayMethod,
  Subscriber, Member, Product, TicketEvent, NewsInput, NewsStats,
} from "./types";

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string;
const ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

function make() {
  if (!URL_ || !ANON) throw new Error("Falta configurar PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY.");
  return createClient(URL_, ANON, { db: { schema: "besta" }, auth: { persistSession: true, detectSessionInUrl: true } });
}
let client: ReturnType<typeof make> | null = null;
export const sb = () => (client ??= make());

type Item<K extends Collection> = DB[K] extends (infer T)[] ? T : never;
interface Row { id: string; doc: Record<string, unknown>; user_id?: string | null; email?: string | null; owner?: boolean }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

/* Fila → objeto de la app. Las entradas se identifican por su código;
   las categorías son solo un nombre. */
function fromRow(k: Collection, r: Row): unknown {
  if (k === "categories") return (r.doc.name as string) ?? r.id;
  if (k === "tickets") return { ...r.doc, code: r.id };
  if (k === "members") return { ...r.doc, id: r.id, email: r.email ?? r.doc.email, userId: r.user_id ?? undefined, owner: r.owner === true };
  return { ...r.doc, id: r.id };
}

function toRow(k: Collection, item: unknown): Row & Record<string, unknown> {
  if (k === "categories") return { id: item as string, doc: { name: item as string } };
  const o = item as Record<string, unknown>;
  const id = (k === "tickets" ? o.code : o.id) as string;
  const { userId: _u, owner: _o, ...doc } = o;
  return k === "members" ? { id, doc, email: (o.email as string) || null } : { id, doc };
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (error) {
    // El mensaje útil viene en el cuerpo ({ error }), no en el error genérico.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then(j => j?.error).catch(() => null) : null;
    throw new Error(msg || error.message);
  }
  return data as T;
}

async function get<K extends Collection>(k: K, id: ID): Promise<Item<K> | null> {
  const { data, error } = await sb().from(k).select("id, doc").eq("id", id).maybeSingle();
  fail(error);
  return data ? (fromRow(k, data as Row) as Item<K>) : null;
}

// La web pide lo publicable una vez por carga de página.
type PublicSite = { gigs: Gig[]; events: (TicketEvent & { free: number })[]; products: Product[] };
let site: Promise<PublicSite> | null = null;
async function loadSite(): Promise<PublicSite> {
  const { data, error } = await sb().rpc("public_site");
  fail(error);
  return data as PublicSite;
}
const publicSite = () => (site ??= loadSite());

const signed = new Map<string, { url: string; until: number }>();

export const supabaseApi = {
  async list<K extends Collection>(k: K): Promise<DB[K]> {
    const cols = k === "members" ? "id, doc, user_id, email, owner" : "id, doc";
    const { data, error } = await sb().from(k).select(cols).order("created_at", { ascending: false });
    fail(error);
    return (data as unknown as Row[]).map(r => fromRow(k, r)) as DB[K];
  },

  async insert<K extends Collection>(k: K, item: Item<K>): Promise<Item<K>> {
    const { error } = await sb().from(k).insert(toRow(k, item));
    fail(error);
    return item;
  },

  async update<K extends Collection>(k: K, id: ID, patch: Partial<Item<K>>): Promise<void> {
    const { userId: _u, owner: _o, ...rest } = patch as Record<string, unknown>;
    // undefined desaparece al pasar a JSON y la clave vieja se quedaría: va como null, que patch_doc borra.
    const sent = Object.fromEntries(Object.entries(rest).map(([key, v]) => [key, v === undefined ? null : v]));
    const { error } = await sb().rpc("patch_doc", { tbl: k, row_id: id, patch: sent });
    fail(error);
    if (k === "members" && "email" in rest) fail((await sb().from("members").update({ email: rest.email || null }).eq("id", id)).error);
  },

  async remove<K extends Collection>(k: K, id: ID): Promise<void> {
    fail((await sb().from(k).delete().eq("id", id)).error);
  },

  async reset(): Promise<void> {
    throw new Error("Con datos reales no se puede reiniciar.");
  },

  // ---------- web pública ----------
  async availability(eventId: ID): Promise<number> {
    return (await publicSite()).events.find(e => e.id === eventId)?.free ?? 0;
  },
  async publicProducts(): Promise<Product[]> {
    return (await publicSite()).products;
  },

  // ---------- entradas ----------
  async checkout(input: { eventId: ID; qty: number; email: string; newsletter: boolean }): Promise<{ order: Order; redirectUrl: string }> {
    const { url } = await invoke<{ url: string }>("checkout", input);
    return { order: null as unknown as Order, redirectUrl: url };
  },

  async orderByToken(token: string): Promise<{ order: Order; tickets: Ticket[]; event?: TicketEvent; gig?: Gig } | null> {
    const { data, error } = await sb().rpc("get_order", { tok: token });
    fail(error);
    return (data as { order: Order; tickets: Ticket[]; event?: TicketEvent; gig?: Gig } | null) ?? null;
  },

  async scan(code: string, eventId: ID, _by: string): Promise<ScanResult> {
    const { data, error } = await sb().rpc("scan_ticket", { code, ev: eventId });
    fail(error);
    return data as ScanResult;
  },

  async refundOrder(orderId: ID): Promise<void> { await invoke("order-actions", { action: "refund", orderId }); },
  async resendTickets(orderId: ID): Promise<void> { await invoke("order-actions", { action: "resend", orderId }); },

  async cancelTicket(code: string): Promise<void> {
    await supabaseApi.update("tickets", code, { status: "cancelada" } as Partial<Ticket>);
  },

  async checkInManual(code: string, by: string): Promise<void> {
    const t = await get("tickets", code);
    if (t?.status === "valida") await supabaseApi.update("tickets", code, { status: "usada", checkedInAt: new Date().toISOString(), checkedInBy: by } as Partial<Ticket>);
  },

  async sendInvites(codes: string[], email: string, name?: string): Promise<void> { await invoke("order-actions", { action: "invite", codes, email, name }); },

  async invite(eventId: ID, holder: string, qty: number): Promise<Ticket[]> {
    const out: Ticket[] = Array.from({ length: qty }, () => ({
      code: "INV-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6),
      eventId, kind: "invitacion" as const, holder, status: "valida" as const,
    }));
    fail((await sb().from("tickets").insert(out.map(t => toRow("tickets", t)))).error);
    return out;
  },

  // ---------- formularios de la web ----------
  async submitLead(input: Omit<Lead, "id" | "createdAt" | "status">): Promise<void> { await invoke("public-forms", { type: "lead", ...input }); },
  async requestMerch(input: Omit<MerchRequest, "id" | "status" | "createdAt" | "moveId">): Promise<void> { await invoke("public-forms", { type: "merch", ...input }); },
  async subscribe(input: Omit<Subscriber, "id" | "createdAt">): Promise<void> { await invoke("public-forms", { type: "subscribe", ...input }); },

  // ---------- contratación ----------
  async quoteFromLead(leadId: ID): Promise<Quote> {
    const lead = await get("leads", leadId);
    if (!lead) throw new Error("Esa solicitud ya no existe.");
    const q = await newQuote({ client: lead.org || lead.name, contactEmail: lead.email, eventDate: lead.date, place: lead.city, leadId });
    await supabaseApi.insert("quotes", q);
    await supabaseApi.update("leads", leadId, { status: "presupuestada" });
    return q;
  },

  async createQuote(): Promise<Quote> {
    const q = await newQuote({ client: "" });
    await supabaseApi.insert("quotes", q);
    return q;
  },

  async acceptQuote(quoteId: ID): Promise<Gig> {
    const q = await get("quotes", quoteId);
    if (!q) throw new Error("Ese presupuesto ya no existe.");
    await supabaseApi.update("quotes", quoteId, { status: "aceptado" });
    if (q.gigId) { const g = await get("gigs", q.gigId); if (g) return g; }
    const gig: Gig = {
      id: uid("gig-"), date: q.eventDate || new Date().toISOString().slice(0, 10), time: "21:00",
      city: q.place || "[ciudad]", venue: q.client, status: "confirmado", published: false, ticketing: "ninguna",
      feeCents: q.lines.reduce((s, l) => s + l.amountCents, 0), deal: "según presupuesto " + q.number, schedule: [],
      contacts: q.contactEmail ? [{ role: "contratación", name: q.client, email: q.contactEmail }] : [], quoteId: q.id, checklist: {},
    };
    await supabaseApi.insert("gigs", gig);
    await supabaseApi.update("quotes", quoteId, { gigId: gig.id });
    return gig;
  },

  // ---------- música ----------
  async ideaToSong(ideaId: ID): Promise<Song> {
    const idea = await get("ideas", ideaId);
    if (!idea) throw new Error("Esa idea ya no existe.");
    if (idea.songId) { const s = await get("songs", idea.songId); if (s) return s; }
    const song: Song = {
      id: uid("song-"), title: idea.title, artist: "besta", own: true, key: idea.key || "", bpm: idea.bpm,
      sections: idea.sections.map(s => ({ id: uid(), name: s.name, lines: [{ chords: s.chords, lyric: "" }] })),
      instrumentNotes: {}, memberChords: {}, comments: [],
    };
    if (idea.lyrics) song.sections.push({ id: uid(), name: "Letra", lines: idea.lyrics.split("\n").map(l => ({ chords: "", lyric: l })) });
    await supabaseApi.insert("songs", song);
    await supabaseApi.update("ideas", ideaId, { songId: song.id, status: "lista" });
    return song;
  },

  // ---------- merch ----------
  async sell(items: { variantId: ID; qty: number }[], payment: PayMethod, by: string, gigId?: ID): Promise<void> {
    const products = await supabaseApi.list("products");
    for (const it of items) {
      const p = products.find(p => p.variants.some(v => v.id === it.variantId));
      if (!p) continue;
      await adjust(p.id, it.variantId, -it.qty);
      await supabaseApi.insert("moves", { id: uid("m"), productId: p.id, variantId: it.variantId, kind: "venta", qty: -it.qty, unitCents: p.priceCents, payment, by, gigId, at: new Date().toISOString() });
    }
  },

  async moveStock(move: Omit<MerchMove, "id" | "at">): Promise<void> {
    await adjust(move.productId, move.variantId, move.qty, move.kind === "recuento");
    await supabaseApi.insert("moves", { ...move, id: uid("m"), at: new Date().toISOString() });
  },

  async reserveRequest(requestId: ID, by: string): Promise<void> {
    const r = await get("requests", requestId);
    const p = r && await get("products", r.productId);
    if (!r || !p) throw new Error("Esa solicitud ya no existe.");
    await adjust(p.id, r.variantId, -r.qty);
    const m: MerchMove = { id: uid("m"), productId: p.id, variantId: r.variantId, kind: "reserva", qty: -r.qty, unitCents: p.priceCents, by, customer: `${r.name} · web`, gigId: r.gigId, open: true, note: r.delivery === "envio" ? "envío" : r.delivery === "concierto" ? "recoge en concierto" : undefined, at: new Date().toISOString() };
    await supabaseApi.insert("moves", m);
    await supabaseApi.update("requests", requestId, { status: "apartada", moveId: m.id });
  },

  async deliverReservation(moveId: ID, payment: PayMethod): Promise<void> {
    const m = await get("moves", moveId);
    if (!m) return;
    await supabaseApi.update("moves", moveId, { open: false, kind: "venta", payment, reservedAt: m.at, at: new Date().toISOString() });
    await markRequests(moveId, "entregada");
  },

  async cancelReservation(moveId: ID): Promise<void> {
    const m = await get("moves", moveId);
    if (!m) return;
    await adjust(m.productId, m.variantId, -m.qty);   // la reserva restó (qty negativa): se devuelve
    await supabaseApi.remove("moves", moveId);
    await markRequests(moveId, "cancelada");
  },

  async deleteMove(moveId: ID): Promise<void> {
    const m = await get("moves", moveId);
    if (!m) return;
    await adjust(m.productId, m.variantId, -m.qty);   // deshace lo que movió; falla si ya no hay de dónde quitar
    await supabaseApi.remove("moves", moveId);
    await markRequests(moveId, "cancelada");
  },

  // ---------- archivos ----------
  async uploadFile(bucket: "musica" | "recibos" | "web", file: File | Blob): Promise<string> {
    const name = (file as File).name?.replace(/[^\w.-]+/g, "-") || "archivo";
    const path = `${new Date().getFullYear()}/${uid()}-${name}`;
    fail((await sb().storage.from(bucket).upload(path, file, { contentType: file.type || undefined })).error);
    return bucket === "web" ? sb().storage.from(bucket).getPublicUrl(path).data.publicUrl : `sb://${bucket}/${path}`;
  },

  async fileUrl(url: string): Promise<string> {
    if (!url.startsWith("sb://")) return url;
    const hit = signed.get(url);
    if (hit && hit.until > Date.now()) return hit.url;
    const [bucket, ...rest] = url.slice(5).split("/");
    const { data, error } = await sb().storage.from(bucket).createSignedUrl(rest.join("/"), 3600);
    fail(error);
    signed.set(url, { url: data!.signedUrl, until: Date.now() + 50 * 60e3 });
    return data!.signedUrl;
  },

  // ---------- usuarios ----------
  async inviteMember(m: Member): Promise<void> {
    await invoke("invite-user", { name: m.name, email: m.email, role: m.role, scopes: m.scopes, instrument: m.instrument, band: m.band });
  },
  // ---------- avisos a la lista ----------
  async newsletterStats(): Promise<NewsStats> { return invoke("newsletter", { action: "stats" }); },
  async newsletterSend(input: NewsInput, test?: string): Promise<{ recipients?: number }> {
    return invoke("newsletter", { ...input, action: test ? "test" : "send", to: test });
  },
};

async function adjust(productId: ID, variantId: ID, delta: number, allowNegative = false) {
  const { error } = await sb().rpc("adjust_stock", { product_id: productId, variant_id: variantId, delta, allow_negative: allowNegative });
  fail(error);
}

async function markRequests(moveId: ID, status: MerchRequest["status"]) {
  const { data } = await sb().from("requests").select("id").eq("doc->>moveId", moveId);
  for (const r of (data ?? []) as { id: string }[]) await supabaseApi.update("requests", r.id, { status });
}

async function newQuote(p: Partial<Quote>): Promise<Quote> {
  const year = new Date().getFullYear();
  const { count } = await sb().from("quotes").select("id", { count: "exact", head: true }).like("doc->>number", `BESTA-${year}-%`);
  return {
    id: uid("q-"), number: `BESTA-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`, status: "borrador", client: "",
    lines: [{ id: uid(), name: "actuación besta · banda completa", note: "75 min · 6 músicos", amountCents: 0 }],
    ivaPct: 21, irpfPct: 15, conditions: "50 % a la firma y 50 % el día del concierto. Sonido y luces a cargo de la organización según rider.",
    createdAt: new Date().toISOString(), ...p,
  };
}

/* Cambios de otros (otra persona en la suite, una compra en la web):
   Supabase Realtime avisa y las pantallas se refrescan. */
export function subscribeLive(fn: () => void) {
  const ch = sb().channel("besta-cambios").on("postgres_changes", { event: "*", schema: "besta" }, () => fn()).subscribe();
  return () => { sb().removeChannel(ch); };
}
