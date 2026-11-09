/* Estudio de visuales: muro CRT y portada flotante, dentro de la suite.
   La vista previa es el mismo lienzo que se exporta. Los archivos se
   quedan en este ordenador (IndexedDB) y la sesión se guarda sola. */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button, Segmented, Select, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { useMedia } from "../../composicion/audio";
import { RATED, ROLES, Studio, fmt, isVid, nzAmt, sRate, vDur, vIn, vLen, vRate, type Fill, type Layer, type Mode, type Role, type Screen } from "./engine";
import { currentFormat, exportGif, exportSettings, exportVideo, formats, importSettings } from "./exporter";

type Tab = "contenido" | "salida";

export default function EstudioPage() {
  const desktop = useMedia("(min-width: 1024px)");
  const [force, setForce] = useState(false);
  const nav = useNavigate();
  if (!desktop && !force) {
    return (
      <div className="h-dvh bg-noche text-crema grid place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3 max-w-[340px]">
          <p className="font-mono text-[11px] text-senal tracking-wider">VISUALES</p>
          <p className="text-2xl font-bold tracking-[-.02em]">Mejor en ordenador</p>
          <p className="text-sm text-crema/70">El estudio necesita pantalla grande y ratón para elegir teles y mover elementos.</p>
          <Button variant="primary" onClick={() => setForce(true)}>abrir igualmente</Button>
          <Button variant="quiet" onClick={() => nav("/visuales")}>volver</Button>
        </div>
      </div>
    );
  }
  return <Estudio />;
}

function useStudio() {
  const [st] = useState(() => new Studio());
  useSyncExternalStore(st.subscribe, st.version);
  return st;
}

