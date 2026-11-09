/* Comprar entradas: reserva plazas en SQL (con bloqueo, para no pasarse
   del aforo ni del límite de cada tipo) y devuelve la URL de pago de
   Stripe. Pública: la llama la web.

   Cuerpo: { eventId, items: [{ typeId, qty }], email, newsletter }.
   La web de antes mandaba { qty } a secas: va como «general». */
import { siteUrl } from "../_shared/env.ts";
import { email, HttpError, json, readJson, serve } from "../_shared/http.ts";
import { checkoutSession } from "../_shared/payment.ts";
import { adminClient, dbError, getRow, patchDoc } from "../_shared/supabase.ts";
import type { Order, TicketEvent } from "../_shared/types.ts";

serve(["POST"], async req => {
  const body = await readJson(req);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId || eventId.length > 100) throw new HttpError("Este evento ya no existe.");

  const db = adminClient();
  const evRow = await getRow<TicketEvent>(db, "events", eventId);
  if (!evRow) throw new HttpError("Este evento ya no existe.");
  const ev = evRow.doc;

  // Mismo orden de comprobaciones que api.checkout, para que el mensaje sea el mismo.
  if (!ev.salesEnabled) throw new HttpError("La venta de este concierto está cerrada.");
  // Un bolo en secreto (o sin publicar) aún no vende, aunque el evento esté abierto.
  const { data: isPublic, error: pubErr } = await db.rpc("event_is_public", { ev: eventId });
  if (pubErr) dbError(pubErr, "No hemos podido comprobar el concierto.");
  if (!isPublic) throw new HttpError("La venta de este concierto aún no está abierta.");

  const items = Array.isArray(body.items)
    ? body.items.slice(0, 20).map((i: { typeId?: unknown; qty?: unknown }) => ({ typeId: String(i?.typeId ?? ""), qty: Number(i?.qty) }))
    : [{ typeId: "general", qty: Number(body.qty) }];
  const mail = email(body.email, "Revisa el email: ahí te llegan las entradas.");
  const newsletter = body.newsletter === true;

  // Tipos, fechas, límites y aforo (otra vez, ya con el evento bloqueado) los vigila make_order.
  const { data, error } = await db.rpc("make_order", { ev: eventId, want: items, channel: "online", email: mail, newsletter });
  if (error) dbError(error, "No hemos podido reservar tus entradas.");
  const order = data as Order;

  try {
    const session = await checkoutSession(order, ev.name, {
      success: `${siteUrl()}/entradas/?pedido=${order.token}&nuevo=1`,
      cancel: `${siteUrl()}/#directo`,
    }, mail);
    const { error: upErr } = await db.from("orders").update({ stripe_session: session.id }).eq("id", order.id);
    if (upErr) throw upErr;
    if (!session.url) throw new Error("Stripe no ha devuelto URL de pago");
    return json(req, { url: session.url });
  } catch (e) {
    // Sin sesión de pago la reserva no sirve: se libera al momento.
    console.error("checkout", e);
    await patchDoc(db, "orders", order.id, { status: "caducado" }).catch(() => {});
    throw new HttpError("No hemos podido abrir el pago. Inténtalo de nuevo en un momento.", 502);
  }
});
