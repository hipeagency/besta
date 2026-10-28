/* Formularios de la web: contratación, merch y «avísame». Pública.
   Guarda en Supabase (lo ve la suite) y avisa por Brevo. Si Brevo falla
   después de guardar, la solicitud no se pierde: se registra el error y
   a quien escribe le decimos que ha ido bien. */
import { notifyBand, sendEmail, upsertNewsletterContact } from "../_shared/brevo.ts";
import { dateLabel, leadNotification, type MerchInfo, merchNotification, merchReceived } from "../_shared/emails.ts";
import { email, HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { adminClient, type Admin, getRow, patchDoc } from "../_shared/supabase.ts";
import { type Gig, type Product, type Topic, TOPICS } from "../_shared/types.ts";

const id = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const now = () => new Date().toISOString();

async function quietly(what: string, p: Promise<unknown>) {
  try { await p; } catch (e) { console.error(what, e); }
}

serve(["POST"], async req => {
  const body = await readJson(req);
  // Trampa para bots: un campo oculto que una persona nunca rellena.
  if (typeof body.website === "string" && body.website.trim()) return json(req, { ok: true });

  const db = adminClient();
  switch (body.type) {
    case "lead": return json(req, await lead(db, body));
    case "merch": return json(req, await merch(db, body));
    case "subscribe": return json(req, await subscribe(db, body));
    default: throw new HttpError("Formulario desconocido.");
  }
});

// ---------- contratación ----------
async function lead(db: Admin, b: Record<string, unknown>) {
  const date = text(b.date, 10, "la fecha");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError("Revisa la fecha.");
  const l = {
    name: text(b.name, 120, "tu nombre", true)!,
    org: text(b.org, 160, "la organización") ?? "",
    city: text(b.city, 120, "la ciudad", true)!,
    date,
    email: email(b.email, "Revisa el email: ahí te contestamos."),
    message: text(b.message, 4000, "el mensaje") ?? "",
  };
  const leadId = id("lead-");
  const { error } = await db.from("leads").insert({ id: leadId, doc: { ...l, id: leadId, createdAt: now(), status: "nueva" } });
  if (error) throw error;
  await quietly("aviso de contratación", notifyBand(leadNotification(l), { email: l.email, name: l.name }, ["contratacion"]));
  return { ok: true };
}

// ---------- merch ----------
async function merch(db: Admin, b: Record<string, unknown>) {
  const productId = text(b.productId, 100, "el producto", true)!;
  const variantId = text(b.variantId, 100, "la talla", true)!;
  const qty = Number(b.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new HttpError("Revisa cuántas unidades quieres.");

  // Mismos mensajes que api.requestMerch. El stock no se aparta aquí:
  // lo hace la banda al confirmar (reserva en la suite).
  const prod = await getRow<Product>(db, "products", productId);
  const v = prod && prod.doc.published && !prod.doc.archived ? prod.doc.variants?.find(x => x.id === variantId) : undefined;
  if (!prod || !v) throw new HttpError("Esa talla ya no está disponible.");
  if (v.stock < qty) throw new HttpError(v.stock ? `Solo quedan ${v.stock}.` : "Esa talla está agotada.");
  const mail = email(b.email, "Revisa el email: ahí te escribimos.");

  // La web ya no pregunta la entrega (se acuerda al confirmar); se acepta por si llega.
  const delivery = b.delivery === "envio" ? "envio" : b.delivery === "concierto" ? "concierto" : undefined;
  const gigId = text(b.gigId, 100, "el concierto");
  const address = text(b.address, 400, "la dirección", delivery === "envio");
  let gig: Gig | undefined;
  if (delivery === "concierto" && gigId) {
    gig = (await getRow<Gig>(db, "gigs", gigId))?.doc;
    if (!gig || !gig.published) throw new HttpError("Ese concierto ya no está en la agenda.");
  }

  const r = {
    productId, variantId, qty,
    name: text(b.name, 120, "tu nombre", true)!,
    email: mail,
    phone: text(b.phone, 40, "el teléfono"),
    delivery,
    gigId: delivery === "concierto" ? gigId : undefined,
    address: delivery === "envio" ? address : undefined,
    note: text(b.note, 1000, "la nota"),
  };
  const reqId = id("rq");
  const { error } = await db.from("requests").insert({ id: reqId, doc: { ...r, id: reqId, status: "nueva", createdAt: now() } });
  if (error) throw error;

  const info: MerchInfo = {
    product: prod.doc.name, variant: v.label, qty, priceCents: prod.doc.priceCents,
    name: r.name, email: r.email, phone: r.phone, delivery, address: r.address, note: r.note,
    gigLabel: gig ? `${dateLabel(gig.date)} · ${gig.venue} · ${gig.city}` : undefined,
  };
  await Promise.all([
    quietly("merch: email al cliente", sendEmail({ email: r.email, name: r.name }, merchReceived(info), { tags: ["merch"] })),
    quietly("merch: aviso a la banda", notifyBand(merchNotification(info), { email: r.email, name: r.name }, ["merch"])),
  ]);
  return { ok: true };
}

// ---------- avísame / newsletter ----------
async function subscribe(db: Admin, b: Record<string, unknown>) {
  const mail = email(b.email);
  const topics = Array.isArray(b.topics) ? b.topics.filter((t): t is Topic => TOPICS.includes(t as Topic)) : [];
  if (!topics.length) throw new HttpError("Marca al menos una cosa.");
  const name = text(b.name, 120, "tu nombre");
  const city = text(b.city, 120, "la ciudad");
  const source = text(b.source, 60, "el origen") ?? "web";

  // Si ya estaba, se le suman los intereses nuevos (como api.subscribe).
  const { data: prev, error } = await db.from("subscribers").select("id, doc").eq("email", mail).maybeSingle();
  if (error) throw error;
  let all: Topic[] = topics;
  if (prev) {
    const doc = await patchDoc<{ topics?: Topic[]; name?: string; city?: string }>(db, "subscribers", prev.id, d => ({
      topics: Array.from(new Set([...(d.topics ?? []), ...topics])),
      ...(name && !d.name ? { name } : {}),
      ...(city && !d.city ? { city } : {}),
    }));
    all = doc?.topics ?? topics;
  } else {
    const subId = id("sub-");
    const ins = await db.from("subscribers").insert({ id: subId, doc: { id: subId, email: mail, name, city, topics, source, createdAt: now() } });
    // Dos altas a la vez con el mismo email: la segunda choca con el índice único y da igual.
    if (ins.error && ins.error.code !== "23505") throw ins.error;
  }

  await quietly("brevo: alta newsletter", upsertNewsletterContact({ email: mail, name, city, topics: all }));
  return { ok: true };
}
