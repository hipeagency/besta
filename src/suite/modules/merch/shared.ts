/* Lo que comparten merch y el modo puesto. */
import type { MerchMove, MoveKind, PayMethod, Product, Variant } from "@/data/types";

/* El «color» del producto, solo con los cuatro de la marca. Sobre tubo, el tubo es marco. */
export const swatch: Record<Product["color"], string> = {
  senal: "bg-senal text-noche",
  crema: "bg-crema text-noche",
  tubo: "bg-marco text-crema",
  noche: "bg-noche text-crema border border-crema/12",
};

export const LOW = 3;
export const PAYMENTS: PayMethod[] = ["efectivo", "bizum", "tarjeta"];

export const KIND_LABEL: Record<MoveKind, string> = {
  venta: "venta", reserva: "reserva", regalo: "regalo", reposicion: "reposición", recuento: "recuento",
};

/** «camiseta tele M», «gorra besta» */
export const itemName = (p: Product | undefined, v: Variant | undefined) =>
  `${p?.name ?? "producto borrado"}${v?.label ? " " + v.label : ""}`;

export const sizeLabel = (v: Variant, p: Product) => v.label || (p.variants.length === 1 ? "única" : "—");

/** Importe de una venta (qty viene en negativo). */
export const moveCents = (m: MerchMove) => -m.qty * m.unitCents;

/* En la oficina se puede apuntar cualquier forma de pago; en el puesto, las tres de siempre. */
export const ALL_PAYMENTS: PayMethod[] = [...PAYMENTS, "otro"];

export const isOpenReserve = (m: MerchMove) => m.kind === "reserva" && !!m.open;

/* El stock de la talla es lo LIBRE: una reserva lo aparta al apuntarse.
   Lo que hay de verdad en la caja es libre + apartado.
   Solo una reserva puede dejar lo libre en negativo: es un encargo, algo
   que debemos a alguien y que aún no tenemos. −2 = «faltan 2» por pedir.
   Vender o regalar sí exige que haya. Al reponer, lo que entra cubre
   primero los encargos. */
export const heldOf = (moves: MerchMove[], variantId: string) =>
  moves.filter(m => m.variantId === variantId && isOpenReserve(m)).reduce((s, m) => s - m.qty, 0);

/** Unidades que faltan para cubrir las reservas de la talla. */
export const shortOf = (v: Variant) => Math.max(0, -v.stock);
/** Lo libre de verdad: nunca menos de 0. */
export const freeOf = (v: Variant) => Math.max(0, v.stock);

export function stockOf(p: Product, moves: MerchMove[]) {
  return p.variants.reduce((t, v) => {
    const held = heldOf(moves, v.id);
    return { free: t.free + freeOf(v), held: t.held + held, box: t.box + v.stock + held, short: t.short + shortOf(v) };
  }, { free: 0, held: 0, box: 0, short: 0 });
}

/* Qué reservas están cubiertas: lo que hay en la caja va a las más
   antiguas primero. Devuelve, por reserva abierta, cuántas le faltan
   (0 = se puede entregar). */
export function coverage(products: Product[], moves: MerchMove[]) {
  const missing = new Map<string, number>();
  const open = moves.filter(isOpenReserve).sort((a, b) => a.at.localeCompare(b.at));
  const left = new Map<string, number>();
  for (const p of products) for (const v of p.variants) left.set(v.id, Math.max(0, v.stock + heldOf(moves, v.id)));
  for (const m of open) {
    const want = -m.qty, have = left.get(m.variantId) ?? 0;
    const got = Math.min(want, have);
    left.set(m.variantId, have - got);
    missing.set(m.id, want - got);
  }
  return missing;
}

/* Dinero en modelo de caja: sale al reponer (a lo que costó esa tirada)
   y entra al vender. Regalos y mermas no restan aparte: su coste ya
   salió al reponer. Lo pagado online entra el día que se paga, aunque
   aún esté por entregar; lo devuelto en Stripe no cuenta. */
export const isPaidOnline = (m: MerchMove) => m.online === "pagado" && !m.refundedAt;

/** Una compra online no se anula desde aquí: el dinero está en Stripe. */
export function onlineGuard(m: MerchMove) {
  if (m.online === "pendiente") throw new Error("Está pagando online ahora mismo: si no paga, se libera sola en 30 minutos.");
  if (m.online === "pagado") throw new Error("Está pagada online: usa «devolver» (Stripe devuelve el dinero y se anula).");
}

export function money(moves: MerchMove[]) {
  let spent = 0, earned = 0, sold = 0, bought = 0;
  for (const m of moves) {
    if (m.kind === "reposicion") { spent += m.qty * m.unitCents; bought += m.qty; }
    else if ((m.kind === "venta" && !m.refundedAt) || (isOpenReserve(m) && isPaidOnline(m))) { earned += moveCents(m); sold -= m.qty; }
  }
  return { spent, earned, sold, bought, profit: earned - spent, left: Math.max(0, spent - earned) };
}

/* «hoy», «ayer», «sáb 29 ago»: las listas se agrupan por día, que es como se busca. */
export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400e3);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  const txt = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  return d.getFullYear() === now.getFullYear() ? txt : `${txt} ${d.getFullYear()}`;
}

export function byDay<T extends { at: string }>(rows: T[]) {
  const out: { key: string; label: string; rows: T[] }[] = [];
  for (const r of rows) {
    const key = new Date(r.at).toDateString();
    const last = out[out.length - 1];
    if (last?.key === key) last.rows.push(r);
    else out.push({ key, label: dayLabel(r.at), rows: [r] });
  }
  return out;
}

/** Texto sobre el que buscan reservas y movimientos. */
export const haystack = (m: MerchMove, p: Product | undefined, gigName = "") =>
  [itemName(p, p?.variants.find(v => v.id === m.variantId)), m.customer, m.note, m.payment, m.by, gigName].filter(Boolean).join(" ").toLowerCase();
