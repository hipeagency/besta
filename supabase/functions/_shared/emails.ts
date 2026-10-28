/* Plantillas de email. Tablas y estilos en línea (Gmail y Outlook
   ignoran casi todo lo demás), mismos colores que la web y siempre
   con versión en texto plano. Copy corto y en minúsculas, como la web.

   El QR va como imagen remota (función ticket-qr) y no incrustado:
   Gmail bloquea las imágenes en base64. Si el cliente no carga
   imágenes, el código BST-… va escrito debajo y el botón lleva a
   «mis entradas», que funciona sin cuenta. */
import type { Mail } from "./brevo.ts";
import { functionsUrl, siteUrl } from "./env.ts";
import type { Gig, Order, Ticket, TicketEvent } from "./types.ts";

const C = { noche: "#0F0B08", crema: "#F6E6CC", senal: "#E8662C", tenue: "#B9AA94" };
const FONT = "Jost, Helvetica, Arial, sans-serif";
const MONO = "'DM Mono', Menlo, Consolas, monospace";
const CONTACT = "besta@besta.es";

export interface OrderContext { order: Order; tickets: Ticket[]; event?: TicketEvent; gig?: Gig }

// ---------- formato ----------
export const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);

/* «2026-12-12» → «sáb 12 dic». Las fechas del bolo no tienen zona: se leen en UTC. */
export function dateLabel(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  if (isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(d);
  const get = (t: string) => (f.find(p => p.type === t)?.value ?? "").replace(".", "");
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

const orderNo = (o: Order) => "#" + String(o.number).padStart(4, "0");
export const ticketsLink = (o: Order) => `${siteUrl()}/entradas/?pedido=${encodeURIComponent(o.token)}`;
export const qrUrl = (code: string) => `${functionsUrl()}/ticket-qr?code=${encodeURIComponent(code)}`;
const mapsUrl = (g: Gig) => `https://www.google.com/maps/search/${encodeURIComponent(`${g.venue} ${g.address ?? ""} ${g.city}`.trim())}`;

/* «SÁB 12 DIC · PUERTAS 21:00» */
function when(g?: Gig, doors = true) {
  if (!g) return "";
  const h = doors && g.doors ? `puertas ${g.doors}` : g.time;
  return [dateLabel(g.date), h].filter(Boolean).join(" · ").toUpperCase();
}
const where = (g?: Gig) => (g ? [g.venue, g.city].filter(Boolean).join(" · ") : "");

// ---------- piezas ----------
function layout(o: { preheader: string; headline: string; body: string }): string {
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>besta</title>
</head>
<body style="margin:0;padding:0;background:${C.noche};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.noche};">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.noche}" style="background:${C.noche};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 8px 22px;font-family:${FONT};font-size:30px;line-height:1;font-weight:700;letter-spacing:-1px;color:${C.crema};">besta</td></tr>
<tr><td style="padding:0 8px 18px;font-family:${FONT};font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-0.5px;color:${C.senal};">${esc(o.headline)}</td></tr>
${o.body}
<tr><td style="padding:28px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.tenue};">
besta · pop-rock desde castelldefels<br>
¿dudas? responde a este email o escríbenos a <a href="mailto:${CONTACT}" style="color:${C.senal};">${CONTACT}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const p = (html: string) =>
  `<tr><td style="padding:0 8px 14px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.crema};">${html}</td></tr>`;

const small = (html: string) =>
  `<tr><td style="padding:4px 8px 14px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.tenue};">${html}</td></tr>`;

/* Botón «a prueba de Outlook»: celda con fondo + enlace con relleno. */
const button = (href: string, label: string) => `<tr><td style="padding:6px 8px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${C.senal}" style="border-radius:999px;background:${C.senal};">
<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;color:${C.noche};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table></td></tr>`;

/* Tarjeta crema con los datos del concierto. */
function card(lines: { mono?: string; title?: string; sub?: string; extra?: string }) {
  return `<tr><td style="padding:0 8px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.crema}" style="background:${C.crema};border-radius:18px;">
<tr><td style="padding:20px 22px;font-family:${FONT};color:${C.noche};">
${lines.mono ? `<div style="font-family:${MONO};font-size:12px;letter-spacing:1px;color:${C.senal};font-weight:600;">${esc(lines.mono)}</div>` : ""}
${lines.title ? `<div style="font-size:22px;line-height:1.2;font-weight:700;padding-top:6px;">${esc(lines.title)}</div>` : ""}
${lines.sub ? `<div style="font-size:15px;line-height:1.4;padding-top:4px;">${esc(lines.sub)}</div>` : ""}
${lines.extra ?? ""}
</td></tr></table></td></tr>`;
}

function qrBlock(t: Ticket, i: number, n: number) {
  return `<tr><td align="center" style="padding:0 8px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.crema}" style="background:${C.crema};border-radius:18px;">
<tr><td align="center" style="padding:20px 20px 8px;">
<img src="${esc(qrUrl(t.code))}" width="220" height="220" alt="QR ${esc(t.code)}" style="display:block;width:220px;height:220px;border:0;background:#ffffff;">
</td></tr>
<tr><td style="padding:6px 22px 18px;font-family:${MONO};font-size:13px;color:${C.noche};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${MONO};font-size:13px;color:${C.noche};">ENTRADA ${i + 1} DE ${n}</td>
<td align="right" style="font-family:${MONO};font-size:13px;font-weight:600;color:${C.noche};">${esc(t.code)}</td>
</tr></table></td></tr></table></td></tr>`;
}

const textFooter = `\n—\nbesta · ¿dudas? responde a este email o escríbenos a ${CONTACT}`;

// ---------- entradas ----------
export function ticketsEmail(ctx: OrderContext): Mail {
  const { order, event, gig } = ctx;
  const tickets = ctx.tickets.filter(t => t.status !== "cancelada");
  const n = tickets.length || order.qty;
  const name = event?.name ?? "besta";
  const hi = order.name ? `Hola, ${order.name.split(" ")[0]}: aquí` : "Aquí";
  const link = ticketsLink(order);
  const line = `${n} × entrada general · ${eur(order.amountCents)}`;

  const html = layout({
    preheader: `${n === 1 ? "tu entrada" : `tus ${n} entradas`} para ${name} · pedido ${orderNo(order)}`,
    headline: "nos vemos en primera fila.",
    body: [
      p(`${esc(hi)} tienes ${n === 1 ? "tu entrada" : "tus entradas"}.`),
      card({
        mono: when(gig),
        title: name,
        sub: where(gig) || undefined,
        extra: `<div style="font-family:${MONO};font-size:13px;padding-top:10px;">${esc(line)} · pedido ${orderNo(order)}</div>`,
      }),
      button(link, "ver mis entradas"),
      ...tickets.map((t, i) => qrBlock(t, i, tickets.length)),
      small("Cada QR vale para una persona y se escanea una sola vez. Sube el brillo en la puerta ☀"),
      gig ? small(`<a href="${esc(mapsUrl(gig))}" style="color:${C.senal};">cómo llegar</a>`) : "",
    ].join("\n"),
  });

  const text = [
    "nos vemos en primera fila.",
    "",
    `${hi} tienes ${n === 1 ? "tu entrada" : "tus entradas"}.`,
    "",
    when(gig), name, where(gig), line, `pedido ${orderNo(order)}`,
    "",
    `ver mis entradas (con los QR): ${link}`,
    "",
    ...tickets.map((t, i) => `entrada ${i + 1} de ${tickets.length}: ${t.code}`),
    "",
    "Cada QR vale para una persona y se escanea una sola vez.",
  ].filter(l => l !== undefined).join("\n") + textFooter;

  return { subject: n === 1 ? `Tu entrada para ${name}` : `Tus ${n} entradas para ${name}`, html, text };
}

export function refundEmail(ctx: OrderContext): Mail {
  const { order, event, gig } = ctx;
  const name = event?.name ?? "besta";
  const html = layout({
    preheader: `devolución del pedido ${orderNo(order)} · ${eur(order.amountCents)}`,
    headline: "te hemos devuelto el dinero.",
    body: [
      p(`Hemos devuelto <b>${esc(eur(order.amountCents))}</b> del pedido ${orderNo(order)}. Según tu banco, tarda entre 5 y 10 días en aparecer en la tarjeta.`),
      card({ mono: when(gig, false), title: name, sub: where(gig) || undefined }),
      p("Las entradas de este pedido ya no son válidas. Si ha sido un error, escríbenos y lo arreglamos."),
    ].join("\n"),
  });
  const text = [
    "te hemos devuelto el dinero.",
    "",
    `Hemos devuelto ${eur(order.amountCents)} del pedido ${orderNo(order)} (${name}${gig ? ", " + dateLabel(gig.date) : ""}).`,
    "Según tu banco, tarda entre 5 y 10 días en aparecer en la tarjeta.",
    "Las entradas de este pedido ya no son válidas. Si ha sido un error, escríbenos y lo arreglamos.",
  ].join("\n") + textFooter;
  return { subject: `Devolución del pedido ${orderNo(order)}`, html, text };
}

export function reminderEmail(ctx: OrderContext): Mail {
  const { order, event, gig } = ctx;
  const name = event?.name ?? "besta";
  const link = ticketsLink(order);
  const rows: [string, string][] = [];
  if (gig?.doors) rows.push(["puertas", gig.doors]);
  if (gig?.time) rows.push(["besta", gig.time]);
  rows.push(["merch", "en la entrada"]);
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">${
    rows.map(([a, b]) => `<tr><td style="padding:4px 0;font-family:${FONT};font-size:15px;color:${C.noche};">${esc(a)}</td><td align="right" style="padding:4px 0;font-family:${MONO};font-size:14px;color:${C.noche};">${esc(b)}</td></tr>`).join("")
  }</table>`;

  const html = layout({
    preheader: `${name} · ${dateLabel(gig?.date)} · ten a mano tus entradas`,
    headline: "mañana es el día.",
    body: [
      card({ mono: when(gig, false), title: name, sub: where(gig) || undefined, extra: table }),
      button(link, "abrir mis entradas"),
      gig ? small(`<a href="${esc(mapsUrl(gig))}" style="color:${C.senal};">cómo llegar</a> · Sube el brillo del móvil en la puerta ☀`) : "",
    ].join("\n"),
  });
  const text = [
    "mañana es el día.",
    "",
    `${name}${gig ? ` · ${dateLabel(gig.date)} · ${where(gig)}` : ""}`,
    ...rows.map(([a, b]) => `${a}: ${b}`),
    "",
    `abrir mis entradas: ${link}`,
  ].join("\n") + textFooter;
  return { subject: `Mañana es el día: ${name}`, html, text };
}

export function thanksEmail(ctx: OrderContext): Mail {
  const name = ctx.event?.name ?? "besta";
  const avisame = `${siteUrl()}/#avisame`;
  const html = layout({
    preheader: "gracias por venir anoche",
    headline: "gracias por venir.",
    body: [
      p(`Anoche en ${esc(ctx.gig?.city || name)} fue de las buenas. Gracias por cantar con nosotros.`),
      p("Si quieres enterarte antes que nadie del próximo concierto, del merch y de lo que vamos sacando, apúntate:"),
      button(avisame, "avísame del próximo"),
      small(`Fotos y vídeos de anoche en <a href="https://instagram.com/besta_oficial" style="color:${C.senal};">@besta_oficial</a>. Si tienes alguno, etiquétanos.`),
    ].join("\n"),
  });
  const text = [
    "gracias por venir.",
    "",
    `Anoche en ${ctx.gig?.city || name} fue de las buenas. Gracias por cantar con nosotros.`,
    `Si quieres enterarte antes que nadie del próximo concierto: ${avisame}`,
    "Fotos y vídeos en instagram.com/besta_oficial",
  ].join("\n") + textFooter;
  return { subject: "Gracias por venir", html, text };
}

// ---------- contratación y merch ----------
function kv(rows: [string, string | undefined][]) {
  const r = rows.filter(([, v]) => v);
  return {
    html: `<tr><td style="padding:0 8px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.crema}" style="background:${C.crema};border-radius:18px;"><tr><td style="padding:16px 22px;">${
      r.map(([k, v]) => `<div style="padding:5px 0;font-family:${FONT};font-size:15px;line-height:1.45;color:${C.noche};"><span style="font-family:${MONO};font-size:11px;letter-spacing:1px;color:${C.senal};text-transform:uppercase;">${esc(k)}</span><br>${esc(v).replace(/\n/g, "<br>")}</div>`).join("")
    }</td></tr></table></td></tr>`,
    text: r.map(([k, v]) => `${k}: ${v}`).join("\n"),
  };
}

export interface LeadInfo { name: string; org: string; city: string; date?: string; email: string; message: string }

export function leadNotification(l: LeadInfo): Mail {
  const t = kv([["nombre", l.name], ["organización", l.org], ["ciudad", l.city], ["fecha", l.date ? `${dateLabel(l.date)} (${l.date})` : undefined], ["email", l.email], ["mensaje", l.message]]);
  const suite = `${siteUrl()}/suite/`;
  return {
    subject: `Contratación: ${l.org || l.name} · ${l.city}${l.date ? " · " + dateLabel(l.date) : ""}`,
    html: layout({ preheader: `${l.name} quiere contratar a besta`, headline: "nueva solicitud de contratación.", body: [t.html, p("Responde a este email para contestarle directamente."), button(suite, "abrir en la suite")].join("\n") }),
    text: `nueva solicitud de contratación.\n\n${t.text}\n\nResponde a este email para contestarle directamente.\nSuite: ${suite}`,
  };
}

export interface MerchInfo {
  product: string; variant: string; qty: number; priceCents: number;
  name: string; email: string; phone?: string;
  delivery: "concierto" | "envio"; gigLabel?: string; address?: string; note?: string;
}

const deliveryLabel = (m: MerchInfo) =>
  m.delivery === "envio" ? `envío${m.address ? ": " + m.address : ""}` : `recoger en concierto${m.gigLabel ? ": " + m.gigLabel : ""}`;

export function merchReceived(m: MerchInfo): Mail {
  const t = kv([["pedido", `${m.qty} × ${m.product} · ${m.variant}`], ["total", eur(m.qty * m.priceCents)], ["entrega", deliveryLabel(m)], ["nota", m.note]]);
  const first = m.name.split(" ")[0];
  return {
    subject: "Hemos recibido tu pedido de merch",
    html: layout({
      preheader: `${m.product} · ${m.variant} · te escribimos en breve`,
      headline: "recibido. te lo guardamos.",
      body: [
        p(`Hola, ${esc(first)}: nos ha llegado tu solicitud. Te escribimos en breve para confirmarla.`),
        t.html,
        p(m.delivery === "envio" ? "Te diremos cómo pagar y cuándo sale el envío." : "Se paga al recogerlo en el concierto (efectivo, bizum o tarjeta)."),
      ].join("\n"),
    }),
    text: `recibido. te lo guardamos.\n\nHola, ${first}: nos ha llegado tu solicitud. Te escribimos en breve para confirmarla.\n\n${t.text}\n\n${
      m.delivery === "envio" ? "Te diremos cómo pagar y cuándo sale el envío." : "Se paga al recogerlo en el concierto (efectivo, bizum o tarjeta)."
    }` + textFooter,
  };
}

export function merchNotification(m: MerchInfo): Mail {
  const t = kv([["producto", `${m.qty} × ${m.product} · ${m.variant}`], ["total", eur(m.qty * m.priceCents)], ["entrega", deliveryLabel(m)], ["nombre", m.name], ["email", m.email], ["teléfono", m.phone], ["nota", m.note]]);
  const suite = `${siteUrl()}/suite/`;
  return {
    subject: `Merch web: ${m.qty} × ${m.product} ${m.variant} · ${m.name}`,
    html: layout({ preheader: `${m.name} pide ${m.product}`, headline: "nueva solicitud de merch.", body: [t.html, p("Apártalo desde merch en la suite. Responde a este email para escribirle."), button(suite, "abrir en la suite")].join("\n") }),
    text: `nueva solicitud de merch.\n\n${t.text}\n\nApártalo desde merch en la suite: ${suite}`,
  };
}
