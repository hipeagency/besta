/* Composición: de la nota de voz a la canción. Tres columnas por
   estado; cada idea abre su ficha (a la derecha en pantalla grande,
   en panel en móvil). Cuando está lista, pasa a ensayos. */
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { Idea } from "@/data/types";
import { Button, Sheet } from "@/components/ui";
import { ago, cx } from "@/lib/format";
import { IdeaDetail, STATUS } from "./composicion/IdeaDetail";
import { VoiceNote } from "./composicion/VoiceNote";
import { canRecord, useMedia } from "./composicion/audio";
import { Icon } from "@/components/ui/icons";

export default function Composicion() {
  const { me } = useMe();
  const { data: ideas, loading } = useCollection("ideas");
  const [params, setParams] = useSearchParams();
  const [recording, setRecording] = useState(false);
  const wide = useMedia("(min-width: 1280px)");
  const create = useAction((i: Idea) => api.insert("ideas", i));

  const sorted = [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // En grande siempre hay una abierta; en móvil solo si la eliges.
  const sel = ideas.find(i => i.id === params.get("idea")) ?? (wide ? sorted.find(i => i.status === "desarrollo") ?? sorted[0] : undefined);
  const open = (id?: string) => setParams(id ? { idea: id } : {}, { replace: !!id && !!params.get("idea") });

  async function newIdea() {
    const i: Idea = { id: uid("i"), title: "idea sin título", status: "idea", author: me.name, lyrics: "", sections: [], demos: [], comments: [], updatedAt: new Date().toISOString() };
    await create.run(i);
    open(i.id);
  }

  const mic = canRecord();

  return (
    <Page title="composición" actions={<>
      <Button onClick={() => setRecording(true)} disabled={!mic} title={mic ? undefined : "Este navegador no deja grabar"}>
        <Icon name="grabar" size={16} className="text-senal" />grabar nota de voz
      </Button>
      <Button variant="primary" onClick={newIdea} disabled={create.pending}>+ nueva idea</Button>
    </>}>
      {!loading && (
        <div className="flex flex-wrap gap-[18px] items-start">
          {/* tablero */}
          <div className="flex-[3_1_520px] min-w-0 grid gap-3 md:grid-cols-3">
            {STATUS.map(col => {
              const list = sorted.filter(i => i.status === col.value);
              return (
                <section key={col.value} aria-label={col.col} className="p-3 rounded-[18px] bg-lateral flex flex-col gap-2.5">
                  <h2 className="px-1.5 py-1 flex justify-between font-mono text-xs tracking-[.1em] text-crema/70 font-normal">
                    <span>{col.col}</span><span>{list.length}</span>
                  </h2>
                  {list.map(i => <IdeaCard key={i.id} idea={i} active={sel?.id === i.id} onClick={() => open(i.id)} />)}
                  {!list.length && <p className="px-1.5 py-3 text-sm text-crema/50">nada aquí</p>}
                </section>
              );
            })}
          </div>

          {/* ficha */}
          {wide && (
            <aside className="flex-[2_1_380px] min-w-0 p-5 rounded-[20px] bg-tubo sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto">
              {sel ? <IdeaDetail key={sel.id} idea={sel} onDeleted={() => open()} /> : <p className="text-crema/60">Elige una idea.</p>}
            </aside>
          )}
        </div>
      )}

      {!wide && (
        <Sheet open={!!sel} onClose={() => open()} title="idea" width={520}>
          {sel && <IdeaDetail key={sel.id} idea={sel} onDeleted={() => open()} />}
        </Sheet>
      )}

      <VoiceNote open={recording} onClose={() => setRecording(false)} onCreated={id => { setRecording(false); open(id); }} />
    </Page>
  );
}

function IdeaCard({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  const meta = [idea.author, idea.key, idea.bpm && `${idea.bpm} BPM`].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx("text-left p-3.5 rounded-[14px] bg-tubo border-[1.5px] flex flex-col gap-2 transition hover:bg-tubo-alto", active ? "border-senal" : "border-transparent")}>
      <span className="text-base font-semibold leading-snug">{idea.title}</span>
      <span className="text-[13px] text-crema/70">{meta}</span>
      <span className="flex gap-2.5 font-mono text-[11px] text-crema/65">
        <span aria-label={`${idea.demos.length} demos`} className="inline-flex items-center gap-1"><Icon name="nota" size={13} />{idea.demos.length}</span>
        <span aria-label={`${idea.comments.length} comentarios`} className="inline-flex items-center gap-1"><Icon name="comentario" size={13} />{idea.comments.length}</span>
        <span className="ml-auto">{ago(idea.updatedAt)}</span>
      </span>
    </button>
  );
}
