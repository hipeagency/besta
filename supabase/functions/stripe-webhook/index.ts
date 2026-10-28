/* Avisos de Stripe. Firma comprobada siempre; todo idempotente porque
   Stripe repite el aviso si tardamos o fallamos. A los eventos que no
   nos interesan se responde 200 sin más. */
import { env } from "../_shared/env.ts";
import { markRefunded, sendTicketsOnce, subscribeBuyer } from "../_shared/orders.ts";
import { Stripe, stripe } from "../_shared/stripe.ts";
import { adminClient, patchDoc } from "../_shared/supabase.ts";
import type { Order } from "../_shared/types.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return reply({ error: "Falta la firma." }, 400);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, sig, env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider);
  } catch (e) {
    console.warn("firma de Stripe no válida", (e as Error).message);
    return reply({ error: "Firma no válida." }, 400);
  }

  try {
    const db = adminClient();
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        const orderId = s.metadata?.order_id;
        if (!orderId) break;  // una sesión que no es de entradas
        if (s.payment_status !== "paid") break;  // pago diferido: llegará async_payment_succeeded
        const { error } = await db.rpc("fulfill_order", { o_id: orderId, session: s.id });
        if (error) throw error;
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
        const name = s.customer_details?.name?.trim();
        const order = await patchDoc<Order>(db, "orders", orderId, o => ({
          ...(pi && !o.paymentIntent ? { paymentIntent: pi } : {}),
          ...(name && !o.name ? { name } : {}),
        }));
        const first = await sendTicketsOnce(db, orderId);
        if (first && order?.newsletter) await subscribeBuyer(db, order);
        break;
      }

      case "checkout.session.expired": {
        const orderId = event.data.object.metadata?.order_id;
        if (orderId) await patchDoc<Order>(db, "orders", orderId, o => (o.status === "pendiente" ? { status: "caducado" } : null));
        break;
      }

      case "charge.refunded": {
        const ch = event.data.object;
        if (!ch.refunded) break;  // devolución parcial: la banda decide a mano
        const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
        if (!pi) break;
        let orderId = (ch.metadata?.order_id as string | undefined) || undefined;
        if (!orderId) {
          const { data, error } = await db.from("orders").select("id").eq("doc->>paymentIntent", pi).maybeSingle();
          if (error) throw error;
          orderId = data?.id;
        }
        if (orderId) await markRefunded(db, orderId);
        else console.warn("devolución sin pedido", pi);
        break;
      }
    }
    return reply({ received: true });
  } catch (e) {
    // 500 → Stripe lo reintenta más tarde; todo lo de arriba aguanta repetirse.
    console.error(event.type, event.id, e);
    return reply({ error: "Error procesando el aviso." }, 500);
  }
});
