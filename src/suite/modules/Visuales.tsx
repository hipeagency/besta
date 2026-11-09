/* Visuales: el estudio del muro CRT y la portada flotante (ahora dentro
   de la suite, en /visuales/estudio), los videolyrics y, cuando haya
   backend, las sesiones guardadas por bolo. */
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useCollection } from "@/data/hooks";
import { upcomingGigs } from "@/data/selectors";
import { Card, CardTitle, Pill } from "@/components/ui";
import { dateLabel, daysUntil } from "@/lib/format";
import { useMedia } from "./composicion/audio";
import { Icon } from "@/components/ui/icons";

export default function Visuales() {
  const { data: gigs } = useCollection("gigs");
  const desktop = useMedia("(min-width: 1024px)");
  const next = upcomingGigs(gigs).slice(0, 6);

  return (
    <Page title="visuales" kicker="MURO CRT">
      <Link to="/visuales/estudio" className="group relative block rounded-[20px] overflow-hidden bg-marco p-2">
        <div className="relative rounded-[14px] bg-noche aspect-[21/9] max-h-[360px] w-full grid place-items-center text-center p-6 vig">
          <span className="scan absolute inset-0" />
          <div className="relative flex flex-col items-center gap-3">
            <p className="font-mono text-[11px] text-senal tracking-wider">ESTUDIO</p>
            <p className="text-3xl font-extrabold tracking-[-.02em]">muro CRT · portada flotante</p>
            <p className="text-sm text-crema/70 max-w-[440px]">
              La pared de teles con lo que emite cada pantalla, o la portada con elementos a la deriva. Exporta en vídeo, PNG o GIF.
              {!desktop && " Mejor desde el ordenador."}
            </p>
            <span className="inline-flex items-center gap-2 h-11 px-[18px] rounded-full bg-senal text-noche font-semibold text-[15px] group-hover:brightness-110">
              abrir estudio <Icon name="flecha" size={14} />
            </span>
          </div>
        </div>
      </Link>

      <Card>
        <CardTitle action={<Pill tone="senal">nuevo</Pill>}>videolyrics</CardTitle>
        <p className="text-sm text-crema/70 mb-3 max-w-[640px]">
          Vídeos con la letra para las pantallas del directo, que duran exactamente lo mismo que la pista de Ableton.
          Primer paso: sincronizar la letra de cada canción con su pista.
        </p>
        <Link to="/visuales/letra" className="inline-flex items-center gap-2 h-11 px-[18px] rounded-full bg-crema text-noche font-semibold text-[15px] hover:brightness-95">
          sincronizar letras <Icon name="flecha" size={14} />
        </Link>
      </Card>

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
