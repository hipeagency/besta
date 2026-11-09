/* Videolyrics, paso 1: sincronizar la letra con la pista de directo.
   Se carga la pista (no se sube: se queda en este ordenador), suena, y
   se marca a toques cuándo empieza cada línea (o cada palabra). Luego
   se afina con «aquí» y ±, y se marcan las palabras con énfasis.
   Lo que se guarda en la canción: el texto con tiempos, el nombre de
   la pista y su duración exacta, que será la del vídeo. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "@/data/api";
import { useCollection } from "@/data/hooks";
import type { LyricLine, LyricSync as Sync, Song } from "@/data/types";
import { Button, Pill, Segmented, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { at, clock, lineEnd, linesFromSong, mergeLines, nextEmphasis, peaks, wordTimes } from "./sync";

export default function LyricSyncPage() {
  const { songId } = useParams();
  const { data: songs, loading } = useCollection("songs");
  if (loading) return <div className="fixed inset-0 bg-noche grid place-items-center text-crema/60">cargando…</div>;
  const song = songs.find(s => s.id === songId);
  if (!song) return <PickSong songs={songs} />;
  return <Studio key={song.id} song={song} />;
}

function PickSong({ songs }: { songs: Song[] }) {
  const withLyrics = songs.filter(s => s.sections.some(sec => sec.lines.some(l => l.lyric.trim())))
    .sort((a, b) => Number(b.own) - Number(a.own) || a.title.localeCompare(b.title));
  return (
    <div className="min-h-dvh bg-noche text-crema">
      <main className="max-w-[760px] mx-auto px-6 py-8 flex flex-col gap-5">
        <Link to="/visuales" className="self-start font-mono text-xs text-crema/70 hover:text-crema inline-flex items-center gap-1.5"><Icon name="atras" size={14} />visuales</Link>
        <div>
          <p className="font-mono text-xs text-senal tracking-wider">VIDEOLYRICS · 1. SINCRONIZAR</p>
          <h1 className="text-[40px] font-extrabold tracking-[-.035em] leading-none mt-1">elige canción</h1>
          <p className="text-crema/70 mt-3">La letra sale de ensayos. Si una canción no aparece, es que aún no tiene letra escrita.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {withLyrics.map(s => (
            <li key={s.id}>
              <Link to={`/visuales/letra/${s.id}`} className="flex items-center gap-4 rounded-[18px] p-4 bg-tubo hover:bg-tubo-alto transition">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-lg truncate">{s.title}</span>
                  <span className="block text-sm text-crema/60">{s.own ? "propia" : s.artist}</span>
                </span>
                {s.lyricSync && <Pill tone="ok" dot>{syncedCount(s.lyricSync)}/{s.lyricSync.lines.length} líneas · {clock(s.lyricSync.durationSec)}</Pill>}
                <Icon name="flecha" size={20} />
              </Link>
            </li>
          ))}
        </ul>
        {!withLyrics.length && <p className="text-crema/60">No hay canciones con letra. Escríbela primero en ensayos.</p>}
      </main>
    </div>
  );
}

const syncedCount = (s: Sync) => s.lines.filter(l => l.t != null).length;

type Mode = "lineas" | "palabras";
type Cursor = { line: number; word: number };
const SPEEDS = [0.5, 0.75, 1] as const;
const REACTION = [0, 0.05, 0.1, 0.15] as const;   // se resta al marcar: lo que tardamos en reaccionar

function Studio({ song }: { song: Song }) {
  const toast = useToast();
  const nav = useNavigate();
  const fresh = useMemo(() => linesFromSong(song), [song]);
  const [sync, setSync] = useState<Sync>(() => song.lyricSync ?? { audioName: "", durationSec: 0, lines: fresh, updatedAt: new Date().toISOString() });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"" | "guardando" | "guardado" | "error">("");

  // ---- audio ----
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string>();
  const [audioName, setAudioName] = useState("");
  const [wave, setWave] = useState<Float32Array>();
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [reaction, setReaction] = useState<(typeof REACTION)[number]>(0.1);

  // ---- marcado ----
  const [mode, setMode] = useState<Mode>("lineas");
  const [armed, setArmed] = useState(false);       // espacio = marcar
  const [cursor, setCursor] = useState<Cursor>({ line: 0, word: 0 });
  const [sel, setSel] = useState<number | null>(null);

  const lyricsChanged = useMemo(() => {
    const a = sync.lines.map(l => l.words.map(w => w.text).join(" ")).join("\n");
    const b = fresh.map(l => l.words.map(w => w.text).join(" ")).join("\n");
    return a !== b;
  }, [sync.lines, fresh]);

  const update = useCallback((fn: (s: Sync) => Sync) => {
    setSync(s => ({ ...fn(s), updatedAt: new Date().toISOString() }));
    setDirty(true);
  }, []);
  const setLines = useCallback((fn: (lines: LyricLine[]) => LyricLine[]) => update(s => ({ ...s, lines: fn(s.lines) })), [update]);

  // guardar solo, un momento después del último cambio
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(async () => {
      setSaving("guardando");
      try {
        await api.update("songs", song.id, { lyricSync: sync });
        setDirty(false); setSaving("guardado");
      } catch (e) {
        setSaving("error"); toast((e as Error).message, "error");
      }
    }, 900);
    return () => clearTimeout(id);
  }, [sync, dirty, song.id, toast]);

  // reloj: lo que marca el audio, a cada fotograma mientras suena
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { setNow(audioRef.current?.currentTime ?? 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed, src]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  async function loadAudio(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      void ctx.close();
      const dur = decoded.duration;
      setWave(peaks(decoded, 1600));
      setSrc(URL.createObjectURL(file));
      setAudioName(file.name);
      setNow(0); setPlaying(false);
      if (sync.durationSec && Math.abs(sync.durationSec - dur) > 0.05) {
        toast(`Ojo: esta pista dura ${clock(dur)} y la letra se sincronizó con una de ${clock(sync.durationSec)}${sync.audioName ? ` (${sync.audioName})` : ""}.`, "error");
      }
      update(s => ({ ...s, audioName: file.name, durationSec: dur }));
    } catch {
      toast("No se ha podido leer el audio. Prueba con WAV, MP3, AIFF o M4A.", "error");
    }
  }

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(t, sync.durationSec || a.duration || 0));
    setNow(a.currentTime);
  }, [sync.durationSec]);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  }, []);

  // ---- marcar ----
  const mark = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = Math.max(0, +(a.currentTime - reaction * speed).toFixed(3));
    const { line, word } = cursor;
    if (line >= sync.lines.length) return;
    if (mode === "lineas") {
      // la línea se mueve entera: las palabras vuelven a repartirse solas
      setLines(ls => ls.map((l, i) => (i === line ? { ...l, t, words: l.words.map(w => ({ ...w, t: undefined })) } : l)));
      setCursor({ line: line + 1, word: 0 });
    } else {
      setLines(ls => ls.map((l, i) => (i !== line ? l : {
        ...l, t: word === 0 ? t : l.t,
        words: l.words.map((w, k) => (k === word ? { ...w, t } : w)),
      })));
      const last = word + 1 >= sync.lines[line].words.length;
      setCursor(last ? { line: line + 1, word: 0 } : { line, word: word + 1 });
    }
    setSel(line);
  }, [cursor, mode, reaction, speed, sync.lines, setLines]);

  /* La última línea marcada se apaga aquí (silencio, solo, puente…). */
  const markEnd = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = +(a.currentTime - reaction * speed).toFixed(3);
    let i = -1;
    sync.lines.forEach((l, k) => { if (l.t != null && l.t <= t) i = k; });
    if (i < 0) return;
    setLines(ls => ls.map((l, k) => (k === i ? { ...l, end: t } : l)));
  }, [reaction, speed, sync.lines, setLines]);

  const undo = useCallback(() => {
    const { line, word } = cursor;
    let back: Cursor;
    if (mode === "lineas") back = { line: Math.max(0, line - 1), word: 0 };
    else if (word > 0) back = { line, word: word - 1 };
    else if (line > 0) back = { line: line - 1, word: sync.lines[line - 1].words.length - 1 };
    else return;
    setLines(ls => ls.map((l, i) => (i !== back.line ? l : mode === "lineas"
      ? { ...l, t: undefined, end: undefined }
      : { ...l, t: back.word === 0 ? undefined : l.t, words: l.words.map((w, k) => (k === back.word ? { ...w, t: undefined } : w)) })));
    setCursor(back);
    const prev = sync.lines[back.line];
    seek(Math.max(0, (sync.lines[back.line - 1]?.t ?? prev?.t ?? now) - 1.5));
  }, [cursor, mode, sync.lines, setLines, seek, now]);

  // teclado: espacio marca (o play/pausa si no estás marcando)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); if (armed) mark(); else toggle(); }
      else if (e.key === "e" || e.key === "E") { if (armed) { e.preventDefault(); markEnd(); } }
      else if (e.key === "Backspace") { if (armed) { e.preventDefault(); undo(); } }
      else if (e.key === "Enter") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seek(now - (e.shiftKey ? 0.1 : 2)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seek(now + (e.shiftKey ? 0.1 : 2)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, mark, markEnd, undo, toggle, seek, now]);

  /* Empezar a marcar desde una línea: el audio va un poco antes. */
  function startFrom(i: number) {
    setCursor({ line: i, word: 0 });
    setSel(i);
    setArmed(true);
    const prev = sync.lines.slice(0, i).reverse().find(l => l.t != null);
    seek(Math.max(0, (prev?.t ?? 0) - 0.5));
  }

  const nudge = (i: number, d: number) => setLines(ls => ls.map((l, k) => (k === i && l.t != null ? { ...l, t: Math.max(0, +(l.t + d).toFixed(3)), words: l.words.map(w => (w.t != null ? { ...w, t: Math.max(0, +(w.t + d).toFixed(3)) } : w)) } : l)));
  const setHere = (i: number) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, t: +now.toFixed(3), words: l.words.map(w => ({ ...w, t: undefined })) } : l)));
  const clearLine = (i: number) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, t: undefined, end: undefined, words: l.words.map(w => ({ ...w, t: undefined })) } : l)));
  const cycleEm = (i: number, w: number) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, words: l.words.map((x, j) => (j === w ? { ...x, em: nextEmphasis(x.em) } : x)) } : l)));

  const live = at(sync, now);
  const done = syncedCount(sync);
  const hasAudio = !!src;

  // la línea que suena, siempre a la vista en la lista
  const listRef = useRef<HTMLOListElement>(null);
  const follow = playing ? live.line : -1;
  useEffect(() => {
    const i = armed ? cursor.line : follow;
    if (i < 0) return;
    listRef.current?.querySelector(`[data-line="${i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [follow, armed, cursor.line]);

  return (
    <div className="h-dvh bg-noche text-crema flex flex-col">
      <style>{`@keyframes vl-temblor{0%,100%{transform:translate(0,0)}25%{transform:translate(-2px,1px)}50%{transform:translate(2px,-1px)}75%{transform:translate(-1px,-2px)}}`}</style>
      {/* cabecera */}
      <header className="px-6 py-3 flex items-center gap-4 border-b border-crema/10">
        <button type="button" onClick={() => nav("/visuales/letra")} className="font-mono text-xs text-crema/70 hover:text-crema inline-flex items-center gap-1.5"><Icon name="atras" size={14} />canciones</button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-senal tracking-wider">VIDEOLYRICS · 1. SINCRONIZAR</p>
          <h1 className="text-2xl font-extrabold tracking-[-.02em] leading-tight truncate">{song.title}</h1>
        </div>
        <span className="font-mono text-xs text-crema/60" aria-live="polite">
          {done}/{sync.lines.length} líneas · {saving === "guardando" ? "guardando…" : saving === "error" ? "sin guardar" : dirty ? "cambios…" : saving === "guardado" ? "guardado" : ""}
        </span>
        <label className="inline-flex items-center gap-2 h-11 px-[18px] rounded-full bg-senal text-noche font-semibold text-[15px] cursor-pointer hover:brightness-110">
          <Icon name="subir" size={16} />{hasAudio ? "cambiar pista" : "cargar pista"}
          <input type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.m4a" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void loadAudio(f); e.target.value = ""; }} />
        </label>
      </header>

      {lyricsChanged && (
        <div className="px-6 py-2 bg-tubo text-sm flex items-center gap-3">
          <span className="flex-1">La letra ha cambiado en ensayos.</span>
          <Button size="sm" variant="ghost" onClick={() => { setLines(ls => mergeLines(ls, fresh)); setCursor({ line: 0, word: 0 }); }}>actualizar (mantiene los tiempos de las líneas iguales)</Button>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        {/* izquierda: vista previa, onda, transporte y marcado */}
        <section className="min-h-0 flex flex-col gap-4 p-6 overflow-y-auto">
          <Preview sync={sync} t={now} />

          {hasAudio ? (
            <>
              <Wave wave={wave} sync={sync} t={now} sel={sel} onSeek={seek} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={toggle} aria-label={playing ? "Pausa" : "Reproducir"} className="size-14 rounded-full bg-crema text-noche grid place-items-center">
                  <Icon name={playing ? "pause" : "play"} size={22} />
                </button>
                <span className="font-mono text-lg tabular-nums">{clock(now)} <span className="text-crema/50">/ {clock(sync.durationSec)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => seek(0)}>inicio</Button>
                <Button size="sm" variant="ghost" onClick={() => seek(now - 5)}>−5 s</Button>
                <Button size="sm" variant="ghost" onClick={() => seek(now + 5)}>+5 s</Button>
                <span className="flex-1" />
                <label className="text-sm text-crema/70 flex items-center gap-2">velocidad
                  <Segmented size="sm" value={String(speed)} onChange={v => setSpeed(Number(v) as typeof speed)} options={SPEEDS.map(s => ({ value: String(s), label: `${s}×` }))} />
                </label>
              </div>

              <div className={cx("rounded-[20px] p-5 flex flex-col gap-4 transition", armed ? "bg-tubo ring-2 ring-senal" : "bg-tubo")}>
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented value={mode} onChange={m => { setMode(m); setCursor(c => ({ line: c.line, word: 0 })); }}
                    options={[{ value: "lineas", label: "marcar líneas" }, { value: "palabras", label: "marcar palabras" }]} />
                  <label className="text-sm text-crema/70 flex items-center gap-2">compensar reacción
                    <Segmented size="sm" value={String(reaction)} onChange={v => setReaction(Number(v) as typeof reaction)} options={REACTION.map(r => ({ value: String(r), label: `${r * 1000} ms` }))} />
                  </label>
                  <span className="flex-1" />
                  <Button variant={armed ? "light" : "primary"} onClick={() => setArmed(a => !a)}>{armed ? "dejar de marcar" : "empezar a marcar"}</Button>
                </div>
                {armed ? (
                  <>
                    <p className="text-crema/70 text-sm">
                      <b className="text-crema">espacio</b> marca {mode === "lineas" ? "el inicio de la línea" : "la palabra"} ·{" "}
                      <b className="text-crema">E</b> la letra desaparece (silencio) · <b className="text-crema">⌫</b> deshacer · <b className="text-crema">intro</b> play/pausa
                    </p>
                    <NextTarget lines={sync.lines} cursor={cursor} mode={mode} />
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                      <Button variant="primary" size="lg" className="!h-16 !text-lg" onClick={mark} disabled={cursor.line >= sync.lines.length}>marcar</Button>
                      <Button variant="ghost" size="lg" className="!h-16" onClick={markEnd}>fin (E)</Button>
                      <Button variant="ghost" size="lg" className="!h-16" onClick={undo}>deshacer</Button>
                    </div>
                  </>
                ) : (
                  <p className="text-crema/70 text-sm">
                    Dale a «empezar a marcar» y a play: con cada <b className="text-crema">espacio</b> marcas dónde empieza la siguiente línea.
                    Para empezar desde otra línea, pulsa su número en la lista. A 0.75× es más fácil.
                    Con las líneas marcadas, «marcar palabras» afina el karaoke palabra a palabra (opcional: si no, se reparten solas).
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-[20px] border-[1.5px] border-dashed border-crema/30 p-8 text-center flex flex-col gap-2 items-center">
              <p className="font-bold text-lg">Carga la pista que sonará en directo</p>
              <p className="text-crema/70 max-w-[520px]">El vídeo durará exactamente lo mismo que este audio. No se sube a ningún sitio: se queda en este ordenador; en la canción solo se guardan el nombre y la duración.</p>
              {sync.audioName && <p className="font-mono text-xs text-crema/60 mt-2">sincronizada con: {sync.audioName} · {clock(sync.durationSec)}</p>}
            </div>
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          {src && <audio ref={audioRef} src={src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setNow(audioRef.current?.currentTime ?? 0); }} onEnded={() => setPlaying(false)} onSeeked={() => setNow(audioRef.current?.currentTime ?? 0)} />}
        </section>

        {/* derecha: la letra */}
        <aside className="min-h-0 border-l border-crema/10 flex flex-col">
          <p className="px-5 pt-4 pb-2 text-sm text-crema/65">Toca una palabra para darle énfasis: <span className="text-crema">normal</span> → <span className="text-senal-suave font-bold">fuerte</span> → <span className="font-extrabold uppercase">impacto</span> → <span className="inline-block" style={{ animation: "vl-temblor .25s infinite" }}>temblor</span></p>
          <ol ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
            {sync.lines.map((l, i) => {
              const showSection = l.section && l.section !== sync.lines[i - 1]?.section;
              const isLive = live.line === i, isNext = armed && cursor.line === i;
              const end = lineEnd(sync.lines, i, sync.durationSec);
              return (
                <li key={l.id} data-line={i}>
                  {showSection && <p className="font-mono text-[11px] text-crema/50 tracking-wider px-2 pt-4 pb-1">{l.section!.toUpperCase()}</p>}
                  <div className={cx("group rounded-[14px] px-2 py-2 flex gap-2 items-start transition", isLive ? "bg-tubo-alto" : sel === i ? "bg-tubo" : "", isNext && "ring-2 ring-senal")}>
                    <button type="button" onClick={() => startFrom(i)} disabled={!hasAudio} title="marcar desde aquí"
                      className="w-8 shrink-0 h-8 rounded-full font-mono text-xs text-crema/60 hover:bg-crema/10 disabled:hover:bg-transparent">{i + 1}</button>
                    <div className="flex-1 min-w-0" onClick={() => setSel(i)}>
                      <p className="leading-snug text-[17px]">
                        {l.words.map((w, k) => (
                          <button key={k} type="button" onClick={() => cycleEm(i, k)} title={w.em ? `énfasis: ${w.em}` : "dar énfasis"}
                            className={cx("rounded px-0.5 hover:bg-crema/10",
                              isLive && k === live.word ? "text-senal" : "",
                              w.em === "fuerte" && "text-senal-suave font-bold",
                              w.em === "impacto" && "font-extrabold uppercase",
                              armed && mode === "palabras" && cursor.line === i && cursor.word === k && "underline decoration-senal decoration-2 underline-offset-4")}
                            style={w.em === "temblor" ? { animation: "vl-temblor .25s infinite", display: "inline-block" } : undefined}>
                            {w.text}
                          </button>
                        ))}
                      </p>
                      <p className="font-mono text-[11px] text-crema/55 mt-0.5">
                        {l.t != null ? <>{clock(l.t)}{end != null && <> → {clock(end)}</>}{l.words.some(w => w.t != null) && " · palabras a mano"}</> : "sin marcar"}
                      </p>
                    </div>
                    {l.t != null && hasAudio && (
                      <div className="flex gap-1 opacity-60 group-hover:opacity-100">
                        <button type="button" className="h-8 px-2 rounded-lg font-mono text-xs hover:bg-crema/10" onClick={() => seek(l.t! - 1)} title="escuchar desde un poco antes">▶</button>
                        <button type="button" className="h-8 px-2 rounded-lg font-mono text-xs hover:bg-crema/10" onClick={() => nudge(i, -0.05)} title="50 ms antes">−</button>
                        <button type="button" className="h-8 px-2 rounded-lg font-mono text-xs hover:bg-crema/10" onClick={() => nudge(i, 0.05)} title="50 ms después">+</button>
                        <button type="button" className="h-8 px-2 rounded-lg font-mono text-xs hover:bg-crema/10" onClick={() => setHere(i)} title="que empiece donde está el cursor">aquí</button>
                        <button type="button" className="h-8 px-2 rounded-lg hover:bg-crema/10" onClick={() => clearLine(i)} title="borrar su tiempo" aria-label="borrar tiempo"><Icon name="x" size={12} /></button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function NextTarget({ lines, cursor, mode }: { lines: LyricLine[]; cursor: Cursor; mode: Mode }) {
  const l = lines[cursor.line];
  if (!l) return <p className="font-bold text-senal-suave">Todas marcadas. Repasa con ▶ y afina con − / +.</p>;
  return (
    <p className="text-2xl font-bold leading-snug">
      <span className="font-mono text-xs text-crema/55 mr-2">SIGUIENTE</span>
      {mode === "lineas" ? l.words.map(w => w.text).join(" ") : l.words.map((w, k) => (
        <span key={k} className={k === cursor.word ? "text-senal" : k < cursor.word ? "text-crema/40" : ""}>{w.text} </span>
      ))}
    </p>
  );
}

/* Vista previa básica (karaoke por línea) para comprobar la sincronía.
   Los estilos de verdad llegan con el motor del vídeo (paso 2). */
function Preview({ sync, t }: { sync: Sync; t: number }) {
  const { line, word } = at(sync, t);
  const l = sync.lines[line];
  return (
    <div className="relative aspect-video w-full max-h-[42vh] rounded-[20px] bg-marco overflow-hidden grid place-items-center p-8">
      <span className="absolute top-3 left-4 font-mono text-[11px] text-crema/45">VISTA PREVIA · 16:9</span>
      {l ? (
        <p key={line} className="text-center text-[clamp(22px,3.2vw,48px)] font-extrabold tracking-[-.02em] leading-tight anim-fade">
          {l.words.map((w, k) => (
            <span key={k}
              className={cx(k <= word ? "text-crema" : "text-crema/30", k === word && "text-senal", w.em === "fuerte" && "text-senal-suave", w.em === "impacto" && "uppercase text-[1.35em]")}
              style={w.em === "temblor" && k <= word ? { animation: "vl-temblor .2s infinite", display: "inline-block" } : undefined}>
              {w.text}{" "}
            </span>
          ))}
        </p>
      ) : <span className="text-crema/30 font-mono text-sm">· · ·</span>}
    </div>
  );
}

/* Forma de onda con las marcas de cada línea y el cursor. Clic = ir ahí. */
function Wave({ wave, sync, t, sel, onSeek }: { wave?: Float32Array; sync: Sync; t: number; sel: number | null; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dur = sync.durationSec;
  useEffect(() => {
    const c = ref.current;
    if (!c || !wave || !dur) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr, h = c.clientHeight * dpr;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext("2d")!;
    const css = getComputedStyle(c);
    const crema = css.getPropertyValue("--color-crema").trim() || "#F6E6CC";
    const senal = css.getPropertyValue("--color-senal").trim() || "#E8662C";
    g.clearRect(0, 0, w, h);
    const x = (s: number) => (s / dur) * w;
    // tramos con letra
    g.fillStyle = senal; g.globalAlpha = 0.12;
    sync.lines.forEach((l, i) => {
      if (l.t == null) return;
      const e = lineEnd(sync.lines, i, dur)!;
      g.fillRect(x(l.t), 0, Math.max(1, x(e) - x(l.t)), h);
    });
    // onda
    g.globalAlpha = 0.55; g.fillStyle = crema;
    const mid = h / 2;
    for (let i = 0; i < w; i++) {
      const v = wave[Math.floor((i / w) * wave.length)] ?? 0;
      const a = Math.max(1, v * (h * 0.46));
      g.fillRect(i, mid - a, 1, a * 2);
    }
    // marcas de línea
    g.globalAlpha = 1;
    sync.lines.forEach((l, i) => {
      if (l.t == null) return;
      g.fillStyle = senal;
      g.fillRect(x(l.t), 0, (i === sel ? 3 : 1.5) * dpr, h);
      const end = l.end;
      if (end != null) { g.fillStyle = crema; g.globalAlpha = 0.6; g.fillRect(x(end), h * 0.7, 1.5 * dpr, h * 0.3); g.globalAlpha = 1; }
    });
    // cursor
    g.fillStyle = crema;
    g.fillRect(x(t) - dpr, 0, 2 * dpr, h);
  }, [wave, sync, t, sel, dur]);

  return (
    <canvas ref={ref} className="w-full h-24 rounded-[14px] bg-tubo cursor-pointer"
      aria-label="Forma de onda: clic para ir a ese punto"
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * dur); }} />
  );
}
