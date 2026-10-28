/* Piezas pequeñas que comparten las pantallas de ensayos. */
import { useIsMutating } from "@tanstack/react-query";
import { useCollection } from "@/data/hooks";
import { Dot, Select } from "@/components/ui";
import { cx, dateShort, hhmm } from "@/lib/format";
import { useLastSong, useOfflineAt, useOnline, useView } from "./lib";

/** Canción que se abre sin elegir: la última vista o la primera. */
export function useFallbackSongId() {
  const { data: songs } = useCollection("songs");
  const [last] = useLastSong();
  return (last && songs.some(s => s.id === last) ? last : [...songs].sort((x, y) => x.title.localeCompare(y.title, "es"))[0]?.id);
}

/** Punto + texto: guardado / guardando / sin conexión. */
export function SaveStatus({ className }: { className?: string }) {
  const online = useOnline();
  const saving = useIsMutating() > 0;
  const copyAt = useOfflineAt();
  const offline = copyAt ? `sin conexión · usando la copia del ${dateShort(copyAt)} ${hhmm(copyAt)}` : "sin conexión · se guarda aquí";
  return (
    <span role="status" className={cx("inline-flex items-center gap-1.5 font-mono text-[11px] text-crema/70 min-w-0", className)}>
      <Dot tone={online ? "ok" : "error"} />
      <span className="truncate">{!online ? offline : saving ? "guardando…" : "guardado"}</span>
    </span>
  );
}

/** «ver como»: la canción con las notas y acordes de otro miembro. */
export function VerComo({ className, compact }: { className?: string; compact?: boolean }) {
  const { viewAs, setViewAs } = useView();
  const { data: members } = useCollection("members");
  return (
    <label className={cx("flex items-center gap-2 text-sm text-crema/75", className)}>
      <span className={cx(compact && "sr-only")}>ver como</span>
      <Select value={viewAs} onChange={e => setViewAs(e.target.value)} className={cx("w-auto font-medium", compact ? "h-11 text-sm" : "h-10")}>
        {members.map(m => <option key={m.id} value={m.id}>{m.name} · {m.instrument}</option>)}
      </Select>
    </label>
  );
}
