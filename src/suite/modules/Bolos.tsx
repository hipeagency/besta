/* Bolos: la lista. Cada bolo abre su ficha (Bolo.tsx). */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs, pastGigs } from "@/data/selectors";
import type { Gig, Ticketing } from "@/data/types";
import { Button, Field, Input, Pill, Segmented, Select, Sheet, Toggle, useToast } from "@/components/ui";
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

export function NewGig({ open, onClose, gig }: { open: boolean; onClose: () => void; gig?: Gig }) {
  const nav = useNavigate();
  const toast = useToast();
  const save = useAction(async (g: Gig) => { gig ? await api.update("gigs", g.id, g) : await api.insert("gigs", g); return g; });
  const blank: Gig = { id: "", date: "", time: "21:00", city: "", venue: "", status: "confirmado", published: false, ticketing: "ninguna", schedule: [], contacts: [], checklist: {} };
  const [f, setF] = useState<Gig>(gig ?? blank);
  useEffect(() => { if (open) setF(gig ?? blank); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Gig>(k: K, v: Gig[K]) => setF(x => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const g = { ...f, id: f.id || `${f.city.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${f.date}-${uid()}` };
    await save.run(g);
    toast(gig ? "Bolo guardado" : "Bolo creado", "ok");
    onClose();
    if (!gig) nav(`/bolos/${g.id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title={gig ? "editar bolo" : "nuevo bolo"}>
      <form onSubmit={submit} className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="fecha">{id => <Input id={id} type="date" required value={f.date} onChange={e => set("date", e.target.value)} />}</Field>
          <Field label="hora del show">{id => <Input id={id} type="time" required value={f.time} onChange={e => set("time", e.target.value)} />}</Field>
        </div>
        <Field label="ciudad">{id => <Input id={id} required value={f.city} onChange={e => set("city", e.target.value)} />}</Field>
        <Field label="sala o lugar">{id => <Input id={id} required value={f.venue} onChange={e => set("venue", e.target.value)} />}</Field>
        <Field label="dirección">{id => <Input id={id} value={f.address ?? ""} onChange={e => set("address", e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="aforo">{id => <Input id={id} type="number" min={0} value={f.capacity ?? ""} onChange={e => set("capacity", e.target.value ? Number(e.target.value) : undefined)} />}</Field>
          <Field label="estado">{id => (
            <Select id={id} value={f.status} onChange={e => set("status", e.target.value as Gig["status"])}>
              <option value="tentativo">tentativo</option><option value="confirmado">confirmado</option><option value="cancelado">cancelado</option>
            </Select>
          )}</Field>
        </div>
        <Field label="entradas">{id => (
          <Select id={id} value={f.ticketing} onChange={e => set("ticketing", e.target.value as Ticketing)}>
            <option value="ninguna">sin entradas (fiesta, privado…)</option>
            <option value="propia">venta propia en besta.es</option>
            <option value="externa">las vende otro (enlace)</option>
          </Select>
        )}</Field>
        {f.ticketing === "externa" && <Field label="enlace de entradas o info">{id => <Input id={id} type="url" value={f.externalUrl ?? ""} onChange={e => set("externalUrl", e.target.value)} />}</Field>}
        <Toggle checked={f.published} onChange={v => set("published", v)} label="visible en la web" className="self-start" />
        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{gig ? "guardar" : "crear bolo"}</Button>
      </form>
    </Sheet>
  );
}
