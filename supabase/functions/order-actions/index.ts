/* Acciones de la suite sobre un pedido (devolver o reenviar entradas)
   y mandar invitaciones por email.
   Solo quien tiene el módulo «entradas» (se pregunta a la base con su
   propio JWT, así manda la misma regla que en todo lo demás). */
import { email, HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { markRefunded, resendTickets, sendInvites } from "../_shared/orders.ts";
import { stripe } from "../_shared/stripe.ts";
import { adminClient, getRow, userClient } from "../_shared/supabase.ts";
import type { Order } from "../_shared/types.ts";

serve(["POST"], async req => {
  const { data: allowed, error: permErr } = await userClient(req).rpc("can", { scope: "entradas" });
  if (permErr) throw new HttpError("Inicia sesión de nuevo.", 401);
  if (allowed !== true) throw new HttpError("Sin permiso para entradas.", 403);

  const body = await readJson(req);
  const db = adminClient();

  if (body.action === "invite") {
    const codes = Array.isArray(body.codes) ? body.codes.filter((c): c is string => typeof c === "string").slice(0, 50) : [];
    if (!codes.length) throw new HttpError("Elige qué invitaciones mandar.");
    const to = email(body.email, "Revisa el email.");
    try {
      const sent = await sendInvites(db, codes, { email: to, name: text(body.name, 120, "el nombre") });
      return json(req, { ok: true, sent });
    } catch (e) {
      const m = (e as Error).message;
      if (m === "no-tickets") throw new HttpError("Esas invitaciones ya no son válidas.");
      if (m === "mixed-events") throw new HttpError("Manda las invitaciones de un evento cada vez.");
      console.error("invitación", e);
      throw new HttpError("No se ha podido mandar el email. Prueba otra vez en un rato.", 502);
    }
  }

  const orderId = text(body.orderId, 100, "el pedido", true)!;
  const row = await getRow<Order>(db, "orders", orderId);
  if (!row) throw new HttpError("Ese pedido ya no existe.", 404);
  const order = row.doc;

  switch (body.action) {
    case "refund": {
      if (order.status === "devuelto") return json(req, { ok: true, status: "devuelto" });
      if (order.status !== "pagado") throw new HttpError("Solo se puede devolver un pedido pagado.");
      // Sin pago de Stripe (pedido antiguo o a mano) solo se anula aquí.
      if (order.paymentIntent) {
        try {
          await stripe().refunds.create(
            { payment_intent: order.paymentIntent, reason: "requested_by_customer", metadata: { order_id: orderId } },
            { idempotencyKey: `refund-${orderId}` },
          );
        } catch (e) {
          const msg = (e as { code?: string; message?: string });
          // Ya devuelto en Stripe (desde su panel, por ejemplo): seguimos y lo marcamos.
          if (msg.code !== "charge_already_refunded") {
            console.error("refund", orderId, e);
            throw new HttpError("Stripe no ha aceptado la devolución. Revísalo en el panel de Stripe.", 502);
          }
        }
      }
      // El webhook también lo hará al confirmarse; aquí ya, para que la puerta no la acepte.
      await markRefunded(db, orderId);
      return json(req, { ok: true, status: "devuelto", stripe: !!order.paymentIntent });
    }

    case "resend": {
      if (order.status !== "pagado") throw new HttpError("Este pedido no tiene entradas válidas que reenviar.");
      await resendTickets(db, orderId);
      return json(req, { ok: true });
    }

    default:
      throw new HttpError("Acción desconocida.");
  }
});
