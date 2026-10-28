/* Reservas abiertas. En el puesto atiendes a una persona, no a un apunte:
   viene Lars y quiere lo suyo, sea una camiseta o cuatro cosas. Por eso
   van agrupadas por quién las tiene, con su total y «entregar todo». */
import { useState } from "react";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import type { Gig, MerchMove, PayMethod, Product } from "@/data/types";
import { Button, Field, Input, Select, useToast } from "@/components/ui";
import { MoneyInput } from "../presupuestos/money";
import { ALL_PAYMENTS, dayLabel, haystack, isOpenReserve, itemName, moveCents } from "./shared";
import { gigName } from "./Moves";
import { cx, eur } from "@/lib/format";

export function Reservations() {
  const { data: moves } = useCollection("moves");
  const { data: products } = useCollection("products");
  const { data: gigs } = useCollection("gigs");
  const [q, setQ] = useState("");
  const all = moves.filter(isOpenReserve);
  const needle = q.trim().toLowerCase();
  // Las más viejas arriba: son las que llevan más tiempo ocupando caja.
  const list = all
    .filter(m => !needle || haystack(m, products.find(p => p.id === m.productId), gigName(gigs, m.gigId)).includes(needle))
    .sort((a, b) => a.at.localeCompare(b.at));

  const people: { who: string; rows: MerchMove[] }[] = [];
  for (const m of list) {
    const who = m.customer?.trim() || "sin nombre";
    let g = people.find(x => x.who.toLowerCase() === who.toLowerCase());
    if (!g) people.push(g = { who, rows: [] });
    g.rows.push(m);
  }

  return (
    <div className="flex flex-col gap-3">
      {all.length > 3 && <Input type="search" aria-label="Buscar reservas" placeholder="buscar por persona, producto o bolo…" value={q} onChange={e => setQ(e.target.value)} />}
      {!list.length && (
        <p className="rounded-[18px] border border-dashed border-crema/20 p-6 text-center text-sm text-crema/65">
          {all.length ? "Nadie coincide con la búsqueda." : "Nada apartado ahora mismo. Lo que reservéis sale aquí hasta que se entregue."}
        </p>
      )}
      {people.map(g => <PersonCard key={g.who} who={g.who} rows={g.rows} products={products} gigs={gigs} />)}
    </div>
  );
}

function PersonCard({ who, rows, products, gigs }: { who: string; rows: MerchMove[]; products: Product[]; gigs: Gig[] }) {
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const deliverAll = useAction(async (pay: PayMethod) => { for (const m of rows) await api.deliverReservation(m.id, pay); });
  const units = rows.reduce((s, m) => s - m.qty, 0);
  const total = rows.reduce((s, m) => s + moveCents(m), 0);

  return (
    <section className="rounded-[18px] bg-crema text-noche p-4 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-semibold truncate">{who}</span>
          <span className="block text-xs text-noche/65">{units} ud · desde {dayLabel(rows[0].at)}</span>
        </span>
        <span className="font-mono text-lg">{eur(total)}</span>
        {rows.length > 1 && <Button size="sm" variant="dark" aria-expanded={paying} onClick={() => setPaying(x => !x)}>entregar todo</Button>}
      </div>
      {paying && (
        <PayPicker onPick={async pay => {
          try { await deliverAll.run(pay); toast(`Entregado a ${who} y cobrado`, "ok"); } catch (e) { toast((e as Error).message, "error"); }
          setPaying(false);
        }} disabled={deliverAll.pending} />
      )}
      <ul>{rows.map(m => <ReservationRow key={m.id} m={m} p={products.find(p => p.id === m.productId)} gigs={gigs} />)}</ul>
    </section>
  );
}

function PayPicker({ onPick, disabled }: { onPick: (p: PayMethod) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="text-xs text-noche/70 mr-1">cobrado con</span>
      {ALL_PAYMENTS.map(pay => <Button key={pay} size="sm" variant="dark" disabled={disabled} onClick={() => onPick(pay)}>{pay}</Button>)}
    </div>
  );
}

