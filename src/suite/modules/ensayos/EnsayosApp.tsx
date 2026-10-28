/* Ensayos: modo propio a pantalla completa, fuera del marco de la
   suite. Biblioteca | canción | contexto en escritorio; en móvil la
   biblioteca y la canción son pantallas separadas. El modo directo
   es otra pantalla negra aparte. */
import { useEffect, useState } from "react";
import { Link, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { Button, IconButton } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { SaveStatus, VerComo, useFallbackSongId } from "./parts";
import { Library, type LibraryTab } from "./Library";
import { SongRoute } from "./SongView";
import { SetlistEditor } from "./Setlists";
import { Directo } from "./Directo";
import { SettingsSheet, useKeepOfflineFresh } from "./Settings";
import { useConcert } from "./lib";

export default function EnsayosApp() {
  return (
    <Routes>
      <Route path="directo/cancion/:songId" element={<Directo />} />
      <Route path="directo/:setlistId" element={<Directo />} />
      <Route element={<Workspace />}>
        <Route index element={<SongRoute />} />
        <Route path="setlists" element={<SongRoute />} />
        <Route path="setlists/:id" element={<SetlistEditor />} />
        <Route path=":songId" element={<SongRoute />} />
      </Route>
    </Routes>
  );
}

/** Lo que hay abierto según la URL (relativa a /ensayos). */
function useWhere() {
  const rest = useLocation().pathname.replace(/^\/ensayos\/?/, "").replace(/\/$/, "");
  const [a, b] = rest.split("/");
  if (a === "setlists") return { list: !b, setlistId: b as string | undefined, songId: undefined };
  return { list: !a, setlistId: undefined, songId: a || undefined };
}

function Workspace() {
  const where = useWhere();
  const nav = useNavigate();
  const fallback = useFallbackSongId();
  const onSetlists = useLocation().pathname.startsWith("/ensayos/setlists");
  const [tab, setTab] = useState<LibraryTab>(onSetlists ? "setlists" : "canciones");
  useEffect(() => { if (onSetlists) setTab("setlists"); }, [onSetlists]);
  const [settings, setSettings] = useState(false);
  /* Modo concierto: fuera cabecera y biblioteca, solo la canción
     (la vista de canción lo apaga al cerrarse). */
  const concert = useConcert();
  useKeepOfflineFresh();

  const directo = where.setlistId ? `/ensayos/directo/${where.setlistId}` : `/ensayos/directo/cancion/${where.songId ?? fallback}`;

  return (
    <div className="min-h-dvh md:h-dvh flex flex-col print:h-auto print:block print:bg-white print:text-black">
      <header className={cx("print:hidden items-center justify-between gap-3 flex-wrap px-4 md:px-5 py-2.5 border-b border-crema/8 bg-lateral", concert ? "hidden" : "flex")}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Link to="/" className="font-mono text-xs text-crema/80 hover:text-crema h-11 inline-flex items-center">← suite</Link>
          <span className="font-bold text-xl tracking-[-.02em]">ensayos</span>
          <SaveStatus />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <VerComo className="hidden md:flex" />
          <Button variant="primary" className="hidden md:inline-flex" onClick={() => nav(directo)} disabled={!where.setlistId && !where.songId && !fallback}>
            <Icon name="play" size={14} />modo directo
          </Button>
          <IconButton label="ajustes" onClick={() => setSettings(true)} aria-haspopup="dialog" className="text-xl">⚙</IconButton>
        </div>
      </header>
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />

      <div className="flex-1 flex min-h-0 print:block">
        <aside className={cx("w-full md:w-[280px] lg:w-[300px] shrink-0 md:border-r border-crema/8 md:overflow-y-auto p-4 flex-col gap-3.5 print:hidden",
          concert ? "hidden" : where.list ? "flex" : "hidden md:flex")} aria-label="Biblioteca">
          <Library tab={tab} onTab={t => { setTab(t); if (t === "setlists" && !onSetlists) nav("/ensayos/setlists"); if (t === "canciones" && onSetlists) nav("/ensayos"); }}
            songId={where.songId ?? (where.list && !onSetlists ? fallback : undefined)} setlistId={where.setlistId} />
        </aside>
        <div className={cx("flex-1 min-w-0 min-h-0 print:block", where.list && !concert ? "hidden md:flex" : "flex")}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
