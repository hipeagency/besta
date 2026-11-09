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

// ---------- avisos a la lista (campañas) ----------
/* Cada interés tiene su lista en Brevo, y una campaña llega solo a quien
   lo eligió. Las listas se crean solas la primera vez y se rellenan desde
   la principal según el atributo INTERESES (así vale también lo que se
   edite a mano en Brevo). */
export const TOPICS = { fechas: "besta · fechas", merch: "besta · merch", lanzamientos: "besta · canciones" } as const;
export type Topic = keyof typeof TOPICS;

interface Contact { email: string; emailBlacklisted?: boolean; listIds?: number[]; attributes?: Record<string, unknown> }

async function listContacts(listId: number): Promise<Contact[]> {
  const out: Contact[] = [];
  for (let offset = 0; ; offset += 500) {
    const res = await brevo("GET", `/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`);
    await check(res, "leer la lista");
    const page = (await res.json() as { contacts?: Contact[] }).contacts ?? [];
    out.push(...page);
    if (page.length < 500) return out;
  }
}

const wants = (c: Contact, t: Topic) =>
  !c.emailBlacklisted && String(c.attributes?.INTERESES ?? "").split(",").map(s => s.trim()).includes(t);

/* Cuánta gente hay en la lista y cuánta por interés. */
export async function newsletterCounts() {
  const all = await listContacts(Number(env("BREVO_LIST_ID")));
  const active = all.filter(c => !c.emailBlacklisted);
  const byTopic = Object.fromEntries((Object.keys(TOPICS) as Topic[]).map(t => [t, all.filter(c => wants(c, t)).length])) as Record<Topic, number>;
  return { total: active.length, byTopic };
}

/* La lista del interés, creada si falta y al día con la principal. */
async function topicList(t: Topic): Promise<{ id: number; count: number }> {
  const mainId = Number(env("BREVO_LIST_ID"));
  const lists = await brevo("GET", "/contacts/lists?limit=50");
  await check(lists, "leer listas");
  let id = ((await lists.json() as { lists?: { id: number; name: string }[] }).lists ?? []).find(l => l.name === TOPICS[t])?.id;
  if (!id) {
    const main = await brevo("GET", `/contacts/lists/${mainId}`);
    await check(main, "leer la lista principal");
    const { folderId } = await main.json() as { folderId: number };
    const made = await brevo("POST", "/contacts/lists", { name: TOPICS[t], folderId });
    await check(made, "crear lista");
    id = (await made.json() as { id: number }).id;
  }
  const want = new Set((await listContacts(mainId)).filter(c => wants(c, t)).map(c => c.email));
  const have = new Set((await listContacts(id)).map(c => c.email));
  const add = [...want].filter(e => !have.has(e));
  const remove = [...have].filter(e => !want.has(e));
  for (let i = 0; i < add.length; i += 150) await check(await brevo("POST", `/contacts/lists/${id}/contacts/add`, { emails: add.slice(i, i + 150) }), "añadir a la lista");
  for (let i = 0; i < remove.length; i += 150) await check(await brevo("POST", `/contacts/lists/${id}/contacts/remove`, { emails: remove.slice(i, i + 150) }), "quitar de la lista");
  return { id, count: want.size };
}

/* Campaña a quien eligió el interés, enviada al momento. */
export async function sendCampaign(t: Topic, mail: Mail & { name: string; preheader?: string }) {
  const { id: listId, count } = await topicList(t);
  if (!count) throw new Error("Nadie de la lista ha pedido este tipo de aviso todavía.");
  const made = await brevo("POST", "/emailCampaigns", {
    name: mail.name, subject: mail.subject, previewText: mail.preheader,
    sender: sender(), replyTo: "besta@besta.es",
    htmlContent: mail.html, recipients: { listIds: [listId] },
  });
  await check(made, "crear la campaña");
  const { id } = await made.json() as { id: number };
  await check(await brevo("POST", `/emailCampaigns/${id}/sendNow`), "enviar la campaña");
  return { campaignId: id, recipients: count };
}

/* Avisos enviados, para la suite. Brevo a veces deja globalStats a cero
   y pone las cifras por lista en campaignStats: se suman esas. */
