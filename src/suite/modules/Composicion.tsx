/* Composición: de la nota de voz a la canción. Un bloc de notas
   (filtrable por estado); cada nota se abre en grande, sin paneles
   con scroll. Cuando está lista, pasa a ensayos. */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { Idea, IdeaStatus } from "@/data/types";
import { Button, Segmented } from "@/components/ui";
import { ago, cx } from "@/lib/format";
import { IdeaDetail, STATUS } from "./composicion/IdeaDetail";
import { VoiceNote } from "./composicion/VoiceNote";
import { canRecord } from "./composicion/audio";
import { Icon } from "@/components/ui/icons";

export default function Composicion() {
  const { me } = useMe();
  const { data: ideas, loading } = useCollection("ideas");
  const [params, setParams] = useSearchParams();
  const [recording, setRecording] = useState(false);
  const [filter, setFilter] = useState<"todas" | IdeaStatus>("todas");
  const create = useAction((i: Idea) => api.insert("ideas", i));

  const sorted = [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = filter === "todas" ? sorted : sorted.filter(i => i.status === filter);
  const sel = ideas.find(i => i.id === params.get("idea"));
  const open = (id?: string) => setParams(id ? { idea: id } : {});

  async function newIdea() {
    const i: Idea = { id: uid("i"), title: "idea sin título", status: "idea", author: me.name, lyrics: "", sections: [], demos: [], comments: [], updatedAt: new Date().toISOString() };
    await create.run(i);
    open(i.id);
  }

  const mic = canRecord();
  const count = (v?: IdeaStatus) => (v ? ideas.filter(i => i.status === v).length : ideas.length);

  return (
    <Page title="composición" actions={<>
      <Button onClick={() => setRecording(true)} disabled={!mic} title={mic ? undefined : "Este navegador no deja grabar"}>
        <Icon name="grabar" size={16} className="text-senal" />grabar nota de voz
      </Button>
      <Button variant="primary" onClick={newIdea} disabled={create.pending}>+ nueva idea</Button>
    </>}>
      {!loading && (
        <div className="flex flex-col gap-4">
          <Segmented value={filter} onChange={setFilter} className="self-start"
            options={[{ value: "todas" as const, label: <>todas <span className="opacity-60">{count()}</span></> },
              ...STATUS.map(s => ({ value: s.value, label: <>{s.label} <span className="opacity-60">{count(s.value)}</span></> }))]} />

          {shown.length
            ? <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
                {shown.map(i => <NoteCard key={i.id} idea={i} onClick={() => open(i.id)} />)}
              </div>
            : <p className="py-10 text-center text-crema/55">{ideas.length ? "Ninguna nota en este estado." : "Aún no hay ideas. Graba una nota de voz o crea una nueva."}</p>}
        </div>
      )}

      {sel && <NoteView onClose={() => open()}><IdeaDetail key={sel.id} idea={sel} onDeleted={() => open()} /></NoteView>}

      <VoiceNote open={recording} onClose={() => setRecording(false)} onCreated={id => { setRecording(false); open(id); }} />
    </Page>
  );
}

/** La nota abierta: ocupa casi toda la pantalla y crece con su contenido. */
function NoteView({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) onClose(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 anim-fade" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Idea"
        className="relative mx-auto w-full max-w-[1240px] min-h-full md:min-h-0 md:my-8 md:w-[calc(100%-64px)] p-5 pt-6 md:p-10 bg-tubo md:rounded-[28px]">
        <button type="button" aria-label="Cerrar" onClick={onClose}
          className="absolute right-4 top-4 md:right-6 md:top-6 size-11 rounded-full bg-noche text-xl z-10">×</button>
        {children}
      </div>
    </div>
  );
}

function NoteCard({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  const meta = [idea.author, idea.key, idea.bpm && `${idea.bpm} BPM`].filter(Boolean).join(" · ");
  const status = STATUS.find(s => s.value === idea.status);
  return (
    <button type="button" onClick={onClick}
      className="text-left p-4 rounded-[16px] bg-tubo border-[1.5px] border-transparent hover:border-crema/20 hover:bg-tubo-alto transition flex flex-col gap-2.5 min-h-[180px]">
      <span className={cx("self-start font-mono text-[10px] tracking-[.1em] px-2 py-1 rounded-full",
        idea.status === "lista" ? "bg-senal text-noche" : idea.status === "desarrollo" ? "bg-crema/15 text-crema" : "bg-noche text-crema/70")}>
        {status?.col}
      </span>
      <span className="text-[17px] font-semibold leading-snug">{idea.title}</span>
      {idea.lyrics.trim()
        ? <span className="text-[13px] leading-relaxed text-crema/65 whitespace-pre-line line-clamp-4">{idea.lyrics.trim()}</span>
        : <span className="text-[13px] text-crema/40 italic">sin letra todavía</span>}
      <span className="mt-auto pt-1 flex gap-2.5 font-mono text-[11px] text-crema/60">
        <span className="truncate">{meta}</span>
        <span aria-label={`${idea.demos.length} demos`} className="ml-auto inline-flex items-center gap-1 shrink-0"><Icon name="nota" size={13} />{idea.demos.length}</span>
        <span aria-label={`${idea.comments.length} comentarios`} className="inline-flex items-center gap-1 shrink-0"><Icon name="comentario" size={13} />{idea.comments.length}</span>
        <span className="shrink-0">{ago(idea.updatedAt)}</span>
      </span>
    </button>
  );
}
