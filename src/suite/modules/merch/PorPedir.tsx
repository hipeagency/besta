/* Por pedir: lo que la gente quiere y no tenemos. Sale de dos sitios:
   reservas apuntadas sin stock (encargos: ya son una deuda, con nombre) y
   pedidos de la web sin apartar de tallas agotadas. Sirve para decidir la
   próxima tirada: «camiseta tele: S faltan 2, M falta 1». Al reponer, lo
   que entra cubre los encargos por orden de llegada. */
import { useCollection } from "@/data/hooks";
import type { MerchMove, MerchRequest, Product, Variant } from "@/data/types";
import { coverage, freeOf, isOpenReserve, shortOf, sizeLabel, swatch } from "./shared";
import { cx } from "@/lib/format";

interface Line { p: Product; v: Variant; owed: { m: MerchMove; n: number }[]; web: MerchRequest[]; short: number; asked: number }

export function usePorPedir() {
  const { data: products } = useCollection("products");
  const { data: moves } = useCollection("moves");
  const { data: requests } = useCollection("requests");
  const missing = coverage(products, moves);
  const lines: Line[] = [];
  for (const p of products) for (const v of p.variants) {
    const owed = moves.filter(m => m.variantId === v.id && isOpenReserve(m) && (missing.get(m.id) ?? 0) > 0)
      .sort((a, b) => a.at.localeCompare(b.at)).map(m => ({ m, n: missing.get(m.id)! }));
    // Pedidos web sin apartar que no caben en lo libre: también es demanda.
    let free = freeOf(v);
    const web = requests.filter(r => r.variantId === v.id && r.status === "nueva")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .filter(r => { if (r.qty <= free) { free -= r.qty; return false; } return true; });
    const asked = web.reduce((s, r) => s + r.qty, 0);
    if (shortOf(v) || asked) lines.push({ p, v, owed, web, short: shortOf(v), asked });
  }
  return { lines, units: lines.reduce((s, l) => s + l.short + l.asked, 0) };
}

export function PorPedir({ onOpen }: { onOpen: (id: string) => void }) {
  const { lines, units } = usePorPedir();
  if (!lines.length) return (
    <p className="rounded-[18px] border border-dashed border-crema/20 p-6 text-center text-sm text-crema/65">
      No falta nada. Si reserváis algo que no hay, o lo piden desde la web agotado, sale aquí para la próxima tirada.
    </p>
  );

  const byProduct = new Map<string, Line[]>();
  for (const l of lines) byProduct.set(l.p.id, [...(byProduct.get(l.p.id) ?? []), l]);

  return (
    <section className="flex flex-col gap-3" aria-label="Por pedir">
      <p className="text-sm text-crema/70 max-w-2xl">
        {units} {units === 1 ? "unidad" : "unidades"} por pedir. Al reponer, lo que entra cubre primero los encargos, por orden de llegada, y entonces ya se pueden entregar.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
        {[...byProduct.values()].map(ls => {
          const p = ls[0].p;
          return (
            <button key={p.id} type="button" onClick={() => onOpen(p.id)} aria-label={`Abrir ${p.name}`}
              className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 flex flex-col gap-3 transition">
              <span className="flex items-center gap-3">
                <span className={cx("size-9 shrink-0 rounded-lg", swatch[p.color])} aria-hidden="true" />
                <span className="font-semibold truncate">{p.name}</span>
              </span>
              <ul className="flex flex-col">
                {ls.map(l => (
                  <li key={l.v.id} className="py-2 border-t border-crema/8 flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{sizeLabel(l.v, p)}</span>
                      <span className="font-mono text-senal-suave">{l.short + l.asked} por pedir</span>
                    </span>
                    {l.owed.length > 0 && (
                      <span className="text-xs text-crema/70">
                        encargos: {l.owed.map(o => `${o.m.customer ?? "sin nombre"}${o.n > 1 ? ` (${o.n})` : ""}`).join(", ")}
                      </span>
                    )}
                    {l.web.length > 0 && (
                      <span className="text-xs text-crema/60">
                        pedidos web sin apartar: {l.web.map(r => `${r.name}${r.qty > 1 ? ` (${r.qty})` : ""}`).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