interface Stats { delivered?: number; uniqueViews?: number; uniqueClicks?: number; unsubscriptions?: number }
export async function recentCampaigns(limit = 5) {
  const res = await brevo("GET", `/emailCampaigns?status=sent&limit=${limit}&sort=desc`);
  await check(res, "leer campañas");
  const list = (await res.json() as { campaigns?: { id: number; name: string; subject: string; sentDate?: string; statistics?: { globalStats?: Stats; campaignStats?: Stats[] } }[] }).campaigns ?? [];
  return list.map(c => {
    const g = c.statistics?.globalStats;
    const per = c.statistics?.campaignStats ?? [];
    const sum = (k: keyof Stats) => (g?.delivered ? g[k] ?? 0 : per.reduce((n, x) => n + (x[k] ?? 0), 0));
    const topic = (Object.keys(TOPICS) as Topic[]).find(t => c.name.startsWith(`${TOPICS[t]} ·`));
    return { id: c.id, name: c.name, subject: c.subject, sentAt: c.sentDate, topic, delivered: sum("delivered"), opened: sum("uniqueViews"), clicked: sum("uniqueClicks"), unsubscribed: sum("unsubscriptions") };
  });
}

// ---------- suscriptores, para la suite ----------
const topicsOf = (c: Contact) => String(c.attributes?.INTERESES ?? "").split(",").map(s => s.trim()).filter((t): t is Topic => t in TOPICS);

/* Quién hay en la lista (sin los que se dieron de baja). */
export async function newsletterContacts() {
  const all = await listContacts(Number(env("BREVO_LIST_ID")));
  return all.filter(c => !c.emailBlacklisted).map(c => ({
    email: c.email,
    name: String(c.attributes?.NOMBRE ?? "") || undefined,
    city: String(c.attributes?.CIUDAD ?? "") || undefined,
    topics: topicsOf(c),
    createdAt: (c as { createdAt?: string }).createdAt,
  }));
}

/* Apuntar a alguien a mano desde la suite, sin doble confirmación (quien
   lo apunta asegura que tiene su permiso). Si se dio de baja él mismo, no
   se le vuelve a meter: tiene que apuntarse otra vez desde la web. */
export async function addContactDirect(c: { email: string; name?: string; city?: string; topics: Topic[] }) {
  const got = await brevo("GET", `/contacts/${encodeURIComponent(c.email)}`);
  if (got.ok && (await got.json() as Contact).emailBlacklisted)
    throw new Error("Ese email se dio de baja de los envíos. Para volver tiene que apuntarse desde la web.");
  if (!got.ok && got.status !== 404) await check(got, "buscar contacto");
  const attributes: Record<string, string> = { INTERESES: c.topics.join(","), FUENTE: "suite" };
  if (c.name) attributes.NOMBRE = c.name;
  if (c.city) attributes.CIUDAD = c.city;
  let res = await brevo("POST", "/contacts", { email: c.email, attributes, listIds: [Number(env("BREVO_LIST_ID"))], updateEnabled: true });
  // Si la cuenta no tiene el atributo FUENTE, se guarda sin él.
  if (res.status === 400 && (await res.clone().text()).includes("FUENTE")) {
    delete attributes.FUENTE;
    res = await brevo("POST", "/contacts", { email: c.email, attributes, listIds: [Number(env("BREVO_LIST_ID"))], updateEnabled: true });
  }
  await check(res, "apuntar contacto");
}

/* Quitar intereses (añadir no: eso lo hace la persona en la web, con
   su doble confirmación). */
export async function setContactTopics(email: string, topics: Topic[]) {
  const got = await brevo("GET", `/contacts/${encodeURIComponent(email)}`);
  if (got.status === 404) throw new Error("Ese email ya no está en la lista.");
  await check(got, "buscar contacto");
  const had = topicsOf(await got.json() as Contact);
  const keep = had.filter(t => topics.includes(t));
  await check(await brevo("PUT", `/contacts/${encodeURIComponent(email)}`, { attributes: { INTERESES: keep.join(",") } }), "actualizar contacto");
  return keep;
}

/* Dar de baja: sale de la lista principal (y de las de cada interés en
   el próximo envío, que se sincronizan desde ella). */
export async function removeContact(email: string) {
  const res = await brevo("POST", `/contacts/lists/${Number(env("BREVO_LIST_ID"))}/contacts/remove`, { emails: [email] });
  if (res.status === 400 && (await res.clone().text()).includes("already removed")) return;
  await check(res, "dar de baja");
}
