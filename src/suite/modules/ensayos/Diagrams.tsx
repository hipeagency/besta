/* Diagramas de los acordes de la canción, del instrumento de quien se
   está mirando: guitarra (SVGuitar), teclado o mástil de bajo. Los
   colores salen de las variables del tema, así que valen en claro y oscuro. */
import { useEffect, useRef, useState } from "react";
import { toLatin } from "@/lib/chords";
import { cx } from "@/lib/format";
import { chordNotes, guitarShape, parseChord, type DiagramKind } from "./chordShapes";

/** ¿Tema claro? Escucha el cambio de data-theme en <html>. */
function useIsLight() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setLight(el.dataset.theme === "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return light;
}

export function ChordDiagrams({ chords, kind, latin, className }: { chords: string[]; kind: DiagramKind; latin: boolean; className?: string }) {
  const light = useIsLight();
  if (!kind || !chords.length) return null;
  return (
    <section aria-label={`diagramas de ${kind}`} className={cx("flex gap-2.5 overflow-x-auto no-scrollbar md:flex-wrap print:hidden", className)}>
      {chords.map(c => (
        <figure key={c} className="shrink-0 w-[92px] rounded-xl bg-tubo p-2 flex flex-col items-center gap-1.5">
          <figcaption className="font-mono text-[13px] font-semibold text-senal-suave">{latin ? toLatin(c) : c}</figcaption>
          <div className="w-[80px] h-[96px] grid place-items-center">
            {kind === "guitarra" ? <Guitar chord={c} light={light} /> : kind === "piano" ? <Piano chord={c} light={light} /> : <Bass chord={c} />}
          </div>
        </figure>
      ))}
    </section>
  );
}

const Missing = ({ text = "sin diagrama" }: { text?: string }) =>
  <span className="font-mono text-[10px] uppercase tracking-[.08em] text-crema/55 text-center">{text}</span>;

