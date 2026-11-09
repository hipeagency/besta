/* El rider tal y como le llega a la sala: papel crema, solo los
   bloques encendidos y en su orden. Es lo único que se imprime.
   En la suite, pinchar un bloque del papel lo abre en el editor. */
import type { Rider, RiderGear, RiderInput, StagePos } from "@/data/types";
import { cx } from "@/lib/format";
import { StagePlot } from "./StagePlot";

/** Canales reales: un «L/R» o un «×2» ocupa dos. */
export const channels = (inputs: RiderInput[]) =>
  inputs.reduce((n, i) => n + (/L\/R|×\s?2|x2/i.test(i.source + " " + i.mic) ? 2 : 1), 0);

/** Material agrupado por persona, en orden de aparición; lo común («banda») y lo que pone la sala, al final. */
function byOwner(gear: RiderGear[]) {
  const rank = (o: string) => (/^sala$/i.test(o) ? 2 : /^banda$/i.test(o) ? 1 : 0);
  const groups = new Map<string, RiderGear[]>();
  for (const g of gear) {
    if (!g.item.trim()) continue;
    const o = g.owner.trim() || "sin asignar";
    groups.set(o, [...(groups.get(o) ?? []), g]);
  }
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]));
}
const ownerTitle = (o: string) => (/^sala$/i.test(o) ? "lo pone la sala" : /^banda$/i.test(o) ? "banda (común)" : o);

export function RiderDoc({ rider, onStage, selected, onSelect }: {
  rider: Rider; onStage?: (next: StagePos[]) => void;
  selected?: string; onSelect?: (blockId: string) => void;
}) {
  const blocks = rider.blocks.filter(b => b.enabled);
  return (
    <article id="rider-doc" aria-label="Vista previa del rider"
      className="papel bg-crema text-noche rounded-md p-5 sm:p-9 flex flex-col gap-[22px] shadow-[0_30px_60px_rgba(0,0,0,.4)]">
      <header className="flex flex-wrap justify-between items-end gap-3 border-b-2 border-noche pb-3.5">
        <div>
          <p className="font-mono text-[11px] tracking-[.16em]">RIDER TÉCNICO · {rider.name.toUpperCase()} · v{rider.version}</p>
          {/* Logo en tinta: el papel es claro y los filtros CSS no siempre se imprimen. */}
          <img src="/img/logo-tinta.png" alt="besta" width={144} height={44} className="mt-2 h-11 w-auto" />
        </div>
        <p className="font-mono text-[11px]">{rider.stage.length} músicos · {channels(rider.inputs)} canales</p>
      </header>

      {blocks.map(b => (
        <section key={b.id} onClick={onSelect ? () => onSelect(b.id) : undefined}
          className={cx("flex flex-col gap-2 break-inside-avoid rounded-sm outline-offset-[6px] print:outline-none",
            onSelect && "cursor-pointer hover:outline hover:outline-1 hover:outline-noche/25",
            selected === b.id && "outline outline-2 outline-senal")}>
          <h2 className="font-mono font-medium text-xs tracking-[.14em] flex items-center gap-2">
            <span className="w-3 h-[3px] bg-senal" aria-hidden="true" />
            {b.name.toUpperCase()}{b.id === "plano" && rider.stageSize ? ` · ${rider.stageSize}` : ""}
          </h2>
          {b.id === "inputs" ? (
            <InputTable inputs={rider.inputs} />
          ) : b.id === "plano" ? (
            <StagePlot stage={rider.stage} onChange={onStage} />
          ) : b.id === "material" ? (
            <GearList gear={rider.gear ?? []} />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-line">{b.body || "—"}</p>
          )}
        </section>
      ))}
      {!blocks.length && <p className="text-sm text-noche/60">Todos los bloques están ocultos.</p>}
    </article>
  );
}

/* Las columnas vacías en todos los canales (p. ej. «pie» con todo a línea) no se imprimen. */
function InputTable({ inputs }: { inputs: RiderInput[] }) {
  const stand = inputs.some(i => i.stand.trim());
  const dest = inputs.some(i => i.dest?.trim());
  const th = "px-1 py-1.5 font-medium";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] min-w-[360px]">
        <thead>
          <tr className="text-left font-mono text-[10px] tracking-[.08em]">
            <th className={`${th} w-10`}>CH</th><th className={th}>FUENTE</th><th className={th}>MIC / DI</th>
            {stand && <th className={th}>PIE</th>}{dest && <th className={th}>DESTINO</th>}
          </tr>
        </thead>
        <tbody>
          {inputs.map((i, n) => (
            <tr key={n} className="border-t border-noche/15">
              <td className="px-1 py-1.5 font-mono">{i.ch}</td><td className="px-1 py-1.5">{i.source}</td>
              <td className="px-1 py-1.5">{i.mic}</td>
              {stand && <td className="px-1 py-1.5">{i.stand}</td>}
              {dest && <td className={cx("px-1 py-1.5 text-[12px]", /no\s*pa|solo/i.test(i.dest ?? "") && "font-semibold")}>{i.dest}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GearList({ gear }: { gear: RiderGear[] }) {
  const groups = byOwner(gear);
  if (!groups.length) return <p className="text-sm">—</p>;
  return (
    <div className="sm:columns-2 print:columns-2 gap-8">
      {groups.map(([owner, items]) => (
        <div key={owner} className="break-inside-avoid mb-3">
          <h3 className="font-mono text-[10px] tracking-[.12em] uppercase border-b border-noche/30 pb-1 mb-1">{ownerTitle(owner)}</h3>
          <ul className="text-[13px]">
            {items.map(g => (
              <li key={g.id} className="flex gap-2 py-[3px]">
                <span className="font-mono w-7 shrink-0 text-right">{g.qty}×</span>
                <span>{g.item}{g.note ? <span className="text-noche/60"> · {g.note}</span> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
