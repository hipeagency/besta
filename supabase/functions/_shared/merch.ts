/* Merch comprado online (producto en modo «comprar»). Como las entradas:
   1. checkout: aparta el stock (reserva «pendiente») y abre Stripe.
   2. webhook pagado: la reserva pasa a «pagado, por entregar»; emails.
   3. webhook caducado (no pagó en 30 min): se anula y el stock vuelve.
   4. webhook devuelto: si no se había entregado, se anula y vuelve al
      stock; si ya se entregó, la venta queda marcada como devuelta.
   Solo se cobra lo que hay: lo agotado se encarga por public-forms, sin pagar. */
import { notifyBand, sendEmail } from "./brevo.ts";
import { type MerchInfo, merchNotification, merchReceived, merchRefundEmail } from "./emails.ts";
import { optEnv, siteUrl } from "./env.ts";
import { email, HttpError, text } from "./http.ts";
import { stripe } from "./stripe.ts";
import { type Admin, dbError, getRow, patchDoc } from "./supabase.ts";
import type { MerchMove, MerchRequest, Product } from "./types.ts";

const id = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const now = () => new Date().toISOString();
const MAX = 5;

export async function merchCheckout(db: Admin, b: Record<string, unknown>): Promise<{ url: string }> {
  const productId = text(b.productId, 100, "el producto", true)!;
  const variantId = text(b.variantId, 100, "la talla", true)!;
  const qty = Number(b.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX) throw new HttpError(`Puedes comprar entre 1 y ${MAX}.`);

  // Mismo orden y mensajes que api.checkoutMerch (mock).
  const row = await getRow<Product>(db, "products", productId);
  const p = row?.doc;
  const v = p && p.published && !p.archived ? p.variants?.find(x => x.id === variantId) : undefined;
  if (!p || !v) throw new HttpError("Esa talla ya no está disponible.");
  if (p.webMode !== "comprar") throw new HttpError("Este producto no se vende online: pídelo y te escribimos.");
  if (v.stock < qty) throw new HttpError(v.stock > 0 ? `Solo quedan ${v.stock}.` : "Esa talla está agotada: puedes encargarla.");
  const mail = email(b.email, "Revisa el email: ahí te mandamos el recibo.");
  const name = text(b.name, 120, "tu nombre", true)!;
  const phone = text(b.phone, 40, "el teléfono");
  const note = text(b.note, 1000, "la nota");

  // Apartar con bloqueo: si otro se ha llevado la última, falla aquí.
  const { error: stockErr } = await db.rpc("adjust_stock", { product_id: productId, variant_id: variantId, delta: -qty, allow_negative: false });
  if (stockErr) dbError(stockErr, "Esa talla se acaba de agotar.");

  const at = now(), moveId = id("m"), reqId = id("rq");
  const move: MerchMove = {
    id: moveId, productId, variantId, kind: "reserva", qty: -qty, unitCents: p.priceCents, by: "web",
    customer: `${name} · web`, open: true, online: "pendiente", note: "compra online", at,
  };
  const req: MerchRequest = {
    id: reqId, productId, variantId, qty, name, email: mail, phone, note,
    status: "apartada", moveId, pay: "pendiente", amountCents: qty * p.priceCents, createdAt: at,
  };
  const ins1 = await db.from("moves").insert({ id: moveId, doc: move });
  if (ins1.error) { await giveBack(db, productId, variantId, qty); throw ins1.error; }
  const ins2 = await db.from("requests").insert({ id: reqId, doc: req });
  if (ins2.error) { await release(db, move); throw ins2.error; }

  const taxRate = optEnv("STRIPE_TAX_RATE_ID");
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: qty,
        price_data: { currency: "eur", unit_amount: p.priceCents, product_data: { name: `${p.name}${v.label ? ` · ${v.label}` : ""}` } },
        ...(taxRate ? { tax_rates: [taxRate] } : {}),
      }],
      invoice_creation: { enabled: true, invoice_data: { description: `Merch besta · ${p.name}${v.label ? ` ${v.label}` : ""}`, metadata: { merch_request_id: reqId } } },
      customer_email: mail,
      metadata: { merch_request_id: reqId },
      payment_intent_data: { metadata: { merch_request_id: reqId } },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      locale: "es",
      success_url: `${siteUrl()}/?compra=merch#merch`,
      cancel_url: `${siteUrl()}/#merch`,
    }, { idempotencyKey: `merch-${reqId}` });
    await patchDoc(db, "requests", reqId, { stripeSession: session.id });
    if (!session.url) throw new Error("Stripe no ha devuelto URL de pago");
    return { url: session.url };
  } catch (e) {
    console.error("merch checkout", e);
    await expireMerch(db, reqId).catch(() => {});
    throw new HttpError("No hemos podido abrir el pago. Inténtalo de nuevo en un momento.", 502);
  }
}

const giveBack = (db: Admin, productId: string, variantId: string, qty: number) =>
  db.rpc("adjust_stock", { product_id: productId, variant_id: variantId, delta: qty, allow_negative: true });

/* Anula la reserva si sigue abierta: el stock vuelve y el apunte se borra. */
async function release(db: Admin, move?: MerchMove | null) {
  if (!move?.open) return;
  const { error } = await giveBack(db, move.productId, move.variantId, -move.qty);
  if (error) throw error;
  const del = await db.from("moves").delete().eq("id", move.id);
  if (del.error) throw del.error;
}

const moveOf = async (db: Admin, r: MerchRequest) => (r.moveId ? (await getRow<MerchMove>(db, "moves", r.moveId))?.doc : null);

