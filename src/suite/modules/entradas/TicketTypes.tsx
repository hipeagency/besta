/* Tipos de entrada de un evento: anticipada, general, taquilla…
   Cada uno con su precio, dónde se vende (web, taquilla o las dos),
   un límite opcional y fechas de venta online. Lo vendido no se toca:
   un tipo con ventas no se borra, se pausa. */
import { useState } from "react";
import { useAction } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { eventTypes, fromPrice, onlineClosedReason } from "@/data/tickets";
import type { SaleChannel, TicketEvent, TicketType } from "@/data/types";
import { Button, Card, CardTitle, Field, Input, Pill, Segmented, Sheet, Toggle, useToast } from "@/components/ui";
import { cx, eur } from "@/lib/format";
import { ConfirmButton, fromLocalInput, toLocalInput } from "./shared";

export const channelLabel: Record<SaleChannel, string> = { online: "solo web", puerta: "solo taquilla", ambos: "web y taquilla" };

export function TicketTypes({ ev, sold }: { ev: TicketEvent; sold: Record<string, number> }) {
  const toast = useToast();
  const types = eventTypes(ev);
  const [edit, setEdit] = useState<TicketType | null>(null);
  const save = useAction((next: TicketType[]) => api.update("events", ev.id, { types: next, priceCents: fromPrice(next) }));

  async function put(t: TicketType) {
    const exists = types.some(x => x.id === t.id);
    await save.run(exists ? types.map(x => (x.id === t.id ? t : x)) : [...types, t]);
    toast(exists ? `«${t.name}» guardada` : `«${t.name}» añadida`, "ok");
    setEdit(null);
  }
  async function drop(t: TicketType) {
    if (types.length === 1) { toast("Tiene que quedar al menos un tipo", "error"); return; }
    await save.run(types.filter(x => x.id !== t.id));
    toast(`«${t.name}» quitada`, "ok");
    setEdit(null);
  }

  const blank = (): TicketType => ({ id: uid("tt-"), name: "", priceCents: types[0]?.priceCents ?? 1200, channel: "ambos", active: true });

  return (
    <Card>
      <CardTitle action={<Button size="sm" onClick={() => setEdit(blank())}>+ tipo</Button>}>tipos de entrada</CardTitle>
      <ul className="flex flex-col">
        {types.map(t => {
          const n = sold[t.id] ?? 0;
          const why = t.channel === "puerta" ? null : onlineClosedReason(t);
          return (
            <li key={t.id} className="border-t border-crema/8 first:border-t-0">
              <button type="button" onClick={() => setEdit(t)} className={cx("w-full flex items-center gap-3 py-3 text-left min-h-[56px]", !t.active && "opacity-60")}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate first-letter:uppercase">{t.name}</span>
                  <span className="block text-xs text-crema/60 truncate">
                    {channelLabel[t.channel]}{!t.active ? " · pausada" : why && why !== "solo en taquilla" ? ` · web: ${why}` : ""}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-mono">{eur(t.priceCents)}</span>
                  <span className="block font-mono text-xs text-crema/60">{n}{t.limit != null ? ` / ${t.limit}` : ""} vend.</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-crema/55">Todas comparten el aforo del evento. Las invitaciones van aparte.</p>

      {edit && <TypeSheet key={edit.id} t={edit} isNew={!types.some(x => x.id === edit.id)} sold={sold[edit.id] ?? 0}
        names={types.filter(x => x.id !== edit.id).map(x => x.name.trim().toLowerCase())}
        busy={save.pending} onClose={() => setEdit(null)} onSave={put} onDelete={drop} />}
    </Card>
  );
}

function TypeSheet({ t, isNew, sold, names, busy, onClose, onSave, onDelete }: {
  t: TicketType; isNew: boolean; sold: number; names: string[]; busy: boolean;
  onClose: () => void; onSave: (t: TicketType) => void; onDelete: (t: TicketType) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    name: t.name, price: t.priceCents ? (t.priceCents / 100).toFixed(2).replace(".", ",") : "", channel: t.channel,
    limit: t.limit != null ? String(t.limit) : "", start: toLocalInput(t.salesStart), end: toLocalInput(t.salesEnd),
    note: t.note ?? "", active: t.active,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = f.name.trim();
    const priceCents = Math.round(Number(f.price.replace(",", ".")) * 100);
    const limit = f.limit.trim() ? Math.floor(Number(f.limit)) : undefined;
    if (!name) { toast("Ponle nombre", "error"); return; }
    if (names.includes(name.toLowerCase())) { toast("Ya hay un tipo con ese nombre", "error"); return; }
    if (!Number.isFinite(priceCents) || priceCents <= 0) { toast("Revisa el precio. Para entradas gratis, usa invitaciones", "error"); return; }
    if (limit !== undefined && (!Number.isFinite(limit) || limit < Math.max(1, sold))) { toast(sold ? `El límite no puede bajar de ${sold}: ya están vendidas` : "Revisa el límite", "error"); return; }
    const salesStart = f.channel === "puerta" ? undefined : fromLocalInput(f.start);
    const salesEnd = f.channel === "puerta" ? undefined : fromLocalInput(f.end);
    if (salesStart && salesEnd && salesStart >= salesEnd) { toast("La venta tiene que empezar antes de acabar", "error"); return; }
    onSave({
      id: t.id, name, priceCents, channel: f.channel, active: f.active,
      ...(limit !== undefined ? { limit } : {}),
      ...(salesStart ? { salesStart } : {}),
      ...(salesEnd ? { salesEnd } : {}),
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
    });
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? "nuevo tipo de entrada" : `entrada ${t.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-3.5 pt-1">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="nombre">{id => <Input id={id} autoFocus={isNew} value={f.name} onChange={e => set("name", e.target.value)} placeholder="anticipada, general, taquilla…" />}</Field>
          <Field label="precio (€)">{id => <Input id={id} inputMode="decimal" value={f.price} onChange={e => set("price", e.target.value)} className="font-mono" />}</Field>
        </div>
        {sold > 0 && !isNew && <p className="-mt-1 text-xs text-crema/55">Ya hay {sold} vendidas: un cambio de precio solo vale para las próximas.</p>}

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-crema/75">dónde se vende</span>
          <Segmented value={f.channel} onChange={v => set("channel", v)} options={[
            { value: "ambos", label: "web y taquilla" }, { value: "online", label: "solo web" }, { value: "puerta", label: "solo taquilla" },
          ]} />
        </div>

        <Field label="límite (opcional)" hint="Vacío: hasta llenar el aforo.">{id =>
          <Input id={id} type="number" min={Math.max(1, sold)} inputMode="numeric" value={f.limit} onChange={e => set("limit", e.target.value)} placeholder="sin límite" className="font-mono" />}</Field>

        {f.channel !== "puerta" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="en la web desde">{id => <Input id={id} type="datetime-local" value={f.start} onChange={e => set("start", e.target.value)} className="font-mono text-sm" />}</Field>
            <Field label="en la web hasta">{id => <Input id={id} type="datetime-local" value={f.end} onChange={e => set("end", e.target.value)} className="font-mono text-sm" />}</Field>
          </div>
        )}
        {f.channel !== "puerta" && <p className="-mt-2 text-xs text-crema/55">Vacío: mientras la venta del evento esté abierta. Las fechas no cuentan en taquilla.</p>}

        <Field label="nota en la web (opcional)">{id => <Input id={id} value={f.note} onChange={e => set("note", e.target.value)} placeholder="hasta el 1 de diciembre · incluye consumición" />}</Field>

        <Toggle checked={f.active} onChange={v => set("active", v)} label={f.active ? "a la venta" : "pausada (no se vende; lo vendido vale)"} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={busy}>{isNew ? "añadir" : "guardar"}</Button>
          <Button type="button" onClick={onClose}>cancelar</Button>
          {!isNew && (sold > 0
            ? <Pill className="ml-auto">con ventas: se pausa, no se borra</Pill>
            : <ConfirmButton className="ml-auto" confirm="sí, quitar" onConfirm={() => onDelete(t)}>quitar</ConfirmButton>)}
        </div>
      </form>
    </Sheet>
  );
}
