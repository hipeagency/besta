/* Merch: lo que hay en la caja, lo que sale, para quién y quién lo vendió.
   Tres vistas: productos, reservas (con los pedidos de la web) y el libro
   de movimientos. El cobro en el bolo va en el modo puesto (MerchPuesto.tsx). */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs } from "@/data/selectors";
import type { MerchMove, MoveKind, Product } from "@/data/types";
import { Button, Input, Pill, Segmented, Stat } from "@/components/ui";
import { Requests } from "./merch/Requests";
import { Moves } from "./merch/Moves";
import { Reservations } from "./merch/Reservations";
import { ProductSheet, Recovery } from "./merch/ProductSheet";
import { LOW, heldOf, isOpenReserve, money, sizeLabel, stockOf, swatch } from "./merch/shared";
import { cx, eur, eur0 } from "@/lib/format";

type View = "productos" | "reservas" | "movimientos";

export default function Merch() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const { data: gigs } = useCollection("gigs");
  const { data: requests } = useCollection("requests");
  const view = (params.get("vista") as View) || "productos";
  const kind = (params.get("tipo") as MoveKind) || "";
  const editing = params.get("producto");
  const go = (p: Record<string, string>) => setParams(p, { replace: true });
  const create = useAction(async () => {
    const p: Product = { id: uid("p-"), name: "producto nuevo", priceCents: 0, costCents: 0, color: "tubo", archived: false, published: false, variants: [{ id: uid("v-"), label: "", stock: 0 }] };
    await api.insert("products", p);
    return p;
  });

  const active = products.filter(p => !p.archived);
  const bag = money(moves);
  const box = active.reduce((s, p) => s + stockOf(p, moves).box, 0);
  const value = active.reduce((s, p) => s + stockOf(p, moves).box * p.priceCents, 0);
  const held = moves.filter(isOpenReserve).reduce((s, m) => s - m.qty, 0);
  const openCount = moves.filter(isOpenReserve).length + requests.filter(r => r.status === "nueva").length;
  const next = upcomingGigs(gigs)[0];

  const stats: { label: string; value: React.ReactNode; to: Record<string, string>; sub?: string }[] = [
    { label: "invertido", value: eur0(bag.spent), to: { vista: "movimientos", tipo: "reposicion" } },
    { label: "vendido", value: eur0(bag.earned), to: { vista: "movimientos", tipo: "venta" }, sub: `${bag.sold} ud` },
    { label: "beneficio", value: <span className={bag.profit < 0 ? "text-senal-suave" : ""}>{eur0(bag.profit)}</span>, to: { vista: "movimientos", tipo: "venta" } },
    { label: "en caja", value: box, to: { vista: "productos" }, sub: `${eur0(value)} a precio de venta` },
    { label: "apartado", value: held, to: { vista: "reservas" }, sub: held ? "sin entregar" : "nada" },
  ];

  return (
    <Page
      title="merch"
      actions={<>
        <Button onClick={async () => { const p = await create.run(); go({ vista: "productos", producto: p.id }); }} disabled={create.pending}>+ producto</Button>
        <Button variant="primary" onClick={() => nav(next ? `/merch/puesto?bolo=${next.id}` : "/merch/puesto")}>
          abrir puesto{next ? ` · ${next.city}` : ""}
        </Button>
      </>}
    >
      {/* cada cifra lleva a la lista que resume */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map(s => (
          <button key={s.label} type="button" onClick={() => go(s.to)} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 transition">
            <Stat label={s.label} value={s.value} sub={s.sub} />
          </button>
        ))}
      </div>
      {bag.spent > 0 && <div className="-mt-1 max-w-xl"><Recovery bag={bag} /></div>}

      <Segmented value={view} onChange={v => go({ vista: v })} className="self-start" options={[
        { value: "productos", label: `productos · ${active.length}` },
        { value: "reservas", label: openCount ? `reservas · ${openCount}` : "reservas" },
        { value: "movimientos", label: "movimientos" },
      ]} />

      {view === "productos" && <Products onOpen={id => go({ vista: "productos", producto: id })} />}
      {view === "reservas" && (
        <div className="flex flex-wrap gap-5 items-start">
          <div className="flex-[3_1_420px] min-w-0"><Reservations /></div>
          <div className="flex-[2_1_320px] min-w-0"><Requests /></div>
        </div>
      )}
      {view === "movimientos" && <Moves kind={kind} onKind={k => go(k ? { vista: "movimientos", tipo: k } : { vista: "movimientos" })} />}

      <ProductSheet id={editing} onClose={() => go({ vista: view })} />
    </Page>
  );
}

