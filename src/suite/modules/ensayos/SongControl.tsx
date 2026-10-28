/* Control de la canción mientras se ensaya: auto-scroll al ritmo del
   BPM, claqueta, transposición y tamaño de letra. En escritorio flota
   abajo a la derecha; en móvil va encima de la barra de contexto. */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "@/lib/format";
import { FONT_MAX, FONT_MIN, SPEED_MAX, SPEED_MIN } from "./lib";

export const DEFAULT_BPM = 100;
const PX_PER_BEAT = 9; // ~30 px/s a 120 BPM con ×1, como la app antigua

export const songBpm = (bpm?: number) => (bpm && bpm > 20 && bpm < 400 ? bpm : DEFAULT_BPM);

/** Contenedor que de verdad hace scroll: <main> en escritorio, la ventana en móvil. */
function scrollerOf(main: HTMLElement | null): HTMLElement | null {
  if (main && /(auto|scroll)/.test(getComputedStyle(main).overflowY) && main.scrollHeight > main.clientHeight) return main;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Auto-scroll: px/s = BPM/60 × 9 × multiplicador. Se para solo al llegar al final. */
export function useAutoscroll(main: RefObject<HTMLElement | null>, bpm: number, mult: number) {
  const [on, setOn] = useState(false);
  const speed = useRef(0);
  speed.current = (bpm / 60) * PX_PER_BEAT * mult;
  useEffect(() => {
    if (!on) return;
    let last = performance.now();
    let rest = 0; // los decimales que scrollTop redondea
    let raf = requestAnimationFrame(function tick(t) {
      const el = scrollerOf(main.current);
      if (!el) { setOn(false); return; }
      const delta = speed.current * ((t - last) / 1000) + rest;
      last = t;
      const before = el.scrollTop;
      el.scrollTop = before + delta;
      rest = delta - (el.scrollTop - before);
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setOn(false); return; }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [on, main]);
  return [on, setOn] as const;
}

/* Claqueta con Web Audio: se programa por adelantado para que el tempo
   no dependa de los temporizadores del navegador. Acento en el 1 de 4. */
const BEATS = 4;
type AC = typeof AudioContext;

export function useMetronome(songBpmValue: number) {
  const [on, setOn] = useState(false);
  const [override, setOverride] = useState<number | null>(null); // null → sigue a la canción
  const [beat, setBeat] = useState(-1);
  const bpm = override ?? songBpmValue;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => { setOverride(null); }, [songBpmValue]);

  useEffect(() => {
    if (!on) { setBeat(-1); return; }
    if (!ctx.current) {
      const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext) as AC | undefined;
      if (!C) { setOn(false); return; }
      ctx.current = new C();
    }
    const ac = ctx.current;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    let next = ac.currentTime + 0.08;
    let n = 0;
    const timers: number[] = [];
    const click = (time: number, i: number) => {
      const accent = i % BEATS === 0;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "square";
      osc.frequency.value = accent ? 1500 : 900;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, time + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(time); osc.stop(time + 0.06);
      // pulso visual a la vez que suena
      timers.push(window.setTimeout(() => setBeat(i % BEATS), Math.max(0, (time - ac.currentTime) * 1000)));
    };
    const id = window.setInterval(() => {
      while (next < ac.currentTime + 0.12) {
        click(next, n);
        next += 60 / bpmRef.current;
        n++;
      }
      if (timers.length > 16) timers.splice(0, timers.length - 16);
    }, 25);
    return () => { clearInterval(id); timers.forEach(clearTimeout); };
  }, [on]);

  useEffect(() => () => { ctx.current?.close().catch(() => {}); }, []);

  const setBpm = useCallback((v: number) => {
    const n = Math.round(v);
    if (!Number.isFinite(n)) return;
    const c = Math.max(30, Math.min(300, n));
    setOverride(c === songBpmValue ? null : c);
  }, [songBpmValue]);

  return { on, setOn, bpm, setBpm, custom: override !== null, beat };
}

export type Metronome = ReturnType<typeof useMetronome>;

export interface ControlProps {
  scrolling: boolean; onScroll: (v: boolean) => void;
  speed: number; onSpeed: (v: number) => void;
  hasBpm: boolean; songBpm: number;
  metro: Metronome;
  semis: number; onSemis: (n: number) => void;
  font: number; onFont: (v: number) => void;
  extra?: ReactNode;
  className?: string;
}

const fmtX = (x: number) => `${x.toFixed(x % 1 === 0 ? 1 : 2).replace(/(\.\d)0$/, "$1")}×`;

/** La botonera. `floating` = píldora flotante de escritorio; si no, tira horizontal. */
export function SongControl(p: ControlProps & { floating?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const step = (v: number, d: number, min: number, max: number) => Math.max(min, Math.min(max, +(v + d).toFixed(2)));
  const btn = "inline-grid place-items-center min-w-11 h-11 px-2 rounded-full text-crema/85 hover:text-crema hover:bg-crema/10 transition disabled:opacity-35 font-mono text-[15px]";
  const group = "inline-flex items-center shrink-0 rounded-full bg-noche/70 px-1";
  return (
    <div role="toolbar" aria-label="control de la canción"
      className={cx("flex items-center gap-1.5", p.floating ? "rounded-full bg-tubo-alto p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.35)] border border-crema/10" : "overflow-x-auto no-scrollbar", p.className)}>
      {/* auto-scroll */}
      <span className={group}>
        <button type="button" aria-pressed={p.scrolling} aria-label={p.scrolling ? "parar auto-scroll" : "auto-scroll"}
          title={`auto-scroll · ${p.hasBpm ? `${p.songBpm} BPM` : `~${DEFAULT_BPM} BPM (sin valor)`}`}
          onClick={() => p.onScroll(!p.scrolling)}
          className={cx(btn, "font-sans", p.scrolling && "!bg-senal !text-noche")}>{p.scrolling ? "❚❚" : "▶"}</button>
        <button type="button" aria-label="más lento" onClick={() => p.onSpeed(step(p.speed, -0.25, SPEED_MIN, SPEED_MAX))} disabled={p.speed <= SPEED_MIN} className={btn}>−</button>
        <span className="font-mono text-[13px] w-11 text-center" aria-live="polite" title="velocidad">{fmtX(p.speed)}</span>
        <button type="button" aria-label="más rápido" onClick={() => p.onSpeed(step(p.speed, 0.25, SPEED_MIN, SPEED_MAX))} disabled={p.speed >= SPEED_MAX} className={btn}>+</button>
      </span>

      {/* claqueta */}
      <span className={group} title="claqueta · acento en el 1">
        <button type="button" aria-pressed={p.metro.on} aria-label={p.metro.on ? "parar claqueta" : "claqueta"} onClick={() => p.metro.setOn(!p.metro.on)}
          className={cx(btn, "font-sans text-lg", p.metro.on && "!bg-senal !text-noche", p.metro.on && p.metro.beat === 0 && "scale-110")}>♩</button>
        {p.metro.on && (
          <span aria-hidden="true" className="flex gap-1 px-1">
            {[0, 1, 2, 3].map(i => <span key={i} className={cx("size-1.5 rounded-full transition-colors", p.metro.beat === i ? (i === 0 ? "bg-senal" : "bg-crema") : "bg-crema/20")} />)}
          </span>
        )}
        <button type="button" aria-label="−5 BPM" onClick={() => p.metro.setBpm(p.metro.bpm - 5)} className={btn}>−</button>
        <input type="number" inputMode="numeric" min={30} max={300}
          value={draft ?? String(p.metro.bpm)} aria-label="BPM de la claqueta"
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft != null) p.metro.setBpm(Number(draft)); setDraft(null); }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={cx("w-12 h-9 bg-transparent text-center font-mono text-[14px] rounded-lg focus:outline-none focus:bg-crema/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
            p.metro.custom ? "text-senal-suave" : "text-crema")} />
        <button type="button" aria-label="+5 BPM" onClick={() => p.metro.setBpm(p.metro.bpm + 5)} className={btn}>+</button>
      </span>

      {/* tono */}
      <span className={group} title="transposición (solo para ti)">
        <button type="button" aria-label="bajar medio tono" onClick={() => p.onSemis(p.semis - 1)} className={cx(btn, "text-lg")}>♭</button>
        <span className={cx("font-mono text-[13px] w-7 text-center", p.semis ? "text-senal-suave" : "text-crema/70")} aria-live="polite">{p.semis > 0 ? `+${p.semis}` : p.semis}</span>
        <button type="button" aria-label="subir medio tono" onClick={() => p.onSemis(p.semis + 1)} className={cx(btn, "text-lg")}>♯</button>
        <button type="button" aria-label="volver al tono original" onClick={() => p.onSemis(0)} disabled={!p.semis} className={btn}>⟳</button>
      </span>

      {/* letra */}
      <span className={group}>
        <button type="button" aria-label="letra más pequeña" onClick={() => p.onFont(step(p.font, -0.1, FONT_MIN, FONT_MAX))} disabled={p.font <= FONT_MIN} className={cx(btn, "font-sans font-semibold")}>A−</button>
        <button type="button" aria-label="letra más grande" onClick={() => p.onFont(step(p.font, 0.1, FONT_MIN, FONT_MAX))} disabled={p.font >= FONT_MAX} className={cx(btn, "font-sans font-semibold")}>A+</button>
      </span>
      {p.extra}
    </div>
  );
}
