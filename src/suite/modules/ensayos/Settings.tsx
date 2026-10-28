/* Ajustes de ensayos (⚙): notación, diagramas, tema, directo sin
   internet y cuenta. Todo es de este aparato salvo la sesión. */
import { useEffect, type ReactNode } from "react";
import { useCollection } from "@/data/hooks";
import { Button, Segmented, Sheet, useToast } from "@/components/ui";
import { ago } from "@/lib/format";
import { useTheme, type ThemePref } from "@/suite/theme";
import { useMe } from "@/suite/session";
import { readOffline, useOfflineAt, useOnline, usePase, useView, writeOffline, type Pase } from "./lib";

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 py-4 border-b border-crema/8 last:border-0">
      <h3 className="font-mono text-[11px] tracking-[.12em] uppercase text-crema/60">{label}</h3>
      {children}
      {hint && <p className="text-[13px] text-crema/65 leading-snug">{hint}</p>}
    </section>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { latin, setLatin, diagrams, setDiagrams } = useView();
  const { pref, setPref } = useTheme();
  const { me, logout } = useMe();
  const [pase, setPase] = usePase();
  const { data: songs } = useCollection("songs");
  const { data: setlists } = useCollection("setlists");
  const offlineAt = useOfflineAt();
  const toast = useToast();

  const prepare = () => {
    if (writeOffline(songs, setlists)) toast("Directo preparado en este aparato", "ok");
    else toast("No cabe en este navegador", "error");
  };

  return (
    <Sheet open={open} onClose={onClose} title="ajustes">
      <Row label="notación de acordes">
        <Segmented value={latin ? "latino" : "ingles"} onChange={v => setLatin(v === "latino")} options={[
          { value: "ingles", label: <span className="font-mono">C D E</span> }, { value: "latino", label: <span className="font-mono">Do Re Mi</span> },
        ]} />
      </Row>
      <Row label="diagramas de acordes" hint="cada uno ve los de su instrumento: guitarra, teclado o bajo. la batería no.">
        <Segmented value={diagrams ? "si" : "no"} onChange={v => setDiagrams(v === "si")} options={[
          { value: "no", label: "ocultos" }, { value: "si", label: "mostrar" },
        ]} />
      </Row>
      <Row label="tema">
        <Segmented<ThemePref> value={pref} onChange={setPref} options={[
          { value: "auto", label: "automático" }, { value: "claro", label: "claro" }, { value: "oscuro", label: "oscuro" },
        ]} />
      </Row>
      <Row label="modo directo" hint="por estrofas: una sección a pantalla completa; pasa tocando, con flechas o con el pedal.">
        <Segmented<Pase> value={pase} onChange={setPase} options={[
          { value: "continuo", label: "scroll continuo" }, { value: "estrofas", label: "por estrofas" },
        ]} />
      </Row>
      <Row label="directo sin internet" hint="guarda una copia de canciones y setlists en este aparato para tocar sin cobertura.">
        <Button variant="ghost" block onClick={prepare} disabled={!songs.length}>preparar directo</Button>
        <p role="status" className="font-mono text-xs text-crema/70">
          {offlineAt ? <>preparado · {ago(offlineAt)} · {readOffline()?.songs.length ?? 0} canciones</> : "sin preparar"}
        </p>
      </Row>
      <Row label="cuenta">
        <p className="text-[15px]">{me.name} <span className="font-mono text-xs text-crema/60">{me.instrument}</span></p>
        <Button variant="ghost" block onClick={() => { onClose(); logout(); }}>cerrar sesión</Button>
      </Row>
    </Sheet>
  );
}

/** Si el directo está preparado, la copia se mantiene al día sola mientras hay conexión. */
export function useKeepOfflineFresh() {
  const { data: songs, loading: l1 } = useCollection("songs");
  const { data: setlists, loading: l2 } = useCollection("setlists");
  const online = useOnline();
  useEffect(() => {
    if (l1 || l2 || !online || !readOffline()) return;
    const t = setTimeout(() => writeOffline(songs, setlists), 1500);
    return () => clearTimeout(t);
  }, [songs, setlists, online, l1, l2]);
}
