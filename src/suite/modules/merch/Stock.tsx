/* Stock: todo lo que queda, de todos los productos, en una sola tabla.
   Se descuenta solo con cada venta (puesto, oficina y web) y cada
   reserva. Si algo no cuadra con la caja de verdad, se corrige aquí el
   número de «en caja»: queda apuntado como recuento (no toca el dinero).
   Si lo contado no llega para lo apartado, esas reservas pasan a
   encargo («faltan N por pedir»). */
import { useState } from "react";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import type { Product, Variant } from "@/data/types";
import { Button, Input, useToast } from "@/components/ui";
import { LOW, heldOf, sizeLabel, stockOf, swatch } from "./shared";
import { cx } from "@/lib/format";

export function Stock({ onOpen }: { onOpen: (id: string) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const active = products.filter(p => !p.archived);
  const boxOf = (v: Variant) => v.stock + heldOf(moves, v.id);
  // Solo cuenta como cambio lo que difiere de lo que hay ahora.
  const changes = active.flatMap(p => p.variants.filter(v => v.id in edits && edits[v.id] !== boxOf(v)).map(v => ({ p, v, to: edits[v.id] })));

  const save = useAction(async () => {
    for (const { p, v, to } of changes) {
      const diff = to - boxOf(v);
      if (diff) await api.moveStock({ productId: p.id, variantId: v.id, kind: "recuento", qty: diff, unitCents: 0, by: me.name, note: note.trim() || "corregido en stock" });
    }
  });

  async function submit() {
    try { await save.run(); } catch (e) { toast((e as Error).message, "error"); return; }
    toast(changes.length === 1 ? "Stock corregido" : `${changes.length} tallas corregidas`, "ok");
    setEdits({}); setNote("");
  }

  if (!active.length) return <p className="text-sm text-crema/60">Todavía no hay productos.</p>;

  return (
    <section className="flex flex-col gap-4" aria-label="Stock">
      <p className="text-sm text-crema/70 max-w-2xl">
        Lo que queda de cada cosa. Baja solo con cada venta (puesto, oficina y web) y cada reserva. Si algo no cuadra con la caja,
        cambia el número de <b className="text-crema">en caja</b> y guarda: queda apuntado como recuento, sin tocar el dinero.
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
        {active.map(p => <ProductStock key={p.id} p={p} boxOf={boxOf} heldOf={(id: string) => heldOf(moves, id)} edits={edits}
          onEdit={(id, n) => setEdits(e => ({ ...e, [id]: n }))} onOpen={() => onOpen(p.id)} total={stockOf(p, moves).box} />)}
      </div>

      {changes.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[18px] bg-crema text-noche p-3 pl-4 shadow-lg">
          <span className="text-sm font-semibold">{changes.length} {changes.length === 1 ? "cambio" : "cambios"}</span>
          <Input aria-label="Motivo del cambio" placeholder="motivo (opcional): contado tras el bolo…" value={note} onChange={e => setNote(e.target.value)}
            className="flex-1 min-w-[180px] bg-white text-noche" />
          <button type="button" className="h-9 px-3 text-sm underline text-noche/75 hover:text-noche" onClick={() => { setEdits({}); setNote(""); }} disabled={save.pending}>deshacer</button>
          <Button size="sm" variant="dark" onClick={submit} disabled={save.pending}>{save.pending ? "guardando…" : "guardar"}</Button>
        </div>
      )}
    </section>
  );
}

function ProductStock({ p, boxOf, heldOf, edits, onEdit, onOpen, total }: {
  p: Product; boxOf: (v: Variant) => number; heldOf: (id: string) => number; edits: Record<string, number>;
  onEdit: (variantId: string, n: number) => void; onOpen: () => void; total: number;
}) {
  return (
    <div className="rounded-[18px] bg-tubo p-4 flex flex-col gap-2">
      <button type="button" onClick={onOpen} className="flex items-center gap-3 text-left hover:underline" aria-label={`Abrir ${p.name}`}>
        <span className={cx("size-8 shrink-0 rounded-lg", swatch[p.color])} aria-hidden="true" />
        <span className="flex-1 font-semibold truncate">{p.name}</span>
        <span className="font-mono text-sm text-crema/70">{total} en caja</span>
      </button>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[12px] text-crema/60">
          <th className="font-normal py-1">talla</th>
          <th className="font-normal text-right">en caja</th>
          <th className="font-normal text-right">apartado</th>
          <th className="font-normal text-right">libre</th>
        </tr></thead>
        <tbody className="font-mono">
          {p.variants.map(v => {
            const box = boxOf(v), held = heldOf(v.id);
            const value = edits[v.id] ?? box;
            const changed = value !== box;
            // Lo libre tal y como quedaría con el número nuevo.
            const free = value - held;
            return (
              <tr key={v.id} className="border-t border-crema/8">
                <td className="py-1.5 font-sans">{sizeLabel(v, p)}</td>
                <td className="text-right">
                  <Input type="number" inputMode="numeric" min={0} value={value} aria-label={`${p.name} ${sizeLabel(v, p)}: unidades en caja`}
                    onChange={e => onEdit(v.id, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className={cx("ml-auto w-20 h-9 text-right font-mono", changed && "ring-2 ring-senal")} />
                </td>
                <td className={cx("text-right", held ? "text-crema" : "text-crema/40")}>{held || "—"}</td>
                <td className={cx("text-right", free <= LOW && "text-senal-suave")}>
                  {free < 0 ? <span className="font-sans">faltan {-free}</span> : free}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {p.variants.some(v => v.id in edits && edits[v.id] - heldOf(v.id) < Math.min(0, v.stock)) && (
        <p className="text-xs text-crema/65">Lo contado no llega para lo apartado: esas reservas quedan como encargo, por pedir.</p>
      )}
    </div>
  );
}
