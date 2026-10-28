/* Comprar entradas: reserva plazas en SQL (con bloqueo, para no pasarse
   del aforo) y devuelve la URL de pago de Stripe. Pública: la llama la web. */
import { optEnv, siteUrl } from "../_shared/env.ts";
import { email, HttpError, json, readJson, serve } from "../_shared/http.ts";
import { stripe } from "../_shared/stripe.ts";
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
  const qty = Number(body.qty);
  const max = ev.maxPerOrder || 10;
  if (!Number.isInteger(qty) || qty < 1 || qty > max) throw new HttpError(`Puedes comprar entre 1 y ${max} entradas.`);
  const mail = email(body.email, "Revisa el email: ahí te llegan las entradas.");
  const newsletter = body.newsletter === true;

  // El aforo (y lo demás otra vez, ya con el evento bloqueado) lo vigila reserve_order.
  const { data, error } = await db.rpc("reserve_order", { ev: eventId, qty, email: mail, newsletter });
  if (error) dbError(error, "No hemos podido reservar tus entradas.");
  const order = data as Order;

  const taxRate = optEnv("STRIPE_TAX_RATE_ID");
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: qty,
        price_data: {
          currency: "eur",
          unit_amount: ev.priceCents,
          product_data: { name: `Entrada general · ${ev.name}` },
        },
        // IVA incluido en el precio: la factura lo desglosa sin cambiar el total.
        ...(taxRate ? { tax_rates: [taxRate] } : {}),
      }],
      // Factura simplificada: Stripe la numera, la manda en PDF al comprador
      // y la guarda en el panel para el gestor.
      invoice_creation: {
        enabled: true,
        invoice_data: { description: `Pedido ${order.number}`, metadata: { order_id: order.id } },
      },
      customer_email: mail,
      metadata: { order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id } },
      // Stripe pide al menos 30 min desde que crea la sesión: un minuto de
      // margen para que no rechace la petición por unos milisegundos.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      locale: "es",
      success_url: `${siteUrl()}/entradas/?pedido=${order.token}&nuevo=1`,
      cancel_url: `${siteUrl()}/#directo`,
    }, { idempotencyKey: `checkout-${order.id}` });

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
