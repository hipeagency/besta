/* Lo que comparten checkout, webhook, acciones de la suite y el cron:
   cargar un pedido con su concierto y mandar sus emails una sola vez. */
import { sendEmail, upsertNewsletterContact } from "./brevo.ts";
import { inviteEmail, type OrderContext, refundEmail, ticketsEmail } from "./emails.ts";
import { type Admin, getRow, patchDoc } from "./supabase.ts";
import type { Gig, Order, Ticket, TicketEvent } from "./types.ts";

export async function loadOrderContext(db: Admin, orderId: string): Promise<OrderContext | null> {
  const row = await getRow<Order>(db, "orders", orderId);
  if (!row) return null;
  const order = { ...row.doc, id: row.id };
  const [tk, ev] = await Promise.all([
    db.from("tickets").select("id, doc").eq("order_id", orderId).order("id"),
    getRow<TicketEvent>(db, "events", order.eventId),
  ]);
  if (tk.error) throw tk.error;
  const event = ev ? { ...ev.doc, id: ev.id } : undefined;
  const gigRow = event?.gigId ? await getRow<Gig>(db, "gigs", event.gigId) : null;
  return {
    order,
    tickets: (tk.data ?? []).map(r => ({ ...(r.doc as Ticket), code: (r.doc as Ticket).code ?? r.id })),
    event,
    gig: gigRow ? { ...gigRow.doc, id: gigRow.id } : undefined,
  };
}

/* Marca primero y manda después: si Stripe repite el aviso no sale
   otro email. Si Brevo falla se quita la marca para que el reintento
   (de Stripe o del cron) lo vuelva a intentar. */
export async function sendOnce(
  db: Admin, orderId: string, field: "emailSentAt" | "refundEmailAt" | "reminderSentAt" | "thanksSentAt",
  build: (ctx: OrderContext) => { subject: string; html: string; text: string },
  tag: string,
): Promise<boolean> {
  const claimed = await patchDoc(db, "orders", orderId, { [field]: new Date().toISOString() }, field);
  if (!claimed) return false;
  try {
    const ctx = await loadOrderContext(db, orderId);
    if (!ctx) return false;
    await sendEmail({ email: ctx.order.email, name: ctx.order.name }, build(ctx), { tags: [tag] });
    return true;
  } catch (e) {
    await patchDoc(db, "orders", orderId, { [field]: null }).catch(() => {});
    throw e;
  }
}

export const sendTicketsOnce = (db: Admin, orderId: string) => sendOnce(db, orderId, "emailSentAt", ticketsEmail, "entradas");

/* Reenvío desde la suite: siempre sale, y deja constancia de cuándo. */
export async function resendTickets(db: Admin, orderId: string) {
  const ctx = await loadOrderContext(db, orderId);
  if (!ctx) throw new Error("not-found");
  await sendEmail({ email: ctx.order.email, name: ctx.order.name }, ticketsEmail(ctx), { tags: ["entradas", "reenvio"] });
  await patchDoc(db, "orders", orderId, { emailSentAt: ctx.order.emailSentAt ?? new Date().toISOString(), resentAt: new Date().toISOString() });
}

/* Devuelto: pedido «devuelto», sus entradas «cancelada» y un único
   email al comprador. Lo llaman la suite (al pedir la devolución) y el
   webhook (cuando Stripe la confirma): da igual quién llegue antes. */
export async function markRefunded(db: Admin, orderId: string) {
  await patchDoc<Order>(db, "orders", orderId, o =>
    o.status === "devuelto" ? null : { status: "devuelto", refundedAt: new Date().toISOString() });
  const { data, error } = await db.from("tickets").select("id").eq("order_id", orderId).neq("status", "cancelada");
  if (error) throw error;
  for (const t of data ?? []) await patchDoc(db, "tickets", t.id, { status: "cancelada" });
  await sendOnce(db, orderId, "refundEmailAt", refundEmail, "devolucion");
}

/* Quien marcó «quiero la newsletter» al comprar: a la lista con doble
   confirmación. Si falla no pasa nada grave: las entradas ya salieron. */
export async function subscribeBuyer(db: Admin, order: Order) {
  try {
    const email = order.email.toLowerCase();
    const { data: prev } = await db.from("subscribers").select("id, doc").eq("email", email).maybeSingle();
    const topics = Array.from(new Set([...(((prev?.doc as { topics?: string[] })?.topics) ?? []), "fechas"]));
    if (prev) await patchDoc(db, "subscribers", prev.id, { topics });
    else {
      const id = "sub-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      await db.from("subscribers").insert({ id, doc: { id, email, name: order.name, topics, source: "entradas", createdAt: new Date().toISOString() } });
    }
    await upsertNewsletterContact({ email, name: order.name, topics });
  } catch (e) {
    console.error("newsletter del comprador", e);
  }
}

/* Invitaciones de la suite por email. Todas del mismo evento y a
   nombre de la misma persona; las anuladas no salen. Deja en cada
   entrada a quién y cuándo se mandó. */
export async function sendInvites(db: Admin, codes: string[], to: { email: string; name?: string }) {
  const { data, error } = await db.from("tickets").select("id, doc").in("id", codes);
  if (error) throw error;
  const tickets = (data ?? []).map(r => ({ ...(r.doc as Ticket), code: r.id }))
    .filter(t => t.kind === "invitacion" && t.status !== "cancelada");
  if (!tickets.length) throw new Error("no-tickets");
  const eventIds = new Set(tickets.map(t => t.eventId));
  if (eventIds.size > 1) throw new Error("mixed-events");
  const ev = await getRow<TicketEvent>(db, "events", tickets[0].eventId);
  const event = ev ? { ...ev.doc, id: ev.id } : undefined;
  const gigRow = event?.gigId ? await getRow<Gig>(db, "gigs", event.gigId) : null;
  const holder = to.name || tickets[0].holder || "";
  await sendEmail({ email: to.email, name: holder || undefined }, inviteEmail({ holder, tickets, event, gig: gigRow ? { ...gigRow.doc, id: gigRow.id } : undefined }), { tags: ["invitacion"] });
  const at = new Date().toISOString();
  await Promise.all(tickets.map(t => patchDoc(db, "tickets", t.code, { email: to.email, sentAt: at })));
  return tickets.length;
}