function Estudio() {
  const st = useStudio();
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("contenido");
  const files = useRef<Record<"wall" | "media" | "bg" | "layer" | "cfg", HTMLInputElement | null>>({ wall: null, media: null, bg: null, layer: null, cfg: null });
  const pick = (k: keyof typeof files.current) => files.current[k]?.click();

  const run = (p: Promise<unknown>) => void p.catch(e => { st.setBusy(false); toast((e as Error).message, "error"); });

  // al entrar, lo que hubiera guardado; al salir, parar vídeos
  useEffect(() => {
    st.attach();
    run(st.restore());
    return () => st.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // teclado: espacio reproduce, Esc suelta la selección, ⌘A elige todas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text")) return;
      if (!st.ready) return;
      if (e.code === "Space" && el.tagName !== "BUTTON") { e.preventDefault(); st.play(); }
      else if (st.mode === "wall" && e.key === "Escape") st.setSel([]);
      else if (st.mode === "wall" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); st.setSel(st.wall.screens.map((_, i) => i)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st]);

  const onDrop = (list: FileList) => {
    const fs = Array.from(list).filter(f => f.type.startsWith("image"));
    if (!fs.length) return;
    if (st.mode === "scene") {
      run((async () => { if (!st.scene.bg) await st.loadBg(fs.shift()!); if (fs.length) await st.addLayers(fs); })());
    } else if (!st.wall.plate || confirm("¿Cambiar la pared de televisores? Se vuelven a detectar las pantallas y se pierde lo asignado.")) {
      run(st.loadWall(fs[0]));
    }
  };

  const { w: outW, h: outH } = st.outSize();
  const fmtSel = currentFormat(st.set.vfmt);
  const scene = st.mode === "scene";

  return (
    <div className="h-dvh bg-noche text-crema flex flex-col">
      <header className="px-6 py-3 flex items-center gap-4 border-b border-crema/10">
        <button type="button" onClick={() => nav("/visuales")} className="font-mono text-xs text-crema/70 hover:text-crema inline-flex items-center gap-1.5"><Icon name="atras" size={14} />visuales</button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-senal tracking-wider">ESTUDIO DE VISUALES</p>
          <h1 className="text-2xl font-extrabold tracking-[-.02em] leading-tight truncate">{scene ? "portada flotante" : "muro CRT"}</h1>
        </div>
        <span className="font-mono text-xs text-crema/60 hidden xl:inline">
          {scene
            ? st.scene.bg ? `${st.scene.bg.naturalWidth}×${st.scene.bg.naturalHeight} portada · ${st.scene.layers.length} elementos` : "sin portada"
            : st.wall.plate ? `${st.wall.srcW}×${st.wall.srcH} origen · ${st.wall.screens.length} pantallas` : "sin imagen"}
        </span>
        <Segmented<Mode> value={st.mode} onChange={m => st.setMode(m)} options={[{ value: "wall", label: "muro CRT" }, { value: "scene", label: "portada flotante" }]} />
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-h-0 p-6 flex flex-col gap-4">
          <Viewport st={st} onDrop={onDrop} onPick={() => pick(scene ? "bg" : "wall")} />

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => st.play()} disabled={!st.ready} aria-label={st.playing ? "Pausa" : "Reproducir"}
              className="size-12 shrink-0 rounded-full bg-crema text-noche grid place-items-center disabled:opacity-40">
              <Icon name={st.playing ? "pause" : "play"} size={20} />
            </button>
            <Button variant="primary" disabled={!st.ready || !!st.busy} onClick={() => run(exportVideo(st, toast))}>
              <Icon name="descargar" size={16} />{fmtSel.id === "png" ? "exportar PNG" : `exportar ${fmtSel.ext.toUpperCase()}`}
            </Button>
            <Button disabled={!st.ready || !!st.busy} onClick={() => run(exportGif(st))}>exportar GIF</Button>
            <span className="w-px h-6 bg-crema/15 mx-1" />
            <Button size="sm" variant="quiet" disabled={!st.ready} onClick={() => exportSettings(st)}>guardar ajustes</Button>
            <Button size="sm" variant="quiet" disabled={!st.ready} onClick={() => pick("cfg")}>cargar ajustes</Button>
            <Button size="sm" variant="quiet" disabled={!st.ready} onClick={() => {
              if (!confirm("Se borra la pared y la portada guardadas, los archivos asignados y todos los ajustes. ¿Seguir?")) return;
              run(st.clearSession().then(() => location.reload()));
            }}>borrar sesión</Button>
            <span className="flex-1" />
            <span className="font-mono text-xs text-crema/55 tabular-nums">{outW}×{outH} · {st.set.secs}s · {st.set.fps}fps</span>
            <span className={cx("font-mono text-xs", st.saved.ok ? "text-crema/60" : "text-senal-suave")} aria-live="polite">{st.saved.text}</span>
          </div>
        </section>

        <aside className="min-h-0 border-l border-crema/10 flex flex-col">
          <div className="p-4 pb-2">
            <Segmented<Tab> value={tab} onChange={setTab} options={[
              { value: "contenido", label: scene ? "portada y elementos" : "pantallas" },
              { value: "salida", label: "formato y textura" },
            ]} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 flex flex-col gap-6">
            {tab === "contenido" && (scene
              ? <ScenePanel st={st} onPickBg={() => pick("bg")} onAddLayers={() => pick("layer")} />
              : <WallPanel st={st} onPickMedia={() => pick("media")} />)}
            {tab === "salida" && <SalidaPanel st={st} run={run} />}
          </div>
        </aside>
      </div>

      <input ref={el => { files.current.wall = el; }} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onDrop(listOf(f)); }} />
      <input ref={el => { files.current.media = el; }} type="file" accept="image/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(st.assignMedia(f)); }} />
      <input ref={el => { files.current.bg = el; }} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(st.loadBg(f)); }} />
      <input ref={el => { files.current.layer = el; }} type="file" accept="image/png,image/*" multiple hidden onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; run(st.addLayers(fs)); }} />
      <input ref={el => { files.current.cfg = el; }} type="file" accept="application/json,.json" hidden onChange={e => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) run(importSettings(st, f).then(msg => toast(msg)));
      }} />
    </div>
  );
}

function listOf(f: File) { const dt = new DataTransfer(); dt.items.add(f); return dt.files; }

