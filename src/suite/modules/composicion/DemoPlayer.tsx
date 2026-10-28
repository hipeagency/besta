/* Reproductor de una demo: play, onda (decorativa) con los comentarios
   marcados en su minuto, y clic en la onda para saltar. */
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { IdeaComment, IdeaDemo } from "@/data/types";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { useFileUrl } from "@/data/hooks";
import { bars, demoUrl, fmtTime, parseTime } from "./audio";

export interface PlayerHandle { seek: (sec: number) => void }

export function DemoPlayer({ demo, comments, onTime, ref }: { demo?: IdeaDemo; comments: IdeaComment[]; onTime?: (sec: number) => void; ref?: Ref<PlayerHandle> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const url = useFileUrl(demoUrl(demo));   // las guardadas en el almacenamiento van firmadas
  const shape = useMemo(() => bars(demo?.id ?? "vacía"), [demo?.id]);

  // Sin audio no sabemos cuánto dura: estiramos hasta el último comentario.
  const marks = comments.map(c => ({ c, t: parseTime(c.at) })).filter((m): m is { c: IdeaComment; t: number } => m.t != null);
  const span = dur || Math.max(180, ...marks.map(m => m.t * 1.15));

  useEffect(() => { setPlaying(false); setTime(0); setDur(0); }, [url]);

  const seek = (sec: number) => {
    const a = audio.current;
    if (!a || !url) return;
    a.currentTime = Math.min(sec, a.duration || sec);
    setTime(a.currentTime);
    if (a.paused) void a.play().catch(() => {});
  };
  useImperativeHandle(ref, () => ({ seek }));

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };

  const progress = Math.min(1, time / span);

  return (
    <div className="flex flex-col gap-2">
      {url && (
        <audio ref={audio} src={url} preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); }}
          onTimeUpdate={e => { setTime(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); }} />
      )}
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={toggle} disabled={!url} aria-label={playing ? "Pausa" : "Reproducir demo"}
          className="size-11 shrink-0 rounded-full bg-senal text-noche grid place-items-center">
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <div className="relative flex-1 min-w-0 pt-2">
          <button type="button" disabled={!url} aria-label="Saltar a un punto de la demo"
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * span); }}
            className="h-12 w-full flex items-center gap-[2px] disabled:opacity-100 disabled:cursor-default">
            {shape.map((h, i) => (
              <span key={i} className={cx("flex-1 rounded-[1px]", i / shape.length < progress ? "bg-senal" : "bg-crema/30")} style={{ height: `${h}%` }} />
            ))}
          </button>
          {marks.map(m => (
            <button key={m.c.id} type="button" onClick={() => seek(m.t)} aria-label={`Ir a ${m.c.at} · ${m.c.who}`} title={`${m.c.at} · ${m.c.who}: ${m.c.text}`}
              className="absolute -top-2 -translate-x-1/2 size-6 grid place-items-center"
              style={{ left: `${Math.min(100, (m.t / span) * 100)}%` }}>
              <span className="size-3 rounded-full bg-crema border-2 border-tubo" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between font-mono text-[11px] text-crema/60">
        <span>{fmtTime(time)}</span>
        <span>{url ? (dur ? fmtTime(dur) : "…") : "sin audio en este navegador"}</span>
      </div>
    </div>
  );
}
