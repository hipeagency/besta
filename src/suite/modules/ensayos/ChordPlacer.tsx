/* Poner acordes tocando la letra: tocas una palabra (o una sílaba) y
   eliges el acorde de la paleta; se coloca encima en su columna. Debajo
   sigue siendo el mismo texto de siempre (acordes encima de la letra). */
import { useState, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { toLatin } from "@/lib/chords";
import { linesToText, parseChordText } from "./lib";

interface Sel { line: number; col: number; word?: { start: number; text: string } }

/** Acordes de una línea con su columna. */
const tokensOf = (chords: string) => [...chords.matchAll(/\S+/g)].map(m => ({ col: m.index ?? 0, t: m[0] }));

/** Pone (o quita, con null) el acorde que empieza en `col`. Si pisa al de al lado, lo empuja. */
export function putChord(chords: string, col: number, chord: string | null) {
  const toks = tokensOf(chords).filter(x => x.col !== col);
  if (chord) toks.push({ col, t: chord });
  toks.sort((a, b) => a.col - b.col);
  let out = "";
  for (const x of toks) {
    const p = out ? Math.max(x.col, out.length + 1) : x.col;
    out += " ".repeat(p - out.length) + x.t;
  }
  return out;
}

export function ChordPlacer({ text, onChange, songChords, latin, onWrite }: {
  text: string; onChange: (text: string) => void; songChords: string[]; latin: boolean; onWrite: () => void;
}) {
  const lines = parseChordText(text);
  const [sel, setSel] = useState<Sel | null>(null);
  const label = (c: string) => (latin ? toLatin(c) : c);

  const set = (chord: string | null) => {
    if (!sel) return;
    const next = [...lines];
    if (sel.line >= next.length) { if (chord) next.push({ chords: chord, lyric: "" }); } // línea instrumental nueva
    else next[sel.line] = { ...next[sel.line], chords: putChord(next[sel.line].chords, sel.col, chord) };
    onChange(linesToText(next));
    setSel(null);
  };

  /** Tocar una palabra: si ya tiene un acorde dentro, se edita ese. */
  const pickWord = (line: number, start: number, word: string) => {
    const hit = tokensOf(lines[line].chords).find(t => t.col >= start && t.col < start + word.length);
    const col = hit?.col ?? start;
    setSel(sel?.line === line && sel.col === col ? null : { line, col, word: { start, text: word } });
  };

  if (!text.trim()) return (
    <div className="rounded-xl bg-tubo px-3.5 py-3 text-sm text-crema/65">
      Sin letra todavía. <button type="button" onClick={onWrite} className="underline text-crema">Escríbela</button> o añade una <button type="button" onClick={() => setSel({ line: 0, col: 0 })} className="underline text-crema">línea de acordes</button>.
      {sel && <ChordPalette className="mt-2.5" songChords={songChords} latin={latin} onPick={set} onClose={() => setSel(null)} />}
    </div>
  );

  const current = sel && sel.line < lines.length ? tokensOf(lines[sel.line].chords).find(t => t.col === sel.col)?.t : undefined;
  const plus = "inline-grid place-items-center h-7 min-w-7 px-1.5 ml-2 rounded-full text-[12px] text-crema/45 hover:text-crema hover:bg-crema/10 align-middle";

  return (
    <div className="rounded-xl border border-crema/15 bg-tubo px-3.5 py-2.5 flex flex-col">
      {lines.map((l, i) => {
        if (!l.chords.trim() && !l.lyric.trim()) return <div key={i} className="h-3" aria-hidden="true" />;
        const toks = tokensOf(l.chords);
        const end = Math.max(l.lyric.length, l.chords.length) + 1;
        return (
          <div key={i}>
            <div className="overflow-x-auto">
              <div className="font-mono text-[15px] leading-snug min-w-max">
                <div className="relative h-[1.5em]" style={{ minWidth: `${l.chords.length}ch` }}>
                  {toks.map(t => (
                    <button key={t.col} type="button" onClick={() => setSel(sel?.line === i && sel.col === t.col ? null : { line: i, col: t.col })}
                      style={{ left: `${t.col}ch` }} aria-label={`Cambiar ${label(t.t)}`}
                      className={cx("absolute top-0 font-semibold text-senal-suave rounded-sm hover:bg-senal/20", sel?.line === i && sel.col === t.col && "bg-senal text-noche")}>
                      {label(t.t)}
                    </button>
                  ))}
                  {sel?.line === i && !toks.some(t => t.col === sel.col) && (
                    <span className="absolute top-0 text-senal animate-pulse" style={{ left: `${sel.col}ch` }} aria-hidden="true">▾</span>
                  )}
                  {!l.lyric.trim() && <button type="button" className={cx(plus, "absolute top-[-2px]")} style={{ left: `${l.chords.length}ch` }}
                    onClick={() => setSel({ line: i, col: end })} aria-label="Añadir acorde al final">+</button>}
                </div>
                {l.lyric.trim() && (
                  <div className="whitespace-pre">
                    {[...l.lyric.matchAll(/\S+|\s+/g)].map(m => {
                      const start = m.index ?? 0;
                      if (!m[0].trim()) return <span key={start}>{m[0]}</span>;
                      const on = sel?.line === i && sel.word?.start === start;
                      return <button key={start} type="button" onClick={() => pickWord(i, start, m[0])}
                        className={cx("py-1 rounded-sm text-crema hover:bg-crema/10", on && "bg-crema/15 underline decoration-senal decoration-2 underline-offset-4")}>{m[0]}</button>;
                    })}
                    <button type="button" className={plus} onClick={() => setSel({ line: i, col: end })} aria-label="Añadir acorde al final de la línea" title="acorde al final">+</button>
                  </div>
                )}
              </div>
            </div>
            {sel?.line === i && (
              <ChordPalette className="my-2" songChords={songChords} latin={latin} current={current} onPick={set} onRemove={current ? () => set(null) : undefined} onClose={() => setSel(null)}>
                {sel.word && sel.word.text.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-mono uppercase tracking-[.1em] text-crema/55 mr-1">encima de</span>
                    {[...sel.word.text].map((ch, k) => {
                      const col = sel.word!.start + k;
                      return <button key={k} type="button" aria-pressed={sel.col === col} onClick={() => setSel({ ...sel, col })}
                        className={cx("h-8 min-w-7 px-1 rounded-md font-mono text-[14px]", sel.col === col ? "bg-crema text-noche" : "bg-noche hover:bg-crema/10")}>{ch}</button>;
                    })}
                  </div>
                )}
              </ChordPalette>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => setSel(sel?.line === lines.length ? null : { line: lines.length, col: 0 })}
        className="self-start mt-1.5 h-9 text-[13px] text-crema/60 hover:text-crema underline">+ línea de acordes (instrumental)</button>
      {sel?.line === lines.length && <ChordPalette songChords={songChords} latin={latin} onPick={set} onClose={() => setSel(null)} />}
    </div>
  );
}

// ---------- paleta de acordes ----------
const ROOTS = ["C", "D", "E", "F", "G", "A", "B"];
const QUALS = [
  { q: "", label: "mayor" }, { q: "m", label: "menor" }, { q: "7", label: "7" }, { q: "m7", label: "m7" }, { q: "maj7", label: "maj7" },
  { q: "6", label: "6" }, { q: "sus2", label: "sus2" }, { q: "sus4", label: "sus4" }, { q: "dim", label: "dim" }, { q: "add9", label: "add9" },
];

export function ChordPalette({ songChords, latin, onPick, onClose, onRemove, current, children, className }: {
  songChords: string[]; latin: boolean; onPick: (c: string) => void; onClose: () => void;
  onRemove?: () => void; current?: string; children?: ReactNode; className?: string;
}) {
  const [acc, setAcc] = useState<"" | "#" | "b">("");
  const [q, setQ] = useState("");
  const [bass, setBass] = useState(false); // siguiente toque = bajo («/F#»)
  const [root, setRoot] = useState<string | null>(null);
  /* Mi♯, Si♯, Do♭ y Fa♭ no existen en la tabla: fuera. */
  const valid = (r: string) => !((acc === "#" && (r === "E" || r === "B")) || (acc === "b" && (r === "C" || r === "F")));
  const label = (c: string) => (latin ? toLatin(c) : c);
  const pill = "h-9 min-w-9 px-2.5 rounded-full font-mono text-[13px] transition disabled:opacity-30";
  const tapRoot = (r: string) => {
    if (bass && root) { onPick(`${root}/${r + acc}`); setBass(false); setRoot(null); return; }
    if (bass) { setRoot(r + acc + q); return; }
    onPick(r + acc + q);
  };
  return (
    <div role="dialog" aria-label="elegir acorde"
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      onMouseDown={e => { if ((e.target as HTMLElement).tagName === "BUTTON") e.preventDefault(); }}
      className={cx("rounded-xl border border-crema/15 bg-noche p-2.5 flex flex-col gap-2 font-sans", className)}>
      {children}
      {songChords.length > 0 && (<>
        <span className="text-[11px] font-mono uppercase tracking-[.1em] text-crema/55">en esta canción</span>
        <div className="flex flex-wrap gap-1">
          {songChords.slice(0, 18).map(c => <button key={c} type="button" onClick={() => onPick(c)}
            className={cx(pill, c === current ? "bg-senal text-noche" : "bg-tubo hover:bg-crema/10")}>{label(c)}</button>)}
        </div>
      </>)}
      <div className="flex flex-wrap gap-1 items-center">
        {(["", "#", "b"] as const).map(a => (
          <button key={a || "n"} type="button" aria-pressed={acc === a} onClick={() => setAcc(a)}
            className={cx(pill, acc === a ? "bg-crema text-noche" : "bg-tubo")}>{a === "" ? "♮" : a === "#" ? "♯" : "♭"}</button>
        ))}
        <span className="w-px h-6 bg-crema/15 mx-1" />
        {QUALS.map(x => (
          <button key={x.q || "M"} type="button" aria-pressed={q === x.q} onClick={() => setQ(x.q)}
            className={cx(pill, q === x.q ? "bg-crema text-noche" : "bg-tubo")}>{x.label}</button>
        ))}
        <button type="button" aria-pressed={bass} onClick={() => { setBass(!bass); setRoot(null); }} title="acorde con bajo: elige el acorde y luego el bajo"
          className={cx(pill, bass ? "bg-crema text-noche" : "bg-tubo")}>/bajo</button>
      </div>
      {bass && <span className="text-xs text-crema/60">{root ? `${label(root)}/… elige el bajo` : "elige el acorde y luego el bajo"}</span>}
      <div className="flex flex-wrap gap-1 items-center">
        {ROOTS.map(r => {
          const c = bass && root ? `${root}/${r + acc}` : r + acc + q;
          return <button key={r} type="button" disabled={!valid(r)} onClick={() => tapRoot(r)} className={cx(pill, "bg-senal/15 text-senal-suave hover:bg-senal/25")}>{label(c)}</button>;
        })}
        <span className="ml-auto flex gap-1">
          {onRemove && <button type="button" onClick={onRemove} className={cx(pill, "text-crema/80 hover:bg-crema/10")}>quitar {current && label(current)}</button>}
          <button type="button" onClick={onClose} className={cx(pill, "text-crema/70")}>cerrar</button>
        </span>
      </div>
    </div>
  );
}