/* ── el lienzo, con las cajas para pinchar teles o arrastrar elementos ── */
function Viewport({ st, onDrop, onPick }: { st: Studio; onDrop: (f: FileList) => void; onPick: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [over, setOver] = useState(false);

  useEffect(() => {
    const h = holder.current;
    if (!h) return;
    st.cv.className = "block w-full h-full rounded-[6px]";
    h.appendChild(st.cv);
    return () => { st.cv.remove(); };
  }, [st]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { PW, PH } = st.dims();
  const sc = PW && PH ? Math.max(0, Math.min((size.w - 40) / PW, (size.h - 40) / PH)) : 0;
  const w = PW * sc, h = PH * sc;
  const scene = st.mode === "scene";

  return (
    <div ref={box}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.files); }}
      className={cx("relative flex-1 min-h-0 rounded-[20px] bg-marco grid place-items-center overflow-hidden", over && "ring-2 ring-senal")}>
      <div className="relative" style={{ width: w, height: h, display: st.ready ? "block" : "none" }}>
        <div ref={holder} className="absolute inset-0" />
        {!(st.playing && scene) && (
          <div className="absolute inset-0">
            {scene
              ? st.scene.layers.map((L, i) => <LayerHit key={i} st={st} L={L} i={i} w={w} h={h} />)
              : st.wall.screens.map((s, i) => <ScreenHit key={i} st={st} s={s} i={i} sc={sc} />)}
          </div>
        )}
      </div>

      {!st.ready && !st.busy && (
        <div className="max-w-[460px] text-center flex flex-col items-center gap-3 p-6">
          <p className="text-3xl font-extrabold tracking-[-.02em]">{scene ? "Suelta la portada del single" : "Suelta la pared de televisores"}</p>
          <p className="text-crema/70">
            {scene
              ? "El JPG o PNG de la portada hace de fondo. Después sueltas encima los PNG de los elementos y cada uno flota por su cuenta."
              : "Un JPG o PNG del muro con los televisores encendidos. Se detecta cada pantalla por su brillo y le asignas fotos, vídeos, texto o ruido."}
          </p>
          <Button variant="primary" onClick={onPick}><Icon name="subir" size={16} />elegir imagen</Button>
        </div>
      )}

      {st.busy && (
        <div className="absolute inset-0 bg-noche/80 grid place-items-center" aria-live="polite">
          <div className="w-[320px] flex flex-col gap-2">
            <p className="font-mono text-xs tracking-wider text-senal">{st.busy.lbl.toUpperCase()}</p>
            <div className="h-1.5 rounded-full bg-crema/15 overflow-hidden">
              <div className={cx("h-full bg-senal transition-[width]", st.busy.pct == null && "w-1/3 animate-pulse")} style={st.busy.pct != null ? { width: `${st.busy.pct * 100}%` } : undefined} />
            </div>
            {st.busy.sub && <p className="text-xs text-crema/60">{st.busy.sub}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ScreenHit({ st, s, i, sc }: { st: Studio; s: Screen; i: number; sc: number }) {
  const on = st.selSet.has(i), pri = i === st.sel;
  return (
    <button type="button" aria-label={`Pantalla ${s.i}`} aria-pressed={on}
      onClick={e => st.select(i, e.ctrlKey || e.metaKey || e.shiftKey)}
      className={cx("absolute rounded-[4px] transition-shadow",
        on ? (pri ? "ring-2 ring-senal" : "ring-2 ring-senal/60") : "hover:ring-1 hover:ring-crema/60",
        s.role === "media" && s.el && !on && "ring-1 ring-crema/30")}
      style={{ left: s.cx * sc, top: s.cy * sc, width: s.cw * sc, height: s.ch * sc }}>
      {(on || s.role === "media") && (
        <i className="absolute top-0.5 left-0.5 px-1 rounded bg-noche/80 font-mono not-italic text-[10px] text-crema/90">{String(s.i).padStart(2, "0")}</i>
      )}
    </button>
  );
}

function LayerHit({ st, L, i, w, h }: { st: Studio; L: Layer; i: number; w: number; h: number }) {
  const b = st.layerBox(L);
  if (!b.w) return null;
  const on = i === st.layerSel;
  const down = (e: RPointerEvent) => {
    e.preventDefault();
    st.layerSel = i; st.change(undefined, false);
    const x0 = e.clientX, y0 = e.clientY, lx = L.x, ly = L.y;
    const mv = (ev: PointerEvent) => st.change(() => {
      L.x = Math.max(-0.3, Math.min(1.3, lx + (ev.clientX - x0) / w));
      L.y = Math.max(-0.3, Math.min(1.3, ly + (ev.clientY - y0) / h));
    }, false);
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); st.autosave(); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  return (
    <div onPointerDown={down} role="button" aria-label={`Elemento ${L.name}`}
      className={cx("absolute cursor-move rounded-[4px] touch-none", on ? "ring-2 ring-senal" : "ring-1 ring-dashed ring-crema/25 hover:ring-crema/60")}
      style={{ left: (L.x - b.w / 2) * w, top: (L.y - b.h / 2) * h, width: b.w * w, height: b.h * h }}>
      <i className="absolute top-0.5 left-0.5 px-1 rounded bg-noche/80 font-mono not-italic text-[10px]">{String(i + 1).padStart(2, "0")}</i>
    </div>
  );
}

/* ── piezas del panel ── */
function Group({ title, children, hint, action }: { title: ReactNode; children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <p className="flex-1 font-mono text-[11px] text-crema/55 tracking-wider uppercase">{title}</p>
        {action}
      </div>
      {children}
      {hint && <p className="text-xs text-crema/55 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, show, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; show?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label className={cx("grid grid-cols-[120px_minmax(0,1fr)_64px] items-center gap-3 text-sm", disabled && "opacity-40")}>
      <span className="text-crema/80">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-[var(--color-senal)]" />
      <span className="font-mono text-xs text-right tabular-nums text-crema/70">{show ?? value}</span>
    </label>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T | undefined; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={cx("h-9 px-3 rounded-full text-sm transition", value === o.id ? "bg-crema text-noche font-semibold" : "border-[1.5px] border-crema/20 hover:border-crema/50")}>{o.label}</button>
      ))}
    </div>
  );
}

const TINTS = [{ id: "cream" as const, label: "crema" }, { id: "orange" as const, label: "naranja" }];
const rateLabel = (v: number) => (v ? `${fmt(v, 2)}×` : "quieta");

/* ── muro: pantalla(s) elegida(s), atajos y canales ── */
function WallPanel({ st, onPickMedia }: { st: Studio; onPickMedia: () => void }) {
  const [bulk, setBulk] = useState<Role | "mix">("static");
  if (!st.wall.plate) return <p className="text-sm text-crema/60">Carga primero la pared de televisores.</p>;
  const s = st.wall.screens[st.sel];
  const n = st.selSet.size;
  return (
    <>
      <Group title={n > 1 ? `${n} pantallas elegidas` : s ? `pantalla ${String(s.i).padStart(2, "0")}` : "pantalla"}
        hint={!s ? <>Pincha una tele del muro para cambiar lo que emite. Con <b>⌘</b>, <b>Ctrl</b> o <b>Mayús</b> eliges varias y lo que ajustes se aplica a todas.</> : undefined}>
        {s && <ScreenControls st={st} s={s} onPickMedia={onPickMedia} />}
      </Group>

      <Group title="atajos" hint="«Restablecer» devuelve las pantallas y las texturas a como estaban al abrir la imagen, y suelta los archivos cargados.">
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => st.setSel(st.wall.screens.map((_, i) => i))}>todas</Button>
          <Button size="sm" onClick={() => st.setSel([])}>ninguna</Button>
          <Button size="sm" onClick={() => st.setSel(st.wall.screens.map((_, i) => i).filter(i => !st.selSet.has(i)))}>invertir</Button>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 shrink-0">Poner {n === 1 ? "la elegida" : n ? `las ${n}` : "todo el muro"} en</span>
          <Select value={bulk} onChange={e => setBulk(e.target.value as Role | "mix")} className="flex-1 min-w-0">
            {ROLES.filter(r => r.id !== "media").map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            <option value="mix">Mezcla variada</option>
          </Select>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="light" onClick={() => st.bulkRole(bulk)}>aplicar</Button>
          <Button size="sm" onClick={() => { if (!st.selSet.size) st.setSel(st.wall.screens.map((_, i) => i)); onPickMedia(); }}>mismo archivo a {n === 1 ? "la elegida" : n ? "las elegidas" : "todas"}</Button>
          <Button size="sm" variant="quiet" onClick={() => {
            if (confirm("Todas las pantallas vuelven a su estado inicial, se sueltan las fotos y vídeos y las texturas vuelven a los valores de fábrica. ¿Seguir?")) st.resetAll();
          }}>restablecer</Button>
        </div>
      </Group>

      <Group title={`canales detectados · ${st.wall.screens.length}`}>
        <ul className="flex flex-col -mx-1">
          {st.wall.screens.map((x, i) => {
            const lbl = { logo: "Logo original", media: x.media || "Foto o vídeo", static: "Nieve", flat: "Color plano", roll: "Desenganchada", off: "Apagada", text: x.txt || "Rótulo" }[x.role];
            const nz = nzAmt(x) > 0 ? (x.nz === "grano" ? " · grano" : x.nz === "vhs" ? " · rayas" : " · ruido") : "";
            return (
              <li key={i}>
                <button type="button" onClick={e => st.select(i, e.ctrlKey || e.metaKey || e.shiftKey)}
                  className={cx("w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-sm", st.selSet.has(i) ? "bg-crema/10" : "hover:bg-crema/5")}>
                  <span className={cx("size-2 rounded-full shrink-0", x.role === "media" ? "bg-senal" : x.role === "logo" || x.role === "text" ? "bg-crema" : "bg-crema/25")} />
                  <span className="font-mono text-xs text-crema/60 w-5">{String(x.i).padStart(2, "0")}</span>
                  <span className="flex-1 min-w-0 truncate">{lbl}<span className="text-crema/50">{nz}</span></span>
                  <span className="font-mono text-[11px] text-crema/40">{x.cw}×{x.ch}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Group>
    </>
  );
}

function ScreenControls({ st, s, onPickMedia }: { st: Studio; s: Screen; onPickMedia: () => void }) {
  const set = (fn: (x: Screen) => void) => st.apply(fn);
  const vid = s.role === "media" && isVid(s);
  const d = vDur(s), len = vLen(s), r = vRate(s), eff = len / r;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <span className="text-sm text-crema/80 w-[120px] shrink-0">Emite</span>
        <Select value={s.role} className="flex-1 min-w-0" onChange={e => {
          const v = e.target.value as Role;
          set(x => { x.role = v; });
          if (v === "media" && !s.el) onPickMedia();
        }}>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </div>

      {s.role === "media" && (
        <>
          <div className="flex gap-2 items-center">
            <span className="flex-1 min-w-0 truncate text-sm">{s.media || <span className="text-crema/50">sin archivo</span>}</span>
            <Button size="sm" onClick={onPickMedia}><Icon name="subir" size={14} />{s.el ? "cambiar" : "cargar"}</Button>
          </div>
          {vid && (
            <>
              <Range label="Empieza en" min={0} max={+(d || 10).toFixed(2)} step={0.05} value={vIn(s)} show={`${fmt(vIn(s))} s`} disabled={!d}
                onChange={v => { set(x => { if (!isVid(x)) return; x.vin = v; const dd = vDur(x); if (dd) x.vlen = Math.min(vLen(x), dd - vIn(x)); }); st.selScreens().forEach(x => st.previewSeek(x)); }} />
              <Range label="Duración usada" min={0.2} max={+(d || 10).toFixed(2)} step={0.05} value={len} show={`${fmt(len)} s`} disabled={!d}
                onChange={v => set(x => { if (isVid(x)) x.vlen = v; })} />
              <Range label="Velocidad" min={10} max={800} step={5} value={Math.round(r * 100)} show={`${fmt(r, 2)}×`}
                onChange={v => set(x => { if (isVid(x)) { x.vrate = v / 100; x.el.playbackRate = vRate(x); } })} />
              <Button size="sm" onClick={() => set(x => { if (isVid(x)) { x.vrate = Math.max(0.1, Math.min(8, vLen(x) / st.set.secs)); x.el.playbackRate = vRate(x); } })}>encajar en la duración del muro</Button>
              <p className="text-xs text-crema/55">
                {d ? <>Fragmento de <b>{fmt(len)} s</b> a <b>{fmt(r, 2)}×</b> → dura <b>{fmt(eff)} s</b> en pantalla y se repite <b>{fmt(st.set.secs / eff)}</b> veces en los {st.set.secs} s del muro.</>
                  : "Este archivo no declara duración: solo se puede ajustar la velocidad."}
              </p>
            </>
          )}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-crema/80 w-[120px] shrink-0">Encuadre</span>
            <Chips value={s.fit} options={[{ id: "cover", label: "llenar" }, { id: "contain", label: "entero" }]} onChange={v => set(x => { x.fit = v; })} />
          </div>
          <Range label="Época" min={0} max={100} value={s.aged} onChange={v => set(x => { x.aged = v; })} />
        </>
      )}

      {s.role === "text" && (
        <>
          <input type="text" value={s.txt} spellCheck={false} aria-label="Texto del rótulo"
            onChange={e => { const v = e.target.value; set(x => { if (x.role === "text") x.txt = v; }); }}
            className="h-11 rounded-xl bg-tubo border-[1.5px] border-crema/20 px-3 font-mono" />
          <Range label="Tamaño" min={25} max={115} value={s.tsize || 100} show={`${s.tsize || 100} %`} onChange={v => set(x => { if (x.role === "text") x.tsize = v; })} />
        </>
      )}

      {(s.role === "flat" || s.role === "text") && (
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Color</span>
          <Chips value={s.col} options={TINTS} onChange={v => set(x => { x.col = v; })} />
        </div>
      )}
      {RATED.includes(s.role) && (
        <Range label="Velocidad" min={0} max={400} step={5} value={Math.round(sRate(s) * 100)} show={rateLabel(sRate(s))}
          onChange={v => set(x => { if (RATED.includes(x.role)) x.rate = v / 100; })} />
      )}
      <Range label="Brillo" min={20} max={180} value={s.gain} onChange={v => set(x => { x.gain = v; })} />

      <div className="flex gap-2 items-center">
        <span className="text-sm text-crema/80 w-[120px] shrink-0">Ruido</span>
        <Chips value={s.nz} options={[{ id: "no", label: "no" }, { id: "grano", label: "grano" }, { id: "vhs", label: "rayas" }, { id: "both", label: "las dos" }]} onChange={v => set(x => { x.nz = v; })} />
      </div>
      {s.nz !== "no" && (
        <>
          <Range label="Cantidad" min={5} max={100} value={s.nzA ?? 45} onChange={v => set(x => { x.nzA = v; })} />
          <p className="text-xs text-crema/55">El <b>grano</b> hierve en toda la pantalla; las <b>rayas</b> son bandas que suben arrastrando la imagen de lado, como una cinta mal seguida. También sirve sobre el logo y el color plano, que si no se quedan muy quietos.</p>
        </>
      )}
    </div>
  );
}

/* ── portada flotante: fondo, elemento elegido y lista ── */
function ScenePanel({ st, onPickBg, onAddLayers }: { st: Studio; onPickBg: () => void; onAddLayers: () => void }) {
  const V = st.scene;
  const L = V.layers[st.layerSel];
  const setL = (fn: (x: Layer) => void) => { if (L) st.change(() => fn(L)); };
  const move = (to: number) => {
    const i = st.layerSel;
    if (i < 0 || to < 0 || to >= V.layers.length) return;
    st.change(() => { [V.layers[i], V.layers[to]] = [V.layers[to], V.layers[i]]; st.layerSel = to; });
  };
  return (
    <>
      <Group title="portada">
        <div className="flex gap-2 items-center">
          <span className="flex-1 min-w-0 truncate text-sm">{V.bgName || <span className="text-crema/50">sin fondo</span>}</span>
          <Button size="sm" onClick={onPickBg}><Icon name="subir" size={14} />{V.bg ? "cambiar" : "cargar"}</Button>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Lados</span>
          <Chips<Fill> value={V.fill} options={[{ id: "blur", label: "desenfoque" }, { id: "crop", label: "recortar" }, { id: "flat", label: "color" }]} onChange={v => st.change(() => { V.fill = v; })} />
        </div>
        <Range label="Brillo" min={20} max={150} value={V.gain} onChange={v => st.change(() => { V.gain = v; })} />
        <Range label="Opacidad" min={0} max={100} value={V.op} onChange={v => st.change(() => { V.op = v; })} />
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Color de debajo</span>
          <input type="color" value={V.col} onChange={e => { const v = e.target.value; st.change(() => { V.col = v; }); }} aria-label="Color de debajo" className="h-9 w-12 rounded-lg bg-transparent" />
          {[["#0a0908", "negro"], ["#e8dcc5", "crema"], ["#ce602a", "naranja"]].map(([c, n]) => (
            <button key={c} type="button" title={n} aria-label={n} onClick={() => st.change(() => { V.col = c; })}
              className={cx("size-8 rounded-full border-[1.5px]", V.col === c ? "border-senal" : "border-crema/25")} style={{ background: c }} />
          ))}
        </div>
      </Group>

      <Group title="elementos" hint="Arrastra los PNG sobre el lienzo para colocarlos. Cada uno flota por su cuenta y el bucle cierra sin salto.">
        <Button variant="light" onClick={onAddLayers} disabled={!V.bg}><Icon name="subir" size={16} />añadir PNG</Button>
        {!!V.layers.length && (
          <ul className="flex flex-col -mx-1">
            {V.layers.map((x, i) => (
              <li key={i}>
                <button type="button" onClick={() => { st.layerSel = i; st.change(undefined, false); }}
                  className={cx("w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-sm", i === st.layerSel ? "bg-crema/10" : "hover:bg-crema/5")}>
                  <span className="font-mono text-xs text-crema/60 w-5">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 min-w-0 truncate">{x.name}</span>
                  <span className="font-mono text-[11px] text-crema/40">{x.s} %</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Group>

      {L && (
        <Group title={`elemento · ${L.name}`}>
          <Range label="Tamaño" min={2} max={120} value={L.s} show={`${L.s} %`} onChange={v => setL(x => { x.s = v; })} />
          <Range label="Opacidad" min={5} max={100} value={L.op} onChange={v => setL(x => { x.op = v; })} />
          <Range label="Deriva" min={0} max={120} value={L.amp} show={`${fmt(L.amp / 10)} %`} onChange={v => setL(x => { x.amp = v; })} />
          <Range label="Vueltas por bucle" min={1} max={6} value={L.spd} onChange={v => setL(x => { x.spd = v; })} />
          <Range label="Balanceo" min={0} max={120} value={L.rot} show={`${fmt(L.rot * 0.0573)}°`} onChange={v => setL(x => { x.rot = v; })} />
          <Range label="Respiración" min={0} max={30} value={L.br} show={`${L.br} %`} onChange={v => setL(x => { x.br = v; })} />
          <Range label="Época" min={0} max={100} value={L.aged} onChange={v => setL(x => { x.aged = v; })} />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => move(st.layerSel + 1)} disabled={st.layerSel >= V.layers.length - 1}><Icon name="arriba" size={14} />subir</Button>
            <Button size="sm" onClick={() => move(st.layerSel - 1)} disabled={st.layerSel < 1}><Icon name="abajo" size={14} />bajar</Button>
            <Button size="sm" onClick={() => setL(x => { x.x = 0.5; x.y = 0.5; })}>centrar</Button>
            <Button size="sm" variant="quiet" onClick={() => st.change(() => { V.layers.splice(st.layerSel, 1); st.layerSel = Math.min(st.layerSel, V.layers.length - 1); })}><Icon name="basura" size={14} />quitar</Button>
          </div>
        </Group>
      )}
    </>
  );
}

/* ── formato de salida, cinta y textura: común a los dos modos ── */
function SalidaPanel({ st, run }: { st: Studio; run: (p: Promise<unknown>) => void }) {
  const p = st.set, T = st.tick;
  const { w, h } = st.outSize();
  const f = currentFormat(p.vfmt);
  const setP = (fn: () => void) => st.change(fn);
  return (
    <>
      <Group title={st.mode === "scene" ? "lienzo" : "muro"}>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Formato</span>
          <Select value={p.aspect} className="flex-1 min-w-0" onChange={e => {
            const v = e.target.value;
            if (st.mode === "scene" || !st.wall.file) { setP(() => { p.aspect = v; }); return; }
            if (!confirm("Cambiar el formato vuelve a detectar las pantallas y pierde las asignaciones. ¿Seguir?")) return;
            p.aspect = v;
            run(st.loadWall(st.wall.file));
          }}>
            <option value="2">Panorámico 2:1 — pared 8×4 m</option>
            <option value="1.7778">16:9 — pared 8×4,5 m</option>
            <option value="0">Original de la imagen</option>
          </Select>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Resolución</span>
          <Chips value={String(p.scale)} options={["1", "2", "3", "4"].map(x => ({ id: x, label: x === "1" ? "×1 nativa" : `×${x}` }))} onChange={v => setP(() => { p.scale = Number(v); })} />
        </div>
        <Range label="Duración" min={4} max={30} value={p.secs} show={`${p.secs} s`} onChange={v => setP(() => { p.secs = v; })} />
        <div className="flex gap-2 items-center">
          <span className="text-sm text-crema/80 w-[120px] shrink-0">Fotogramas</span>
          <Chips value={String(p.fps)} options={["24", "25", "30", "50", "60"].map(x => ({ id: x, label: x }))} onChange={v => setP(() => { p.fps = Number(v); })} />
        </div>
        <p className="text-xs text-crema/55">
          Exporta a <b>{w || "—"}×{h || "—"} px</b>, {p.secs} s, {p.fps} fps ({p.secs * p.fps} fotogramas).
          {w > 3900 && <span className="block text-senal-suave mt-1">A esta resolución el navegador va lento y algunos reproductores no tragan el archivo. Para la pared basta con unos 2.000 px de ancho.</span>}
        </p>
      </Group>

      <Group title="formato de vídeo">
        <Select value={f.id} onChange={e => { const v = e.target.value; setP(() => { p.vfmt = v; }); }}>
          {formats().map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </Select>
        <p className="text-xs text-crema/55 leading-relaxed">
          {f.id === "png"
            ? <>Un PNG por fotograma dentro de un ZIP, tal cual sale del lienzo. Pesa mucho, pero entra en cualquier montaje: <code className="font-mono text-crema/80">ffmpeg -framerate {p.fps} -i besta-%04d.png -c:v libx264 -pix_fmt yuv420p muro.mp4</code></>
            : <>{f.ext === "mp4" ? "El MP4 va en H.264 y lo abre cualquier móvil, Instagram incluido. " : "WebM pesa poco y se ve limpio, pero algunas apps y móviles no lo abren; para redes, mejor MP4. "}
              <b>La grabación va a ritmo real</b>: un muro de {p.secs} s tarda {p.secs} s en salir, y al terminar se comprueba la duración.</>}
        </p>
      </Group>

      <Group title="cinta del muro" action={<Chips value={T.on ? "1" : "0"} options={[{ id: "0", label: "no" }, { id: "1", label: "sí" }]} onChange={v => st.change(() => { T.on = v === "1"; })} />}
        hint={T.on ? <>A <b>1,00×</b> el texto da una vuelta exacta por bucle, así que el vídeo encadena sin salto.</> : undefined}>
        {T.on && (
          <>
            <input type="text" value={T.txt} spellCheck={false} aria-label="Texto de la cinta"
              onChange={e => { const v = e.target.value; st.change(() => { T.txt = v; }); }}
              className="h-11 rounded-xl bg-tubo border-[1.5px] border-crema/20 px-3 font-mono" />
            <div className="flex gap-2 items-center">
              <span className="text-sm text-crema/80 w-[120px] shrink-0">Posición</span>
              <Chips value={T.pos} options={[{ id: "bottom", label: "abajo" }, { id: "top", label: "arriba" }]} onChange={v => st.change(() => { T.pos = v; })} />
            </div>
            <Range label="Vueltas por bucle" min={0} max={400} step={25} value={Math.round(T.rate * 100)} show={rateLabel(T.rate)} onChange={v => st.change(() => { T.rate = v / 100; })} />
            <Range label="Altura" min={3} max={14} value={T.h} show={`${T.h} %`} onChange={v => st.change(() => { T.h = v; })} />
            <div className="flex gap-2 items-center">
              <span className="text-sm text-crema/80 w-[120px] shrink-0">Color</span>
              <Chips value={T.col} options={TINTS} onChange={v => st.change(() => { T.col = v; })} />
            </div>
          </>
        )}
      </Group>

      <Group title="textura de época">
        <Range label="Líneas de barrido" min={0} max={100} value={p.scan} onChange={v => setP(() => { p.scan = v; })} />
        <Range label="Grano" min={0} max={100} value={p.grain} onChange={v => setP(() => { p.grain = v; })} />
        <Range label="Banda que recorre" min={0} max={100} value={p.sweep} onChange={v => setP(() => { p.sweep = v; })} />
        <Range label="Parpadeo" min={0} max={100} value={p.flick} onChange={v => setP(() => { p.flick = v; })} />
      </Group>
    </>
  );
}
