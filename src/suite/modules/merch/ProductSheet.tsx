/* Ficha de un producto: cómo va de dinero, qué hay por talla, apuntar
   cualquier movimiento y todo lo que le ha pasado. Los datos del
   producto (nombre, precio, tallas…) van plegados al final: se tocan poco. */
import { useEffect, useState } from "react";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { MerchMove, PayMethod, Product } from "@/data/types";
import { Button, Field, IconButton, Input, Progress, Segmented, Select, Sheet, Stat, Textarea, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "../presupuestos/money";
import { ALL_PAYMENTS, LOW, heldOf, isOpenReserve, money, stockOf } from "./shared";
import { MoveRow } from "./Moves";
import { NotifyButton } from "@/suite/NotifyList";
import { ReservationRow } from "./Reservations";
import { cx, eur } from "@/lib/format";

type Action = "vender" | "reservar" | "reponer" | "regalar" | "recuento";
const ACTIONS: { value: Action; label: string }[] = [
  { value: "vender", label: "vender" }, { value: "reservar", label: "reservar" }, { value: "reponer", label: "reponer" },
  { value: "regalar", label: "regalar" }, { value: "recuento", label: "recuento" },
];

export function ProductSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const { data: gigs } = useCollection("gigs");
  const p = products.find(x => x.id === id);
  if (!p) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const mine = moves.filter(m => m.productId === p.id).sort((a, b) => b.at.localeCompare(a.at));
  const open = mine.filter(isOpenReserve);
  const past = mine.filter(m => !isOpenReserve(m));
  const bag = money(mine);
  const s = stockOf(p, moves);
  const pending = s.box * p.priceCents;
  const sized = p.variants.length > 1 || !!p.variants[0]?.label;

  return (
    <Sheet open={!!id} onClose={onClose} title={p.name || "producto"} width={560}>
      <div className="flex flex-col gap-6 pt-2">
        {p.info && <p className="-mt-1 text-sm text-crema/70">{p.info}</p>}

        {/* dinero */}
        <section className="flex flex-col gap-3" aria-label="Dinero">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="invertido" value={eur(bag.spent)} />
            <Stat label="vendido" value={eur(bag.earned)} />
            <Stat label="beneficio" value={<span className={bag.profit < 0 ? "text-senal-suave" : ""}>{eur(bag.profit)}</span>} />
            <Stat label="vendidas" value={bag.sold} sub={bag.bought ? `de ${bag.bought} compradas` : undefined} />
          </div>
          <Recovery bag={bag} />
          {pending > 0 && <p className="text-sm text-crema/70">Quedan {eur(pending)} en caja a precio de venta: vendiéndolo todo, este producto acabaría en <b className="text-crema">{eur(bag.earned + pending - bag.spent)}</b>.</p>}
        </section>

        {/* tallas */}
        <section aria-label="Stock por talla">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[12px] text-crema/60">
              <th className="font-normal py-1">{sized ? "talla" : ""}</th><th className="font-normal text-right">en caja</th><th className="font-normal text-right">apartado</th><th className="font-normal text-right">libre</th>
            </tr></thead>
            <tbody className="font-mono">
              {p.variants.map(v => {
                const held = heldOf(moves, v.id);
                return (
                  <tr key={v.id} className="border-t border-crema/8">
                    <td className="py-2 font-sans">{v.label || "única"}</td>
                    <td className="text-right">{v.stock + held}</td>
                    <td className={cx("text-right", held ? "text-crema" : "text-crema/40")}>{held || "—"}</td>
                    <td className={cx("text-right", v.stock <= LOW && "text-senal-suave")}>{v.stock}</td>
                  </tr>
                );
              })}
              {p.variants.length > 1 && (
                <tr className="border-t border-crema/20 font-semibold">
                  <td className="py-2 font-sans">total</td><td className="text-right">{s.box}</td><td className="text-right">{s.held || "—"}</td><td className="text-right">{s.free}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <MoveForm p={p} />

        {/* lo apartado pide acción: va primero y aparte */}
        {open.length > 0 && (
          <section className="rounded-[18px] bg-crema text-noche p-4">
            <h3 className="font-semibold">apartado · {open.length} sin entregar</h3>
            <ul>{open.map(m => <ReservationRow key={m.id} m={m} p={p} gigs={gigs} showCustomer />)}</ul>
          </section>
        )}
        <section>
          <h3 className="font-semibold mb-1">historial</h3>
          {past.length ? <ul>{past.map(m => <MoveRow key={m.id} m={m} p={p} gigs={gigs} sizeOnly={sized ? undefined : true} />)}</ul>
            : <p className="text-sm text-crema/60">Todavía no le ha pasado nada a este producto.</p>}
        </section>

        <Settings p={p} onClose={onClose} />
      </div>
    </Sheet>
  );
}

export function Recovery({ bag }: { bag: ReturnType<typeof money> }) {
  if (!bag.spent) return null;
  const pct = bag.earned / bag.spent;
  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={pct} />
      <span className="text-[13px] text-crema/70">
        {bag.left === 0 ? <>coste cubierto · <b className="text-crema">{eur(bag.profit)}</b> de beneficio</> : <>{Math.round(pct * 100)} % del coste recuperado · faltan <b className="text-crema">{eur(bag.left)}</b></>}
      </span>
    </div>
  );
}

function MoveForm({ p }: { p: Product }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: moves } = useCollection("moves");
  const { data: gigs } = useCollection("gigs");
  const { data: members } = useCollection("members");
  const move = useAction((m: Omit<MerchMove, "id" | "at">) => api.moveStock(m));
  const today = new Date().toISOString().slice(0, 10);
  const todayGig = gigs.find(g => g.date === today)?.id ?? "";
  const recent = [...gigs].filter(g => g.date <= today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  const [action, setAction] = useState<Action>("vender");
  const [vid, setVid] = useState(p.variants[0]?.id ?? "");
  const [n, setN] = useState(1);
  const [unit, setUnit] = useState(p.priceCents);
  const [who, setWho] = useState("");
  const [pay, setPay] = useState<PayMethod>("efectivo");
  const [gig, setGig] = useState(todayGig);
  const [by, setBy] = useState(me.name);
  const [note, setNote] = useState("");

  const v = p.variants.find(x => x.id === vid) ?? p.variants[0];
  const box = v ? v.stock + heldOf(moves, v.id) : 0;
  /* Al cambiar de producto, de acción o de talla, cada campo vuelve a su valor lógico. */
  const reset = (a: Action, variant = v) => {
    setAction(a); setWho(""); setNote("");
    setN(a === "recuento" ? (variant ? variant.stock + heldOf(moves, variant.id) : 0) : 1);
    setUnit(a === "reponer" ? p.costCents : p.priceCents);
  };
  useEffect(() => { setVid(p.variants[0]?.id ?? ""); setGig(todayGig); reset("vender", p.variants[0]); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const takes = action === "vender" || action === "reservar" || action === "regalar";
  const withGig = takes;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v) return;
    if (takes && n > v.stock) { toast(v.stock ? `Solo quedan ${v.stock} libres.` : "No queda nada libre de esta talla.", "error"); return; }
    if (action === "reservar" && !who.trim()) { toast("¿Para quién es la reserva?", "error"); return; }
    const base = { productId: p.id, variantId: v.id, by, note: note.trim() || undefined, customer: who.trim() || undefined, gigId: withGig && gig ? gig : undefined };
    try {
      if (action === "vender") await move.run({ ...base, kind: "venta", qty: -n, unitCents: unit, payment: pay });
      if (action === "reservar") await move.run({ ...base, kind: "reserva", qty: -n, unitCents: unit, open: true });
      if (action === "regalar") await move.run({ ...base, kind: "regalo", qty: -n, unitCents: 0 });
      if (action === "reponer") await move.run({ ...base, kind: "reposicion", qty: n, unitCents: unit });
      if (action === "recuento") {
        const diff = n - box;
        if (!diff) { toast("Cuadra: no hay nada que ajustar", "ok"); return; }
        await move.run({ ...base, kind: "recuento", qty: diff, unitCents: 0 });
      }
    } catch (err) { toast((err as Error).message, "error"); return; }
    toast({ vender: "Venta apuntada", reservar: "Reserva apuntada", reponer: "Stock repuesto", regalar: "Regalo apuntado", recuento: "Recuento ajustado" }[action], "ok");
    reset(action);
  }

  const label = { vender: `vender ${n} · ${eur(n * unit)}`, reservar: `reservar ${n} · ${eur(n * unit)}`, reponer: `reponer +${n}`, regalar: `regalar ${n}`, recuento: "guardar recuento" }[action];

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-noche p-4">
      <h3 className="font-semibold">apuntar</h3>
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1"><Segmented size="sm" value={action} onChange={a => reset(a)} options={ACTIONS} /></div>
      <div className="grid grid-cols-2 gap-3">
        {p.variants.length > 1 ? (
          <Field label="talla">{fid => (
            <Select id={fid} value={v?.id} onChange={e => { const nv = p.variants.find(y => y.id === e.target.value); setVid(e.target.value); if (action === "recuento" && nv) setN(nv.stock + heldOf(moves, nv.id)); }}>
              {p.variants.map(x => <option key={x.id} value={x.id}>{x.label || "—"} · {x.stock} libres</option>)}
            </Select>
          )}</Field>
        ) : <div className="flex flex-col justify-end pb-2.5 text-sm text-crema/70">talla única · {v?.stock ?? 0} libres</div>}
        <Field label={action === "recuento" ? "hay en la caja" : "unidades"} hint={action === "recuento" ? "contando lo apartado" : undefined}>{fid => (
          <Input id={fid} type="number" inputMode="numeric" min={action === "recuento" ? 0 : 1} required value={n} onChange={e => setN(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="font-mono" />
        )}</Field>
        {(action === "vender" || action === "reservar" || action === "reponer") && (
          <Field label={action === "reponer" ? "coste por unidad €" : "precio por unidad €"} hint={action !== "reponer" && unit !== p.priceCents ? `tarifa ${eur(p.priceCents)}` : undefined}>
            {fid => <MoneyInput id={fid} cents={unit} onValue={setUnit} />}
          </Field>
        )}
        {(takes) && (
          <Field label={action === "reservar" ? "para quién" : action === "regalar" ? "a quién" : "a quién (opcional)"}>
            {fid => <Input id={fid} value={who} required={action === "reservar"} placeholder={action === "regalar" ? "Ràdio Castelldefels…" : "nombre o @instagram"} onChange={e => setWho(e.target.value)} />}
          </Field>
        )}
        {withGig && (
          <Field label="bolo">{fid => (
            <Select id={fid} value={gig} onChange={e => setGig(e.target.value)}>
              <option value="">fuera de bolo</option>
              {recent.map(g => <option key={g.id} value={g.id}>{g.city} · {g.date.slice(5).split("-").reverse().join("/")}</option>)}
            </Select>
          )}</Field>
        )}
        <Field label="atiende">{fid => (
          <Select id={fid} value={by} onChange={e => setBy(e.target.value)}>
            {!members.some(m => m.name === by) && <option value={by}>{by}</option>}
            {members.filter(m => m.active !== false).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </Select>
        )}</Field>
      </div>
      {action === "vender" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-crema/75">cobrado con</span>
          <Segmented size="sm" value={pay} onChange={setPay} options={ALL_PAYMENTS.map(x => ({ value: x, label: x }))} className="self-start" />
        </div>
      )}
      <Field label={action === "regalar" ? "por qué" : "nota"}>{fid => <Input id={fid} value={note} placeholder={action === "reponer" ? "imprenta, segunda tirada…" : action === "recuento" ? "cuadre tras contar la caja" : ""} onChange={e => setNote(e.target.value)} />}</Field>
      {action === "recuento" && v && <p className="text-sm text-crema/70">En sistema: {box} en caja. Ajuste: <span className="font-mono">{n - box > 0 ? "+" : ""}{n - box}</span></p>}
      <Button type="submit" variant="primary" disabled={move.pending || !v}>{label}</Button>
    </form>
  );
}

function Settings({ p, onClose }: { p: Product; onClose: () => void }) {
  const toast = useToast();
  const patch = useAction((x: Partial<Product>) => api.update("products", p.id, x));
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(p.priceCents);
  const [cost, setCost] = useState(p.costCents);
  const [info, setInfo] = useState(p.info ?? "");
  useEffect(() => { setName(p.name); setPrice(p.priceCents); setCost(p.costCents); setInfo(p.info ?? ""); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setVariants = (variants: Product["variants"]) => patch.run({ variants });
  const fresh = p.name === "producto nuevo";

  return (
    <details open={fresh} className="rounded-2xl border border-crema/12 p-4 group/s">
      <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
        datos del producto <span className="text-crema/60 text-sm font-normal group-open/s:hidden">nombre, precio, tallas, web…</span>
      </summary>
      <div className="flex flex-col gap-4 pt-4">
        <Field label="nombre">{fid => <Input id={fid} value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name && patch.run({ name: name.trim() })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="precio €">{fid => <MoneyInput id={fid} cents={price} onValue={setPrice} onBlur={() => price !== p.priceCents && patch.run({ priceCents: price })} />}</Field>
          <Field label="coste por unidad €" hint={price && cost ? `margen ${eur(price - cost)}` : undefined}>{fid => <MoneyInput id={fid} cents={cost} onValue={setCost} onBlur={() => cost !== p.costCents && patch.run({ costCents: cost })} />}</Field>
        </div>
        <Field label="descripción">{fid => <Textarea id={fid} rows={2} value={info} placeholder="algodón orgánico, serigrafía a dos tintas…" onChange={e => setInfo(e.target.value)} onBlur={() => info.trim() !== (p.info ?? "") && patch.run({ info: info.trim() })} />}</Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-crema/75">color de la ficha</span>
          <Segmented size="sm" value={p.color} onChange={color => patch.run({ color })} className="self-start"
            options={(["senal", "crema", "tubo", "noche"] as const).map(c => ({ value: c, label: c === "senal" ? "señal" : c }))} />
        </div>
        {!p.archived && (
          <div className="flex flex-wrap items-center gap-3">
            <Toggle checked={p.published} onChange={v => { patch.run({ published: v }); toast(v ? "Ahora sale en la web" : "Oculto en la web", "ok"); }} label="visible en la web" />
            {p.published && <NotifyButton size="sm" draft={{
              topic: "merch", subject: `merch nuevo de besta: ${p.name}`, title: p.name.toLowerCase(),
              body: `Ya tenemos ${p.name} por ${eur(p.priceCents)}.\n\nPídelo en la web y lo recoges en el próximo concierto, o te lo mandamos.`,
              ctaLabel: "lo quiero", ctaUrl: "https://besta.es/#merch",
            }} />}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-crema/75">tallas</span>
          <ul className="flex flex-col gap-1.5">
            {p.variants.map(x => (
              <li key={x.id} className="flex items-center gap-2">
                <Input aria-label="Nombre de la talla" defaultValue={x.label} placeholder="única" className="flex-1"
                  onBlur={e => e.target.value.trim() !== x.label && setVariants(p.variants.map(y => (y.id === x.id ? { ...y, label: e.target.value.trim() } : y)))} />
                <span className={cx("w-20 text-right font-mono text-sm", x.stock <= LOW ? "text-senal-suave" : "")}>{x.stock} libres</span>
                <IconButton label={x.stock ? `No se puede quitar ${x.label || "la talla"}: aún tiene stock` : `Quitar talla ${x.label}`}
                  disabled={!!x.stock || p.variants.length === 1} onClick={() => setVariants(p.variants.filter(y => y.id !== x.id))} className="text-crema/60">
                  <Icon name="x" size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button size="sm" className="self-start border-dashed" onClick={() => setVariants([...p.variants, { id: uid("v-"), label: "", stock: 0 }])}>+ talla</Button>
          <p className="text-xs text-crema/55">Solo se quita una talla cuando está a cero. Para meter unidades, «reponer».</p>
        </div>

        <Button variant="quiet" className="self-start" onClick={() => { patch.run({ archived: !p.archived }); toast(p.archived ? "Producto recuperado" : "Producto archivado", "ok"); if (!p.archived) onClose(); }}>
          {p.archived ? "recuperar producto" : "archivar producto"}
        </Button>
      </div>
    </details>
  );
}
