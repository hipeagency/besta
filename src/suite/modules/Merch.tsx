/* Merch: lo que hay en la caja, lo que sale y quién lo vendió.
   El cobro en el bolo va en el modo puesto (MerchPuesto.tsx). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs } from "@/data/selectors";
import type { MerchMove, MoveKind, PayMethod, Product } from "@/data/types";
import { Button, Card, CardTitle, Field, IconButton, Input, Pill, Segmented, Select, Sheet, Stat, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "./presupuestos/money";
import { Requests } from "./merch/Requests";
import { KIND_LABEL, LOW, PAYMENTS, itemName, moveCents, sizeLabel, swatch } from "./merch/shared";
import { ago, cx, dateShort, eur, eur0 } from "@/lib/format";

export default function Merch() {
  const nav = useNavigate();
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const { data: gigs } = useCollection("gigs");
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const create = useAction(async () => {
    const p: Product = { id: uid("p-"), name: "producto nuevo", priceCents: 0, costCents: 0, color: "tubo", archived: false, published: false, variants: [{ id: uid("v-"), label: "", stock: 0 }] };
    await api.insert("products", p);
    return p;
  });

  const active = products.filter(p => !p.archived);
  const archived = products.filter(p => p.archived);
  const units = active.reduce((s, p) => s + p.variants.reduce((a, v) => a + v.stock, 0), 0);
  const value = active.reduce((s, p) => s + p.variants.reduce((a, v) => a + v.stock * p.priceCents, 0), 0);
  const low = active.reduce((s, p) => s + p.variants.filter(v => v.stock <= LOW).length, 0);
  const lastGig = gigs.filter(g => moves.some(m => m.kind === "venta" && m.gigId === g.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastSold = lastGig ? moves.filter(m => m.kind === "venta" && m.gigId === lastGig.id).reduce((s, m) => s + moveCents(m), 0) : 0;
  const next = upcomingGigs(gigs)[0];

  return (
    <Page
      title="merch"
      actions={<>
        <Button onClick={async () => setEditing((await create.run()).id)} disabled={create.pending}>+ producto</Button>
        <Button variant="primary" onClick={() => nav(next ? `/merch/puesto?bolo=${next.id}` : "/merch/puesto")}>
          abrir puesto{next ? ` · ${next.city}` : ""}
        </Button>
      </>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="!p-4"><Stat label="unidades en caja" value={units} /></Card>
        <Card className="!p-4"><Stat label="valor a precio de venta" value={eur0(value)} /></Card>
        <Card className="!p-4"><Stat label="vendido último bolo" value={eur0(lastSold)} sub={lastGig ? `${lastGig.city} · ${dateShort(lastGig.date)}` : "sin ventas aún"} /></Card>
        <Card className="!p-4"><Stat label="tallas en mínimo" value={low} sub={`≤ ${LOW} unidades`} /></Card>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {/* productos */}
        <section className="flex-[3_1_460px] min-w-0 flex flex-col gap-3" aria-label="Productos">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
            {active.map(p => <ProductCard key={p.id} p={p} onOpen={() => setEditing(p.id)} />)}
          </div>
          {archived.length > 0 && (
            <button type="button" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived} className="self-start h-11 text-sm text-crema/70 hover:text-crema underline">
              {showArchived ? "ocultar archivados" : `ver archivados · ${archived.length}`}
            </button>
          )}
          {showArchived && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 opacity-60">
              {archived.map(p => <ProductCard key={p.id} p={p} onOpen={() => setEditing(p.id)} />)}
            </div>
          )}
        </section>

        {/* reservas y movimientos */}
        <section className="flex-[2_1_300px] min-w-0 flex flex-col gap-3.5">
          <Requests />
          <Reservations />
          <Moves />
        </section>
      </div>

      <ProductSheet id={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function ProductCard({ p, onOpen }: { p: Product; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-3.5 flex flex-col gap-3 transition" aria-label={`Editar ${p.name}`}>
      <span className={cx("h-[120px] rounded-xl grid place-items-center font-mono text-xs", swatch[p.color])} aria-hidden="true">[foto]</span>
      <span className="flex justify-between items-baseline gap-2">
        <span className="font-semibold truncate">{p.name}</span>
        <span className="font-mono shrink-0">{eur0(p.priceCents)}</span>
      </span>
      {!p.archived && !p.published && <Pill className="self-start">oculto en la web</Pill>}
      <span className="flex flex-wrap gap-1.5">
        {p.variants.map(v => (
          <span key={v.id} className={cx("min-w-11 px-2 py-1.5 rounded-[10px] text-center font-mono text-xs leading-tight", v.stock <= LOW ? "bg-senal text-noche" : "bg-noche text-crema")}>
            {sizeLabel(v, p)}<br /><b className="font-medium">{v.stock}</b>
          </span>
        ))}
      </span>
    </button>
  );
}

// ---------- reservas ----------
function Reservations() {
  const toast = useToast();
  const { data: moves } = useCollection("moves");
  const { data: products } = useCollection("products");
  const [delivering, setDelivering] = useState<string | null>(null);
  const deliver = useAction((id: string, pay: PayMethod) => api.deliverReservation(id, pay));
  const cancel = useAction((id: string) => api.cancelReservation(id));
  const open = moves.filter(m => m.kind === "reserva" && m.open);

  return (
    <section className="rounded-[18px] bg-crema text-noche p-4 flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold">reservas abiertas · {open.length}</h2>
      {!open.length && <p className="text-sm text-noche/70">Nada apartado.</p>}
      {open.map(m => {
        const p = products.find(x => x.id === m.productId);
        const v = p?.variants.find(x => x.id === m.variantId);
        return (
          <div key={m.id} className="pt-2 border-t border-noche/15 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate">{m.customer ?? "?"} · {itemName(p, v)}{-m.qty > 1 ? ` ×${-m.qty}` : ""}</span>
                <span className="block font-mono text-[11px] text-noche/65">{eur(moveCents(m))} · apuntó {m.by} · {ago(m.at)}</span>
              </span>
              <span className="flex shrink-0">
                <button type="button" aria-expanded={delivering === m.id} onClick={() => setDelivering(d => (d === m.id ? null : m.id))} className="h-11 px-2.5 font-medium underline">entregar</button>
                <button type="button" onClick={async () => { await cancel.run(m.id); toast("Reserva anulada: vuelve al stock", "ok"); }} className="h-11 px-2.5 text-noche/70 hover:text-noche">anular</button>
              </span>
            </div>
            {delivering === m.id && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-xs text-noche/70 mr-1">cobrado con</span>
                {PAYMENTS.map(pay => (
                  <Button key={pay} size="sm" variant="dark" onClick={async () => { await deliver.run(m.id, pay); setDelivering(null); toast("Entregada y cobrada", "ok"); }}>{pay}</Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------- movimientos ----------
function Moves() {
  const { data: moves } = useCollection("moves");
  const { data: products } = useCollection("products");
  const { data: gigs } = useCollection("gigs");
  const [kind, setKind] = useState<"" | MoveKind>("");
  const [gig, setGig] = useState("");
  const [limit, setLimit] = useState(30);
  const gigsWithMoves = gigs.filter(g => moves.some(m => m.gigId === g.id)).sort((a, b) => b.date.localeCompare(a.date));
  const list = moves
    .filter(m => !kind || m.kind === kind)
    .filter(m => !gig || (gig === "-" ? !m.gigId : m.gigId === gig))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card className="!p-4">
      <CardTitle>movimientos</CardTitle>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Select aria-label="Filtrar por tipo" value={kind} onChange={e => setKind(e.target.value as "" | MoveKind)}>
          <option value="">todos los tipos</option>
          {(Object.keys(KIND_LABEL) as MoveKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
        <Select aria-label="Filtrar por bolo" value={gig} onChange={e => setGig(e.target.value)}>
          <option value="">todos los bolos</option>
          <option value="-">fuera de bolo</option>
          {gigsWithMoves.map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
        </Select>
      </div>
      <ul>
        {list.slice(0, limit).map(m => <MoveRow key={m.id} m={m} p={products.find(p => p.id === m.productId)} gigCity={gigs.find(g => g.id === m.gigId)?.city} />)}
        {!list.length && <li className="py-3 text-sm text-crema/60">Sin movimientos con estos filtros.</li>}
      </ul>
      {list.length > limit && <Button size="sm" variant="quiet" onClick={() => setLimit(l => l + 30)} className="mt-2">ver más</Button>}
    </Card>
  );
}

function MoveRow({ m, p, gigCity }: { m: MerchMove; p?: Product; gigCity?: string }) {
  const v = p?.variants.find(x => x.id === m.variantId);
  const n = Math.abs(m.qty);
  const meta = [gigCity, m.payment, m.customer, m.note, `atendió ${m.by}`, ago(m.at)].filter(Boolean).join(" · ");
  return (
    <li className="flex justify-between gap-3 py-2 border-t border-crema/8 text-sm">
      <span className="min-w-0">
        <span className="block">{KIND_LABEL[m.kind]}{m.open ? " abierta" : ""} · {itemName(p, v)}{n > 1 ? ` ×${n}` : ""}</span>
        <span className="block text-xs text-crema/60">{meta}</span>
      </span>
      <span className={cx("font-mono text-[13px] whitespace-nowrap", m.qty > 0 ? "text-senal-suave" : m.kind === "venta" ? "text-crema" : "text-crema/70")}>
        {m.qty > 0 ? `+${m.qty}` : `−${n}`}
      </span>
    </li>
  );
}

// ---------- ficha de producto ----------
type StockAction = "reponer" | "regalar" | "reservar" | "recuento";

function ProductSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: products } = useCollection("products");
  const p = products.find(x => x.id === id);
  const patch = useAction((x: Partial<Product>) => api.update("products", id!, x));
  const move = useAction((m: Omit<MerchMove, "id" | "at">) => api.moveStock(m));

  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [cost, setCost] = useState(0);
  const [vid, setVid] = useState("");
  const [action, setAction] = useState<StockAction>("reponer");
  const [n, setN] = useState(1);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");

  /* Al abrir otra ficha, el formulario arranca de cero. */
  useEffect(() => {
    if (!p) return;
    setName(p.name); setPrice(p.priceCents); setCost(p.costCents);
    setVid(p.variants[0]?.id ?? ""); setAction("reponer"); setN(1); setWho(""); setNote("");
  }, [id, !!p]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const v = p.variants.find(x => x.id === vid) ?? p.variants[0];

  const pickAction = (a: StockAction) => { setAction(a); setN(a === "recuento" ? v?.stock ?? 0 : 1); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v || !p) return;
    const base = { productId: p.id, variantId: v.id, by: me.name, note: note.trim() || undefined };
    if ((action === "regalar" || action === "reservar") && n > v.stock) { toast(`Solo quedan ${v.stock}.`, "error"); return; }
    if (action === "reservar" && !who.trim()) { toast("¿Para quién es la reserva?", "error"); return; }
    if (action === "reponer") await move.run({ ...base, kind: "reposicion", qty: n, unitCents: p.costCents });
    if (action === "regalar") await move.run({ ...base, kind: "regalo", qty: -n, unitCents: 0, customer: who.trim() || undefined });
    if (action === "reservar") await move.run({ ...base, kind: "reserva", qty: -n, unitCents: p.priceCents, customer: who.trim(), open: true });
    if (action === "recuento") {
      const diff = n - v.stock;
      if (!diff) { toast("Cuadra: no hay nada que ajustar", "ok"); return; }
      await move.run({ ...base, kind: "recuento", qty: diff, unitCents: 0 });
    }
    toast({ reponer: "Stock repuesto", regalar: "Regalo apuntado", reservar: "Reserva apuntada", recuento: "Recuento ajustado" }[action], "ok");
    setN(action === "recuento" ? n : 1); setWho(""); setNote("");
  }

  const setVariants = (variants: Product["variants"]) => patch.run({ variants });

  return (
    <Sheet open={!!id} onClose={onClose} title={p.name || "producto"} width={480}>
      <div className="flex flex-col gap-6 pt-2">
        {/* datos */}
        <div className="flex flex-col gap-3">
          <Field label="nombre">{fid => <Input id={fid} value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name && patch.run({ name: name.trim() })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="precio €">{fid => <MoneyInput id={fid} cents={price} onValue={setPrice} onBlur={() => price !== p.priceCents && patch.run({ priceCents: price })} />}</Field>
            <Field label="coste €" hint={price && cost ? `margen ${eur(price - cost)}` : undefined}>{fid => <MoneyInput id={fid} cents={cost} onValue={setCost} onBlur={() => cost !== p.costCents && patch.run({ costCents: cost })} />}</Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-crema/75">color de la ficha</span>
            <Segmented size="sm" value={p.color} onChange={color => patch.run({ color })} className="self-start"
              options={(["senal", "crema", "tubo", "noche"] as const).map(c => ({ value: c, label: c === "senal" ? "señal" : c }))} />
          </div>
          {!p.archived && (
            <Toggle checked={p.published} onChange={v => { patch.run({ published: v }); toast(v ? "Ahora sale en la web" : "Oculto en la web", "ok"); }} label="visible en la web" className="self-start" />
          )}
        </div>

        {/* tallas */}
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">tallas</h3>
          <ul className="flex flex-col gap-1.5">
            {p.variants.map(x => (
              <li key={x.id} className="flex items-center gap-2">
                <Input aria-label="Nombre de la talla" defaultValue={x.label} placeholder="única" className="flex-1"
                  onBlur={e => e.target.value.trim() !== x.label && setVariants(p.variants.map(y => (y.id === x.id ? { ...y, label: e.target.value.trim() } : y)))} />
                <span className={cx("w-14 text-right font-mono", x.stock <= LOW ? "text-senal-suave" : "")}>{x.stock} ud</span>
                <IconButton label={x.stock ? `No se puede quitar ${x.label || "la talla"}: aún tiene stock` : `Quitar talla ${x.label}`}
                  disabled={!!x.stock || p.variants.length === 1} onClick={() => setVariants(p.variants.filter(y => y.id !== x.id))} className="text-crema/60">
                  <Icon name="x" size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button size="sm" className="self-start border-dashed" onClick={() => setVariants([...p.variants, { id: uid("v-"), label: "", stock: 0 }])}>+ talla</Button>
          <p className="text-xs text-crema/55">Solo se quita una talla cuando está a cero.</p>
        </div>

        {/* stock */}
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-noche p-4">
          <h3 className="font-semibold">mover stock</h3>
          <Segmented size="sm" value={action} onChange={pickAction}
            options={[{ value: "reponer", label: "reponer" }, { value: "regalar", label: "regalar" }, { value: "reservar", label: "reservar" }, { value: "recuento", label: "recuento" }]} />
          <div className="grid grid-cols-2 gap-3">
            {p.variants.length > 1 ? (
              <Field label="talla">{fid => (
                <Select id={fid} value={v?.id} onChange={e => { setVid(e.target.value); if (action === "recuento") setN(p.variants.find(y => y.id === e.target.value)?.stock ?? 0); }}>
                  {p.variants.map(x => <option key={x.id} value={x.id}>{x.label || "—"} · {x.stock} ud</option>)}
                </Select>
              )}</Field>
            ) : <div className="flex flex-col justify-end pb-2.5 text-sm text-crema/70">talla única · {v?.stock ?? 0} ud</div>}
            <Field label={action === "recuento" ? "hay de verdad" : "unidades"}>{fid => (
              <Input id={fid} type="number" inputMode="numeric" min={action === "recuento" ? 0 : 1} required value={n} onChange={e => setN(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="font-mono" />
            )}</Field>
          </div>
          {(action === "regalar" || action === "reservar") && (
            <Field label={action === "regalar" ? "a quién" : "para quién"}>{fid => <Input id={fid} value={who} required={action === "reservar"} placeholder={action === "regalar" ? "Ràdio Castelldefels…" : "Laura, la prima de Lars…"} onChange={e => setWho(e.target.value)} />}</Field>
          )}
          <Field label={action === "regalar" ? "por qué" : "nota"}>{fid => <Input id={fid} value={note} placeholder={action === "reponer" ? "imprenta…" : action === "recuento" ? "cuadre tras contar la caja" : ""} onChange={e => setNote(e.target.value)} />}</Field>
          {action === "recuento" && v && <p className="text-sm text-crema/70">En sistema: {v.stock}. Ajuste: <span className="font-mono">{n - v.stock > 0 ? "+" : ""}{n - v.stock}</span></p>}
          <Button type="submit" variant="primary" disabled={move.pending || !v}>
            {{ reponer: `reponer +${n}`, regalar: `regalar −${n}`, reservar: `reservar ${n}`, recuento: "guardar recuento" }[action]}
          </Button>
        </form>

        <Button variant="quiet" className="self-start" onClick={() => { patch.run({ archived: !p.archived }); toast(p.archived ? "Producto recuperado" : "Producto archivado", "ok"); if (!p.archived) onClose(); }}>
          {p.archived ? "recuperar producto" : "archivar producto"}
        </Button>
      </div>
    </Sheet>
  );
}
