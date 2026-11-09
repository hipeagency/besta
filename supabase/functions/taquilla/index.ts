/* Taquilla: cobrar entradas con tarjeta en la puerta.

   Quien vende elige las entradas; aquí se reservan (make_order, canal
   «puerta») y se abre un pago de Stripe. La suite enseña su enlace en
   un QR: el cliente lo escanea y paga en su móvil (tarjeta, Apple Pay,
   Google Pay). Cuando Stripe lo da por pagado, las entradas se emiten
   ya «dentro».

   La suite pregunta cada pocos segundos («status»). No esperamos solo
   al webhook: aquí se le pregunta a Stripe directamente, así que el
   «pagado» llega aunque el aviso tarde. «ya ha pagado» hace lo mismo
   al momento. Si Stripe no lo ve pagado, no se da por pagado.

   Efectivo y Bizum no pasan por aquí: los apunta besta.door_sale.

   Acciones (POST):
     { action: "card",   eventId, items: [{ typeId, qty }] } → { orderId, number, url, amountCents }
     { action: "status", orderId }                            → { status }
     { action: "cancel", orderId }                            → { status } */
import { siteUrl } from "../_shared/env.ts";
import { HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { fulfillPaid } from "../_shared/orders.ts";
import { checkoutSession } from "../_shared/payment.ts";
import { stripe } from "../_shared/stripe.ts";
import { adminClient, dbError, getRow, patchDoc, userClient } from "../_shared/supabase.ts";
import type { Order, TicketEvent } from "../_shared/types.ts";

serve(["POST"], async req => {
  const user = userClient(req);
  const [{ data: door }, { data: tickets }] = await Promise.all([
    user.rpc("can", { scope: "puerta" }),
    user.rpc("can", { scope: "entradas" }),
  ]);
  if (door !== true && tickets !== true) throw new HttpError("Sin permiso para la taquilla.", 403);

  const body = await readJson(req);
  const db = adminClient();

  if (body.action === "card") {
    const eventId = text(body.eventId, 100, "el evento", true)!;
    const ev = await getRow<TicketEvent>(db, "events", eventId);
    if (!ev) throw new HttpError("Este evento ya no existe.");
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 20).map((i: { typeId?: unknown; qty?: unknown }) => ({ typeId: String(i?.typeId ?? ""), qty: Number(i?.qty) }))
      : [];

    const { data: auth } = await user.auth.getUser();
    const { data: me } = auth.user
      ? await db.from("members").select("doc").eq("user_id", auth.user.id).maybeSingle()
      : { data: null };
    const soldBy = ((me?.doc as { name?: string } | undefined)?.name) || "taquilla";

    const { data, error } = await db.rpc("make_order", {
      ev: eventId, want: items, channel: "puerta", email: "", newsletter: false, method: "tarjeta", sold_by: soldBy,
    });
    if (error) dbError(error, "No se han podido reservar las entradas.");
    const order = data as Order;

    try {
      const back = `${siteUrl()}/entradas/?pedido=${order.token}`;
      const session = await checkoutSession(order, ev.doc.name, { success: `${back}&nuevo=1`, cancel: back });
      const { error: upErr } = await db.from("orders").update({ stripe_session: session.id }).eq("id", order.id);
      if (upErr) throw upErr;
      if (!session.url) throw new Error("Stripe no ha devuelto URL de pago");
      return json(req, { orderId: order.id, number: order.number, url: session.url, amountCents: order.amountCents });
    } catch (e) {
      console.error("taquilla card", e);
      await patchDoc(db, "orders", order.id, { status: "caducado" }).catch(() => {});
      throw new HttpError("No se ha podido abrir el pago con Stripe. Prueba otra vez o cobra en efectivo.", 502);
    }
  }

  const orderId = text(body.orderId, 100, "el pedido", true)!;
  const { data: row, error: rowErr } = await db.from("orders").select("doc, stripe_session").eq("id", orderId).maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) throw new HttpError("Ese pedido ya no existe.", 404);
  const order = row.doc as Order;
  if (order.channel !== "puerta") throw new HttpError("Ese pedido no es de taquilla.");
  const sessionId = row.stripe_session as string | null;

  switch (body.action) {
    case "status": {
      if (order.status !== "pendiente" || !sessionId) return json(req, { status: order.status });
      const s = await stripe().checkout.sessions.retrieve(sessionId);
      if (s.payment_status === "paid") {
        await fulfillPaid(db, orderId, s);
        return json(req, { status: "pagado" });
      }
      if (s.status === "expired") {
        await patchDoc<Order>(db, "orders", orderId, o => (o.status === "pendiente" ? { status: "caducado" } : null));
        return json(req, { status: "caducado" });
      }
      return json(req, { status: "pendiente" });
    }

    case "cancel": {
      if (order.status !== "pendiente") return json(req, { status: order.status });
      if (sessionId) {
        // Si justo acaba de pagar, Stripe no deja caducarla: entonces está pagado.
        const s = await stripe().checkout.sessions.retrieve(sessionId);
        if (s.payment_status === "paid") {
          await fulfillPaid(db, orderId, s);
          return json(req, { status: "pagado" });
        }
        if (s.status === "open") await stripe().checkout.sessions.expire(sessionId).catch(e => console.warn("expire", e));
      }
      await patchDoc<Order>(db, "orders", orderId, o => (o.status === "pendiente" ? { status: "caducado" } : null));
      return json(req, { status: "caducado" });
    }

    default:
      throw new HttpError("Acción desconocida.");
  }
});
