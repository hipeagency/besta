/* Bolos: la lista. Cada bolo abre su ficha (Bolo.tsx). */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { gigChecklist, upcomingGigs, pastGigs } from "@/data/selectors";
import type { Contact, Gig, Ticketing, TicketEvent } from "@/data/types";
import { Button, Empty, Field, IconButton, Input, Pill, Progress, Segmented, Select, Sheet, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "./presupuestos/money";
import { cx, dayNum, daysUntil, gigSub, gigTitle, mon, monthLong } from "@/lib/format";

/* En la web: oculto, por desvelar (teaser con lo desvelado; internamente «secreto») o público. */
export type WebMode = "oculto" | "secreto" | "publico";
export const webMode = (g: Gig): WebMode => !g.published ? "oculto" : g.teaser ? "secreto" : "publico";
export const webPatch = (g: Gig, m: WebMode): Partial<Gig> =>
  m === "oculto" ? { published: false }
  : m === "secreto" ? { published: true, teaser: g.teaser ?? { date: "mes", city: true, venue: false, event: true } }
  : { published: true, teaser: null };
export const WEB_OPTIONS: { value: WebMode; label: string }[] = [
  { value: "oculto", label: "oculto" }, { value: "secreto", label: "por desvelar" }, { value: "publico", label: "en la web" },
];
const WEB_HINT: Record<WebMode, string> = {
  oculto: "No sale en la web. Solo lo veis en la suite.",
  secreto: "Sale en la web sin desvelar todo. En la ficha eliges qué se ve.",
  publico: "Sale en la web con fecha, ciudad y sala.",
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* «2026-12» → «2026-12-31»: con solo el mes se guarda su último día, así no cuenta como pasado antes de tiempo. */
const monthEnd = (ym: string) => {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export default function Bolos() {
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: quotes } = useCollection("quotes");
  const { data: riders } = useCollection("riders");
  const { data: setlists } = useCollection("setlists");
  const { data: settings } = useCollection("settings");
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"proximos" | "pasados">("proximos");
  const creating = params.get("nuevo") === "1";
  const upcoming = upcomingGigs(gigs);
  const list = tab === "proximos" ? upcoming : pastGigs(gigs);

  /* Agrupados por mes: se lee como una agenda. Sin fecha, al final. */
  const groups: { key: string; label: string; items: Gig[] }[] = [];
  for (const g of list) {
    const key = g.date ? g.date.slice(0, 7) : "sin-fecha";
    const label = g.date ? monthLong(g.date) : "sin fecha";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(g); else groups.push({ key, label, items: [g] });
  }

  return (
    <Page title="bolos" actions={<Button variant="primary" onClick={() => setParams({ nuevo: "1" })}>+ nuevo bolo</Button>}>
      <Segmented value={tab} onChange={setTab} options={[{ value: "proximos", label: `próximos · ${upcoming.length}` }, { value: "pasados", label: "pasados" }]} className="self-start" />
      {!list.length && (tab === "proximos"
        ? <Empty title="Sin bolos por delante" action={<Button variant="primary" onClick={() => setParams({ nuevo: "1" })}>+ nuevo bolo</Button>}>Crea uno con lo que sepáis: con la ciudad o el mes ya vale.</Empty>
        : <Empty title="Aún no hay bolos pasados" />)}
      {groups.map(gr => (
        <section key={gr.key} className="flex flex-col gap-2">
          <h2 className="px-1 font-mono text-[11px] tracking-[.14em] text-crema/55 uppercase">{gr.label}</h2>
          <ul className="flex flex-col gap-2">
            {gr.items.map(g => {
              const ev = events.find(e => e.gigId === g.id);
              const d = daysUntil(g.date);
              const check = gigChecklist(g, { quotes, riders, events, setlists, settings });
              const done = check.filter(c => c.done).length;
              const soon = tab === "proximos" && g.date && !g.dateTbc && d <= 14;
              return (
                <li key={g.id}>
                  <Link to={`/bolos/${g.id}`} className={cx("flex items-center gap-4 rounded-[18px] bg-tubo hover:bg-tubo-alto p-3 pr-4 sm:pr-5", g.status === "cancelado" && "opacity-60")}>
                    <span className={cx("w-14 h-[60px] shrink-0 rounded-2xl grid place-items-center content-center leading-none", soon ? "bg-senal text-noche" : "bg-noche")}>
                      <span className="text-[22px] font-bold">{g.date && !g.dateTbc ? dayNum(g.date) : "—"}</span>
                      <span className={cx("font-mono text-[10px] mt-1", soon ? "text-noche/70" : "text-crema/60")}>{g.date ? mon(g.date) : "s/f"}</span>
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-lg font-bold tracking-[-.01em] truncate">{gigTitle(g)}</span>
                        {g.status !== "confirmado" && <Pill className="shrink-0">{g.status}</Pill>}
                        {g.soldOut && <Pill tone="senal" className="shrink-0">sold out</Pill>}
                      </span>
                      <span className="text-sm text-crema/65 truncate">
                        {[gigSub(g), g.time || (g.date ? "hora por confirmar" : ""), tab === "proximos" && g.date && !g.dateTbc ? (d === 0 ? "hoy" : `en ${d} días`) : ""].filter(Boolean).join(" · ")}
                      </span>
                      {tab === "proximos" && g.status !== "cancelado" && check.length > 0 && (
                        <span className="flex items-center gap-2.5 max-w-[320px]">
                          <Progress value={done / check.length} className="flex-1" />
                          <span className="font-mono text-[11px] text-crema/60 shrink-0">{done === check.length ? "listo" : `${done}/${check.length}`}</span>
                        </span>
                      )}
                    </span>
                    <span className="hidden sm:flex flex-wrap justify-end gap-1.5 max-w-[260px]">
                      {g.ticketing === "propia" && ev && <Pill tone={ev.salesEnabled ? "senal" : "mute"} dot={ev.salesEnabled}>{ev.salesEnabled ? "a la venta" : "venta cerrada"}</Pill>}
                      <Pill>{!g.published ? "oculto" : g.teaser ? "por desvelar" : "en la web"}</Pill>
                    </span>
                    <Icon name="flecha" size={16} className="shrink-0 text-crema/40" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <NewGig open={creating} onClose={() => setParams({})} />
    </Page>
  );
}

/* Marcar sold out cierra la venta propia (si la hay): ya no queda nada
   que vender y en la web sale el cartel. Quitarlo no la reabre sola. */
export async function applySoldOut(g: Gig, on: boolean, ev?: TicketEvent) {
  await api.update("gigs", g.id, { soldOut: on || undefined });
  if (on && ev?.salesEnabled) await api.update("events", ev.id, { salesEnabled: false });
}

export function NewGig({ open, onClose, gig }: { open: boolean; onClose: () => void; gig?: Gig }) {
  const nav = useNavigate();
  const toast = useToast();
  const { data: quotes } = useCollection("quotes");
  const { data: events } = useCollection("events");
  const ev = gig && events.find(e => e.gigId === gig.id);
  const save = useAction(async (g: Gig) => {
    if (gig) {
      await api.update("gigs", g.id, { ...g, soldOut: gig.soldOut });  // el cambio de sold out va aparte: cierra la venta
      if (!!g.soldOut !== !!gig.soldOut) await applySoldOut(gig, !!g.soldOut, ev);
    } else await api.insert("gigs", g);
    return g;
  });
  const remove = useAction(() => api.remove("gigs", gig!.id));
  const blank: Gig = { id: "", date: "", time: "21:00", city: "", venue: "", status: "confirmado", published: false, ticketing: "ninguna", schedule: [], contacts: [], checklist: {} };
  const [f, setF] = useState<Gig>(gig ?? blank);
  useEffect(() => { if (open) setF(gig ?? blank); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Gig>(k: K, v: Gig[K]) => setF(x => ({ ...x, [k]: v }));
  // La fecha va en dos: mes y año por un lado, día por otro. Sin día, dateTbc.
  const ym = f.date.slice(0, 7);
  const day = f.date && !f.dateTbc ? f.date.slice(8, 10) : "";
  // Mes y año con dos desplegables: <input type="month"> no existe en Safari ni Firefox (sale un texto que no deja escribir).
  const [yDraft, setYDraft] = useState("");
  useEffect(() => { if (open) setYDraft(""); }, [open]);
  const curY = new Date().getFullYear();
  const year = ym.slice(0, 4) || yDraft;
  const month = ym.slice(5, 7);
  const years = Array.from(new Set([curY - 1, curY, curY + 1, curY + 2, curY + 3, ...(year ? [Number(year)] : [])])).sort();
  const pickMonth = (m: string) => {
    if (!m) { setDate("", ""); return; }
    // Sin año elegido: el próximo que toque (si el mes ya pasó este año, el siguiente).
    const y = year || String(Number(m) < new Date().getMonth() + 1 ? curY + 1 : curY);
    setDate(`${y}-${m}`, day);
  };
  const pickYear = (y: string) => {
    setYDraft(y);
    if (!y) { setDate("", ""); return; }
    if (month) setDate(`${y}-${month}`, day);
  };
  const setDate = (m: string, d: string) => setF(x => ({
    ...x,
    date: !m ? "" : d ? `${m}-${d > monthEnd(m).slice(8) ? monthEnd(m).slice(8) : d}` : monthEnd(m),
    dateTbc: m && !d ? true : undefined,
  }));
  const setContact = (i: number, c: Partial<Contact>) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, ...c } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Basta con lo que se sepa, pero algo hay que poner.
    if (![f.date, f.city, f.venue, f.event].some(x => x?.trim())) { toast("Pon al menos la fecha, la ciudad, la sala o el festival.", "error"); return; }
    const contacts = f.contacts.map(c => ({ ...c, role: c.role.trim(), name: c.name.trim(), phone: c.phone?.trim() || undefined, email: c.email?.trim() || undefined })).filter(c => c.name || c.phone || c.email);
    const g = { ...f, contacts, deal: f.deal?.trim() || undefined, doors: f.doors || undefined, event: f.event?.trim() || undefined, dateTbc: f.date && f.dateTbc ? true : undefined, id: f.id || `${f.city.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${f.date}-${uid()}` };
    try { await save.run(g); } catch (err) { toast((err as Error).message, "error"); return; }
    toast(gig ? (g.soldOut && !gig.soldOut && ev?.salesEnabled ? "Guardado: sold out y venta cerrada" : "Bolo guardado") : "Bolo creado", "ok");
    onClose();
    if (!gig) nav(`/bolos/${g.id}`);
  }

  async function del() {
    if (!gig) return;
    if (ev) { toast("Este bolo tiene venta de entradas: no se puede borrar. Márcalo como cancelado.", "error"); return; }
    if (!confirm(`¿Borrar el bolo de ${gig.city} (${gig.date})? No se puede deshacer. Si solo no se hace, mejor márcalo como cancelado.`)) return;
    await remove.run();
    toast("Bolo borrado", "ok");
    onClose();
    nav("/bolos");
  }

  return (
    <Sheet open={open} onClose={onClose} title={gig ? "editar bolo" : "nuevo bolo"} width={520}>
      <form onSubmit={submit} className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-crema/75" id="gig-web">en la web</span>
          <div role="group" aria-labelledby="gig-web" className="self-start"><Segmented size="sm" value={webMode(f)} onChange={m => setF(x => ({ ...x, ...webPatch(x, m) }))} options={WEB_OPTIONS} /></div>
          <span className="text-xs text-crema/55">{WEB_HINT[webMode(f)]}</span>
        </div>
        <p className="-mb-1 text-xs text-crema/55">Pon lo que sepáis: con un dato basta. Lo que falte sale «por confirmar».</p>
        <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-3">
          <Field label="mes">{id => (
            <Select id={id} value={month} onChange={e => pickMonth(e.target.value)}>
              <option value="">sin fecha</option>
              {MONTHS.map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}
            </Select>
          )}</Field>
          <Field label="año">{id => (
            <Select id={id} value={year} onChange={e => pickYear(e.target.value)}>
              <option value="">—</option>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </Select>
          )}</Field>
          <Field label="día" hint={ym && !day ? "Sin día: sale mes y año." : undefined}>{id => (
            <Select id={id} value={day} disabled={!ym} onChange={e => setDate(ym, e.target.value)}>
              <option value="">por confirmar</option>
              {Array.from({ length: ym ? Number(monthEnd(ym).slice(8)) : 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(d => <option key={d} value={d}>{Number(d)}</option>)}
            </Select>
          )}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="puertas">{id => <Input id={id} type="time" value={f.doors ?? ""} onChange={e => set("doors", e.target.value || undefined)} />}</Field>
          <Field label="show">{id => <Input id={id} type="time" value={f.time} onChange={e => set("time", e.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ciudad">{id => <Input id={id} value={f.city} onChange={e => set("city", e.target.value)} />}</Field>
          <Field label="sala o lugar">{id => <Input id={id} value={f.venue} onChange={e => set("venue", e.target.value)} placeholder="sala, plaza, teatro…" />}</Field>
        </div>
        <Field label="festival o evento" hint="Si el bolo forma parte de uno.">{id => <Input id={id} value={f.event ?? ""} onChange={e => set("event", e.target.value)} placeholder="Sonorama Ribera, fiestas de…" />}</Field>
        <Field label="dirección">{id => <Input id={id} value={f.address ?? ""} onChange={e => set("address", e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="aforo">{id => <Input id={id} type="number" min={0} value={f.capacity ?? ""} onChange={e => set("capacity", e.target.value ? Number(e.target.value) : undefined)} />}</Field>
          <Field label="estado">{id => (
            <Select id={id} value={f.status} onChange={e => set("status", e.target.value as Gig["status"])}>
              <option value="tentativo">tentativo</option><option value="confirmado">confirmado</option><option value="cancelado">cancelado</option>
            </Select>
          )}</Field>
        </div>

        <fieldset className="flex flex-col gap-3 pt-2 border-t border-crema/10">
          <legend className="pt-3 font-semibold">dinero</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="caché €" hint="lo acordado, sin IVA">{id => <MoneyInput id={id} cents={f.feeCents ?? 0} onValue={c => set("feeCents", c || undefined)} />}</Field>
            <Field label="presupuesto">{id => (
              <Select id={id} value={f.quoteId ?? ""} onChange={e => set("quoteId", e.target.value || undefined)}>
                <option value="">ninguno</option>
                {quotes.map(q => <option key={q.id} value={q.id}>{q.number} · {q.client || "sin cliente"}</option>)}
              </Select>
            )}</Field>
          </div>
          <Field label="trato">{id => <Input id={id} value={f.deal ?? ""} placeholder="caché fijo + taquilla propia, 70/30 de puerta…" onChange={e => set("deal", e.target.value)} />}</Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3 pt-2 border-t border-crema/10">
          <legend className="pt-3 font-semibold">entradas</legend>
          <Field label="quién las vende">{id => (
            <Select id={id} value={f.ticketing} onChange={e => set("ticketing", e.target.value as Ticketing)}>
              <option value="ninguna">sin entradas (fiesta, privado…)</option>
              <option value="propia">venta propia en besta.es</option>
              <option value="externa">las vende otro (enlace)</option>
            </Select>
          )}</Field>
          {f.ticketing === "externa" && <Field label="enlace de entradas o info">{id => <Input id={id} type="url" value={f.externalUrl ?? ""} onChange={e => set("externalUrl", e.target.value)} />}</Field>}
          {f.ticketing !== "ninguna" && (
            <Toggle checked={!!f.soldOut} onChange={v => set("soldOut", v)} className="self-start"
              label={<span>sold out <span className="text-crema/60 text-sm">· {f.ticketing === "propia" ? "cierra la venta y" : ""} sale el cartel en la web</span></span>} />
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2 pt-2 border-t border-crema/10">
          <legend className="pt-3 font-semibold">contactos</legend>
          {f.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 p-2.5 rounded-xl bg-noche">
              <Input aria-label="Rol" placeholder="sala, técnico, promotor…" value={c.role} onChange={e => setContact(i, { role: e.target.value })} />
              <Input aria-label="Nombre" placeholder="nombre" value={c.name} onChange={e => setContact(i, { name: e.target.value })} />
              <IconButton label={`Quitar contacto ${c.name}`} onClick={() => set("contacts", f.contacts.filter((_, j) => j !== i))} className="text-crema/60 row-span-2 self-center"><Icon name="x" size={16} /></IconButton>
              <Input aria-label="Teléfono" type="tel" placeholder="teléfono" value={c.phone ?? ""} onChange={e => setContact(i, { phone: e.target.value })} />
              <Input aria-label="Email" type="email" placeholder="email" value={c.email ?? ""} onChange={e => setContact(i, { email: e.target.value })} />
            </div>
          ))}
          <Button type="button" size="sm" className="self-start border-dashed" onClick={() => set("contacts", [...f.contacts, { role: "", name: "" }])}>+ contacto</Button>
        </fieldset>

        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{gig ? "guardar" : "crear bolo"}</Button>
        {gig && <Button type="button" variant="quiet" className="self-start" onClick={del} disabled={remove.pending}>borrar bolo</Button>}
      </form>
    </Sheet>
  );
}
