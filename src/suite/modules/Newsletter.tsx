/* Newsletter: la lista de la web entera en un sitio. Cuánta gente hay y
   qué pidió, escribir un aviso (concierto, merch, canción o libre), lo ya
   enviado con aperturas y clics, y quién está apuntado: buscar,
   apuntar a mano, quitar intereses, dar de baja y exportar. Solo admin. */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Page } from "@/suite/Shell";
import { useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import { upcomingGigs } from "@/data/selectors";
import type { NewsCampaign, NewsContact, NewsInput, Topic } from "@/data/types";
import { Button, Card, CardTitle, Empty, Field, Input, Pill, Segmented, Select, Sheet, Stat, Table, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { NotifyList, TOPIC_LABEL, blankDraft, gigDraft, productDraft, songDraft, useNewsStats } from "@/suite/NotifyList";
import { ago, cx, dateShort, gigTitle, plural } from "@/lib/format";

type View = "avisos" | "suscriptores";
const TOPICS = Object.keys(TOPIC_LABEL) as Topic[];
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

export default function Newsletter() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("vista") as View) || "avisos";
  const filter = (params.get("interes") as Topic | null) ?? "";
  const go = (p: Record<string, string>) => setParams(p, { replace: true });
  const stats = useNewsStats();
  const campaigns = useQuery({ queryKey: ["newsletter", "campaigns"], queryFn: () => api.newsletterCampaigns(), staleTime: 60e3, retry: 0 });
  const [draft, setDraft] = useState<NewsInput | null>(null);
  const d = stats.data;
  const last = campaigns.data?.[0];

  return (
    <Page title="newsletter" kicker="la lista de la web · Brevo"
      actions={<Button variant="primary" onClick={() => go({ vista: "avisos" })}><Icon name="enviar" size={16} />nuevo aviso</Button>}>
      {stats.error && <Card><p className="text-sm text-crema/75">No se ha podido leer la lista de Brevo: {(stats.error as Error).message}</p></Card>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button type="button" onClick={() => go({ vista: "suscriptores" })} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 transition">
          <Stat label="apuntados" value={d ? d.total : "…"} sub="en la lista" />
        </button>
        {TOPICS.map(t => (
          <button key={t} type="button" onClick={() => go({ vista: "suscriptores", interes: t })} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 transition">
            <Stat label={TOPIC_LABEL[t]} value={d ? d.byTopic[t] : "…"} sub={d ? pct(d.byTopic[t], d.total) + " de la lista" : undefined} />
          </button>
        ))}
        <div className="rounded-[18px] bg-tubo p-4">
          <Stat label="último aviso" value={last?.sentAt ? ago(last.sentAt) : "—"}
            sub={last ? `${pct(last.opened, last.delivered)} lo abrió` : "aún ninguno"} />
        </div>
      </div>

      <Segmented value={view} onChange={v => go({ vista: v })} className="self-start" options={[
        { value: "avisos", label: campaigns.data?.length ? `avisos · ${campaigns.data.length}` : "avisos" },
        { value: "suscriptores", label: d ? `suscriptores · ${d.total}` : "suscriptores" },
      ]} />

      {view === "avisos" && <>
        <Composer onWrite={setDraft} />
        <Sent q={campaigns} />
      </>}
      {view === "suscriptores" && <Subscribers filter={filter} onFilter={t => go(t ? { vista: "suscriptores", interes: t } : { vista: "suscriptores" })} />}

      {draft && <NotifyList draft={draft} onClose={() => setDraft(null)} />}
    </Page>
  );
}

/* Por dónde empezar un aviso: cada tipo trae un texto ya propuesto. */
type Kind = "concierto" | "merch" | "cancion" | "libre";
function Composer({ onWrite }: { onWrite: (d: NewsInput) => void }) {
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: products } = useCollection("products");
  const stats = useNewsStats();
  const [kind, setKind] = useState<Kind>("concierto");
  const [gigId, setGigId] = useState("");
  const [productId, setProductId] = useState("");
  const [topic, setTopic] = useState<Topic>("fechas");

  const nextGigs = upcomingGigs(gigs).filter(g => g.published);
  const shop = products.filter(p => p.published && !p.archived);
  const gig = nextGigs.find(g => g.id === gigId) ?? nextGigs[0];
  const product = shop.find(p => p.id === productId) ?? shop[0];

  const draft: NewsInput | null =
    kind === "concierto" ? (gig ? gigDraft(gig, events.find(e => e.gigId === gig.id)) : null)
    : kind === "merch" ? (product ? productDraft(product) : null)
    : kind === "cancion" ? songDraft()
    : blankDraft(topic);
  const n = draft && stats.data?.byTopic[draft.topic];

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>nuevo aviso</CardTitle>
      <Segmented size="sm" value={kind} onChange={setKind} className="self-start" options={[
        { value: "concierto", label: "concierto" },
        { value: "merch", label: "merch" },
        { value: "cancion", label: "canción nueva" },
        { value: "libre", label: "libre" },
      ]} />

      {kind === "concierto" && (nextGigs.length
        ? <Field label="qué bolo">{id => <Select id={id} value={gig?.id} onChange={e => setGigId(e.target.value)}>
            {nextGigs.map(g => <option key={g.id} value={g.id}>{g.date ? dateShort(g.date) : "sin fecha"} · {gigTitle(g)}</option>)}
          </Select>}</Field>
        : <p className="text-sm text-crema/70">No hay bolos próximos publicados en la web. Publica uno en bolos y vuelve.</p>)}
      {kind === "merch" && (shop.length
        ? <Field label="qué producto">{id => <Select id={id} value={product?.id} onChange={e => setProductId(e.target.value)}>
            {shop.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>}</Field>
        : <p className="text-sm text-crema/70">No hay merch visible en la web. Publica un producto en merch y vuelve.</p>)}
      {kind === "libre" && <Field label="a quién le llega" hint="Cada aviso va solo a quien pidió ese tipo de noticias.">{id => (
        <Select id={id} value={topic} onChange={e => setTopic(e.target.value as Topic)}>
          {TOPICS.map(t => <option key={t} value={t}>a quien pidió {TOPIC_LABEL[t]}</option>)}
        </Select>
      )}</Field>}

      {draft && <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => onWrite(draft)}><Icon name="editar" size={16} />{kind === "libre" ? "escribir" : "revisar y enviar"}</Button>
        <span className="text-sm text-crema/70">
          {stats.data ? <>le llega a <b className="text-crema">{plural(n ?? 0, "persona", "personas")}</b> ({TOPIC_LABEL[draft.topic]})</> : ""}
        </span>
      </div>}
      <p className="text-xs text-crema/55">Antes de enviar puedes cambiar todo el texto y mandarte una prueba.</p>
    </Card>
  );
}

