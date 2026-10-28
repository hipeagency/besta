/* El rider tal y como le llega a la sala: papel crema, solo los
   bloques encendidos y en su orden. Es lo único que se imprime.
   En la suite, pinchar un bloque del papel lo abre en el editor. */
import type { Rider, RiderInput, StagePos } from "@/data/types";
import { cx } from "@/lib/format";
import { StagePlot } from "./StagePlot";

/** Canales reales: un «L/R» o un «×2» ocupa dos. */
export const channels = (inputs: RiderInput[]) =>
  inputs.reduce((n, i) => n + (/L\/R|×\s?2|x2/i.test(i.source + " " + i.mic) ? 2 : 1), 0);

export function RiderDoc({ rider, onStage, selected, onSelect }: {
  rider: Rider; onStage?: (next: StagePos[]) => void;
  selected?: string; onSelect?: (blockId: string) => void;
}) {
  const blocks = rider.blocks.filter(b => b.enabled);
  return (
    <article id="rider-doc" aria-label="Vista previa del rider"
      className="bg-crema text-noche rounded-md p-5 sm:p-9 flex flex-col gap-[22px] shadow-[0_30px_60px_rgba(0,0,0,.4)]">
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px] min-w-[360px]">
                <thead>
                  <tr className="text-left font-mono text-[10px] tracking-[.08em]">
                    <th className="px-1 py-1.5 font-medium w-10">CH</th><th className="px-1 py-1.5 font-medium">FUENTE</th>
                    <th className="px-1 py-1.5 font-medium">MIC / DI</th><th className="px-1 py-1.5 font-medium">PIE</th>
                  </tr>
                </thead>
                <tbody>
                  {rider.inputs.map((i, n) => (
                    <tr key={n} className="border-t border-noche/15">
                      <td className="px-1 py-1.5 font-mono">{i.ch}</td><td className="px-1 py-1.5">{i.source}</td>
                      <td className="px-1 py-1.5">{i.mic}</td><td className="px-1 py-1.5">{i.stand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : b.id === "plano" ? (
            <StagePlot stage={rider.stage} onChange={onStage} />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-line">{b.body || "—"}</p>
          )}
        </section>
      ))}
      {!blocks.length && <p className="text-sm text-noche/60">Todos los bloques están ocultos.</p>}
    </article>
  );
}