/** Una reserva abierta: entregar (y cobrar), editar o anular. Va sobre fondo crema. */
export function ReservationRow({ m, p, gigs, showCustomer }: { m: MerchMove; p?: Product; gigs: Gig[]; showCustomer?: boolean }) {
  const toast = useToast();
  const [mode, setMode] = useState<"" | "pay" | "edit">("");
  const deliver = useAction((pay: PayMethod) => api.deliverReservation(m.id, pay));
  const cancel = useAction(() => api.cancelReservation(m.id));
  const v = p?.variants.find(x => x.id === m.variantId);
  const n = -m.qty;
  const meta = [dayLabel(m.at), gigName(gigs, m.gigId), m.by && `apuntó ${m.by}`, m.note].filter(Boolean).join(" · ");

  return (
    <li className="pt-2.5 mt-1.5 border-t border-noche/15 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{showCustomer && `${m.customer ?? "sin nombre"} · `}{n}× {itemName(p, v)}</span>
          <span className="block text-xs text-noche/65">{meta}</span>
        </span>
        <span className="font-mono shrink-0">{eur(moveCents(m))}</span>
      </div>
      <div className="flex flex-wrap -ml-2.5">
        {(["pay", "edit"] as const).map(k => (
          <button key={k} type="button" aria-expanded={mode === k} onClick={() => setMode(x => (x === k ? "" : k))}
            className={cx("h-10 px-2.5", k === "pay" ? "font-semibold underline" : "text-noche/75 hover:text-noche")}>{k === "pay" ? "entregar" : "editar"}</button>
        ))}
        <button type="button" disabled={cancel.pending} className="h-10 px-2.5 text-noche/75 hover:text-noche"
          onClick={async () => { if (!confirm(`¿Anular la reserva de ${m.customer ?? "esta persona"}? Las ${n} ud vuelven a estar libres.`)) return; await cancel.run(); toast("Reserva anulada: vuelve al stock", "ok"); }}>anular</button>
      </div>
      {mode === "pay" && <PayPicker disabled={deliver.pending} onPick={async pay => { await deliver.run(pay); toast("Entregada y cobrada", "ok"); }} />}
      {mode === "edit" && <EditReservation m={m} gigs={gigs} onDone={() => setMode("")} />}
    </li>
  );
}

function EditReservation({ m, gigs, onDone }: { m: MerchMove; gigs: Gig[]; onDone: () => void }) {
  const toast = useToast();
  const [customer, setCustomer] = useState(m.customer ?? "");
  const [note, setNote] = useState(m.note ?? "");
  const [unit, setUnit] = useState(m.unitCents);
  const [gig, setGig] = useState(m.gigId ?? "");
  const save = useAction(() => api.update("moves", m.id, { customer: customer.trim(), note: note.trim(), unitCents: unit, gigId: gig || null } as Partial<MerchMove>));
  const recent = [...gigs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return (
    <form className="grid grid-cols-2 gap-2 pb-2 pt-1 [&_input]:bg-crema [&_input]:text-noche [&_input]:border-noche/25 [&_select]:bg-crema [&_select]:text-noche [&_select]:border-noche/25"
      onSubmit={async e => { e.preventDefault(); if (!customer.trim()) return; await save.run(); toast("Reserva guardada", "ok"); onDone(); }}>
      <Field label="para quién" className="col-span-2 [&_label]:text-noche/70">{id => <Input id={id} required value={customer} onChange={e => setCustomer(e.target.value)} />}</Field>
      <Field label="precio por unidad €" className="[&_label]:text-noche/70">{id => <MoneyInput id={id} cents={unit} onValue={setUnit} />}</Field>
      <Field label="bolo" className="[&_label]:text-noche/70">{id => (
        <Select id={id} value={gig} onChange={e => setGig(e.target.value)}>
          <option value="">ninguno</option>
          {recent.map(g => <option key={g.id} value={g.id}>{g.city} · {g.date.slice(5).split("-").reverse().join("/")}</option>)}
        </Select>
      )}</Field>
      <Field label="nota" className="col-span-2 [&_label]:text-noche/70">{id => <Input id={id} value={note} placeholder="paga Max, recoge en el bolo…" onChange={e => setNote(e.target.value)} />}</Field>
      <div className="col-span-2 flex gap-2">
        <Button type="submit" size="sm" variant="dark" disabled={save.pending}>guardar</Button>
        <Button type="button" size="sm" variant="quiet" className="!text-noche/70" onClick={onDone}>cancelar</Button>
      </div>
    </form>
  );
}