function Sent({ q }: { q: { data?: NewsCampaign[]; isPending: boolean; error: unknown } }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>enviados</CardTitle>
      {q.isPending && <p className="text-sm text-crema/60">cargando…</p>}
      {!!q.error && <p className="text-sm text-crema/70">No se ha podido leer el historial de Brevo.</p>}
      {q.data && !q.data.length && <Empty title="aún no habéis mandado ningún aviso">El primero, desde «nuevo aviso».</Empty>}
      {!!q.data?.length && <Table minWidth={680} head={["cuándo", "asunto", "para", "entregados", "abiertos", "clics", "bajas"]}>
        {q.data.map(c => (
          <tr key={c.id}>
            <td className="px-1.5 py-2.5 font-mono text-xs text-crema/70 whitespace-nowrap">{c.sentAt ? dateShort(c.sentAt.slice(0, 10)) : "—"}</td>
            <td className="px-1.5 py-2.5 max-w-[320px] truncate" title={c.subject}>{c.subject}</td>
            <td className="px-1.5 py-2.5">{c.topic ? <Pill>{TOPIC_LABEL[c.topic]}</Pill> : <span className="text-crema/50">—</span>}</td>
            <td className="px-1.5 py-2.5 font-mono">{c.delivered}</td>
            <td className="px-1.5 py-2.5 font-mono">{c.opened} <span className="text-crema/55">· {pct(c.opened, c.delivered)}</span></td>
            <td className="px-1.5 py-2.5 font-mono">{c.clicked ?? "—"}{c.clicked != null && <span className="text-crema/55"> · {pct(c.clicked, c.delivered)}</span>}</td>
            <td className="px-1.5 py-2.5 font-mono">{c.unsubscribed ?? "—"}</td>
          </tr>
        ))}
      </Table>}
      <p className="text-xs text-crema/55">Las cifras las da Brevo y tardan un rato en llegar. «Abiertos» se queda corto: muchos correos bloquean el recuento.</p>
    </Card>
  );
}

