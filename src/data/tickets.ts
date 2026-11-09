/* Tipos de entrada: las reglas en un solo sitio para la web, la suite,
   la taquilla y los datos de prueba. Las mismas cuentas están en SQL
   (besta.event_types, besta.make_order), que es lo que manda de verdad. */
import type { Order, OrderItem, Ticket, TicketEvent, TicketType } from "./types";

/** El tipo de los eventos de antes de haber tipos (y de sus entradas). */
export const GENERAL = "general";

/** Los tipos de un evento. Sin tipos guardados: una «general» al precio del evento. */
export function eventTypes(ev: Pick<TicketEvent, "types" | "priceCents">): TicketType[] {
  if (ev.types?.length) return ev.types;
  return [{ id: GENERAL, name: "general", priceCents: ev.priceCents, channel: "ambos", active: true }];
}

export const typeOf = (t: Ticket) => t.typeId ?? GENERAL;

/** Nombre para enseñar: el que llevaba al emitirse, o el del tipo. */
export const ticketTypeName = (t: Ticket, ev?: Pick<TicketEvent, "types" | "priceCents">) =>
  t.kind === "invitacion" ? "invitación" : t.typeName ?? (ev ? eventTypes(ev).find(x => x.id === typeOf(t))?.name : undefined) ?? "general";

export const sellsOnline = (t: TicketType) => t.channel !== "puerta";
export const sellsAtDoor = (t: TicketType) => t.channel !== "online";

/** ¿Se puede comprar online ahora? (activo, canal y fechas). */
export function onlineOpen(t: TicketType, now = Date.now()) {
  if (!t.active || !sellsOnline(t)) return false;
  if (t.salesStart && Date.parse(t.salesStart) > now) return false;
  if (t.salesEnd && Date.parse(t.salesEnd) < now) return false;
  return true;
}

/** Por qué un tipo no está a la venta online ahora mismo (o null si lo está). */
export function onlineClosedReason(t: TicketType, now = Date.now()): string | null {
  if (!t.active) return "pausada";
  if (!sellsOnline(t)) return "solo en taquilla";
  if (t.salesStart && Date.parse(t.salesStart) > now) return "aún no";
  if (t.salesEnd && Date.parse(t.salesEnd) < now) return "terminada";
  return null;
}

/** «desde»: el más barato de los que se venden online (o de todos, si ninguno). */
export function fromPrice(types: TicketType[]) {
  const pool = types.filter(t => t.active && sellsOnline(t));
  const list = (pool.length ? pool : types).map(t => t.priceCents);
  return list.length ? Math.min(...list) : 0;
}

/** Líneas de un pedido (los antiguos no las llevan: todo general). */
export const orderItems = (o: Order): OrderItem[] =>
  o.items?.length ? o.items : [{ typeId: GENERAL, name: "general", qty: o.qty, unitCents: o.qty ? Math.round(o.amountCents / o.qty) : 0 }];

/** «2 anticipada + 1 general» */
export const itemsLabel = (items: OrderItem[]) =>
  items.filter(i => i.qty > 0).map(i => `${i.qty} ${i.name}`).join(" + ");

/** Ocupadas por tipo: entradas emitidas no canceladas + pedidos en pago. */
export function takenByType(evId: string, orders: Order[], tickets: Ticket[]) {
  const out: Record<string, number> = {};
  for (const t of tickets) {
    if (t.eventId !== evId || t.kind !== "general" || t.status === "cancelada") continue;
    out[typeOf(t)] = (out[typeOf(t)] ?? 0) + 1;
  }
  for (const o of orders) {
    if (o.eventId !== evId || o.status !== "pendiente") continue;
    for (const i of orderItems(o)) out[i.typeId] = (out[i.typeId] ?? 0) + i.qty;
  }
  return out;
}

/** Cuántas quedan de un tipo, contando su límite y el aforo libre del evento. */
export const typeLeft = (t: TicketType, taken: Record<string, number>, eventFree: number) =>
  Math.max(0, Math.min(eventFree, t.limit != null ? t.limit - (taken[t.id] ?? 0) : Infinity));

/** Comprobación común antes de crear un pedido (de prueba; en SQL, make_order). */
export function buildItems(
  ev: TicketEvent, want: { typeId: string; qty: number }[], channel: "online" | "puerta",
  taken: Record<string, number>, eventFree: number,
): { items: OrderItem[]; qty: number; amountCents: number } {
  const types = eventTypes(ev);
  const items: OrderItem[] = [];
  for (const w of want) {
    if (!Number.isInteger(w.qty) || w.qty < 0) throw new Error("Revisa cuántas entradas.");
    if (!w.qty) continue;
    const t = types.find(x => x.id === w.typeId);
    if (!t) throw new Error("Ese tipo de entrada ya no existe.");
    if (channel === "online" && !onlineOpen(t)) throw new Error(`«${t.name}» no está a la venta ahora.`);
    if (channel === "puerta" && !(t.active && sellsAtDoor(t))) throw new Error(`«${t.name}» no se vende en taquilla.`);
    if (t.limit != null && (taken[t.id] ?? 0) + w.qty > t.limit) {
      const left = Math.max(0, t.limit - (taken[t.id] ?? 0));
      throw new Error(left ? `De «${t.name}» solo quedan ${left}.` : `«${t.name}» está agotada.`);
    }
    items.push({ typeId: t.id, name: t.name, qty: w.qty, unitCents: t.priceCents });
  }
  const qty = items.reduce((s, i) => s + i.qty, 0);
  if (!qty) throw new Error("Elige al menos una entrada.");
  if (channel === "online" && qty > ev.maxPerOrder) throw new Error(`Puedes comprar entre 1 y ${ev.maxPerOrder} entradas.`);
  if (qty > eventFree) throw new Error(eventFree ? `Solo quedan ${eventFree} entradas.` : "No quedan entradas: aforo completo.");
  return { items, qty, amountCents: items.reduce((s, i) => s + i.qty * i.unitCents, 0) };
}
