/* Visuales: el estudio del muro CRT ya existe y funciona; no se
   reescribe. Aquí se abre (o se ve incrustado en ordenador) y se
   prepara el sitio para guardar sesiones por bolo cuando haya backend. */
import { useState } from "react";
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useCollection } from "@/data/hooks";
import { upcomingGigs } from "@/data/selectors";
import { Button, Card, CardTitle, Pill, Toggle } from "@/components/ui";
import { dateLabel, daysUntil } from "@/lib/format";
import { useMedia } from "./composicion/audio";

const STUDIO = "/suite/estudio-visuales.html";

export default function Visuales() {
  const { data: gigs } = useCollection("gigs");
  const desktop = useMedia("(min-width: 1024px)");
  const [embed, setEmbed] = useState(true);
  const next = upcomingGigs(gigs).slice(0, 6);

  const open = (
    <a href={STUDIO} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-full bg-senal text-noche font-semibold text-[15px] whitespace-nowrap hover:brightness-110">
      abrir estudio ↗
    </a>
  );

  return (
    <Page title="visuales" kicker="MURO CRT" actions={<>
      {desktop && <Toggle checked={embed} onChange={setEmbed} label="ver aquí" />}
      {open}
    </>}>
      <p className="-mt-2 max-w-[640px] text-crema/75 leading-relaxed">
        Es el estudio de siempre: muro de teles, texturas, portada y exportar en GIF o vídeo. Se abre tal cual, con sus propios controles.
      </p>

      {desktop ? (
        embed && (
          <div className="relative rounded-[20px] overflow-hidden bg-marco p-2">
            <iframe src={STUDIO} title="Estudio de visuales (muro CRT)" className="w-full h-[80vh] rounded-[14px] bg-noche border-0" allow="fullscreen" />
          </div>
        )
      ) : (
        <div className="relative rounded-[20px] overflow-hidden bg-marco p-2">
          <div className="relative rounded-[14px] bg-noche aspect-[4/3] grid place-items-center text-center p-6 vig">
            <span className="scan absolute inset-0" />
            <div className="relative flex flex-col items-center gap-3">
              <p className="text-2xl font-bold tracking-[-.02em]">solo en ordenador</p>
              <p className="text-sm text-crema/70 max-w-[260px]">El estudio necesita pantalla grande y ratón. Ábrelo desde el portátil.</p>
              {open}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardTitle action={<Pill>pronto</Pill>}>sesiones por bolo</CardTitle>
        <p className="text-sm text-crema/70 mb-3">Guardar una sesión del muro para cada concierto llega con el backend. Mientras, exporta desde el estudio.</p>
        <ul className="flex flex-col gap-1.5">
          {next.map(g => {
            const d = daysUntil(g.date);
            return (
              <li key={g.id}>
                <Link to={`/bolos/${g.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-11 px-3 py-2 rounded-xl bg-noche hover:bg-crema/5">
                  <span className="w-[104px] font-mono text-xs tracking-wider text-crema/75">{dateLabel(g.date)}</span>
                  <span className="flex-1 min-w-0 truncate">{g.city} <span className="text-crema/60">· {g.venue}</span></span>
                  <span className="font-mono text-[11px] text-crema/55">{d === 0 ? "hoy" : `en ${d} d`} · sin sesión</span>
                </Link>
              </li>
            );
          })}
          {!next.length && <li className="text-sm text-crema/60">No hay bolos a la vista.</li>}
        </ul>
      </Card>
    </Page>
  );
}
