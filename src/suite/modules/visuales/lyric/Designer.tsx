/* Videolyrics, pasos 2 y 3: cómo se ve. Presets de letra, «sorpréndeme»,
   ajustes rápidos, y fondos (generados o propios) para toda la canción o
   por sección. La vista previa es el mismo motor que exportará el vídeo. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "@/data/api";
import { useCollection } from "@/data/hooks";
import type { LyricBg, LyricStyle, LyricVideo, Song } from "@/data/types";
import { Button, Segmented, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { clock } from "./sync";
import { useTrack, type AudioFeat } from "./track";
import { media as library, type MediaItem } from "./local";
import { ANIMS, MODES, PRESETS, defaultVideo, surprise } from "./engine/style";
import { GENERATED, drawBg } from "./engine/backgrounds";
import { MediaPool } from "./engine/media";
import { renderFrame } from "./engine/render";

export default function DesignerPage() {
  const { songId } = useParams();
  const { data: songs, loading } = useCollection("songs");
  if (loading) return <div className="fixed inset-0 bg-noche grid place-items-center text-crema/60">cargando…</div>;
  const song = songs.find(s => s.id === songId);
  if (!song) return <Navigate404 />;
  if (!song.lyricSync?.lines.some(l => l.t != null)) {
    return (
      <div className="fixed inset-0 bg-noche text-crema grid place-items-center p-6 text-center">
        <div className="flex flex-col gap-3 items-center">
          <p className="text-2xl font-bold">Primero sincroniza la letra</p>
          <p className="text-crema/70 max-w-[420px]">El diseño necesita saber cuándo suena cada línea.</p>
          <Link to={`/visuales/letra/${song.id}`} className="h-11 px-5 rounded-full bg-senal text-noche font-semibold grid place-items-center">sincronizar {song.title}</Link>
        </div>
      </div>
    );
  }
  return <Designer key={song.id} song={song} />;
}

function Navigate404() {
  return <div className="fixed inset-0 bg-noche text-crema grid place-items-center"><Link to="/visuales/letra" className="underline">Esta canción no existe. Volver.</Link></div>;
}

type Tab = "letra" | "fondos" | "formato";

function Designer({ song }: { song: Song }) {
  const toast = useToast();
  const nav = useNavigate();
  const sync = song.lyricSync!;
  const [video, setVideo] = useState<LyricVideo>(() => ({ ...defaultVideo(), ...song.lyricVideo }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState("");
  const [tab, setTab] = useState<Tab>("letra");

  const change = useCallback((fn: (v: LyricVideo) => LyricVideo) => {
    setVideo(v => ({ ...fn(v), updatedAt: new Date().toISOString() }));
    setDirty(true);
  }, []);
  const setStyle = (patch: Partial<LyricStyle>) => change(v => ({ ...v, style: { ...v.style, ...patch }, preset: undefined }));

  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(async () => {
      setSaving("guardando…");
      try { await api.update("songs", song.id, { lyricVideo: video }); setDirty(false); setSaving("guardado"); }
      catch (e) { setSaving("sin guardar"); toast((e as Error).message, "error"); }
    }, 900);
    return () => clearTimeout(id);
  }, [video, dirty, song.id, toast]);

  // ---- pista y reloj ----
  const track = useTrack(song.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const duration = track.duration || sync.durationSec;
  const wrongTrack = !!track.duration && Math.abs(track.duration - sync.durationSec) > 0.05;
  const seek = (t: number) => { const a = audioRef.current; const v = Math.max(0, Math.min(t, duration)); if (a) a.currentTime = v; setNow(v); };
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };

  // ---- vista previa: el mismo motor que la exportación ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pool = useMemo(() => new MediaPool(() => {}), []);
  useEffect(() => () => pool.dispose(), [pool]);
  const scene = useRef({ video, feat: track.feat });
  scene.current = { video, feat: track.feat };
  const nowRef = useRef(now);
  nowRef.current = now;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvasRef.current, a = audioRef.current;
      if (c) {
        const { video: v, feat } = scene.current;
        const W = Math.min(1280, v.width), H = Math.round((W * v.height) / v.width);
        if (c.width !== W) c.width = W;
        if (c.height !== H) c.height = H;
        const t = a && !a.paused ? a.currentTime : nowRef.current;
        pool.playing = !!a && !a.paused;
        renderFrame(c.getContext("2d")!, W, H, t, { sync, video: v, feat, media: pool });
        if (a && !a.paused) setNow(a.currentTime);
      }
      raf = requestAnimationFrame(loop);
    };
    void document.fonts.load("800 40px Jost").finally(() => { raf = requestAnimationFrame(loop); });
    return () => cancelAnimationFrame(raf);
  }, [pool, sync]);

  // teclado: espacio play/pausa, flechas mover
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") seek(nowRef.current - (e.shiftKey ? 0.1 : 2));
      else if (e.key === "ArrowRight") seek(nowRef.current + (e.shiftKey ? 0.1 : 2));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // secciones en orden, para fondos por sección y marcas en la barra
  const sections = useMemo(() => {
    const out: { id: string; name: string; t?: number }[] = [];
    for (const l of sync.lines) if (l.sectionId && !out.some(s => s.id === l.sectionId)) out.push({ id: l.sectionId, name: l.section ?? "sección", t: l.t });
    return out;
  }, [sync.lines]);

  return (
    <div className="h-dvh bg-noche text-crema flex flex-col">
      <header className="px-6 py-3 flex items-center gap-4 border-b border-crema/10">
        <button type="button" onClick={() => nav("/visuales/letra")} className="font-mono text-xs text-crema/70 hover:text-crema inline-flex items-center gap-1.5"><Icon name="atras" size={14} />canciones</button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-senal tracking-wider">
            VIDEOLYRICS · <Link to={`/visuales/letra/${song.id}`} className="text-crema/60 hover:text-crema">1. SINCRONIZAR</Link> · 2. DISEÑAR
          </p>
          <h1 className="text-2xl font-extrabold tracking-[-.02em] leading-tight truncate">{song.title}</h1>
        </div>
        <span className="font-mono text-xs text-crema/60" aria-live="polite">{dirty ? "cambios…" : saving}</span>
        <label className={cx("inline-flex items-center gap-2 h-11 px-[18px] rounded-full font-semibold text-[15px] cursor-pointer", track.src ? "border-[1.5px] border-crema/25" : "bg-senal text-noche")}>
          <Icon name="subir" size={16} />{track.src ? "cambiar pista" : "cargar pista"}
          <input type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.m4a" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) track.load(f).catch(() => toast("No se ha podido leer el audio.", "error")); e.target.value = ""; }} />
        </label>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
          <div className="rounded-[20px] bg-marco p-2">
            <canvas ref={canvasRef} className="w-full rounded-[14px] bg-black block" style={{ aspectRatio: `${video.width} / ${video.height}`, maxHeight: "62vh", objectFit: "contain" }} />
          </div>
          {!track.src && !track.loading && (
            <p className="text-sm text-crema/70">
              Sin pista no suena ni reaccionan los fondos, pero puedes moverte por la canción.
              {sync.audioName && <> Se sincronizó con <b className="text-crema">{sync.audioName}</b>.</>}
            </p>
          )}
          {wrongTrack && <p className="text-sm text-senal-suave">Ojo: esta pista dura {clock(track.duration)} y la letra se sincronizó con una de {clock(sync.durationSec)}.</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggle} disabled={!track.src} aria-label={playing ? "Pausa" : "Reproducir"} className="size-12 shrink-0 rounded-full bg-crema text-noche grid place-items-center disabled:opacity-40">
              <Icon name={playing ? "pause" : "play"} size={20} />
            </button>
            <span className="font-mono tabular-nums text-sm w-[150px] shrink-0">{clock(now)} / {clock(duration)}</span>
            <div className="relative flex-1">
              <input type="range" min={0} max={duration || 1} step={0.01} value={now} onChange={e => seek(Number(e.target.value))} className="w-full accent-[var(--color-senal)]" aria-label="Posición" />
              <div className="relative h-4 pointer-events-none">
                {sections.filter(s => s.t != null).map(s => (
                  <span key={s.id} className="absolute top-0 font-mono text-[10px] text-crema/50 -translate-x-1/2 whitespace-nowrap" style={{ left: `${(s.t! / (duration || 1)) * 100}%` }}>│{s.name.slice(0, 10)}</span>
                ))}
              </div>
            </div>
          </div>
          {track.src && <audio ref={audioRef} src={track.src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
        </section>

        <aside className="min-h-0 border-l border-crema/10 flex flex-col">
          <div className="p-4 pb-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: "letra", label: "letra" }, { value: "fondos", label: "fondos" }, { value: "formato", label: "textura y formato" }]} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 flex flex-col gap-5">
            {tab === "letra" && <LetraPanel video={video} change={change} setStyle={setStyle} />}
            {tab === "fondos" && <FondosPanel video={video} change={change} sections={sections} feat={track.feat} />}
            {tab === "formato" && <FormatoPanel video={video} change={change} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] text-crema/55 tracking-wider">{title.toUpperCase()}</p>
      {children}
      {hint && <p className="text-xs text-crema/55">{hint}</p>}
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={cx("h-9 px-3 rounded-full text-sm transition", value === o.id ? "bg-crema text-noche font-semibold" : "border-[1.5px] border-crema/20 hover:border-crema/50")}>{o.label}</button>
      ))}
    </div>
  );
}

type Change = (fn: (v: LyricVideo) => LyricVideo) => void;

function LetraPanel({ video, change, setStyle }: { video: LyricVideo; change: Change; setStyle: (p: Partial<LyricStyle>) => void }) {
  const s = video.style;
  const roll = () => { const seed = Math.floor(Math.random() * 1e9); change(v => ({ ...v, seed, style: surprise(seed), preset: undefined })); };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={roll}>sorpréndeme</Button>
        <Button variant="ghost" onClick={() => change(v => ({ ...v, seed: Math.floor(Math.random() * 1e9) }))} title="mismo estilo, otra suerte en cada línea">barajar</Button>
      </div>
      <p className="-mt-3 text-xs text-crema/55">«Sorpréndeme» inventa un estilo; «barajar» mantiene el estilo y cambia lo que varía de cada línea. Siempre sale igual al exportar.</p>

      <Group title="presets">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => change(v => ({ ...v, style: p.style, preset: p.id }))}
              className={cx("text-left rounded-[14px] p-3 transition", video.preset === p.id ? "bg-crema text-noche" : "bg-tubo hover:bg-tubo-alto")}>
              <span className="block font-bold">{p.name}</span>
              <span className={cx("block text-xs", video.preset === p.id ? "text-noche/70" : "text-crema/60")}>{p.desc}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="modo"><Chips value={s.mode} options={MODES} onChange={mode => setStyle({ mode })} /></Group>
      <Group title="tamaño"><Chips value={s.size} options={[{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }, { id: "xl", label: "XL" }]} onChange={size => setStyle({ size })} /></Group>
      <Group title="posición"><Chips value={s.pos} options={[{ id: "centro", label: "centro" }, { id: "arriba", label: "arriba" }, { id: "abajo", label: "abajo" }, { id: "azar", label: "al azar" }]} onChange={pos => setStyle({ pos })} /></Group>
      <Group title="letra">
        <Chips value={s.font} options={[{ id: "jost", label: "gruesa" }, { id: "fina", label: "fina" }, { id: "mono", label: "máquina" }]} onChange={font => setStyle({ font })} />
        <Chips value={s.caps} options={[{ id: "normal", label: "Normal" }, { id: "mayus", label: "MAYÚSCULAS" }, { id: "minus", label: "minúsculas" }]} onChange={caps => setStyle({ caps })} />
        <Chips value={s.color} options={[{ id: "crema", label: "crema" }, { id: "senal", label: "naranja" }]} onChange={color => setStyle({ color })} />
      </Group>
      <Group title="entrada"><Chips value={s.in} options={ANIMS} onChange={x => setStyle({ in: x })} /></Group>
      <Group title="salida"><Chips value={s.out} options={ANIMS.filter(a => a.id !== "maquina")} onChange={x => setStyle({ out: x })} /></Group>
      <div className="flex flex-col gap-2">
        <Toggle checked={s.variar} onChange={variar => setStyle({ variar })} label="variar en cada línea (entrada, sitio y tamaño al azar)" />
        <Toggle checked={s.box} onChange={box => setStyle({ box })} label="franja oscura detrás del texto" />
      </div>
      <p className="text-xs text-crema/55">Las palabras con énfasis se marcan en «1. sincronizar»: fuerte (más grande y en color), impacto (ocupa la pantalla) y temblor.</p>
    </>
  );
}

function FondosPanel({ video, change, sections, feat }: { video: LyricVideo; change: Change; sections: { id: string; name: string }[]; feat: AudioFeat }) {
  const toast = useToast();
  const [target, setTarget] = useState<string>("");   // "" = toda la canción
  const [items, setItems] = useState<MediaItem[]>([]);
  const refresh = useCallback(() => { library.list().then(setItems).catch(() => setItems([])); }, []);
  useEffect(refresh, [refresh]);

  const current: LyricBg | undefined = target ? video.bySection[target] : video.bg;
  const assign = (bg: LyricBg | undefined) => change(v => {
    if (!target) return bg ? { ...v, bg } : v;
    const bySection = { ...v.bySection };
    if (bg) bySection[target] = bg; else delete bySection[target];
    return { ...v, bySection };
  });
  const tint = current?.kind === "gen" ? current.tint : "senal";

  async function upload(files: FileList) {
    for (const f of Array.from(files)) {
      if (!/^(image|video)\//.test(f.type)) { toast(`${f.name}: solo fotos, vídeos o GIF.`, "error"); continue; }
      try { const it = await library.add(f); assign({ kind: "media", id: it.id, name: it.name, fit: "cover" }); }
      catch { toast(`No se ha podido guardar ${f.name}. ¿Falta espacio en el disco?`, "error"); }
    }
    refresh();
  }
  const used = (id: string) => (video.bg.kind === "media" && video.bg.id === id) || Object.values(video.bySection).some(b => b.kind === "media" && b.id === id);
  const missing = [video.bg, ...Object.values(video.bySection)].filter((b): b is Extract<LyricBg, { kind: "media" }> => b.kind === "media" && !items.some(i => i.id === b.id));

  return (
    <>
      <Group title="aplicar a" hint="Cada sección puede tener su fondo; al cambiar de sección se funden. Los instrumentales siguen con el fondo de lo anterior.">
        <select value={target} onChange={e => setTarget(e.target.value)} className="h-11 rounded-xl bg-tubo border-[1.5px] border-crema/20 px-3">
          <option value="">toda la canción</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.name}{video.bySection[s.id] ? " · propio" : ""}</option>)}
        </select>
        {target && (
          <Button size="sm" variant="ghost" disabled={!video.bySection[target]} onClick={() => assign(undefined)}>igual que la canción</Button>
        )}
      </Group>

      {!!missing.length && (
        <p className="text-sm text-senal-suave">Faltan en este ordenador: {[...new Set(missing.map(m => m.name))].join(", ")}. Vuelve a subirlos (los archivos se guardan en cada ordenador, no en la nube).</p>
      )}

      <Group title="generados">
        <div className="grid grid-cols-3 gap-2">
          {GENERATED.map(gen => {
            const on = current?.kind === "gen" && current.id === gen.id;
            return (
              <button key={gen.id} type="button" onClick={() => assign({ kind: "gen", id: gen.id, tint })}
                className={cx("rounded-[12px] overflow-hidden text-left transition", on ? "ring-2 ring-senal" : "hover:ring-1 hover:ring-crema/40")}>
                <Thumb bg={{ kind: "gen", id: gen.id, tint }} feat={feat} />
                <span className="block px-2 py-1.5 text-xs bg-tubo">{gen.name}{gen.reacts && <span className="text-senal-suave"> · ♪</span>}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Chips value={tint} options={[{ id: "senal", label: "naranja" }, { id: "crema", label: "crema" }]}
            onChange={t => current?.kind === "gen" && assign({ ...current, tint: t })} />
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => {
            const g = GENERATED[Math.floor(Math.random() * GENERATED.length)];
            assign({ kind: "gen", id: g.id, tint: Math.random() < 0.7 ? "senal" : "crema" });
          }}>al azar</Button>
        </div>
        <p className="text-xs text-crema/55">♪ = reacciona a la pista (nivel y golpes).</p>
      </Group>

      <Group title="tus fotos, vídeos y GIF" hint="Se guardan en este ordenador, no se suben. Los vídeos van en bucle y se oscurecen un poco para que se lea la letra.">
        <label className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border-[1.5px] border-dashed border-crema/40 cursor-pointer hover:border-crema">
          <Icon name="subir" size={16} />subir archivos
          <input type="file" multiple accept="image/*,video/*,.gif" className="sr-only" onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {items.map(it => {
            const on = current?.kind === "media" && current.id === it.id;
            return (
              <div key={it.id} className={cx("relative rounded-[12px] overflow-hidden bg-tubo", on && "ring-2 ring-senal")}>
                <button type="button" className="block w-full" onClick={() => assign({ kind: "media", id: it.id, name: it.name, fit: "cover" })}>
                  <MediaThumb item={it} />
                  <span className="block px-2 py-1.5 text-xs truncate text-left">{it.name}</span>
                </button>
                <button type="button" aria-label={`Borrar ${it.name}`} title={used(it.id) ? "está en uso" : "borrar"}
                  onClick={async () => {
                    if (used(it.id) && !confirm(`${it.name} está puesto de fondo. ¿Borrarlo igualmente?`)) return;
                    await library.remove(it.id); refresh();
                  }}
                  className="absolute top-1 right-1 size-7 rounded-full bg-noche/80 grid place-items-center"><Icon name="x" size={12} /></button>
              </div>
            );
          })}
        </div>
        {current?.kind === "media" && (
          <Chips value={current.fit} options={[{ id: "cover", label: "llenar pantalla" }, { id: "contain", label: "entero" }]} onChange={fit => assign({ ...current, fit })} />
        )}
      </Group>
    </>
  );
}

/* Miniatura de un fondo generado, quieta en el segundo 3. */
function Thumb({ bg, feat }: { bg: LyricBg; feat: AudioFeat }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const fake: AudioFeat = feat.hits.length ? feat : { level: () => 0.6, hit: () => 0.5, hits: [2.4, 2.8] };
    drawBg(c.getContext("2d")!, c.width, c.height, 3, bg, { seed: 1, feat: fake, media: { frame: () => null } });
  }, [bg, feat]);
  return <canvas ref={ref} width={192} height={108} className="block w-full aspect-video" />;
}

