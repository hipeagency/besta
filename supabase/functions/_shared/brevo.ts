/* Brevo (API v3): emails transaccionales y la lista de la newsletter. */
import { env, list, optEnv, siteUrl } from "./env.ts";

const API = "https://api.brevo.com/v3";

export interface Mail { subject: string; html: string; text: string }
export interface Person { email: string; name?: string }

async function brevo(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(API + path, {
    method,
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
}

async function check(res: Response, what: string) {
  if (res.ok) return;
  throw new Error(`Brevo ${what}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

export const sender = () => ({ name: "besta", email: optEnv("SENDER_EMAIL", "besta@besta.es") });

export async function sendEmail(to: Person | Person[], mail: Mail, opts: { replyTo?: Person; tags?: string[] } = {}) {
  const res = await brevo("POST", "/smtp/email", {
    sender: sender(),
    to: (Array.isArray(to) ? to : [to]).map(p => (p.name ? { email: p.email, name: p.name } : { email: p.email })),
    replyTo: opts.replyTo ?? { email: "besta@besta.es", name: "besta" },
    subject: mail.subject,
    htmlContent: mail.html,
    textContent: mail.text,
    tags: opts.tags,
  });
  await check(res, "envío de email");
}

/* Avisos internos: a la banda (NOTIFY_EMAILS, separados por comas). */
export async function notifyBand(mail: Mail, replyTo?: Person, tags?: string[]) {
  const to = list(env("NOTIFY_EMAILS")).map(email => ({ email }));
  await sendEmail(to, mail, { replyTo, tags });
}

/* Alta en la newsletter con doble confirmación. Si ya estaba en la
   lista (confirmado) no le volvemos a pedir confirmación: solo se le
   actualizan los intereses. */
export async function upsertNewsletterContact(c: { email: string; name?: string; city?: string; topics: string[] }) {
  const listId = Number(env("BREVO_LIST_ID"));
  const attributes: Record<string, string> = { INTERESES: c.topics.join(",") };
  if (c.name) attributes.NOMBRE = c.name;
  if (c.city) attributes.CIUDAD = c.city;

  const got = await brevo("GET", `/contacts/${encodeURIComponent(c.email)}`);
  if (got.ok) {
    const contact = await got.json() as { listIds?: number[] };
    if (contact.listIds?.includes(listId)) {
      await check(await brevo("PUT", `/contacts/${encodeURIComponent(c.email)}`, { attributes }), "actualizar contacto");
      return "actualizado" as const;
    }
  } else if (got.status !== 404) {
    await check(got, "buscar contacto");
  }

  const res = await brevo("POST", "/contacts/doubleOptinConfirmation", {
    email: c.email,
    attributes,
    includeListIds: [listId],
    templateId: Number(env("BREVO_DOI_TEMPLATE_ID")),
    redirectionUrl: `${siteUrl()}/?suscrito=1`,
  });
  await check(res, "doble confirmación");
  return "pendiente" as const;
}