function Subscribers({ filter, onFilter }: { filter: Topic | ""; onFilter: (t: Topic | "") => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const contacts = useQuery({ queryKey: ["newsletter", "contacts"], queryFn: () => api.newsletterContacts(), staleTime: 60e3, retry: 0 });
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState("");      // «email» o «email|tema»
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (contacts.data ?? [])
      .filter(c => !filter || c.topics.includes(filter))
      .filter(c => !s || [c.email, c.name, c.city].some(x => x?.toLowerCase().includes(s)))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [contacts.data, filter, search]);

  async function act(key: string, fn: () => Promise<void>, ok: string) {
    if (confirm !== key) { setConfirm(key); return; }
    setBusy(key);
    try {
      await fn();
      toast(ok, "ok");
      qc.invalidateQueries({ queryKey: ["newsletter"] });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(""); setConfirm("");
    }
  }
  const dropTopic = (c: NewsContact, t: Topic) => act(`${c.email}|${t}`, () => api.newsletterTopics(c.email, c.topics.filter(x => x !== t)), `${c.email} ya no recibe avisos de ${TOPIC_LABEL[t]}`);
  const remove = (c: NewsContact) => act(c.email, () => api.newsletterRemove(c.email), `${c.email} dado de baja`);

  function exportCsv() {
    const esc = (v = "") => `"${v.replace(/"/g, '""')}"`;
    const lines = [["email", "nombre", "ciudad", ...TOPICS.map(t => TOPIC_LABEL[t]), "alta"].join(","),
      ...rows.map(c => [esc(c.email), esc(c.name), esc(c.city), ...TOPICS.map(t => (c.topics.includes(t) ? "sí" : "")), esc(c.createdAt?.slice(0, 10))].join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `newsletter-besta${filter ? `-${filter}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" placeholder="buscar email, nombre o ciudad" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" aria-label="Buscar suscriptor" />
        <Segmented size="sm" value={filter} onChange={onFilter} options={[{ value: "" as Topic | "", label: "todos" }, ...TOPICS.map(t => ({ value: t, label: TOPIC_LABEL[t] }))]} />
        <Button size="sm" onClick={exportCsv} disabled={!rows.length}><Icon name="descargar" size={16} />csv</Button>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>+ apuntar</Button>
      </div>
      <AddSheet open={adding} onClose={() => setAdding(false)} />

      {contacts.isPending && <p className="text-sm text-crema/60">cargando la lista…</p>}
      {contacts.error && <p className="text-sm text-crema/70">No se ha podido leer la lista de Brevo: {(contacts.error as Error).message}</p>}
      {contacts.data && !contacts.data.length && <Empty title="todavía no hay nadie apuntado" action={<Button variant="primary" onClick={() => setAdding(true)}>+ apuntar a alguien</Button>}>La gente se apunta desde la web, en «avísame», o al comprar entradas. También puedes apuntar a alguien tú.</Empty>}
      {contacts.data && !!contacts.data.length && !rows.length && <p className="text-sm text-crema/70">Nadie coincide con la búsqueda.</p>}

      {!!rows.length && <Table minWidth={720} head={["email", "nombre", "ciudad", "quiere avisos de", "alta", ""]}>
        {rows.map(c => (
          <tr key={c.email}>
            <td className="px-1.5 py-2.5 max-w-[260px] truncate" title={c.email}>{c.email}</td>
            <td className="px-1.5 py-2.5 text-crema/85">{c.name || <span className="text-crema/40">—</span>}</td>
            <td className="px-1.5 py-2.5 text-crema/85">{c.city || <span className="text-crema/40">—</span>}</td>
            <td className="px-1.5 py-2.5">
              <div className="flex flex-wrap gap-1">
                {c.topics.length ? c.topics.map(t => {
                  const key = `${c.email}|${t}`;
                  return (
                    <button key={t} type="button" onClick={() => dropTopic(c, t)} disabled={!!busy}
                      title={`Quitar avisos de ${TOPIC_LABEL[t]}`}
                      className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs transition",
                        confirm === key ? "bg-senal text-noche" : "bg-crema/10 text-crema/85 hover:bg-crema/20")}>
                      {confirm === key ? `¿quitar ${TOPIC_LABEL[t]}?` : TOPIC_LABEL[t]}<Icon name="x" size={11} />
                    </button>
                  );
                }) : <span className="text-xs text-crema/55">ninguno: no le llega nada</span>}
              </div>
            </td>
            <td className="px-1.5 py-2.5 font-mono text-xs text-crema/70 whitespace-nowrap">{c.createdAt ? dateShort(c.createdAt.slice(0, 10)) : "—"}</td>
            <td className="px-1.5 py-2.5 text-right">
              <Button size="sm" variant={confirm === c.email ? "primary" : "quiet"} onClick={() => remove(c)} disabled={!!busy}>
                {busy === c.email ? "…" : confirm === c.email ? "sí, dar de baja" : "dar de baja"}
              </Button>
            </td>
          </tr>
        ))}
      </Table>}
      {!!rows.length && <p className="text-xs text-crema/55">
        {plural(rows.length, "persona", "personas")}{filter || search ? " con este filtro" : ""}.
      </p>}
    </Card>
  );
}

