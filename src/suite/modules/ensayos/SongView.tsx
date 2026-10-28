/* Canción: letra y acordes en grande, con tono, notación y «ver como».
   Al lado (o abajo en móvil) el contexto: notas por instrumento,
   comentarios y en qué setlists está. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { Member, Song, SongComment } from "@/data/types";
import { Button, Empty, Pill, Segmented, Select, Sheet, Textarea, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { ago, cx } from "@/lib/format";
import { FONT_MAX, FONT_MIN, chordsIn, displayKey, setConcert, shownSections, useConcert, useFontScale, useLastSong, useScrollSpeed, useTranspose, useView, useWakeLock, type ViewMode } from "./lib";
import { diagramKind } from "./chordShapes";
import { ChordDiagrams } from "./Diagrams";
import { SongControl, songBpm, useAutoscroll, useMetronome } from "./SongControl";
import { SaveStatus, VerComo, useFallbackSongId } from "./parts";
import { SongEditor, useDeleteFlow } from "./SongEditor";
import { sx } from "./extra";
import { MaterialView, hasMaterial } from "./Material";

export function SongRoute() {
  const { songId } = useParams();
  const fallback = useFallbackSongId();
  const { data: songs, loading } = useCollection("songs");
  const id = songId ?? fallback;
  const song = songs.find(s => s.id === id);
  const [, setLast] = useLastSong();
  useEffect(() => { if (songId && song) setLast(songId); }, [songId, song, setLast]);

  if (loading) return null;
  if (!song) return (
    <main className="flex-1 p-6">
      <Link to="/ensayos" className="md:hidden font-mono text-xs text-crema/80 inline-flex items-center gap-1.5"><Icon name="atras" size={14} />canciones</Link>
      <div className="mt-4"><Empty title={songs.length ? "Esta canción ya no existe" : "Aún no hay canciones"}>Crea una o pega una letra desde la biblioteca.</Empty></div>
    </main>
  );
  return <SongView key={song.id} song={song} />;
}

const MODES: ViewMode[] = ["acordes", "letra", "limpio", "mis"];

function SongView({ song }: { song: Song }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { me, viewAs, mode, setMode, latin, setLatin, diagrams } = useView();
  const [semis, setSemis] = useTranspose(song.id);
  const [font, setFont] = useFontScale();
  const [speed, setSpeed] = useScrollSpeed();
  const concert = useConcert();
  const { data: members } = useCollection("members");
  const { data: setlists } = useCollection("setlists");
  const [ctxOpen, setCtxOpen] = useState(false);
  const editing = params.get("editar") === "1";
  const setEditing = (v: boolean) => setParams(p => { if (v) p.set("editar", "1"); else p.delete("editar"); return p; }, { replace: true });

  const mainRef = useRef<HTMLElement>(null);
  const bpm = songBpm(song.bpm);
  const [scrolling, setScrolling] = useAutoscroll(mainRef, bpm, speed);
  const metro = useMetronome(bpm);

  /* Concierto: pantalla encendida mientras dure, y se apaga al salir de la canción. */
  useWakeLock(concert);
  useEffect(() => () => setConcert(false), []);

  const viewer = members.find(m => m.id === viewAs) ?? me;
  const clean = mode === "limpio";
  const sections = shownSections(song, mode, viewer.id, semis, latin);
  const inSetlists = setlists.filter(s => s.songIds.includes(song.id));
  const firstSl = inSetlists[0];
  const open = song.comments.filter(c => !c.resolved);
  const myNote = song.instrumentNotes[viewer.id];
  const secNotes = sx(song).sectionNotes ?? {};

  /* Diagramas: los acordes que suenan (con «mis acordes» si toca), ya transpuestos,
     sin pasar a Do Re Mi: la postura se busca por el nombre inglés. */
  const kind = diagramKind(viewer);
  const showDiagrams = diagrams && !clean && !concert && !!kind;
  const diagramChords = useMemo(
    () => showDiagrams ? chordsIn(shownSections(song, mode === "mis" ? "mis" : "acordes", viewer.id, semis, false).flatMap(s => s.lines)) : [],
    [showDiagrams, song, mode, viewer.id, semis],
  );

  /* Atajos como en la app antigua: ⇧C concierto, M modo, + − 0 tono, ⇧, ⇧. letra. */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || editing || ctxOpen) return;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const f = (d: number) => setFont(Math.max(FONT_MIN, Math.min(FONT_MAX, +(font + d).toFixed(2))));
    if (e.code === "KeyC" && e.shiftKey) { e.preventDefault(); setConcert(!concert); }
    else if (e.key === "Escape" && concert) setConcert(false);
    else if (e.code === "KeyM" && !e.shiftKey) { e.preventDefault(); setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); }
    else if (e.code === "Comma" && e.shiftKey) { e.preventDefault(); f(-0.1); }
    else if (e.code === "Period" && e.shiftKey) { e.preventDefault(); f(0.1); }
    else if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") { e.preventDefault(); setSemis(semis + 1); }
    else if (e.key === "-" || e.code === "NumpadSubtract") { e.preventDefault(); setSemis(semis - 1); }
    else if (e.key === "0") { e.preventDefault(); setSemis(0); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const lyricPx = (concert ? 26 : 19) * font;
  const chordPx = (concert ? 20 : 15) * font;
  const control = {
    scrolling, onScroll: setScrolling, speed, onSpeed: setSpeed, hasBpm: !!song.bpm, songBpm: bpm,
    metro, semis, onSemis: setSemis, font, onFont: setFont,
  };
  const concertBtn = (
    <button type="button" aria-pressed={concert} onClick={() => setConcert(!concert)}
      title="modo concierto: letra grande, pantalla siempre encendida (⇧C)"
      className={cx("inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full text-sm font-medium transition",
        concert ? "bg-senal text-noche" : "text-crema/80 hover:text-crema hover:bg-crema/5")}>
      <Icon name="estrella" size={16} />{concert ? "salir de concierto" : "concierto"}
    </button>
  );

  return (
    <>
      <main ref={mainRef} className={cx("flex-1 min-w-0 md:overflow-y-auto px-4 md:px-[clamp(16px,3vw,40px)] pt-4 md:pt-6 flex flex-col gap-5 print:p-0 print:overflow-visible",
        concert ? "pb-36 lg:pb-8 max-w-[1100px] mx-auto w-full" : "pb-[270px] lg:pb-6")}>
        {/* móvil: volver y estado */}
        <div className={cx("md:hidden flex items-center justify-between gap-3 -mt-1 print:hidden", concert && "hidden")}>
          <Link to="/ensayos" className="font-mono text-xs text-crema/80 h-11 inline-flex items-center gap-1.5"><Icon name="atras" size={14} />canciones</Link>
          <SaveStatus />
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {!concert && (
              <p className="font-mono text-xs text-senal mb-1 print:text-black/60">
                {song.own ? "PROPIA" : "VERSIÓN"}{song.artist ? ` · ${song.artist}` : ""}{firstSl ? ` · ${firstSl.name} #${firstSl.songIds.indexOf(song.id) + 1}` : ""}
              </p>
            )}
            <h1 className="text-[30px] md:text-[44px] font-extrabold tracking-[-.035em] leading-none">{song.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[13px]">
            <span className="inline-flex items-center gap-1 h-11 pl-3.5 rounded-full bg-tubo print:bg-transparent print:pl-0">
              <button type="button" onClick={() => setSemis(0)} disabled={!semis} title="Volver al tono original" className="disabled:opacity-100 disabled:cursor-default">
                tono {displayKey(song.key, semis, latin)}{semis ? <span className="text-senal-suave"> {semis > 0 ? "+" : ""}{semis}</span> : null}
              </button>
              <button type="button" aria-label="Bajar medio tono" onClick={() => setSemis(semis - 1)} className="size-11 rounded-full hover:bg-noche text-base print:hidden">−</button>
              <button type="button" aria-label="Subir medio tono" onClick={() => setSemis(semis + 1)} className="size-11 rounded-full hover:bg-noche text-base print:hidden">+</button>
            </span>
            {!concert && song.bpm ? <span className="inline-flex items-center h-11 px-3.5 rounded-full bg-tubo print:bg-transparent">{song.bpm} BPM</span> : null}
            {!concert && song.duration ? <span className="inline-flex items-center h-11 px-3.5 rounded-full bg-tubo print:bg-transparent">{song.duration}</span> : null}
          </div>
        </header>

        <div className="flex flex-wrap gap-2 items-center print:hidden">
          {/* el modo se queda también en concierto: cada uno decide si quiere acordes */}
          <Segmented<ViewMode> size="sm" value={mode} onChange={setMode} options={[
            { value: "acordes", label: "letra + acordes" }, { value: "letra", label: "letra" }, { value: "limpio", label: "limpio" },
            { value: "mis", label: viewer.id === me.id ? "mis acordes" : `acordes de ${viewer.name}` },
          ]} />
          {!concert && (
            <Segmented size="sm" value={latin ? "latino" : "ingles"} onChange={v => setLatin(v === "latino")} options={[
              { value: "ingles", label: <span className="font-mono">C D E</span> }, { value: "latino", label: <span className="font-mono">Do Re Mi</span> },
            ]} />
          )}
          {!concert && <VerComo compact className="md:hidden" />}
          <span className="flex gap-1 ml-auto">
            {concertBtn}
            {!concert && <>
              <Button variant="quiet" size="sm" className="!h-11" onClick={() => setEditing(true)}><Icon name="editar" size={16} />editar</Button>
              <Button variant="quiet" size="sm" className="!h-11" onClick={() => window.print()}><Icon name="descargar" size={16} />PDF</Button>
            </>}
          </span>
        </div>

        {mode === "mis" && !concert && !sections.some(s => s.own) && (
          <p className="text-sm text-crema/65 print:hidden">
            {viewer.name} no tiene acordes propios en esta canción: se ven los de la banda.{" "}
            {viewer.id === me.id && <button type="button" onClick={() => setEditing(true)} className="underline text-senal-suave">añadir los míos</button>}
          </p>
        )}

        {!concert && <DeleteBanner song={song} />}

        {showDiagrams && <ChordDiagrams chords={diagramChords} kind={kind} latin={latin} />}

        <div className="flex flex-col gap-4 print:gap-5">
          {sections.map(({ sec, lines, own }) => {
            const n = open.filter(c => c.where === sec.name).length;
            return (
              <section key={sec.id} className="rounded-[18px] bg-tubo px-4 md:px-5 py-4 flex flex-col gap-2.5 break-inside-avoid print:bg-transparent print:p-0">
                <div className="flex justify-between items-baseline gap-3">
                  <h2 className={cx("font-mono font-medium tracking-[.14em] uppercase text-senal print:text-black", concert ? "text-sm" : "text-xs")}>
                    {sec.name}{own && !clean && <span className="ml-2 normal-case tracking-normal text-crema/60 print:text-black/60">· acordes de {viewer.name}</span>}
                  </h2>
                  {!clean && (
                    <span className="flex items-center gap-2 text-xs text-crema/65 text-right print:text-black/60">
                      {sec.note}
                      {n > 0 && !concert && <button type="button" onClick={() => setCtxOpen(true)} className="print:hidden lg:pointer-events-none"><Pill tone="senal">{n} coment.</Pill></button>}
                    </span>
                  )}
                </div>
                {!clean && <SectionNotes notes={secNotes[sec.id]} members={members} viewerId={viewer.id} onlyViewer={concert} />}
                {lines.length === 0 && <p className="text-sm text-crema/45 print:hidden">sin letra ni acordes</p>}
                {lines.map((l, i) => (
                  <div key={i} className="flex flex-col overflow-x-auto no-scrollbar">
                    {l.chords && <span className="font-mono font-medium text-senal whitespace-pre print:text-black" style={{ fontSize: chordPx }}>{l.chords}</span>}
                    {l.lyric && <span className={cx("whitespace-pre-wrap", concert ? "leading-normal" : "leading-snug")} style={{ fontSize: lyricPx }}>{l.lyric}</span>}
                  </div>
                ))}
              </section>
            );
          })}
        </div>

        {myNote && !clean && <p className="hidden print:block text-sm border-t border-black/20 pt-3"><b>nota de {viewer.name}:</b> {myNote}</p>}

        {/* escritorio: control flotante, se queda pegado abajo a la derecha de la canción */}
        <SongControl {...control} floating className="hidden lg:flex flex-wrap justify-end sticky bottom-4 mt-auto self-end max-w-full z-20 print:hidden" />
      </main>

      {/* contexto: columna en escritorio */}
      {!concert && (
        <aside aria-label="Contexto" className="hidden lg:flex w-[320px] xl:w-[340px] shrink-0 border-l border-crema/8 overflow-y-auto p-4 flex-col gap-4 print:hidden">
          <Context song={song} viewer={viewer} clean={clean} />
        </aside>
      )}

      {/* móvil y tablet: control de la canción y, debajo, el contexto */}
      <div className={cx("lg:hidden print:hidden fixed bottom-0 right-0 left-0 z-30 px-3 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] rounded-t-[22px] bg-tubo shadow-[0_-10px_30px_rgba(0,0,0,.3)]", !concert && "md:left-[280px]")}>
        {!concert && <span className="block mx-auto mb-2 w-10 h-1 rounded-full bg-crema/30" />}
        <SongControl {...control} className={cx(!concert && "mb-2.5")}
          extra={!concert && (
            <button type="button" onClick={() => nav(`/ensayos/directo/cancion/${song.id}`)}
              className="md:hidden shrink-0 h-11 px-4 rounded-full bg-senal text-noche font-semibold inline-flex items-center gap-2">
              <Icon name="play" size={14} />directo
            </button>
          )} />
        {!concert && (
          <div className={cx("grid gap-2", clean ? "grid-cols-2" : "grid-cols-3")}>
            {!clean && <CtxTile label={viewer.id === me.id ? "tu nota" : `nota de ${viewer.name}`} value={myNote || "sin nota"} onClick={() => setCtxOpen(true)} />}
            <CtxTile label="setlists" value={inSetlists.length ? inSetlists.map(s => s.name).join(", ") : "en ninguno"} onClick={() => setCtxOpen(true)} />
            <CtxTile label={`${open.length}`} value={open.length === 1 ? "comentario" : "comentarios"} onClick={() => setCtxOpen(true)} />
          </div>
        )}
      </div>
      <Sheet open={ctxOpen} onClose={() => setCtxOpen(false)} title={song.title}>
        <div className="flex flex-col gap-4"><Context song={song} viewer={viewer} clean={clean} /></div>
      </Sheet>

      <SongEditor open={editing} onClose={() => setEditing(false)} song={song} />
    </>
  );
}

function CtxTile({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left p-2.5 rounded-xl bg-noche text-[13px] leading-tight min-h-[56px] min-w-0">
      <b className="block font-semibold truncate">{label}</b>
      <span className="block text-crema/75 line-clamp-2">{value}</span>
    </button>
  );
}

// ---------- contexto ----------
/* En limpio fuera notas y demo: solo quedan comentarios y setlists. */
function Context({ song, viewer, clean }: { song: Song; viewer: Member; clean?: boolean }) {
  return (
    <>
      {!clean && sx(song).notes && <Box title="notas generales"><p className="text-sm leading-snug whitespace-pre-wrap">{sx(song).notes}</p></Box>}
      {!clean && hasMaterial(song) && <Box title="material"><MaterialView song={song} /></Box>}
      {!clean && <Notes song={song} viewer={viewer} />}
      <Comments song={song} />
      <InSetlists song={song} />
    </>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-tubo max-lg:bg-noche p-3.5 flex flex-col gap-2.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Notes({ song, viewer }: { song: Song; viewer: Member }) {
  const { me } = useView();
  const toast = useToast();
  const { data: members } = useCollection("members");
  const save = useAction((text: string) => {
    const next = { ...song.instrumentNotes };
    if (text.trim()) next[me.id] = text.trim(); else delete next[me.id];
    return api.update("songs", song.id, { instrumentNotes: next });
  });
  const rows = members.filter(m => m.id === me.id || song.instrumentNotes[m.id]);
  return (
    <Box title="notas por instrumento">
      {rows.map(m => {
        const hl = m.id === viewer.id;
        return (
          <div key={m.id} className={cx("flex gap-2.5 text-sm leading-snug rounded-lg", hl && "bg-senal/15 -mx-2 px-2 py-1.5")}>
            <b className={cx("w-[74px] shrink-0 font-medium", hl ? "text-senal-suave" : "text-crema/70")}>{m.name}<span className="block font-mono text-[10px] font-normal text-crema/55">{m.instrument}</span></b>
            {m.id === me.id
              ? <Textarea key={song.id} aria-label="Tu nota para esta canción" defaultValue={song.instrumentNotes[me.id] ?? ""} rows={2} placeholder="tu nota: entradas, cambios, efectos…"
                  className="!min-h-0 text-sm !px-2.5 !py-1.5"
                  onBlur={async e => { if (e.target.value.trim() !== (song.instrumentNotes[me.id] ?? "")) { await save.run(e.target.value); toast("Nota guardada", "ok"); } }} />
              : <span className="flex-1">{song.instrumentNotes[m.id]}</span>}
          </div>
        );
      })}
    </Box>
  );
}

function Comments({ song }: { song: Song }) {
  const { me } = useView();
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [showDone, setShowDone] = useState(false);
  const setComments = useAction((comments: SongComment[]) => api.update("songs", song.id, { comments }));
  const open = song.comments.filter(c => !c.resolved);
  const done = song.comments.filter(c => c.resolved);
  const toggle = (c: SongComment) => setComments.run(song.comments.map(x => x.id === c.id ? { ...x, resolved: !x.resolved } : x));

  const item = (c: SongComment) => (
    <div key={c.id} className={cx("p-3 rounded-xl bg-noche max-lg:bg-tubo flex flex-col gap-1", c.resolved && "opacity-60")}>
      <span className="text-xs text-crema/65">{c.who}{c.where ? ` · ${c.where.toLowerCase()}` : ""} · {ago(c.at)}</span>
      <span className="text-sm leading-snug whitespace-pre-wrap">{c.text}</span>
      <span className="flex gap-4">
        <button type="button" onClick={() => toggle(c)} className="h-9 text-[13px] font-medium text-senal-suave">{c.resolved ? "reabrir" : "resolver"}</button>
        {c.who === me.name && <button type="button" onClick={() => { if (window.confirm("¿Borrar este comentario?")) setComments.run(song.comments.filter(x => x.id !== c.id)); }}
          className="h-9 text-[13px] text-crema/60 hover:text-crema">borrar</button>}
      </span>
    </div>
  );

  return (
    <Box title={`comentarios · ${open.length} ${open.length === 1 ? "abierto" : "abiertos"}`}>
      {open.map(item)}
      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone(!showDone)} className="self-start h-9 text-[13px] text-crema/70 underline">
          {showDone ? "ocultar resueltos" : `ver resueltos (${done.length})`}
        </button>
      )}
      {showDone && done.map(item)}
      <form className="flex flex-col gap-2 pt-1" onSubmit={async e => {
        e.preventDefault();
        if (!text.trim()) return;
        const c: SongComment = { id: uid("c"), who: me.name, where: where || undefined, text: text.trim(), resolved: false, at: new Date().toISOString() };
        await setComments.run([...song.comments, c]);
        setText("");
      }}>
        <label className="sr-only" htmlFor={`cw-${song.id}`}>Sección</label>
        <Select id={`cw-${song.id}`} value={where} onChange={e => setWhere(e.target.value)} className="h-10 text-sm">
          <option value="">toda la canción</option>
          {[...new Set(song.sections.map(s => s.name))].map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
        <label className="sr-only" htmlFor={`ct-${song.id}`}>Comentario</label>
        <Textarea id={`ct-${song.id}`} rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="¿subimos medio tono?…" className="!min-h-0 text-sm" />
        <Button type="submit" size="sm" className="self-end !h-10" disabled={!text.trim() || setComments.pending}>comentar</Button>
      </form>
    </Box>
  );
}

function InSetlists({ song }: { song: Song }) {
  const { data: setlists } = useCollection("setlists");
  const list = setlists.filter(s => s.songIds.includes(song.id));
  return (
    <Box title="en setlists">
      {!list.length && <p className="text-sm text-crema/60">En ninguno todavía.</p>}
      {list.map(s => (
        <Link key={s.id} to={`/ensayos/setlists/${s.id}`} className="flex justify-between items-center gap-2 min-h-11 text-sm hover:text-senal-suave">
          <span className="truncate">{s.name}</span>
          <span className="font-mono text-xs text-crema/65">#{s.songIds.indexOf(song.id) + 1} / {s.songIds.length}</span>
        </Link>
      ))}
    </Box>
  );
}

/* Notas de cada miembro en esta sección; la de quien se mira, resaltada. */
function SectionNotes({ notes, members, viewerId, onlyViewer }: { notes?: Record<string, string>; members: Member[]; viewerId: string; onlyViewer?: boolean }) {
  if (!notes) return null;
  const rows = members.filter(m => notes[m.id] && (!onlyViewer || m.id === viewerId));
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col gap-1 -mt-1">
      {rows.map(m => (
        <li key={m.id} className={cx("text-[13px] leading-snug rounded-lg print:text-black/70", m.id === viewerId ? "bg-senal/15 px-2 py-1 text-crema" : "text-crema/60")}>
          <b className={cx("font-medium", m.id === viewerId && "text-senal-suave")}>{m.name}</b> · {notes[m.id]}
        </li>
      ))}
    </ul>
  );
}

