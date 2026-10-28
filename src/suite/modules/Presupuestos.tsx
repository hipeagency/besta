/* Presupuestos: solicitudes de la web → presupuesto → bolo.
   Lista a la izquierda, editor a la derecha (en móvil, uno u otro).
   El editor guarda solo mientras escribes. */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { quoteTotals } from "@/data/selectors";
import type { Lead, Quote, QuoteLine, QuoteStatus } from "@/data/types";
import { Button, Empty, Field, IconButton, Input, Modal, Pill, Segmented, Textarea, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "./presupuestos/money";
import { ISSUER, QuotePrint } from "./presupuestos/QuotePrint";
import { ago, cx, dateLong, dateShort, eur } from "@/lib/format";

const STATUSES: QuoteStatus[] = ["borrador", "enviado", "aceptado", "rechazado"];
type Filter = "todos" | QuoteStatus;

/* Conceptos de siempre. Sin precio: lo pone la banda en cada caso. */
const TEMPLATES: Omit<QuoteLine, "id">[] = [
  { name: "actuación besta · banda completa", note: "75 min · 6 músicos", amountCents: 0 },
  { name: "actuación besta · acústico", note: "60 min", amountCents: 0 },
  { name: "desplazamiento", note: "furgo + gasolina", amountCents: 0 },
  { name: "técnico de sonido propio", amountCents: 0 },
  { name: "backline", note: "según rider técnico", amountCents: 0 },
];

export default function Presupuestos() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: quotes, loading } = useCollection("quotes");
  const { data: leads } = useCollection("leads");
  const [filter, setFilter] = useState<Filter>("todos");
  const create = useAction(() => api.createQuote());
  const fromLead = useAction((leadId: string) => api.quoteFromLead(leadId));

  /* ?lead=… (desde inicio o la ficha de una solicitud): crea el presupuesto una sola vez. */
  const leadParam = params.get("lead");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!leadParam || handled.current === leadParam) return;
    handled.current = leadParam;
    (async () => {
      try {
        const existing = (await api.list("quotes")).find(q => q.leadId === leadParam);
        const q = existing ?? await fromLead.run(leadParam);
        nav(`/presupuestos/${q.id}`, { replace: true });
      } catch (e) {
        toast((e as Error).message, "error");
        setParams({}, { replace: true });
      }
    })();
  }, [leadParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = [...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = filter === "todos" ? sorted : sorted.filter(q => q.status === filter);
  const count = (s: Filter) => (s === "todos" ? quotes.length : quotes.filter(q => q.status === s).length);
  const current = id ? quotes.find(q => q.id === id) : undefined;
  const newLeads = leads.filter(l => l.status === "nueva").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function newQuote() {
    const q = await create.run();
    nav(`/presupuestos/${q.id}`);
  }

  return (
    <Page
      title="presupuestos"
      back={id ? { to: "/presupuestos", label: "presupuestos" } : undefined}
      className={cx(id && "md:[&>header>div>button]:hidden")}
      actions={<Button variant="primary" onClick={newQuote} disabled={create.pending}>+ presupuesto</Button>}
    >
      <div className="flex flex-wrap gap-5 items-start">
        {/* lista */}
        <section className={cx("flex-[1_1_320px] min-w-0 flex-col gap-3.5", id ? "hidden md:flex" : "flex")} aria-label="Lista de presupuestos">
          {newLeads.length > 0 && <LeadsCard leads={newLeads} onCreate={async l => { const q = await fromLead.run(l.id); nav(`/presupuestos/${q.id}`); }} />}

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            {(["todos", ...STATUSES] as Filter[]).map(s => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
                className={cx("h-9 px-3 rounded-full font-mono text-xs transition", filter === s ? "bg-crema text-noche" : "bg-tubo text-crema/80 hover:text-crema")}>
                {s} <span className="opacity-70">{count(s)}</span>
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {list.map(q => {
              const on = q.id === id;
              return (
                <li key={q.id}>
                  <Link to={`/presupuestos/${q.id}`} aria-current={on ? "page" : undefined}
                    className={cx("flex items-center justify-between gap-3 px-4 py-3.5 rounded-[14px] border-[1.5px] transition",
                      on ? "bg-tubo border-senal" : "border-crema/10 hover:bg-tubo")}>
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] text-crema/65">{q.number} · {dateShort(q.createdAt.slice(0, 10))}</span>
                      <span className="block font-medium truncate">{q.client || "sin cliente"}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-mono text-sm">{eur(quoteTotals(q).total)}</span>
                      <span className={cx("block text-xs", q.status === "aceptado" ? "text-senal-suave" : "text-crema/65")}>{q.status}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {!loading && !list.length && <li className="p-4 text-sm text-crema/60">Nada por aquí.</li>}
          </ul>
        </section>

        {/* editor */}
        <section className={cx("flex-[2_1_480px] min-w-0", id ? "block" : "hidden md:block")}>
          {current ? <Editor key={current.id} quote={current} />
            : id && !loading ? <Empty title="Este presupuesto ya no existe" action={<Button onClick={() => nav("/presupuestos")}>volver</Button>} />
            : <Empty title="Elige un presupuesto">O crea uno nuevo. Las solicitudes de la web se convierten en presupuesto con un toque.</Empty>}
        </section>
      </div>
    </Page>
  );
}

// ---------- solicitudes de la web ----------
function LeadsCard({ leads, onCreate }: { leads: Lead[]; onCreate: (l: Lead) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const discard = useAction((leadId: string) => api.update("leads", leadId, { status: "descartada" }));
  return (
    <section className="rounded-[18px] bg-crema text-noche p-4 flex flex-col gap-2.5">
      <h2 className="text-[15px] font-semibold">solicitudes nuevas desde la web · {leads.length}</h2>
      {leads.map(l => (
        <div key={l.id} className="pt-2.5 border-t border-noche/15">
          <div className="flex items-center justify-between gap-2">
            <button type="button" aria-expanded={open === l.id} onClick={() => setOpen(o => (o === l.id ? null : l.id))} className="min-w-0 text-left min-h-11">
              <span className="block text-sm font-medium truncate">{l.org || l.name}</span>
              <span className="block text-xs text-noche/70">{l.city}{l.date ? ` · ${dateShort(l.date)}` : ""} · {ago(l.createdAt)}</span>
            </button>
            <Button size="sm" variant="dark" className="shrink-0" onClick={() => onCreate(l)}>crear <Icon name="flecha" size={14} className="inline align-[-2px]" /></Button>
          </div>
          {open === l.id && (
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <p className="rounded-xl bg-noche/5 p-3 leading-relaxed">{l.message}</p>
              <p className="font-mono text-xs text-noche/70 break-all">{l.name} · {l.email}</p>
              <button type="button" className="self-start h-9 text-sm underline text-noche/75 hover:text-noche"
                onClick={async () => { await discard.run(l.id); toast("Solicitud descartada", "ok"); }}>descartar</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------- editor ----------
/* Lo que se guarda solo. Estado, envío y bolo van aparte, al momento. */
const editable = (q: Quote): Partial<Quote> => ({
  client: q.client, contactEmail: q.contactEmail, eventDate: q.eventDate, place: q.place, format: q.format,
  lines: q.lines, ivaPct: q.ivaPct, irpfPct: q.irpfPct, conditions: q.conditions,
});

function Editor({ quote }: { quote: Quote }) {
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<Quote>(quote);
  const [saved, setSaved] = useState<"" | "guardando…" | "guardado">("");
  const [tplOpen, setTplOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const accept = useAction((qid: string) => api.acceptQuote(qid));
  const dirty = useRef(false);
  const latest = useRef(d);
  latest.current = d;

  const set = (patch: Partial<Quote>) => { dirty.current = true; setD(x => ({ ...x, ...patch })); };
  const setLine = (lid: string, patch: Partial<QuoteLine>) => set({ lines: d.lines.map(l => (l.id === lid ? { ...l, ...patch } : l)) });

  async function flush() {
    if (!dirty.current) return;
    dirty.current = false;
    const x = latest.current;
    try { await api.update("quotes", x.id, editable(x)); setSaved("guardado"); } catch { /* borrado mientras tanto */ }
  }
  useEffect(() => {
    if (!dirty.current) return;
    setSaved("guardando…");
    const t = setTimeout(flush, 600);
    return () => clearTimeout(t);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* El estado sale del almacén, no del borrador: aceptar crea el bolo. */
  async function setStatus(s: QuoteStatus) {
    await flush();
    if (s === "aceptado") {
      const g = await accept.run(quote.id);
      toast(`Aceptado: bolo en ${g.city} creado`, "ok");
      return;
    }
    await api.update("quotes", quote.id, { status: s, ...(s === "enviado" && !quote.sentAt ? { sentAt: new Date().toISOString() } : {}) });
  }

  const t = quoteTotals(d);

  function email() {
    const body = [
      `Hola,`, ``,
      `Os pasamos el presupuesto ${quote.number} para ${d.client || "vuestro evento"}${d.eventDate ? ` el ${dateLong(d.eventDate)}` : ""}${d.place ? ` en ${d.place}` : ""}.`, ``,
      ...d.lines.map(l => `· ${l.name}${l.note ? ` (${l.note})` : ""}: ${eur(l.amountCents)}`), ``,
      `Base imponible: ${eur(t.base)}`,
      `IVA ${d.ivaPct} %: + ${eur(t.iva)}`,
      ...(d.irpfPct ? [`Retención IRPF ${d.irpfPct} %: − ${eur(t.irpf)}`] : []),
      `Total a cobrar: ${eur(t.total)}`, ``,
      ...(d.conditions ? [`Condiciones: ${d.conditions}`, ``] : []),
      `Un saludo,`, `${ISSUER.name} · besta`,
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(d.contactEmail ?? "")}?subject=${encodeURIComponent(`Presupuesto ${quote.number} · besta`)}&body=${encodeURIComponent(body)}`;
    if (quote.status === "borrador") setStatus("enviado");
  }

  async function duplicate() {
    await flush();
    const n = await api.createQuote();
    await api.update("quotes", n.id, { ...editable(d), lines: d.lines.map(l => ({ ...l, id: uid() })) });
    toast(`Duplicado como ${n.number}`, "ok");
    nav(`/presupuestos/${n.id}`);
  }

  async function remove() {
    dirty.current = false;
    await api.remove("quotes", quote.id);
    toast(`${quote.number} borrado`, "ok");
    nav("/presupuestos");
  }

  return (
    <div className="rounded-[20px] bg-tubo p-5 sm:p-6 flex flex-col gap-5">
      {/* cabecera */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs text-senal">
            {quote.number} · {quote.status.toUpperCase()}{quote.status === "enviado" && quote.sentAt ? ` ${ago(quote.sentAt).toUpperCase()}` : ""}
          </p>
          <span className="font-mono text-[11px] text-crema/55" aria-live="polite">{saved}</span>
        </div>
        <Segmented value={quote.status} onChange={setStatus} size="sm" className="self-start"
          options={STATUSES.map(s => ({ value: s, label: s }))} />
        {quote.gigId && (
          <Link to={`/bolos/${quote.gigId}`} className="self-start"><Pill tone="senal" dot>bolo creado · abrir ficha <Icon name="flecha" size={14} className="inline align-[-2px]" /></Pill></Link>
        )}
      </div>

      {/* datos */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="cliente">{fid => <Input id={fid} value={d.client} placeholder="Ajuntament de…" onChange={e => set({ client: e.target.value })} />}</Field>
        <Field label="email de contacto">{fid => <Input id={fid} type="email" value={d.contactEmail ?? ""} onChange={e => set({ contactEmail: e.target.value || undefined })} />}</Field>
        <Field label="fecha del evento">{fid => <Input id={fid} type="date" value={d.eventDate ?? ""} onChange={e => set({ eventDate: e.target.value || undefined })} />}</Field>
        <Field label="lugar">{fid => <Input id={fid} value={d.place ?? ""} placeholder="plaza mayor, sala…" onChange={e => set({ place: e.target.value || undefined })} />}</Field>
        <Field label="formato" className="sm:col-span-2">{fid => (<>
          <Input id={fid} list="formatos" value={d.format ?? ""} placeholder="banda completa, acústico…" onChange={e => set({ format: e.target.value || undefined })} />
          <datalist id="formatos"><option value="banda completa" /><option value="acústico" /><option value="trío" /></datalist>
        </>)}</Field>
      </div>

      {/* conceptos */}
      <div className="flex flex-col">
        <div className="hidden sm:grid grid-cols-[1.4fr_1fr_130px_44px] gap-2 px-0.5 pb-2 font-mono text-[11px] tracking-[.08em] text-crema/60">
          <span>CONCEPTO</span><span>NOTA</span><span className="text-right">IMPORTE €</span><span />
        </div>
        <ul className="flex flex-col">
          {d.lines.map((l, i) => (
            <li key={l.id} className="grid grid-cols-[1fr_44px] sm:grid-cols-[1.4fr_1fr_130px_44px] gap-2 py-2.5 border-t border-crema/8">
              <Input aria-label={`Concepto ${i + 1}`} value={l.name} onChange={e => setLine(l.id, { name: e.target.value })} className="col-start-1" />
              <IconButton label={`Quitar ${l.name || "concepto"}`} onClick={() => set({ lines: d.lines.filter(x => x.id !== l.id) })} className="col-start-2 row-start-1 sm:col-start-4 text-crema/60">
                <Icon name="x" size={16} />
              </IconButton>
              <div className="col-span-2 grid grid-cols-[1fr_120px] gap-2 sm:contents">
                <Input aria-label={`Nota del concepto ${i + 1}`} placeholder="nota" value={l.note ?? ""} onChange={e => setLine(l.id, { note: e.target.value || undefined })} />
                <MoneyInput aria-label={`Importe del concepto ${i + 1} en euros`} cents={l.amountCents} onValue={c => setLine(l.id, { amountCents: c })} />
              </div>
            </li>
          ))}
        </ul>
        <div className="relative flex flex-wrap gap-2 pt-2">
          <Button size="sm" className="border-dashed" onClick={() => set({ lines: [...d.lines, { id: uid(), name: "", amountCents: 0 }] })}>+ concepto</Button>
          <Button size="sm" className="border-dashed" aria-expanded={tplOpen} onClick={() => setTplOpen(o => !o)}>desde plantilla <Icon name="desplegar" size={14} className="inline align-[-2px]" /></Button>
          {tplOpen && (
            <ul className="absolute z-10 top-full mt-1 left-0 w-[min(100%,340px)] rounded-2xl bg-noche border border-crema/12 p-1.5 shadow-2xl">
              {TEMPLATES.map(tp => (
                <li key={tp.name}>
                  <button type="button" className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-crema/8 min-h-11"
                    onClick={() => { set({ lines: [...d.lines, { ...tp, id: uid() }] }); setTplOpen(false); }}>
                    <span className="block">{tp.name}</span>{tp.note && <span className="block text-xs text-crema/60">{tp.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* totales */}
      <div className="flex flex-wrap gap-5 items-start justify-between">
        <div className="flex gap-3">
          <Field label="IVA %">{fid => <Input id={fid} type="number" min={0} max={100} step="any" value={d.ivaPct} onChange={e => set({ ivaPct: Number(e.target.value) || 0 })} className="w-24 font-mono" />}</Field>
          <Field label="IRPF %">{fid => <Input id={fid} type="number" min={0} max={100} step="any" value={d.irpfPct} onChange={e => set({ irpfPct: Number(e.target.value) || 0 })} className="w-24 font-mono" />}</Field>
        </div>
        <div className="w-full sm:w-[320px] flex flex-col gap-1.5 text-[15px]">
          <TotalRow k="base imponible" v={eur(t.base)} />
          <TotalRow k={`IVA ${d.ivaPct} %`} v={`+ ${eur(t.iva)}`} />
          <TotalRow k={`retención IRPF ${d.irpfPct} %`} v={`− ${eur(t.irpf)}`} />
          <div className="flex justify-between pt-2.5 mt-1 border-t border-crema/15 text-xl">
            <b className="font-semibold">total a cobrar</b><b className="font-mono font-medium">{eur(t.total)}</b>
          </div>
          <span className="text-xs text-crema/60 text-right">factura: {ISSUER.name} · {ISSUER.kind} · {ISSUER.nif}</span>
        </div>
      </div>

      <Field label="condiciones">{fid => <Textarea id={fid} rows={3} value={d.conditions} onChange={e => set({ conditions: e.target.value })} />}</Field>

      {/* acciones */}
      <div className="flex flex-wrap gap-2 pt-4 border-t border-crema/10">
        <Button onClick={async () => { await flush(); window.print(); }}><Icon name="descargar" size={16} />PDF</Button>
        <Button onClick={email} disabled={!d.contactEmail}><Icon name="enviar" size={16} />{quote.sentAt ? "reenviar por email" : "enviar por email"}</Button>
        <Button onClick={duplicate}><Icon name="copiar" size={16} />duplicar</Button>
        <Button variant="quiet" onClick={() => setConfirmDelete(true)}><Icon name="basura" size={16} />borrar</Button>
        {quote.status !== "aceptado" && (
          <Button variant="primary" className="sm:ml-auto" onClick={() => setStatus("aceptado")} disabled={accept.pending}>aceptado <Icon name="flecha" size={14} className="inline align-[-2px]" /> crear bolo</Button>
        )}
      </div>

      <QuotePrint q={{ ...quote, ...d }} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="¿borrar presupuesto?">
        <p className="text-crema/80 mb-5">
          {quote.number} · {d.client || "sin cliente"}. No se puede deshacer.{quote.gigId ? " El bolo que creó se queda como está." : ""}
          {" "}Si solo quieres apartarlo, márcalo como rechazado.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={remove}>sí, borrar</Button>
          <Button onClick={() => setConfirmDelete(false)}>cancelar</Button>
        </div>
      </Modal>
    </div>
  );
}

const TotalRow = ({ k, v }: { k: string; v: string }) =>
  <div className="flex justify-between"><span className="text-crema/70">{k}</span><span className="font-mono">{v}</span></div>;
