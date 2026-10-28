/* El libro de la caja: todo lo que ha entrado y salido, por días. */
import { useState } from "react";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import type { Gig, MerchMove, MoveKind, Product } from "@/data/types";
import { Button, Card, Input, Select, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { KIND_LABEL, byDay, haystack, itemName, moveCents } from "./shared";
import { cx, dateShort, eur, hhmm } from "@/lib/format";

export const gigName = (gigs: Gig[], id?: string) => { const g = gigs.find(x => x.id === id); return g ? `${g.city} ${dateShort(g.date)}` : ""; };

const CHIPS: ["" | MoveKind, string][] = [["", "todo"], ["venta", "ventas"], ["reserva", "reservas"], ["reposicion", "reposiciones"], ["regalo", "regalos"], ["recuento", "recuentos"]];

export function Moves({ kind, onKind }: { kind: "" | MoveKind; onKind: (k: "" | MoveKind) => void }) {
  const { data: moves } = useCollection("moves");
  const { data: products } = useCollection("products");
  const { data: gigs } = useCollection("gigs");
  const [q, setQ] = useState("");
  const [gig, setGig] = useState("");
  const [limit, setLimit] = useState(60);
  const gigsWithMoves = gigs.filter(g => moves.some(m => m.gigId === g.id)).sort((a, b) => b.date.localeCompare(a.date));
  const needle = q.trim().toLowerCase();
  const list = moves
    .filter(m => !kind || m.kind === kind)
    .filter(m => !gig || (gig === "-" ? !m.gigId : m.gigId === gig))
    .filter(m => !needle || haystack(m, products.find(p => p.id === m.productId), gigName(gigs, m.gigId)).includes(needle))
    .sort((a, b) => b.at.localeCompare(a.at));
  const shown = list.slice(0, limit);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input type="search" aria-label="Buscar movimientos" placeholder="buscar por persona, producto, bolo, nota…" value={q} onChange={e => setQ(e.target.value)} className="flex-[2_1_260px]" />
        <Select aria-label="Filtrar por bolo" value={gig} onChange={e => setGig(e.target.value)} className="flex-[1_1_180px]">
          <option value="">todos los bolos</option>
          <option value="-">fuera de bolo</option>
          {gigsWithMoves.map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de movimiento">
        {CHIPS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => onKind(k)}
            className={cx("h-9 px-3.5 rounded-full text-sm transition", kind === k ? "bg-crema text-noche font-semibold" : "border border-crema/20 text-crema/80 hover:border-crema/40")}>{label}</button>
        ))}
      </div>
      <Card className="!p-4">
        {!list.length && <p className="py-3 text-sm text-crema/60">{moves.length ? "Nada coincide con estos filtros." : "Todavía no hay movimientos."}</p>}
        {byDay(shown).map(d => (
          <div key={d.key}>
            <h3 className="pt-3 pb-1 font-mono text-[11px] tracking-[.12em] text-crema/55 uppercase">{d.label}</h3>
            <ul>{d.rows.map(m => <MoveRow key={m.id} m={m} p={products.find(p => p.id === m.productId)} gigs={gigs} />)}</ul>
          </div>
        ))}
        {list.length > limit && <Button size="sm" variant="quiet" onClick={() => setLimit(l => l + 60)} className="mt-2">ver más · quedan {list.length - limit}</Button>}
      </Card>
    </div>
  );
}

/** Una línea del libro. En la ficha del producto sobra repetir el nombre (`sizeOnly`). */
export function MoveRow({ m, p, gigs, sizeOnly }: { m: MerchMove; p?: Product; gigs: Gig[]; sizeOnly?: boolean }) {
  const toast = useToast();
  const remove = useAction((id: string) => api.deleteMove(id));
  const v = p?.variants.find(x => x.id === m.variantId);
  const n = Math.abs(m.qty);
  const what = sizeOnly ? (v?.label || "") : itemName(p, v);
  const meta = [
    hhmm(m.at), m.customer, gigName(gigs, m.gigId), m.payment, m.by && `atendió ${m.by}`, m.note,
    m.reservedAt && `reservado el ${dateShort(m.reservedAt.slice(0, 10))}`,
  ].filter(Boolean).join(" · ");
  const amount = m.kind === "venta" || m.kind === "reserva" ? eur(moveCents(m))
    : m.kind === "reposicion" && m.unitCents ? `−${eur(m.qty * m.unitCents)}` : "";

  async function del() {
    const undo = m.qty < 0 ? `vuelven ${n} al stock` : `se quitan ${n} del stock`;
    if (!confirm(`¿Borrar este apunte (${KIND_LABEL[m.kind]} ${n} × ${itemName(p, v)})? Al borrarlo ${undo}.`)) return;
    try { await remove.run(m.id); toast("Apunte borrado", "ok"); } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <li className="flex items-center gap-3 py-2.5 border-t border-crema/8 text-sm group">
      <span className={cx("w-[86px] shrink-0 font-mono text-[11px] uppercase tracking-wider",
        m.kind === "venta" ? "text-senal" : m.kind === "reserva" ? "text-crema" : "text-crema/60")}>
        {KIND_LABEL[m.kind]}{m.open ? " ●" : ""}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block"><b className="font-medium">{m.qty > 0 ? "+" : ""}{m.qty > 0 ? m.qty : n}×</b>{what ? ` ${what}` : ""}</span>
        <span className="block text-xs text-crema/60">{meta}</span>
      </span>
      <span className="font-mono text-[13px] whitespace-nowrap text-crema/85">{amount}</span>
      {!m.open && (
        <button type="button" onClick={del} disabled={remove.pending} aria-label={`Borrar apunte: ${KIND_LABEL[m.kind]} ${itemName(p, v)}`}
          className="size-9 shrink-0 rounded-full grid place-items-center text-crema/45 hover:text-crema hover:bg-crema/10 sm:opacity-0 group-hover:opacity-100 focus:opacity-100">
          <Icon name="x" size={14} />
        </button>
      )}
    </li>
  );
}
