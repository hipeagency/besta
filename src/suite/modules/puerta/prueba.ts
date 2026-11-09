/* Puerta en modo prueba: un concierto inventado con sus entradas,
   solo en la memoria de este móvil. Nada llega a la base de datos ni
   cuenta en ningún evento de verdad. Sirve para ensayar la puerta
   cuando no hay conciertos con entradas a la venta.

   Los códigos son fijos (BST-PRB1…): abre el modo prueba en otro
   móvil o en el ordenador, enseña los QR y escanéalos con este. */
import { useSyncExternalStore } from "react";
import type { Gig, Order, ScanResult, Ticket, TicketEvent } from "@/data/types";

export const PRUEBA_ID = "prueba";
const OTRO_ID = "prueba-otro";

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const ago = (min: number) => new Date(Date.now() - min * 60e3).toISOString();

const gig = (id: string, date: string, city: string, venue: string): Gig => ({
  id, date, time: "22:00", doors: "21:00", city, venue,
  status: "confirmado", published: false, ticketing: "propia", schedule: [], contacts: [], checklist: {},
});

const event = (id: string, gigId: string, name: string): TicketEvent => ({
  id, gigId, name, description: "", priceCents: 1200, capacity: 50, maxPerOrder: 6, salesEnabled: false,
});

const order = (n: number, email: string, qty: number, status: Order["status"] = "pagado", eventId = PRUEBA_ID): Order => ({
  id: `prb-o${n}`, number: 9000 + n, eventId, email, name: undefined, qty, amountCents: qty * 1200,
  status, newsletter: false, createdAt: ago(60 * 24 * n), token: `prueba-${n}`,
});

const general = (code: string, orderId: string, extra: Partial<Ticket> = {}): Ticket =>
  ({ code, orderId, eventId: PRUEBA_ID, kind: "general", status: "valida", ...extra });

function seed() {
  return {
    events: [event(PRUEBA_ID, "prb-g1", "Concierto de prueba"), event(OTRO_ID, "prb-g2", "Otro concierto de prueba")],
    gigs: [gig("prb-g1", today(), "Prueba", "sala de ensayo · modo prueba"), gig("prb-g2", inDays(21), "Otra ciudad", "otra sala")],
    orders: [
      order(1, "lucia.prueba@example.com", 3),
      order(2, "marcos.prueba@example.com", 2),
      order(3, "elena.prueba@example.com", 1),
      order(4, "devuelto.prueba@example.com", 1, "devuelto"),
      order(5, "otro.prueba@example.com", 1, "pagado", OTRO_ID),
    ],
    tickets: [
      general("BST-PRB1", "prb-o1"),
      general("BST-PRB2", "prb-o1"),
      general("BST-PRB3", "prb-o1"),
      general("BST-PRB4", "prb-o2"),
      general("BST-PRB5", "prb-o2", { status: "usada", checkedInAt: ago(25), checkedInBy: "Ana (prueba)" }),
      general("BST-PRB6", "prb-o3"),
      general("BST-PRB7", "prb-o4", { status: "cancelada" }),
      { code: "BST-PRB8", orderId: "prb-o5", eventId: OTRO_ID, kind: "general", status: "valida" },
      { code: "INV-PRB1", eventId: PRUEBA_ID, kind: "invitacion", holder: "Pepa Prueba", status: "valida" },
      { code: "INV-PRB2", eventId: PRUEBA_ID, kind: "invitacion", status: "valida" },
    ] as Ticket[],
  };
}

type State = ReturnType<typeof seed>;
let state: State = seed();
const subs = new Set<() => void>();
const set = (s: State) => { state = s; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const usePrueba = () => useSyncExternalStore(subscribe, () => state);

export const prueba = {
  reset() { set(seed()); },

  /** Misma lógica que la API: solo la primera lectura de una entrada válida la deja pasar. */
  async scan(raw: string, eventId: string, by: string): Promise<ScanResult> {
    await new Promise(r => setTimeout(r, 250));   // como si fuera a la red
    const clean = raw.trim().toUpperCase().replace(/^BESTA:T:/, "");
    const t = state.tickets.find(x => x.code === clean);
    if (!t) return { ok: false, reason: "no-existe" };
    const o = t.orderId ? state.orders.find(x => x.id === t.orderId) : undefined;
    if (t.eventId !== eventId) return { ok: false, reason: "otro-evento", ticket: t, order: o };
    if (t.status === "cancelada") return { ok: false, reason: "cancelada", ticket: t, order: o };
    if (t.status === "usada") return { ok: false, reason: "usada", ticket: t, order: o };
    const used: Ticket = { ...t, status: "usada", checkedInAt: new Date().toISOString(), checkedInBy: by };
    set({ ...state, tickets: state.tickets.map(x => x.code === t.code ? used : x) });
    return { ok: true, ticket: used, order: o };
  },

  async checkInManual(code: string, by: string) {
    set({ ...state, tickets: state.tickets.map(t => t.code === code && t.status === "valida"
      ? { ...t, status: "usada" as const, checkedInAt: new Date().toISOString(), checkedInBy: by } : t) });
  },

  /** Un código para cada caso que se quiere ver en la puerta. */
  pick(kind: "valida" | "invitacion" | "usada" | "cancelada" | "otro-evento" | "no-existe"): string {
    const ts = state.tickets;
    const find = (f: (t: Ticket) => boolean) => ts.find(f)?.code;
    switch (kind) {
      case "valida": return find(t => t.eventId === PRUEBA_ID && t.kind === "general" && t.status === "valida") ?? "BST-PRB1";
      case "invitacion": return find(t => t.kind === "invitacion" && t.status === "valida") ?? "INV-PRB1";
      case "usada": return find(t => t.eventId === PRUEBA_ID && t.status === "usada") ?? "BST-PRB5";
      case "cancelada": return "BST-PRB7";
      case "otro-evento": return "BST-PRB8";
      case "no-existe": return "BST-NOPE";
    }
  },
};
