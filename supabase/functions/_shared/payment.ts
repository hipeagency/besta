/* Sesión de Stripe Checkout para un pedido ya reservado (make_order):
   una línea por tipo de entrada, con el precio que quedó en el pedido.
   La comparten la compra en la web y el cobro con tarjeta en taquilla. */
import { optEnv } from "./env.ts";
import { stripe } from "./stripe.ts";
import type { Order, OrderItem } from "./types.ts";

export const itemsOf = (o: Order): OrderItem[] =>
  o.items?.length ? o.items : [{ typeId: "general", name: "general", qty: o.qty, unitCents: o.qty ? Math.round(o.amountCents / o.qty) : 0 }];

export async function checkoutSession(order: Order, eventName: string, urls: { success: string; cancel: string }, email?: string) {
  const taxRate = optEnv("STRIPE_TAX_RATE_ID");
  return await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: itemsOf(order).map(i => ({
      quantity: i.qty,
      price_data: {
        currency: "eur",
        unit_amount: i.unitCents,
        product_data: { name: `Entrada ${i.name} · ${eventName}` },
      },
      // IVA incluido en el precio: la factura lo desglosa sin cambiar el total.
      ...(taxRate ? { tax_rates: [taxRate] } : {}),
    })),
    // Factura simplificada: Stripe la numera, la manda en PDF al comprador
    // y la guarda en el panel para el gestor.
    invoice_creation: {
      enabled: true,
      invoice_data: { description: `Pedido ${order.number}`, metadata: { order_id: order.id } },
    },
    ...(email ? { customer_email: email } : {}),
    metadata: { order_id: order.id },
    payment_intent_data: { metadata: { order_id: order.id } },
    // Stripe pide al menos 30 min desde que crea la sesión: un minuto de
    // margen para que no rechace la petición por unos milisegundos.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    locale: "es",
    success_url: urls.success,
    cancel_url: urls.cancel,
  }, { idempotencyKey: `checkout-${order.id}` });
}
