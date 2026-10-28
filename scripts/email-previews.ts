/* Vista previa de los emails automáticos: genera cada plantilla de
   supabase/functions/_shared/emails.ts con datos de ejemplo y deja los
   HTML en email-previews/ (con un índice). Se abre en el navegador.

     pnpm emails

   Es lo mismo que mandan las funciones: si cambias emails.ts, vuelve a
   generarlo. La doble confirmación de la newsletter no está aquí: vive
   en Brevo (supabase/brevo/confirmacion-newsletter.html). */
import { mkdirSync, writeFileSync } from "node:fs";

// emails.ts lee SITE_URL y SUPABASE_URL con Deno.env.
const ENV: Record<string, string> = { SITE_URL: "https://besta.es", SUPABASE_URL: "https://ejemplo.supabase.co" };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

const e = await import("../supabase/functions/_shared/emails.ts");

const gig = {
  id: "bcn-2026-12-12", date: "2026-12-12", time: "22:00", doors: "21:00", city: "Barcelona", venue: "Sala Upload",
  address: "Av. Francesc Ferrer i Guàrdia, 13", status: "confirmado", published: true, ticketing: "propia",
  schedule: [], contacts: [], checklist: {},
} as any;
const event = { id: "ev1", gigId: gig.id, name: "besta en Barcelona", description: "", priceCents: 1200, capacity: 300, maxPerOrder: 6, salesEnabled: true } as any;
const order = {
  id: "ord1", number: 42, eventId: event.id, email: "irene@ejemplo.com", name: "Irene Puig", qty: 2, amountCents: 2400,
  status: "pagado", newsletter: true, createdAt: "2026-10-29T18:00:00.000Z", token: "tok-ejemplo",
} as any;
const tickets = [
  { code: "BST-7K2Q", orderId: order.id, eventId: event.id, kind: "general", status: "valida" },
  { code: "BST-9MX4", orderId: order.id, eventId: event.id, kind: "general", status: "valida" },
] as any;
const ctx = { order, tickets, event, gig };
const merch = {
  product: "Camiseta señal", variant: "L", qty: 2, priceCents: 2000, name: "Pol Ferrer", email: "pol@ejemplo.com",
  phone: "600 000 000", note: "Una es para regalar",
};
const lead = {
  name: "Marta Soler", org: "Festa Major de Gavà", city: "Gavà", date: "2027-06-24", email: "marta@ejemplo.com",
  message: "Hola! Buscamos grupo para la noche del 24. ¿Tenéis la fecha libre y qué caché manejáis?",
};

const mails: { file: string; who: string; when: string; mail: { subject: string; html: string; text: string } }[] = [
  { file: "entradas", who: "comprador", when: "al pagar entradas (y al reenviarlas desde la suite)", mail: e.ticketsEmail(ctx) },
  { file: "gracias", who: "comprador", when: "el día después del concierto", mail: e.thanksEmail(ctx) },
  { file: "devolucion", who: "comprador", when: "al devolver un pedido desde la suite", mail: e.refundEmail({ ...ctx, order: { ...order, status: "devuelto" } }) },
  { file: "merch-recibido", who: "fan", when: "al pedir merch en la web", mail: e.merchReceived(merch) },
  { file: "merch-aviso-banda", who: "banda (NOTIFY_EMAILS)", when: "al pedir merch en la web", mail: e.merchNotification(merch) },
  { file: "contratacion-aviso-banda", who: "banda (NOTIFY_EMAILS)", when: "al rellenar el formulario de contratación", mail: e.leadNotification(lead) },
  { file: "aviso-concierto", who: "lista (interés fechas)", when: "al avisar de un bolo desde la suite", mail: e.newsletterEmail({ topic: "fechas", subject: "besta en Barcelona · 12 dic", title: "nos vemos en Barcelona", body: "Sábado 12 de diciembre, Sala Apolo. Puertas a las 21:00.\n\nLas entradas ya están a la venta en besta.es: con QR al momento y sin gastos de gestión.", ctaLabel: "comprar entradas", ctaUrl: "https://besta.es/#directo", image: "/img/escenario-azul.jpg" }, "#baja") },
  { file: "aviso-merch", who: "lista (interés merch)", when: "al avisar de merch nuevo desde la suite", mail: e.newsletterEmail({ topic: "merch", subject: "merch nuevo de besta", title: "camiseta nueva", body: "Ya está la camiseta de la gira. Pídela en la web y la recoges en el próximo concierto.", ctaLabel: "la quiero", ctaUrl: "https://besta.es/#merch" }, "#baja") },
  { file: "aviso-cancion", who: "lista (interés lanzamientos)", when: "al avisar de una canción nueva desde la suite", mail: e.newsletterEmail({ topic: "lanzamientos", subject: "«No me sale olvidarte» ya está fuera", title: "«No me sale olvidarte»", body: "Nuestra canción nueva ya está en todas las plataformas.", ctaLabel: "escuchar en Spotify", ctaUrl: "https://open.spotify.com/", image: "/img/no-me-sale-olvidarte.jpg" }, "#baja") },
];

const out = new URL("../email-previews/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const m of mails) {
  writeFileSync(new URL(`${m.file}.html`, out), m.mail.html);
  writeFileSync(new URL(`${m.file}.txt`, out), `Asunto: ${m.mail.subject}\n\n${m.mail.text}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
writeFileSync(new URL("index.html", out), `<!doctype html><meta charset="utf-8"><title>emails de besta</title>
<style>body{font:15px/1.5 system-ui;margin:0;background:#f4efe6;color:#0F0B08}main{max-width:1180px;margin:auto;padding:24px 16px}
section{margin:0 0 40px}h2{margin:0;font-size:20px}p{margin:4px 0 12px;color:#5b5248}a{color:#E8662C}
iframe{width:100%;height:760px;border:1px solid #d8ccb8;border-radius:12px;background:#0F0B08}</style>
<main><h1>emails automáticos</h1><p>Generados con <code>pnpm emails</code> a partir de <code>supabase/functions/_shared/emails.ts</code>, con datos de ejemplo.</p>
${mails.map(m => `<section><h2>${esc(m.mail.subject)}</h2><p>para: ${esc(m.who)} · cuándo: ${esc(m.when)} · <a href="${m.file}.html">abrir</a> · <a href="${m.file}.txt">texto plano</a></p><iframe src="${m.file}.html" loading="lazy"></iframe></section>`).join("\n")}
</main>`);
console.log(`${mails.length} emails en email-previews/ — abre email-previews/index.html`);