/* Alguien pidió borrar la canción: se ve arriba hasta que la banda decide. */
function DeleteBanner({ song }: { song: Song }) {
  const { me } = useView();
  const { data: members } = useCollection("members");
  const toast = useToast();
  const flow = useDeleteFlow(song);
  const req = sx(song).deleteRequest;
  if (!req) return null;
  const mine = req.approvals.includes(me.id);
  return (
    <div role="status" className="rounded-2xl border border-senal/40 bg-senal/10 px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
      <p className="text-sm flex-1 min-w-[200px]">
        <b>{req.by === me.id ? "Pediste" : `${req.name} pidió`} borrar esta canción.</b>{" "}
        <span className="text-crema/70">aprobado por {req.approvals.length} de {members.length} · {ago(req.at)}</span>
      </p>
      {!mine && <Button size="sm" variant="primary" className="!h-11" disabled={flow.pending}
        onClick={async () => { const gone = await flow.request(); toast(gone ? "Canción borrada" : "Aprobado", "ok"); }}>aprobar borrado</Button>}
      <Button size="sm" variant="quiet" className="!h-11" disabled={flow.pending}
        onClick={async () => { await flow.cancel(); toast("Se queda", "ok"); }}>{req.by === me.id ? "retirar petición" : "que se quede"}</Button>
    </div>
  );
}