function MediaThumb({ item }: { item: MediaItem }) {
  const url = useMemo(() => URL.createObjectURL(item.blob), [item.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return item.type.startsWith("video/")
    ? <video src={url} muted preload="metadata" className="block w-full aspect-video object-cover" />
    : <img src={url} alt="" className="block w-full aspect-video object-cover" />;
}

const FORMATS = [
  { id: "1920x1080", label: "1920×1080 · 16:9", w: 1920, h: 1080 },
  { id: "3840x2160", label: "3840×2160 · 4K", w: 3840, h: 2160 },
  { id: "1280x720", label: "1280×720", w: 1280, h: 720 },
  { id: "1080x1920", label: "1080×1920 · vertical", w: 1080, h: 1920 },
  { id: "1080x1080", label: "1080×1080 · cuadrado", w: 1080, h: 1080 },
];

function FormatoPanel({ video, change }: { video: LyricVideo; change: Change }) {
  const fmt = `${video.width}x${video.height}`;
  const custom = !FORMATS.some(f => f.id === fmt);
  const setO = (k: keyof LyricVideo["overlay"], v: boolean) => change(x => ({ ...x, overlay: { ...x.overlay, [k]: v } }));
  return (
    <>
      <Group title="textura de época">
        <Toggle checked={video.overlay.scan} onChange={v => setO("scan", v)} label="líneas de tele (scanlines)" />
        <Toggle checked={video.overlay.grain} onChange={v => setO("grain", v)} label="grano" />
        <Toggle checked={video.overlay.vignette} onChange={v => setO("vignette", v)} label="bordes oscuros (viñeta)" />
      </Group>
      <Group title="tamaño del vídeo" hint="Para pantallas LED con medida rara, pide al técnico la resolución en píxeles y ponla a mano.">
        <div className="flex flex-col gap-1.5">
          {FORMATS.map(f => (
            <button key={f.id} type="button" onClick={() => change(v => ({ ...v, width: f.w, height: f.h }))}
              className={cx("h-10 px-3 rounded-xl text-left text-sm", fmt === f.id ? "bg-crema text-noche font-semibold" : "bg-tubo hover:bg-tubo-alto")}>{f.label}</button>
          ))}
        </div>
        <div className={cx("flex items-center gap-2 text-sm", custom && "text-senal-suave")}>
          a mano:
          <input type="number" min={240} max={7680} value={video.width} onChange={e => change(v => ({ ...v, width: Math.max(240, Math.min(7680, Number(e.target.value) || 1920)) }))} className="w-24 h-9 rounded-lg bg-tubo border border-crema/20 px-2" aria-label="ancho" />
          ×
          <input type="number" min={240} max={4320} value={video.height} onChange={e => change(v => ({ ...v, height: Math.max(240, Math.min(4320, Number(e.target.value) || 1080)) }))} className="w-24 h-9 rounded-lg bg-tubo border border-crema/20 px-2" aria-label="alto" />
        </div>
      </Group>
      <Group title="fotogramas por segundo" hint="30 vale para casi todo. Usa 25 o 50 si la pantalla o el técnico lo piden.">
        <Chips value={String(video.fps)} options={["25", "30", "50", "60"].map(x => ({ id: x, label: x }))} onChange={x => change(v => ({ ...v, fps: Number(x) }))} />
      </Group>
      <p className="text-sm text-crema/60">Exportar a MP4 para Ableton es el siguiente paso.</p>
    </>
  );
}
