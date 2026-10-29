/* Entradas: un evento con venta propia por bolo. Cada tarjeta abre
   su gestión (EntradasEvento.tsx). Un evento nuevo nace cerrado. */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { eventStats } from "@/data/selectors";
import type { Gig, TicketEvent } from "@/data/types";
import { Button, Empty, Field, Input, Pill, Progress, Select, Sheet, Stepper, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { dateLabel, daysUntil, eur, eur0, gigWhen, isPast } from "@/lib/format";

export default function Entradas() {
  const { data: events, loading } = useCollection("events");
  const { data: gigs } = useCollection("gigs");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const [params, setParams] = useSearchParams();
  const creating = params.get("nuevo") === "1";

  // próximos primero, por fecha; los pasados al final
  const rows = events
    .map(ev => ({ ev, g: gigs.find(g => g.id === ev.gigId) }))
    .sort((a, b) => {
      const pa = a.g ? isPast(a.g.date) : true, pb = b.g ? isPast(b.g.date) : true;
      if (pa !== pb) return pa ? 1 : -1;
      return (a.g?.date ?? "").localeCompare(b.g?.date ?? "") * (pa ? -1 : 1);
    });

  return (
    <Page title="entradas" kicker={`${events.length} ${events.length === 1 ? "EVENTO" : "EVENTOS"} CON VENTA PROPIA`}
      actions={<Button variant="primary" onClick={() => setParams({ nuevo: "1" })}>+ nuevo evento</Button>}>
      {!loading && !rows.length && (
        <Empty title="Aún no vendéis entradas" action={<Button variant="primary" onClick={() => setParams({ nuevo: "1" })}>+ nuevo evento</Button>}>
          Crea un evento a partir de un bolo: nace cerrado para que reviséis precio y aforo antes de abrir la venta.
        </Empty>
      )}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ ev, g }) => {
          const s = eventStats(ev, { orders, tickets });
          const past = g ? isPast(g.date) : false;
          const d = g ? daysUntil(g.date) : 0;
          return (
            <li key={ev.id}>
              <Link to={`/entradas/${ev.id}`} className="h-full rounded-[20px] bg-tubo hover:bg-tubo-alto p-5 flex flex-col gap-4 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs tracking-wider text-crema/65">{g ? gigWhen(g).toUpperCase() : "SIN BOLO"}</p>
                    <h2 className="text-[22px] font-bold tracking-[-.015em] truncate">{g?.city ?? ev.name}</h2>
                    <p className="text-sm text-crema/65 truncate">{g?.venue}</p>
                  </div>
                  {past ? <Pill>pasado</Pill>
                    : ev.salesEnabled ? <Pill tone="senal" dot>a la venta</Pill>
                    : <Pill>cerrada</Pill>}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[26px] leading-none tracking-tight">{s.sold}<span className="text-crema/55 text-base"> / {ev.capacity}</span></span>
                    <span className="font-mono text-lg">{eur0(s.gross)}</span>
                  </div>
                  <Progress value={s.pct} />
                  <p className="flex flex-wrap justify-between gap-x-3 font-mono text-xs text-crema/60">
                    <span>{eur(ev.priceCents)} · {s.invites} inv.</span>
                    <span>{past ? `${s.inside} dentro` : d === 0 ? "hoy" : `en ${d} d`}</span>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <NewEvent open={creating} onClose={() => setParams({})} />
    </Page>
  );
}

function NewEvent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  // bolos futuros sin evento propio todavía
  const free = gigs
    .filter(g => !isPast(g.date) && g.status !== "cancelado" && !events.some(e => e.gigId === g.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  const [gigId, setGigId] = useState("");
  const [price, setPrice] = useState("12");
  const [capacity, setCapacity] = useState("");
  const [maxPerOrder, setMax] = useState(10);
  const gig: Gig | undefined = free.find(g => g.id === gigId);

  useEffect(() => {
    if (!open) return;
    const first = free[0];
    setGigId(first?.id ?? ""); setPrice("12"); setCapacity(first?.capacity ? String(first.capacity) : "200"); setMax(10);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useAction(async (e: TicketEvent) => {
    await api.insert("events", e);
    await api.update("gigs", e.gigId, { ticketing: "propia" });
    return e;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gig) return;
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { toast("Revisa el precio", "error"); return; }
    const ev: TicketEvent = {
      id: uid("ev-"), gigId: gig.id, name: `besta en ${gig.city}`, description: "",
      image: "/img/escenario-azul.jpg", priceCents: cents, capacity: Math.max(1, Number(capacity) || 1),
      maxPerOrder, salesEnabled: false,
    };
    await create.run(ev);
    toast("Evento creado. La venta sigue cerrada.", "ok");
    onClose();
    nav(`/entradas/${ev.id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="nuevo evento">
      {!free.length ? (
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-crema/75">Todos los bolos próximos ya tienen venta, o no hay bolos. Crea primero el bolo.</p>
          <Button variant="primary" onClick={() => { onClose(); nav("/bolos?nuevo=1"); }}>+ nuevo bolo</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 pt-2">
          <Field label="bolo">{id => (
            <Select id={id} required value={gigId} onChange={e => {
              setGigId(e.target.value);
              const g = free.find(x => x.id === e.target.value);
              if (g?.capacity) setCapacity(String(g.capacity));
            }}>
              {free.map(g => <option key={g.id} value={g.id}>{dateLabel(g.date)} · {g.city} · {g.venue}</option>)}
            </Select>
          )}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="precio (€)">{id => <Input id={id} inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)} className="font-mono" />}</Field>
            <Field label="aforo">{id => <Input id={id} type="number" min={1} required value={capacity} onChange={e => setCapacity(e.target.value)} className="font-mono" />}</Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-crema/75" id="max-label">máximo por pedido</span>
            <div role="group" aria-labelledby="max-label"><Stepper value={maxPerOrder} onChange={setMax} min={1} max={20} /></div>
          </div>
          <p className="text-sm text-crema/65 flex gap-2"><Icon name="reloj" size={16} className="shrink-0 mt-0.5" />Se crea con la venta cerrada. La abres desde el evento cuando esté todo revisado.</p>
          <Button type="submit" variant="primary" size="lg" disabled={create.pending || !gig}>crear evento</Button>
        </form>
      )}
    </Sheet>
  );
}
