/* Material de la canción: audios con nombre (ensayo, demo, referencia…)
   y links. Los de YouTube se incrustan; el iframe solo se carga al darle
   al play para no traerse YouTube entero al abrir la canción. */
import { useEffect, useRef, useState } from "react";
import { api, uid } from "@/data/api";
import type { Song } from "@/data/types";
import { Button, IconButton, Input } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { StoredAudio } from "@/components/ui/StoredAudio";
import { isAudioUrl, songLinks, sx, youTubeId, type SongAudio, type SongLink } from "./extra";

export function hasMaterial(song: Song) {
  return !!(sx(song).audios?.length || songLinks(song).length || (song.demoUrl && isAudioUrl(song.demoUrl)));
}

export function MaterialView({ song }: { song: Song }) {
  const audios = [...(sx(song).audios ?? [])];
  if (song.demoUrl && isAudioUrl(song.demoUrl) && !audios.some(a => a.url === song.demoUrl)) audios.unshift({ id: "demo", name: "demo", url: song.demoUrl });
  const links = songLinks(song);
  const videos = links.filter(l => youTubeId(l.url));
  const others = links.filter(l => !youTubeId(l.url));
  return (
    <div className="flex flex-col gap-3">
      {audios.map(a => (
        <div key={a.id} className="flex flex-col gap-1">
          <span className="font-mono text-xs text-crema/70">{a.name || "audio"}</span>
          <StoredAudio url={a.url} className="w-full h-10" />
        </div>
      ))}
      {videos.map(v => <YouTube key={v.id} link={v} />)}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map(l => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-crema/10 text-[13px] hover:bg-crema/15 max-w-full">
              <span className="truncate">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32)}</span> ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function YouTube({ link }: { link: SongLink }) {
  const id = youTubeId(link.url)!;
  const [play, setPlay] = useState(false);
  const title = link.label || "referencia youtube";
  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-noche">
        {play ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`} title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen className="absolute inset-0 size-full" />
        ) : (
          <button type="button" onClick={() => setPlay(true)} aria-label={`reproducir ${title}`} className="group absolute inset-0">
            <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover opacity-85 group-hover:opacity-100 transition" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="size-14 rounded-full bg-senal text-noche grid place-items-center shadow-lg"><Icon name="play" size={20} /></span>
            </span>
            <span className="absolute left-2 bottom-2 right-2 text-left text-[13px] font-medium text-white drop-shadow truncate">{title}</span>
          </button>
        )}
      </div>
      <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer" className="self-end text-xs text-crema/65 underline">abrir en youtube ↗</a>
    </div>
  );
}

// ---------- editor ----------
export function MaterialEditor({ audios, links, onAudios, onLinks }: {
  audios: SongAudio[]; links: SongLink[]; onAudios: (a: SongAudio[]) => void; onLinks: (l: SongLink[]) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  /* Las URL de objeto mueren al recargar: hasta que haya servidor de audio es lo que hay. */
  const made = useRef<string[]>([]);
  useEffect(() => () => { made.current.forEach(u => { if (!audiosRef.current.some(a => a.url === u)) URL.revokeObjectURL(u); }); }, []);
  const audiosRef = useRef(audios);
  audiosRef.current = audios;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...audios];
    for (const f of Array.from(files)) {
      // Con datos reales se sube al almacenamiento privado de la banda.
      const url = await api.uploadFile("musica", f);
      if (url.startsWith("blob:")) made.current.push(url);
      next.push({ id: uid("a"), name: f.name.replace(/\.[^.]+$/, ""), url });
    }
    onAudios(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">audios</h4>
        {audios.map((a, i) => (
          <div key={a.id} className="rounded-xl bg-noche p-2.5 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <label className="sr-only" htmlFor={`an-${a.id}`}>Nombre del audio</label>
              <Input id={`an-${a.id}`} value={a.name} onChange={e => onAudios(audios.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                placeholder="ensayo, demo, referencia…" className="!bg-tubo h-10 text-sm" />
              <IconButton label={`Quitar ${a.name || "audio"}`} onClick={() => onAudios(audios.filter((_, j) => j !== i))}><Icon name="basura" size={16} /></IconButton>
            </div>
            <StoredAudio url={a.url} className="w-full h-9" />
          </div>
        ))}
        <input ref={file} type="file" accept="audio/*" multiple className="sr-only" tabIndex={-1} onChange={e => { add(e.target.files); e.target.value = ""; }} />
        <Button className="self-start" onClick={() => file.current?.click()}><Icon name="subir" size={16} />subir audio</Button>
        <p className="text-xs text-crema/55">de momento los audios subidos solo duran esta sesión: el almacenamiento llega con el servidor.</p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">links</h4>
        {links.map((l, i) => (
          <div key={l.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_auto] gap-2 items-center">
            <label className="sr-only" htmlFor={`ll-${l.id}`}>Nombre del link</label>
            <Input id={`ll-${l.id}`} value={l.label} onChange={e => onLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="nombre" className="h-10 text-sm max-sm:col-span-2" />
            <label className="sr-only" htmlFor={`lu-${l.id}`}>URL</label>
            <Input id={`lu-${l.id}`} type="url" value={l.url} onChange={e => onLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" className="h-10 text-sm" />
            <IconButton label={`Quitar ${l.label || "link"}`} onClick={() => onLinks(links.filter((_, j) => j !== i))}><Icon name="x" size={16} /></IconButton>
          </div>
        ))}
        <Button className="self-start" onClick={() => onLinks([...links, { id: uid("l"), label: "", url: "" }])}>+ añadir link</Button>
        <p className="text-xs text-crema/55">los de youtube se ven con reproductor en la canción.</p>
      </div>
    </div>
  );
}