/* Apuntar a alguien a mano. Por defecto le llega el mismo email de
   confirmación que en la web; sin él, hay que asegurar que dio permiso
   (lo pide la ley: sin consentimiento no se le puede escribir). */
function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const empty = { email: "", name: "", city: "", topics: [...TOPICS] as Topic[], confirm: true, consent: false };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const toggle = (t: Topic) => set("topics", f.topics.includes(t) ? f.topics.filter(x => x !== t) : TOPICS.filter(x => x === t || f.topics.includes(x)));
  const close = () => { setF(empty); onClose(); };
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && f.topics.length > 0 && (f.confirm || f.consent);

  async function save() {
    setBusy(true);
    try {
      const { status } = await api.newsletterAdd({ ...f, email: f.email.trim(), name: f.name.trim() || undefined, city: f.city.trim() || undefined });
      toast(status === "pendiente" ? `Le hemos mandado el email de confirmación a ${f.email.trim()}`
        : status === "actualizado" ? `${f.email.trim()} ya estaba: actualizado` : `${f.email.trim()} apuntado`, "ok");
      qc.invalidateQueries({ queryKey: ["newsletter"] });
      close();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={close} title="apuntar a la newsletter"
      footer={<Button variant="primary" block onClick={save} disabled={!ready || busy}>{busy ? "guardando…" : f.confirm ? "mandar confirmación" : "apuntar"}</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="email">{id => <Input id={id} type="email" autoFocus value={f.email} onChange={e => set("email", e.target.value)} placeholder="nombre@correo.com" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="nombre (opcional)">{id => <Input id={id} value={f.name} maxLength={80} onChange={e => set("name", e.target.value)} />}</Field>
          <Field label="ciudad (opcional)">{id => <Input id={id} value={f.city} maxLength={80} onChange={e => set("city", e.target.value)} />}</Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-crema/75">quiere avisos de</span>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map(t => <Toggle key={t} checked={f.topics.includes(t)} onChange={() => toggle(t)} label={TOPIC_LABEL[t]} className="bg-noche" />)}
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Segmented size="sm" value={f.confirm ? "si" : "no"} onChange={v => set("confirm", v === "si")} className="self-start" options={[
            { value: "si", label: "con email de confirmación" },
            { value: "no", label: "directo" },
          ]} />
          {f.confirm
            ? <p className="text-xs text-crema/65">Le llega el mismo email que cuando se apunta en la web. Entra en la lista cuando pulse el enlace. Lo más seguro.</p>
            : <label className="flex items-start gap-2.5 text-sm text-crema/85 cursor-pointer">
                <input type="checkbox" checked={f.consent} onChange={e => set("consent", e.target.checked)} className="mt-1 accent-[var(--color-senal)]" />
                <span>Me ha dicho que quiere recibir estos avisos (por ejemplo, se apuntó en papel en un concierto). Entra al momento y sin email de confirmación.</span>
              </label>}
        </div>
      </div>
    </Sheet>
  );
}