// ---------- guitarra ----------
function Guitar({ chord, light }: { chord: string; light: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"ok" | "sin" | "error">("ok");
  useEffect(() => {
    const shape = guitarShape(chord);
    if (!shape) { setState("sin"); return; }
    setState("ok");
    let dead = false;
    /* La librería se carga solo cuando hace falta (y solo en el navegador). */
    import("svguitar").then(({ SVGuitarChord, ChordStyle }) => {
      const el = ref.current;
      if (dead || !el) return;
      el.innerHTML = "";
      const css = getComputedStyle(document.documentElement);
      const v = (n: string) => css.getPropertyValue(n).trim();
      new SVGuitarChord(el).configure({
        strings: 6, frets: 5, style: ChordStyle.normal,
        fingerSize: 0.7, fingerColor: v("--color-senal"), fingerTextColor: v("--color-noche"), fingerTextSize: 22,
        backgroundColor: "transparent", color: v("--color-crema"), strokeWidth: 1.4, nutWidth: 4,
        noPosition: !shape.position || shape.position === 1, fixedDiagramPosition: false,
      }).chord({ fingers: shape.fingers, barres: shape.barres, position: shape.position || 1 }).draw();
    }).catch(() => { if (!dead) setState("error"); });
    return () => { dead = true; };
  }, [chord, light]);
  if (state !== "ok") return <Missing text={state === "error" ? "error" : undefined} />;
  return <div ref={ref} role="img" aria-label={`postura de ${chord}`} className="size-full grid place-items-center [&_svg]:max-w-full [&_svg]:max-h-full" />;
}

// ---------- piano ----------
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [{ after: 0, semi: 1 }, { after: 1, semi: 3 }, { after: 3, semi: 6 }, { after: 4, semi: 8 }, { after: 5, semi: 10 }];

function Piano({ chord, light }: { chord: string; light: boolean }) {
  const p = parseChord(chord);
  if (!p) return <Missing text="—" />;
  const notes = chordNotes(p);
  const root = p.root % 12;
  const W = 11, H = 60, BW = 7, BH = 38;
  /* Teclas blancas siempre claras y negras siempre oscuras, sea cual sea el tema. */
  const white = light ? "fill-noche" : "fill-crema";
  const black = light ? "fill-crema" : "fill-noche";
  const cls = (semi: number, oct: number, base: string) =>
    !notes.has(semi) ? base : semi === root && oct === 0 ? "fill-senal" : "fill-senal-suave";
  return (
    <svg viewBox={`0 0 ${W * 14} ${H + 2}`} className="w-full" role="img" aria-label={`teclado de ${chord}`}>
      {[0, 1].flatMap(oct => WHITE.map((semi, i) => (
        <rect key={`w${oct}${i}`} x={(oct * 7 + i) * W} y={0} width={W} height={H} strokeWidth={1}
          className={cx(cls(semi, oct, white), "stroke-crema/60")} />
      )))}
      {[0, 1].flatMap(oct => BLACK.map(b => (
        <rect key={`b${oct}${b.semi}`} x={(oct * 7 + b.after + 1) * W - BW / 2} y={0} width={BW} height={BH} strokeWidth={1}
          className={cx(cls(b.semi, oct, black), "stroke-crema/60")} />
      )))}
    </svg>
  );
}

// ---------- bajo ----------
/* Un bajista no lee posturas: lee dónde cae la tónica y la quinta.
   4 cuerdas (Mi La Re Sol, grave a la izquierda) y 5 trastes alrededor de la tónica más grave. */
const BASS_OPEN = [4, 9, 2, 7];
const WIN = 5;

function Bass({ chord }: { chord: string }) {
  const p = parseChord(chord);
  if (!p) return <Missing text="—" />;
  const root = p.root % 12;
  const fifth = (root + 7) % 12;
  const fretOn = (open: number) => ((root - open) % 12 + 12) % 12;
  const lowest = Math.min(fretOn(BASS_OPEN[0]), fretOn(BASS_OPEN[1]));
  const start = lowest === 0 ? 0 : Math.max(1, lowest - 1);
  const W = 54, H = 68, px = 9, top = 10;
  const sGap = (W - px * 2) / (BASS_OPEN.length - 1);
  const fGap = (H - top - 4) / WIN;
  const dots: { x: number; y: number; isRoot: boolean }[] = [];
  BASS_OPEN.forEach((open, i) => {
    const x = px + i * sGap;
    for (let f = start; f <= start + WIN; f++) {
      const semi = (open + f) % 12;
      if (semi !== root && semi !== fifth) continue;
      if (f === 0 && start !== 0) continue;
      dots.push({ x, y: f === 0 ? top - 5 : top + (f - start - 0.5) * fGap, isRoot: semi === root });
    }
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img" aria-label={`tónica y quinta de ${chord} en el bajo`}>
      <line x1={px} y1={top} x2={W - px} y2={top} className="stroke-crema" strokeWidth={start === 0 ? 2.4 : 0.7} strokeOpacity={start === 0 ? 1 : 0.35} />
      {Array.from({ length: WIN }, (_, k) => {
        const y = top + (k + 1) * fGap;
        return <line key={k} x1={px} y1={y} x2={W - px} y2={y} className="stroke-crema" strokeWidth={0.7} strokeOpacity={0.35} />;
      })}
      {BASS_OPEN.map((_, i) => {
        const x = px + i * sGap;
        return <line key={i} x1={x} y1={top} x2={x} y2={top + WIN * fGap} className="stroke-crema" strokeWidth={0.7} strokeOpacity={0.55} />;
      })}
      {dots.map((d, i) => d.isRoot
        ? <circle key={i} cx={d.x} cy={d.y} r={4.2} className="fill-senal" />
        : <circle key={i} cx={d.x} cy={d.y} r={3.4} className="fill-none stroke-senal" strokeWidth={1.3} />)}
      {start > 0 && <text x={W - px + 2} y={top + fGap * 0.75} fontSize={7} dominantBaseline="middle" className="fill-crema/60 font-mono">{start}</text>}
    </svg>
  );
}
