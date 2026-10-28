/* Bolos: la lista. Cada bolo abre su ficha (Bolo.tsx). */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs, pastGigs } from "@/data/selectors";
import type { Contact, Gig, Ticketing, TicketEvent } from "@/data/types";
import { Button, Field, IconButton, Input, Pill, Segmented, Select, Sheet, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "./presupuestos/money";
import { dateLabel, daysUntil } from "@/lib/format";

export default function Bolos() {
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"proximos" | "pasados">("proximos");
  const creating = params.get("nuevo") === "1";
  const list = tab === "proximos" ? upcomingGigs(gigs) : pastGigs(gigs);

  return (
    <Page title="bolos" actions={<Button variant="primary" onClick={() => setParams({ nuevo: "1" })}>+ nuevo bolo</Button>}>
      <Segmented value={tab} onChange={setTab} options={[{ value: "proximos", label: `próximos · ${upcomingGigs(gigs).length}` }, { value: "pasados", label: "pasados" }]} className="self-start" />
      <ul className="flex flex-col gap-2">
        {list.map(g => {
          const ev = events.find(e => e.gigId === g.id);
          const d = daysUntil(g.date);
          return (
            <li key={g.id}>
              <Link to={`/bolos/${g.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 sm:px-5">
                <span className="w-[104px] font-mono text-sm tracking-wider">{dateLabel(g.date)}</span>
                <span className="flex-[1_1_200px] min-w-0">
                  <span className="block text-xl font-bold tracking-[-.01em]">{g.city}</span>
                  <span className="block text-sm text-crema/65 truncate">{g.venue}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {g.status !== "confirmado" && <Pill>{g.status}</Pill>}
                  {g.soldOut && <Pill tone="senal">sold out</Pill>}
                  {g.ticketing === "propia" && ev && <Pill tone={ev.salesEnabled ? "senal" : "mute"} dot={ev.salesEnabled}>entradas propias</Pill>}
                  {!g.published ? <Pill>oculto</Pill> : g.teaser ? <Pill>secreto</Pill> : <Pill>en la web</Pill>}
                  {tab === "proximos" && <Pill>{d === 0 ? "hoy" : `en ${d} d`}</Pill>}
                </span>
              </Link>
            </li>
          );
        })}
        {!list.length && <li className="text-crema/60 p-4">Nada por aquí.</li>}
      </ul>
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
  const setContact = (i: number, c: Partial<Contact>) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, ...c } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const contacts = f.contacts.map(c => ({ ...c, role: c.role.trim(), name: c.name.trim(), phone: c.phone?.trim() || undefined, email: c.email?.trim() || undefined })).filter(c => c.name || c.phone || c.email);
    const g = { ...f, contacts, deal: f.deal?.trim() || undefined, doors: f.doors || undefined, id: f.id || `${f.city.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${f.date}-${uid()}` };
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="fecha">{id => <Input id={id} type="date" required value={f.date} onChange={e => set("date", e.target.value)} />}</Field>
          <Field label="puertas">{id => <Input id={id} type="time" value={f.doors ?? ""} onChange={e => set("doors", e.target.value || undefined)} />}</Field>
          <Field label="show">{id => <Input id={id} type="time" required value={f.time} onChange={e => set("time", e.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ciudad">{id => <Input id={id} required value={f.city} onChange={e => set("city", e.target.value)} />}</Field>
          <Field label="sala o lugar">{id => <Input id={id} required value={f.venue} onChange={e => set("venue", e.target.value)} />}</Field>
        </div>
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

        {!gig && <Toggle checked={f.published} onChange={v => set("published", v)} label="visible en la web" className="self-start" />}
        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{gig ? "guardar" : "crear bolo"}</Button>
        {gig && <Button type="button" variant="quiet" className="self-start" onClick={del} disabled={remove.pending}>borrar bolo</Button>}
      </form>
    </Sheet>
  );
}
