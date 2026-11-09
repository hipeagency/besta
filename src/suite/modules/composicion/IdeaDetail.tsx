/* Una nota abierta: título, estado, letra y secciones a la izquierda;
   demos, comentarios con minuto y el salto a ensayos a la derecha. */
import { useRef, useState } from "react";
import { Link } from "react-router";
import { useAction } from "@/data/hooks";
import { api, uid, DATA_MODE } from "@/data/api";
import type { Idea, IdeaDemo, IdeaStatus } from "@/data/types";
import { useMe } from "@/suite/session";
import { Button, IconButton, Input, Segmented, useToast } from "@/components/ui";
import { AutoTextarea } from "./AutoTextarea";
import { Icon } from "@/components/ui/icons";
import { cx, dateShort } from "@/lib/format";
import { DemoPlayer, type PlayerHandle } from "./DemoPlayer";
import { fmtTime, parseTime, rememberDemoUrl } from "./audio";

export const STATUS: { value: IdeaStatus; label: string; col: string }[] = [
  { value: "idea", label: "idea", col: "IDEA" },
  { value: "desarrollo", label: "desarrollo", col: "EN DESARROLLO" },
  { value: "lista", label: "lista", col: "LISTA PARA ENSAYAR" },
];

export function IdeaDetail({ idea, onDeleted }: { idea: Idea; onDeleted: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const player = useRef<PlayerHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const patch = useAction((p: Partial<Idea>) => api.update("ideas", idea.id, { ...p, updatedAt: new Date().toISOString() }));
  const toSong = useAction((id: string) => api.ideaToSong(id));
  const remove = useAction((id: string) => api.remove("ideas", id));

  const latest = idea.demos.reduce((a, d) => (d.version > a ? d.version : a), 0);
  const [version, setVersion] = useState(latest);
  const demo = idea.demos.find(d => d.version === version) ?? idea.demos.find(d => d.version === latest);
  const [now, setNow] = useState(0);

  // ---------- demos ----------
  async function upload(f: File) {
    const url = await api.uploadFile("musica", f);
    const d: IdeaDemo = { id: uid("d"), version: latest + 1, by: me.name, date: new Date().toISOString().slice(0, 10) };
    // De prueba el archivo solo vive en esta pestaña: no se guarda su URL.
    if (DATA_MODE === "supabase") d.url = url; else rememberDemoUrl(d.id, url);
    await patch.run({ demos: [...idea.demos, d] });
    setVersion(d.version);
    toast(`Demo v${d.version} subida${DATA_MODE === "supabase" ? "" : " (solo en este navegador: modo de prueba)"}`, "ok");
  }

  // ---------- comentarios ----------
  const [at, setAt] = useState("");
  const [text, setText] = useState("");
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (at && parseTime(at) == null) { toast("El minuto va así: 0:42", "error"); return; }
    await patch.run({ comments: [...idea.comments, { id: uid("k"), at: at || undefined, who: me.name, text: text.trim() }] });
    setAt(""); setText("");
  }

  // ---------- secciones ----------
  const setSection = (id: string, p: Partial<Idea["sections"][number]>) => {
    const cur = idea.sections.find(s => s.id === id);
    if (!cur || Object.entries(p).every(([k, v]) => cur[k as keyof typeof cur] === v)) return;
    patch.run({ sections: idea.sections.map(s => (s.id === id ? { ...s, ...p } : s)) });
  };

  async function pass() {
    const song = await toSong.run(idea.id);
    toast(`«${song.title}» ya está en ensayos`, "ok");
  }


  return (
    <div className="flex flex-col gap-7">
      {/* cabecera: título grande, estado y datos de la canción */}
      <header className="flex flex-col gap-3 pr-12">
        <p className="font-mono text-[11px] text-senal">{STATUS.find(s => s.value === idea.status)?.col} · de {idea.author}</p>
        <input key={idea.id + "t"} defaultValue={idea.title} aria-label="Título de la idea"
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== idea.title) patch.run({ title: v }); else e.target.value = idea.title; }}
          className="w-full bg-transparent text-[30px] md:text-[44px] font-extrabold tracking-[-.03em] leading-[1.05] rounded-lg -mx-1 px-1 focus:outline-none focus:bg-noche" />
        <div className="flex flex-wrap items-end gap-3">
          <Segmented size="sm" value={idea.status} onChange={v => patch.run({ status: v })} options={STATUS.map(s => ({ value: s.value, label: s.label }))} />
          <label className="flex items-center gap-2 text-[12px] text-crema/70">tono
            <Input key={idea.id + "k"} defaultValue={idea.key ?? ""} placeholder="Am" className="font-mono h-9 w-[72px] px-2.5 text-sm"
              onBlur={e => { const v = e.target.value.trim() || undefined; if (v !== idea.key) patch.run({ key: v }); }} />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-crema/70">bpm
            <Input key={idea.id + "b"} type="number" min={30} max={260} inputMode="numeric" defaultValue={idea.bpm ?? ""} placeholder="110" className="font-mono h-9 w-[80px] px-2.5 text-sm"
              onBlur={e => { const v = e.target.value ? Number(e.target.value) : undefined; if (v !== idea.bpm) patch.run({ bpm: v }); }} />
          </label>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        {/* izquierda: lo escrito */}
        <div className="flex flex-col gap-7 min-w-0">
          <section className="flex flex-col gap-2">
            <label htmlFor={idea.id + "-letra"} className="text-[15px] font-semibold">letra</label>
            <AutoTextarea id={idea.id + "-letra"} key={idea.id + "l"} defaultValue={idea.lyrics} rows={8} placeholder="lo que haya, aunque sea a medias…"
              onBlur={e => { if (e.target.value !== idea.lyrics) patch.run({ lyrics: e.target.value }); }}
              className="text-[17px] leading-relaxed px-4 py-3.5" />
          </section>

          <section className="flex flex-col gap-2" aria-label="Secciones">
            <h3 className="text-[15px] font-semibold">secciones</h3>
            {idea.sections.map(s => (
              <div key={s.id} className="flex items-center gap-1.5">
                <Input defaultValue={s.name} aria-label="Nombre de la sección" className="w-[120px] shrink-0 h-10 text-sm px-2.5"
                  onBlur={e => setSection(s.id, { name: e.target.value.trim() || s.name })} />
                <Input defaultValue={s.chords} aria-label={`Acordes de ${s.name}`} placeholder="Am F C G" className="flex-1 min-w-0 h-10 font-mono text-sm px-2.5"
                  onBlur={e => setSection(s.id, { chords: e.target.value })} />
                <IconButton label={`Quitar ${s.name}`} className="shrink-0 text-crema/60"
                  onClick={() => patch.run({ sections: idea.sections.filter(x => x.id !== s.id) })}><Icon name="basura" size={16} /></IconButton>
              </div>
            ))}
            <button type="button" onClick={() => patch.run({ sections: [...idea.sections, { id: uid("s"), name: idea.sections.length ? "sección" : "intro", chords: "" }] })}
              className="self-start h-10 px-3.5 rounded-[10px] border border-dashed border-crema/30 font-mono text-xs text-crema/80 hover:text-crema">+ sección</button>
          </section>
        </div>

        {/* derecha: lo que suena y lo que se dice */}
        <div className="flex flex-col gap-6 min-w-0 lg:p-5 lg:rounded-[20px] lg:bg-noche/40">
          <section className="flex flex-col gap-2.5" aria-label="Demos">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-crema/75">
              {demo ? <span>demo <b className="text-crema font-medium">v{demo.version}</b> · {demo.by} · {dateShort(demo.date)}</span> : <span>sin demos todavía</span>}
              {idea.demos.length > 1 && (
                <span className="flex gap-1 font-mono">
                  {[...idea.demos].sort((a, b) => a.version - b.version).map(d => (
                    <button key={d.id} type="button" onClick={() => setVersion(d.version)} aria-pressed={d.version === demo?.version}
                      className={cx("h-8 min-w-9 px-2 rounded-full text-xs", d.version === demo?.version ? "bg-crema text-noche" : "bg-noche text-crema/75 hover:text-crema")}>
                      v{d.version}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {demo && <DemoPlayer ref={player} demo={demo} comments={idea.comments} onTime={setNow} />}
            <input ref={file} type="file" accept="audio/*" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <Button size="sm" onClick={() => file.current?.click()} className="self-start"><Icon name="subir" size={14} />{demo ? "subir nueva versión" : "subir demo"}</Button>
          </section>

          <section className="flex flex-col gap-2" aria-label="Comentarios">
            <h3 className="text-[15px] font-semibold">comentarios</h3>
            {idea.comments.map(c => {
              const t = parseTime(c.at);
              return (
                <div key={c.id} className="group flex items-start gap-2 px-3 py-2.5 rounded-xl bg-noche text-sm leading-snug">
                  <p className="flex-1 min-w-0 break-words">
                    {c.at && (t != null
                      ? <button type="button" onClick={() => player.current?.seek(t)} className="font-mono text-xs text-senal-suave hover:underline mr-1">{c.at}</button>
                      : <span className="font-mono text-xs text-senal-suave mr-1">{c.at}</span>)}
                    <span className="font-mono text-xs text-crema/60">· {c.who}</span>{" "}— {c.text}
                  </p>
                  {c.who === me.name && (
                    <IconButton label="Borrar comentario" className="size-8 -my-1 text-crema/60"
                      onClick={() => patch.run({ comments: idea.comments.filter(x => x.id !== c.id) })}><Icon name="x" size={14} /></IconButton>
                  )}
                </div>
              );
            })}
            <form onSubmit={addComment} className="flex flex-wrap gap-2">
              <div className="flex gap-1 w-[118px] shrink-0">
                <Input value={at} onChange={e => setAt(e.target.value)} placeholder="0:42" aria-label="Minuto (opcional)" className="font-mono h-10 px-2.5 text-sm" />
                {now > 0 && <IconButton label={`Usar el minuto actual ${fmtTime(now)}`} onClick={() => setAt(fmtTime(now))} className="size-10 shrink-0 bg-noche"><Icon name="reloj" size={16} /></IconButton>}
              </div>
              <Input value={text} onChange={e => setText(e.target.value)} placeholder="comenta la demo…" aria-label="Comentario" className="flex-[1_1_160px] h-10 text-sm" />
              <Button type="submit" size="sm" className="h-10" disabled={!text.trim()}>comentar</Button>
            </form>
          </section>

          <div className="flex flex-col gap-2 pt-4 border-t border-crema/10">
            {idea.songId
              ? <Link to={`/ensayos/${idea.songId}`} className="inline-flex items-center justify-center h-11 px-[18px] rounded-full bg-crema text-noche font-semibold text-[15px] whitespace-nowrap">abrir en ensayos <Icon name="flecha" size={14} className="ml-1.5" /></Link>
              : <Button variant="light" disabled={toSong.pending} onClick={pass}>pasar a ensayos <Icon name="flecha" size={14} className="inline align-[-2px]" /></Button>}
            <button type="button" className="self-start h-11 font-mono text-xs text-crema/55 hover:text-crema"
              onClick={async () => { if (confirm(`¿Borrar «${idea.title}»?`)) { await remove.run(idea.id); onDeleted(); toast("Idea borrada", "ok"); } }}>
              borrar idea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