/* Pago completado. Idempotente: solo el primero que marca «pagado» sigue. */
export async function merchPaid(db: Admin, reqId: string, paymentIntent?: string, buyerName?: string) {
  const r = await patchDoc<MerchRequest>(db, "requests", reqId, d =>
    d.pay === "pendiente" ? { pay: "pagado", paidAt: now(), ...(paymentIntent ? { paymentIntent } : {}) } : null);
  if (!r) return;
  if (r.moveId) await patchDoc(db, "moves", r.moveId, { online: "pagado", paidAt: r.paidAt, payment: "online", note: "pagado online" });
  await sendPaidOnce(db, r, buyerName);
}

async function infoOf(db: Admin, r: MerchRequest, buyerName?: string): Promise<MerchInfo> {
  const p = (await getRow<Product>(db, "products", r.productId))?.doc;
  const v = p?.variants.find(x => x.id === r.variantId);
  // El importe cobrado, no el precio de hoy (pudo cambiar después).
  const unit = r.amountCents && r.qty ? Math.round(r.amountCents / r.qty) : p?.priceCents ?? 0;
  return {
    product: p?.name ?? "merch", variant: v?.label ?? "", qty: r.qty, priceCents: unit,
    name: r.name || buyerName || "", email: r.email, phone: r.phone, note: r.note, paid: true,
  };
}

async function sendPaidOnce(db: Admin, r: MerchRequest, buyerName?: string) {
  const claimed = await patchDoc(db, "requests", r.id, { paidEmailAt: now() }, "paidEmailAt");
  if (!claimed) return;
  try {
    const info = await infoOf(db, r, buyerName);
    await Promise.all([
      sendEmail({ email: r.email, name: info.name }, merchReceived(info), { tags: ["merch", "pagado"] }),
      notifyBand(merchNotification(info), { email: r.email, name: info.name }, ["merch"]),
    ]);
  } catch (e) {
    await patchDoc(db, "requests", r.id, { paidEmailAt: null }).catch(() => {});
    throw e;
  }
}

/* No pagó (sesión caducada o fallo al abrir el pago): el stock vuelve. */
export async function expireMerch(db: Admin, reqId: string) {
  const r = await patchDoc<MerchRequest>(db, "requests", reqId, d =>
    d.pay === "pendiente" ? { pay: "caducado", status: "cancelada" } : null);
  if (!r) return;
  await release(db, await moveOf(db, r));
}

/* Devolución completa. La marcan el webhook (Stripe la confirma, o se
   hizo desde el panel de Stripe) y la suite (botón «devolver»): da igual
   quién llegue antes. Sin entregar, la unidad vuelve al stock; ya
   entregada, la venta queda como devuelta (el producto no vuelve solo). */
export async function refundMerch(db: Admin, reqId: string) {
  const r = await patchDoc<MerchRequest>(db, "requests", reqId, d =>
    d.pay === "pagado" ? { pay: "devuelto", refundedAt: now(), ...(d.status === "entregada" ? {} : { status: "cancelada" }) } : null);
  if (r) {
    const m = await moveOf(db, r);
    if (m?.open) await release(db, m);
    else if (m) await patchDoc(db, "moves", m.id, { refundedAt: now() });
  }
  await sendRefundOnce(db, reqId);
}

async function sendRefundOnce(db: Admin, reqId: string) {
  const r = await patchDoc<MerchRequest>(db, "requests", reqId, d => (d.pay === "devuelto" ? { refundEmailAt: now() } : null), "refundEmailAt");
  if (!r) return;
  try {
    await sendEmail({ email: r.email, name: r.name }, merchRefundEmail(await infoOf(db, r)), { tags: ["merch", "devolucion"] });
  } catch (e) {
    await patchDoc(db, "requests", reqId, { refundEmailAt: null }).catch(() => {});
    throw e;
  }
}

/* Desde la suite: pide la devolución a Stripe y la marca ya. */
export async function refundMerchNow(db: Admin, reqId: string) {
  const r = (await getRow<MerchRequest>(db, "requests", reqId))?.doc;
  if (!r) throw new HttpError("Ese pedido ya no existe.", 404);
  if (r.pay === "devuelto") return;
  if (r.pay !== "pagado") throw new HttpError("Solo se puede devolver una compra pagada online.");
  if (!r.paymentIntent) throw new HttpError("No encontramos el pago en Stripe: hazla desde el panel de Stripe.");
  try {
    await stripe().refunds.create(
      { payment_intent: r.paymentIntent, reason: "requested_by_customer", metadata: { merch_request_id: reqId } },
      { idempotencyKey: `merch-refund-${reqId}` },
    );
  } catch (e) {
    // Ya devuelto en Stripe (desde su panel, por ejemplo): seguimos y lo marcamos.
    if ((e as { code?: string }).code !== "charge_already_refunded") {
      console.error("merch refund", reqId, e);
      throw new HttpError("Stripe no ha aceptado la devolución. Revísalo en el panel de Stripe.", 502);
    }
  }
  await refundMerch(db, reqId);
}

/* El pedido de un cobro devuelto: por metadata o, si no viene, por el payment intent. */
export async function merchRequestFor(db: Admin, meta: Record<string, string> | null | undefined, pi?: string) {
  if (meta?.merch_request_id) return meta.merch_request_id;
  if (!pi) return undefined;
  const { data, error } = await db.from("requests").select("id").eq("doc->>paymentIntent", pi).maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}
