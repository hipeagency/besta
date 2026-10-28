/* Modo directo: pantalla negra para el atril. Una canción cada vez,
   letra enorme, acordes en naranja y la línea por la que vas marcada.
   Pasa de canción tocando los lados, con flechas o con un pasapáginas
   bluetooth (envían RePág/AvPág o flechas). La pantalla no se apaga. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useCollection } from "@/data/hooks";
import type { Song } from "@/data/types";
import { cx } from "@/lib/format";
import { setlistItems } from "./extra";
import { displayKey, durationSecs, mmss, shownSections, usePase, usePref, useTranspose, useView, useWakeLock } from "./lib";
import { Icon, Punto } from "@/components/ui/icons";

const MIN = 0.5, MAX = 2;

/* El escenario es siempre oscuro, aunque la suite esté en claro:
   se fijan aquí los colores del tema oscuro para todo lo de dentro. */
const STAGE = {
  "--color-noche": "#0F0B08", "--color-tubo": "#1C1510", "--color-crema": "#F6E6CC",
  "--color-senal": "#E8662C", "--color-senal-suave": "#F08A57", colorScheme: "dark",
} as CSSProperties;

export function Directo() {
  const { setlistId, songId } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: setlists, loading: l1 } = useCollection("setlists");
  const { data: songs, loading: l2 } = useCollection("songs");
  const { data: members } = useCollection("members");
  const { me, viewAs, mode, latin } = useView();
  const viewer = members.find(m => m.id === viewAs) ?? me;

  const sl = setlistId ? setlists.find(s => s.id === setlistId) : undefined;
  const list = useMemo(
    () => (sl ? sl.songIds : songId ? [songId] : []).map(id => songs.find(s => s.id === id)).filter((s): s is Song => !!s),
    [sl, songId, songs],
  );
  const idx = Math.min(Math.max(0, Number(params.get("n")) || 0), Math.max(0, list.length - 1));
  const song = list[idx];
  const next = list[idx + 1];

  /* Lo que el setlist dice alrededor de esta canción: bloque que abre, su nota y los momentos que vienen después. */
  const around = useMemo(() => {
    const items = sl ? setlistItems(sl) : [];
    let k = -1, block = "", notes = "";
    const moments: string[] = [];
    let pendingBlock = "";
    for (const it of items) {
      if (it.type === "bloque") { pendingBlock = it.title; if (k === idx) break; continue; }
      if (it.type === "momento") { if (k === idx) moments.push(it.title || "momento"); continue; }
      if (k === idx) break;
      k++;
      if (k === idx) { block = pendingBlock; notes = it.notes ?? ""; }
      pendingBlock = "";
    }
    return { block, notes, moments };
  }, [sl, idx]);
  const go = useCallback((d: number) => {
    const n = idx + d;
    if (n < 0 || n >= list.length) return;
    setParams(p => { p.set("n", String(n)); return p; }, { replace: true });
  }, [idx, list.length, setParams]);

  const exit = () => nav(setlistId ? `/ensayos/setlists/${setlistId}` : `/ensayos/${songId ?? ""}`);

  const [scale, setScale] = usePref<number>("besta:ensayos:directo-escala", typeof window !== "undefined" && window.innerWidth < 700 ? 0.65 : 1);
  const [semis] = useTranspose(song?.id);
  const [pase, setPase] = usePase();
  const estrofas = pase === "estrofas";
  const [auto, setAuto] = useState(false);
  const [sec, setSec] = useState(0);
  const toLast = useRef(false); // al volver atrás desde la 1ª estrofa, se entra por la última
  const [cur, setCur] = useState(0);
  const [frac, setFrac] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const lineEls = useRef<(HTMLDivElement | null)[]>([]);

  useWakeLock(true);

  /* Canción nueva: arriba del todo y sin auto-scroll. */
  useEffect(() => {
    setAuto(false); setCur(0); setFrac(0);
    setSec(toLast.current ? Number.MAX_SAFE_INTEGER : 0);
    toLast.current = false;
    scroller.current?.scrollTo({ top: 0 });
  }, [song?.id]);

  /* Por estrofas: una sección cada vez; al acabar la canción, la siguiente. */
  const nSecs = song ? Math.max(1, shownSections(song, mode, viewer.id, 0, false).length) : 1;
  const secIdx = Math.min(sec, nSecs - 1);
  const step = useCallback((d: number) => {
    const n = secIdx + d;
    if (n >= 0 && n < nSecs) { setSec(n); return; }
    if (d < 0 && idx > 0) toLast.current = true;
    if (d > 0 && idx >= list.length - 1) { setAuto(false); return; }
    go(d);
  }, [secIdx, nSecs, idx, list.length, go]);

  /* Línea actual: la que cruza el tercio superior de la pantalla. */
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setFrac(max > 0 ? el.scrollTop / max : 0);
    const anchor = el.scrollTop + el.clientHeight * 0.33;
    let c = 0;
    lineEls.current.forEach((n, i) => { if (n && n.offsetTop <= anchor) c = i; });
    setCur(el.scrollTop <= 2 ? 0 : c);
  }, []);

  /* Auto-scroll: recorre todo el texto en lo que dura la canción. */
  const secs = durationSecs(song?.duration);
  useEffect(() => {
    const el = scroller.current;
    if (!auto || !el || estrofas) return;
    const total = el.scrollHeight - el.clientHeight;
    if (total <= 0) { setAuto(false); return; }
    const speed = total / secs;
    let last = performance.now();
    let pos = el.scrollTop;
    let raf = requestAnimationFrame(function step(t) {
      pos += speed * ((t - last) / 1000);
      last = t;
      el.scrollTop = pos;
      if (pos >= total) { setAuto(false); return; }
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [auto, secs, scale, song?.id, estrofas]);

  /* Auto por estrofas: cada sección dura lo que le toca de la canción. */
  useEffect(() => {
    if (!auto || !estrofas) return;
    const t = setTimeout(() => step(1), (secs / nSecs) * 1000);
    return () => clearTimeout(t);
  }, [auto, estrofas, secs, nSecs, secIdx, idx, step]);

  /* Teclado y pasapáginas. AvPág/espacio bajan; si ya estás abajo, siguiente canción. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (estrofas) {
        if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); step(1); }
        else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1); }
        return;
      }
      const el = scroller.current;
      const page = el ? el.clientHeight * 0.75 : 0;
      const atEnd = !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = !el || el.scrollTop <= 4;
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); go(1); break;
        case "ArrowLeft": e.preventDefault(); go(-1); break;
        case "PageDown": case " ":
          e.preventDefault(); setAuto(false);
          if (atEnd) go(1); else el!.scrollBy({ top: page, behavior: "smooth" });
          break;
        case "PageUp":
          e.preventDefault(); setAuto(false);
          if (atTop) go(-1); else el!.scrollBy({ top: -page, behavior: "smooth" });
          break;
        case "ArrowDown": e.preventDefault(); el?.scrollBy({ top: 120, behavior: "smooth" }); break;
        case "ArrowUp": e.preventDefault(); el?.scrollBy({ top: -120, behavior: "smooth" }); break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go, step, estrofas]);

  if (l1 || l2) return <div className="fixed inset-0 bg-black" style={STAGE} />;
  if (!song) return (
    <div style={STAGE} className="fixed inset-0 z-40 bg-black text-crema grid place-items-center p-6 text-center">
      <div className="flex flex-col gap-4 items-center">
        <p className="text-2xl font-semibold">{sl ? "Este setlist está vacío" : "No hay nada que tocar"}</p>
        <button type="button" onClick={exit} className="h-12 px-6 rounded-full bg-senal text-noche font-semibold">volver</button>
      </div>
    </div>
  );

  const sections = shownSections(song, mode, viewer.id, semis, latin);
  const note = song.instrumentNotes[viewer.id];
  const cur$ = sections[secIdx];
  const nextSec = sections[secIdx + 1];
  const progress = list.length ? (idx + (estrofas ? (secIdx + 1) / sections.length : frac)) / list.length : 0;
  const fs = (px: number) => Math.round(px * scale);
  let li = -1;
  lineEls.current = [];

  return (
    <div style={STAGE} className="fixed inset-0 z-40 bg-black text-crema flex flex-col select-none">
      <div className="h-1 bg-crema/12" role="progressbar" aria-label="Avance del setlist" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-senal transition-[width]" style={{ width: `${progress * 100}%` }} />
      </div>

      <header className="flex justify-between items-center gap-3 px-3 md:px-7 py-2 md:py-3 font-mono text-[13px] md:text-[15px]">
        <span className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={exit} aria-label="Salir del modo directo" className="size-11 shrink-0 rounded-full grid place-items-center text-crema/70 hover:bg-crema/10"><Icon name="x" size={18} /></button>
          <span className="truncate text-crema/70">{list.length > 1 ? `${idx + 1} / ${list.length}` : "canción suelta"}{sl ? ` · ${sl.name.toUpperCase()}` : ""}</span>
        </span>
        <span className="hidden sm:flex gap-4 md:gap-5 shrink-0">
          <span>{displayKey(song.key, semis, latin)}</span>
          {song.bpm ? <span>{song.bpm} BPM</span> : null}
          <span className={auto ? "text-senal" : "text-crema/60"}>{auto && <><Punto className="mr-1.5" />auto </>}{estrofas ? `estrofa ${secIdx + 1} / ${sections.length}` : `${mmss(frac * secs)} / ${mmss(secs)}`}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0 justify-end">
          <button type="button" onClick={() => { setAuto(false); setPase(estrofas ? "continuo" : "estrofas"); }}
            title="cambiar entre scroll continuo y pase por estrofas"
            className="h-11 px-3 shrink-0 rounded-full border border-crema/25 text-crema/80 hover:text-crema text-[12px] md:text-[13px]">
            {estrofas ? "por estrofas" : "continuo"}
          </button>
          <span className="hidden md:inline truncate text-crema/70 text-right">{viewer.name.toUpperCase()} · {viewer.instrument.toUpperCase()}</span>
        </span>
      </header>

      <div className="flex-1 flex min-h-0">
        <button type="button" aria-label={estrofas ? "Estrofa anterior" : "Canción anterior"} onClick={() => estrofas ? step(-1) : go(-1)} disabled={idx === 0 && (!estrofas || secIdx === 0)}
          className="w-12 md:w-[72px] shrink-0 text-[28px] text-crema/25 hover:text-crema/60 disabled:opacity-0">‹</button>

        {estrofas ? (
          /* Tocar el tercio izquierdo vuelve; el resto avanza (como el pedal). */
          <div onClick={e => { const r = e.currentTarget.getBoundingClientRect(); step(e.clientX - r.left < r.width / 3 ? -1 : 1); }}
            className="flex-1 min-w-0 overflow-y-auto no-scrollbar flex flex-col justify-center py-6 cursor-pointer" aria-live="polite">
            {secIdx === 0 && <>
              {around.block && <p className="font-mono uppercase tracking-[.16em] text-senal mb-2" style={{ fontSize: Math.max(12, fs(15)) }}>{around.block}</p>}
              <p className="font-extrabold tracking-[-.02em] text-crema/50 mb-4" style={{ fontSize: fs(24) }}>{song.title}</p>
              {around.notes && <p className="text-crema/75 mb-4" style={{ fontSize: fs(20) }}><Icon name="flecha" size={16} className="inline align-[-2px] mr-1.5" />{around.notes}</p>}
            </>}
            {cur$ && (
              <section className="flex flex-col" style={{ gap: fs(16) }}>
                <h2 className="font-mono tracking-[.14em] uppercase text-senal" style={{ fontSize: Math.max(13, fs(16)) }}>
                  {cur$.sec.name}{cur$.sec.note && mode !== "limpio" && <span className="ml-3 normal-case tracking-normal text-crema/55">{cur$.sec.note}</span>}
                </h2>
                {cur$.lines.length === 0 && <p className="text-crema/60 italic" style={{ fontSize: fs(40) }}>{cur$.sec.name.toLowerCase()}</p>}
                {cur$.lines.map((l, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {l.chords && <span className="font-mono text-senal whitespace-pre-wrap" style={{ fontSize: fs(30) }}>{l.chords}</span>}
                    {l.lyric && <span className="leading-[1.12] font-semibold tracking-[-.01em] whitespace-pre-wrap" style={{ fontSize: fs(50) }}>{l.lyric}</span>}
                  </div>
                ))}
              </section>
            )}
          </div>
        ) : (
        <div ref={scroller} onScroll={onScroll} onWheel={() => setAuto(false)} onTouchStart={() => setAuto(false)}
          className="relative flex-1 min-w-0 overflow-y-auto no-scrollbar py-[18vh]">
          {around.block && <p className="font-mono uppercase tracking-[.16em] text-senal mb-2" style={{ fontSize: Math.max(12, fs(15)) }}>{around.block}</p>}
          <h1 className="font-extrabold tracking-[-.02em] text-crema/60 mb-6" style={{ fontSize: fs(30) }}>{song.title}</h1>
          {around.notes && <p className="text-crema/75 mb-4" style={{ fontSize: fs(20) }}><Icon name="flecha" size={16} className="inline align-[-2px] mr-1.5" />{around.notes}</p>}
          <div className="flex flex-col" style={{ gap: fs(22) }}>
            {sections.map(({ sec, lines }) => (
              <section key={sec.id} className="flex flex-col" style={{ gap: fs(14) }}>
                <h2 className="font-mono tracking-[.14em] uppercase text-senal" style={{ fontSize: Math.max(12, fs(14)) }}>
                  {sec.name}{sec.note && mode !== "limpio" && <span className="ml-3 normal-case tracking-normal text-crema/55">{sec.note}</span>}
                </h2>
                {lines.map((l, i) => {
                  li++;
                  const n = li;
                  const on = n === cur;
                  return (
                    <div key={i} ref={el => { lineEls.current[n] = el; }}
                      className={cx("flex flex-col gap-1 border-l-4 pl-4 md:pl-5 transition-opacity overflow-x-auto no-scrollbar", on ? "border-senal" : "border-transparent", n < cur && "opacity-35")}>
                      {l.chords && <span className="font-mono text-senal whitespace-pre" style={{ fontSize: fs(on ? 34 : 26) }}>{l.chords}</span>}
                      {l.lyric && <span className={cx("leading-[1.12] whitespace-pre-wrap", on && "font-semibold tracking-[-.01em]")} style={{ fontSize: fs(on ? 52 : 40) }}>{l.lyric}</span>}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          {note && mode !== "limpio" && (
            <p className="mt-8 inline-block px-4 py-3 rounded-xl bg-tubo" style={{ fontSize: fs(20) }}>
              {viewer.id === me.id ? "tu nota" : `nota de ${viewer.name}`} · <b className="text-senal">{note}</b>
            </p>
          )}
        </div>
        )}

        <button type="button" aria-label={estrofas ? "Estrofa siguiente" : "Canción siguiente"} onClick={() => estrofas ? step(1) : go(1)} disabled={!next && (!estrofas || !nextSec)}
          className="w-12 md:w-[72px] shrink-0 text-[28px] text-crema/25 hover:text-crema/60 disabled:opacity-0">›</button>
      </div>

      <footer className="flex justify-between items-center gap-3 px-3 md:px-7 py-3 md:py-4 border-t border-crema/10 pb-[max(12px,env(safe-area-inset-bottom))]">
        <span className="min-w-0 truncate text-base md:text-xl">
          {estrofas && nextSec ? <>
            <span className="font-mono text-xs md:text-sm text-crema/60">LUEGO · </span>{nextSec.sec.name}
          </> : around.moments.length ? <>
            <span className="font-mono text-xs md:text-sm text-crema/60">LUEGO · </span><i>{around.moments.join(" · ")}</i>
            {next && <span className="text-crema/60"> <Icon name="flecha" size={14} className="inline align-[-2px]" /> {next.title}</span>}
          </> : next ? <>
            <span className="font-mono text-xs md:text-sm text-crema/60">SIGUIENTE · </span>{next.title}{" "}
            <span className="font-mono text-senal">{displayKey(next.key, 0, latin)}</span>
          </> : <span className="font-mono text-sm text-crema/60">{list.length > 1 ? "ÚLTIMA DEL SETLIST" : ""}</span>}
        </span>
        <span className="flex gap-2 shrink-0">
          <button type="button" aria-label="Letra más pequeña" onClick={() => setScale(Math.max(MIN, +(scale - 0.1).toFixed(2)))} disabled={scale <= MIN}
            className="h-12 px-4 md:px-[18px] rounded-full border-[1.5px] border-crema/30 font-semibold text-lg">A−</button>
          <button type="button" aria-label="Letra más grande" onClick={() => setScale(Math.min(MAX, +(scale + 0.1).toFixed(2)))} disabled={scale >= MAX}
            className="h-12 px-4 md:px-[18px] rounded-full border-[1.5px] border-crema/30 font-semibold text-lg">A+</button>
          <button type="button" aria-pressed={auto} onClick={() => setAuto(!auto)}
            className="h-12 px-5 md:px-[22px] rounded-full bg-senal text-noche font-semibold text-lg"><span className="inline-flex items-center gap-2"><Icon name={auto ? "pause" : "play"} size={16} />{auto ? "pausa" : "auto"}</span></button>
        </span>
      </footer>
    </div>
  );
}
