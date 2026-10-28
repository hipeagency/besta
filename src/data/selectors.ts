/* Cálculos derivados. Funciones puras: las usan las pantallas
   y, el día de mañana, las mismas cuentas vivirán en vistas SQL. */
import type { DB } from "./seed";
import type { Gig, ID, TicketEvent, Member, Expense, Settlement, Song } from "./types";
import { isPast } from "@/lib/format";

/** Comisión estimada de Stripe con tarjeta europea: 1,5 % + 0,25 € por pedido. */
export const stripeFee = (amountCents: number) => Math.round(amountCents * 0.015 + 25);

export function eventStats(ev: TicketEvent, d: Pick<DB, "orders" | "tickets">) {
  const orders = d.orders.filter(o => o.eventId === ev.id);
  const paid = orders.filter(o => o.status === "pagado");
  const tickets = d.tickets.filter(t => t.eventId === ev.id);
  const sold = tickets.filter(t => t.kind === "general" && t.status !== "cancelada").length;
  const invites = tickets.filter(t => t.kind === "invitacion" && t.status !== "cancelada").length;
  const pending = orders.filter(o => o.status === "pendiente").reduce((s, o) => s + o.qty, 0);
  const inside = tickets.filter(t => t.status === "usada").length;
  const gross = paid.reduce((s, o) => s + o.amountCents, 0);
  const net = gross - paid.reduce((s, o) => s + stripeFee(o.amountCents), 0);
  const free = Math.max(0, ev.capacity - sold - invites - pending);
  return { orders, paid, tickets, sold, invites, pending, inside, gross, net, free, pct: ev.capacity ? sold / ev.capacity : 0 };
}

/** Ventas por día de las últimas `days` jornadas. */
export function salesByDay(evId: ID, d: Pick<DB, "orders">, days = 21) {
  const out: { day: string; qty: number }[] = [];
  const today = new Date(new Date().toDateString());
  for (let i = days - 1; i >= 0; i--) {
    const dd = new Date(today.getTime() - i * 86400e3);
    const key = dd.toISOString().slice(0, 10);
    out.push({ day: key, qty: 0 });
  }
  d.orders.filter(o => o.eventId === evId && o.status === "pagado").forEach(o => {
    const row = out.find(r => r.day === o.createdAt.slice(0, 10));
    if (row) row.qty += o.qty;
  });
  return out;
}

export const upcomingGigs = (gigs: Gig[]) =>
  gigs.filter(g => !isPast(g.date) && g.status !== "cancelado").sort((a, b) => a.date.localeCompare(b.date));
export const pastGigs = (gigs: Gig[]) =>
  gigs.filter(g => isPast(g.date)).sort((a, b) => b.date.localeCompare(a.date));

export interface CheckItem { key: string; name: string; done: boolean; auto: boolean }

/** Lo que se marca solo + lo que se marca a mano. */
export function gigChecklist(g: Gig, d: Pick<DB, "quotes" | "riders" | "events" | "setlists">): CheckItem[] {
  const quote = d.quotes.find(q => q.id === g.quoteId);
  const riderSent = d.riders.some(r => r.sentTo.some(s => s.gigId === g.id));
  const ev = d.events.find(e => e.gigId === g.id);
  const sl = d.setlists.find(s => s.id === g.setlistId || s.gigId === g.id);
  const items: CheckItem[] = [
    { key: "presupuesto", name: "presupuesto aceptado", done: quote?.status === "aceptado", auto: true },
    { key: "rider", name: "rider enviado", done: riderSent, auto: true },
  ];
  if (g.ticketing === "propia") items.push({ key: "entradas", name: "entradas a la venta", done: !!ev?.salesEnabled, auto: true });
  items.push({ key: "setlist", name: "setlist cerrado", done: !!sl?.closed, auto: true });
  items.push({ key: "merch", name: "stock de merch revisado", done: !!g.checklist.merch, auto: false });
  items.push({ key: "furgo", name: "furgo reservada", done: !!g.checklist.furgo, auto: false });
  return items;
}

/** Duración total de un setlist en minutos («3:41» → 3,68). */
export function setlistMinutes(ids: ID[], songs: Song[]) {
  return ids.reduce((s, id) => {
    const d = songs.find(x => x.id === id)?.duration;
    if (!d) return s + 3.5;
    const [m, sec] = d.split(":").map(Number);
    return s + m + (sec || 0) / 60;
  }, 0);
}

/** Saldo de cada miembro: lo que pagó − lo que le toca + liquidaciones. Positivo = le deben. */
export function balances(members: Member[], expenses: Expense[], settlements: Settlement[]) {
  const bal: Record<ID, number> = Object.fromEntries(members.map(m => [m.id, 0]));
  for (const e of expenses) {
    const parts = e.participantIds.length ? e.participantIds : members.map(m => m.id);
    const share = e.amountCents / parts.length;
    bal[e.payerId] = (bal[e.payerId] ?? 0) + e.amountCents;
    parts.forEach(p => { bal[p] = (bal[p] ?? 0) - share; });
  }
  for (const s of settlements) {
    bal[s.fromId] = (bal[s.fromId] ?? 0) + s.amountCents;
    bal[s.toId] = (bal[s.toId] ?? 0) - s.amountCents;
  }
  return members.map(m => ({ member: m, cents: Math.round(bal[m.id] ?? 0) }));
}

/** Mínimos pagos para quedar en paz (deudor mayor con acreedor mayor). */
export function settleUp(bal: { member: Member; cents: number }[]) {
  const debt = bal.filter(b => b.cents < -50).map(b => ({ ...b })).sort((a, b) => a.cents - b.cents);
  const cred = bal.filter(b => b.cents > 50).map(b => ({ ...b })).sort((a, b) => b.cents - a.cents);
  const out: { from: Member; to: Member; cents: number }[] = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(-debt[i].cents, cred[j].cents);
    out.push({ from: debt[i].member, to: cred[j].member, cents: Math.round(amt) });
    debt[i].cents += amt; cred[j].cents -= amt;
    if (debt[i].cents > -50) i++;
    if (cred[j].cents < 50) j++;
  }
  return out;
}

/** Ingresos automáticos de entradas por bolo (neto de Stripe). */
export function ticketIncomeByGig(d: Pick<DB, "events" | "orders" | "tickets">) {
  return d.events.map(ev => ({ gigId: ev.gigId, cents: eventStats(ev, d).net }));
}

export function quoteTotals(q: { lines: { amountCents: number }[]; ivaPct: number; irpfPct: number }) {
  const base = q.lines.reduce((s, l) => s + l.amountCents, 0);
  const iva = Math.round(base * q.ivaPct / 100);
  const irpf = Math.round(base * q.irpfPct / 100);
  return { base, iva, irpf, total: base + iva - irpf };
}