function Products({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const needle = q.trim().toLowerCase();
  const match = (p: Product) => !needle || [p.name, p.info, ...p.variants.map(v => v.label)].join(" ").toLowerCase().includes(needle);
  const active = products.filter(p => !p.archived && match(p));
  const archived = products.filter(p => p.archived && match(p));

  return (
    <section className="flex flex-col gap-3" aria-label="Productos">
      {products.length > 4 && <Input type="search" aria-label="Buscar producto" placeholder="buscar producto…" value={q} onChange={e => setQ(e.target.value)} className="max-w-md" />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {active.map(p => <ProductCard key={p.id} p={p} moves={moves} onOpen={() => onOpen(p.id)} />)}
      </div>
      {!active.length && <p className="text-sm text-crema/60">{products.length ? "Nada coincide con la búsqueda." : "Todavía no hay productos. Empieza con «+ producto»."}</p>}
      {archived.length > 0 && (
        <button type="button" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived} className="self-start h-11 text-sm text-crema/70 hover:text-crema underline">
          {showArchived ? "ocultar archivados" : `ver archivados · ${archived.length}`}
        </button>
      )}
      {showArchived && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 opacity-60">
          {archived.map(p => <ProductCard key={p.id} p={p} moves={moves} onOpen={() => onOpen(p.id)} />)}
        </div>
      )}
    </section>
  );
}

function ProductCard({ p, moves, onOpen }: { p: Product; moves: MerchMove[]; onOpen: () => void }) {
  const s = stockOf(p, moves);
  const bag = money(moves.filter(m => m.productId === p.id));
  return (
    <button type="button" onClick={onOpen} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 flex flex-col gap-3 transition" aria-label={`Abrir ${p.name}`}>
      <span className="flex items-start gap-3">
        <span className={cx("size-11 shrink-0 rounded-xl", swatch[p.color])} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="flex justify-between items-baseline gap-2">
            <span className="font-semibold truncate">{p.name}</span>
            <span className="font-mono shrink-0">{eur(p.priceCents)}</span>
          </span>
          <span className="block text-xs text-crema/60 truncate">{p.info || (p.variants.length > 1 ? `${p.variants.length} tallas` : "talla única")}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {p.variants.map(v => {
          const h = heldOf(moves, v.id);
          return (
            <span key={v.id} className={cx("min-w-12 px-2 py-1.5 rounded-[10px] text-center font-mono text-xs leading-tight", v.stock <= LOW ? "bg-senal text-noche" : "bg-noche text-crema")}
              title={`${sizeLabel(v, p)}: ${v.stock} libres${h ? `, ${h} apartadas` : ""}`}>
              {sizeLabel(v, p)}<br /><b className="font-medium">{v.stock}</b>{h ? <span className="opacity-70">+{h}</span> : null}
            </span>
          );
        })}
      </span>
      <span className="grid grid-cols-3 gap-2 pt-2 border-t border-crema/8 text-xs">
        <span><span className="block text-crema/55">en caja</span><span className="font-mono text-sm">{s.box}</span></span>
        <span><span className="block text-crema/55">apartado</span><span className="font-mono text-sm">{s.held || "—"}</span></span>
        <span><span className="block text-crema/55">beneficio</span><span className={cx("font-mono text-sm", bag.profit < 0 && "text-senal-suave")}>{eur0(bag.profit)}</span></span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {!p.archived && !p.published && <Pill>oculto en la web</Pill>}
        {s.free <= 0 && <Pill>agotado</Pill>}
      </span>
    </button>
  );
}
